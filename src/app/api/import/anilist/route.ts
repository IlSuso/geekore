import { logger } from '@/lib/logger'
// src/app/api/import/anilist/route.ts
// FIX: strategia manual upsert per evitare il problema con constraint mancante su Supabase

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

const ANILIST_API = 'https://graphql.anilist.co'

const STATUS_MAP: Record<string, string> = {
  CURRENT: 'watching',
  COMPLETED: 'completed',
  PAUSED: 'paused',
  DROPPED: 'dropped',
  PLANNING: 'watching',
  REPEATING: 'watching',
}

const QUERY = `
  query ($username: String, $type: MediaType, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage currentPage }
      mediaList(userName: $username, type: $type, sort: UPDATED_TIME_DESC) {
        status
        score(format: POINT_10)
        progress
        notes
        media {
          id
          type
          title { romaji english }
          coverImage { large extraLarge }
          episodes
          chapters
          genres
          seasonYear
          tags { name rank }
        }
      }
    }
  }
`

async function fetchAniListPage(
  username: string,
  type: 'ANIME' | 'MANGA',
  page: number
): Promise<{ items: any[]; hasNextPage: boolean }> {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { username, type, page } }),
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`)
  const json = await res.json()

  if (json.errors) {
    const msg = json.errors[0]?.message || 'Errore AniList'
    throw new Error(msg)
  }

  const page_data = json.data?.Page
  return {
    items: page_data?.mediaList || [],
    hasNextPage: page_data?.pageInfo?.hasNextPage || false,
  }
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 3, windowMs: 60 * 60 * 1000, prefix: 'anilist-import' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Troppe importazioni. Attendi un'ora prima di riprovare." },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { anilist_username, types = ['ANIME', 'MANGA'] } = body

  if (!anilist_username || typeof anilist_username !== 'string') {
    return NextResponse.json({ error: 'Username AniList mancante' }, { status: 400 })
  }

  const username = anilist_username.trim()
  if (username.length < 2 || username.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(username)) {
    return NextResponse.json({ error: 'Username AniList non valido' }, { status: 400 })
  }

  const validTypes = (['ANIME', 'MANGA'] as const).filter(t => types.includes(t))
  if (!validTypes.length) {
    return NextResponse.json({ error: 'Tipo non valido' }, { status: 400 })
  }

  const allItems: any[] = []
  const errors: string[] = []

  for (const type of validTypes) {
    let page = 1
    let hasNext = true
    while (hasNext && page <= 10) {
      try {
        const { items, hasNextPage } = await fetchAniListPage(username, type, page)
        allItems.push(...items.map(i => ({ ...i, _type: type })))
        hasNext = hasNextPage
        page++
        if (hasNext) await new Promise(r => setTimeout(r, 500))
      } catch (e: any) {
        errors.push(`${type}: ${e.message}`)
        hasNext = false
      }
    }
  }

  if (allItems.length === 0 && errors.length > 0) {
    return NextResponse.json(
      { error: 'Impossibile recuperare i dati. Il profilo AniList è pubblico?', details: errors },
      { status: 422 }
    )
  }

  const toInsert = allItems
    .filter(item => item.media?.id)
    .map(item => {
      const media = item.media
      const isAnime = item._type === 'ANIME'
      const title = media.title?.romaji || media.title?.english || 'Senza titolo'
      const type = isAnime ? 'anime' : 'manga'
      const externalId = `anilist-${type}-${media.id}`
      const topTags = (media.tags || [])
        .filter((t: any) => t.rank >= 60)
        .sort((a: any, b: any) => b.rank - a.rank)
        .slice(0, 15)
        .map((t: any) => t.name)
      const rating = item.score ? Math.round((item.score / 10) * 5 * 2) / 2 : null

      return {
        user_id: user.id,
        external_id: externalId,
        title,
        type,
        // Salva l'URL diretto di AniList — extraLarge per qualità migliore
        cover_image: media.coverImage?.extraLarge || media.coverImage?.large || null,
        current_episode: item.progress || 0,
        episodes: isAnime ? (media.episodes || null) : (media.chapters || null),
        status: STATUS_MAP[item.status] || 'watching',
        rating: rating && rating > 0 ? rating : null,
        genres: media.genres || [],
        tags: topTags,
        notes: item.notes || null,
        import_source: 'anilist',
        display_order: Date.now(),
        updated_at: new Date().toISOString(),
      }
    })

  if (toInsert.length === 0) {
    return NextResponse.json({
      success: true, imported: 0, skipped: 0, total: 0,
      message: 'Nessun titolo valido trovato nel profilo AniList',
    }, { headers: rl.headers })
  }

  // Manual upsert: controlla quali external_id esistono già
  const externalIds = toInsert.map(i => i.external_id)
  const { data: existing } = await supabase
    .from('user_media_entries')
    .select('id, external_id')
    .eq('user_id', user.id)
    .in('external_id', externalIds)

  const existingMap = new Map((existing || []).map((e: any) => [e.external_id, e.id]))
  const toCreate = toInsert.filter(i => !existingMap.has(i.external_id))
  const toUpdate = toInsert.filter(i => existingMap.has(i.external_id))

  let imported = 0
  let skipped = 0

  // INSERT nuovi in batch da 50
  for (let i = 0; i < toCreate.length; i += 50) {
    const batch = toCreate.slice(i, i + 50)
    const { error } = await supabase.from('user_media_entries').insert(batch)
    if (!error) {
      imported += batch.length
    } else {
      logger.error('[AniList Import] insert error:', error)
      skipped += batch.length
    }
  }

  // UPDATE esistenti: usa l'id reale della riga
  for (let i = 0; i < toUpdate.length; i += 50) {
    const batch = toUpdate.slice(i, i + 50)
    for (const item of batch) {
      const rowId = existingMap.get(item.external_id)
      const { error } = await supabase
        .from('user_media_entries')
        .update({ ...item })
        .eq('id', rowId)
      if (!error) {
        imported++
      } else {
        logger.error('[AniList Import] update error:', error)
        skipped++
      }
    }
  }

  return NextResponse.json({
    success: true,
    imported,
    skipped,
    total: toInsert.length,
    errors: errors.length > 0 ? errors : undefined,
    message: `Importati ${imported} titoli da AniList (@${username})`,
  }, { headers: rl.headers })
}