import { logger } from '@/lib/logger'
// src/app/api/import/anilist/route.ts
// Importa la lista anime/manga di un utente AniList tramite GraphQL pubblico.
// Non richiede OAuth — la lista deve essere pubblica sul profilo AniList.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

const ANILIST_API = 'https://graphql.anilist.co'

// Mappa status AniList → status Geekore
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
          coverImage { large }
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
  // Rate limit: 3 import/ora per IP (è pesante)
  const rl = rateLimit(request, { limit: 3, windowMs: 60 * 60 * 1000, prefix: 'anilist-import' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Troppe importazioni. Attendi un\'ora prima di riprovare.' },
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

  // Fetch tutte le pagine per ogni tipo
  for (const type of validTypes) {
    let page = 1
    let hasNext = true

    while (hasNext && page <= 10) { // Max 10 pagine = 500 entries per tipo
      try {
        const { items, hasNextPage } = await fetchAniListPage(username, type, page)
        allItems.push(...items.map(i => ({ ...i, _type: type })))
        hasNext = hasNextPage
        page++
        if (hasNext) await new Promise(r => setTimeout(r, 500)) // Rate limit AniList
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

  // Trasforma e inserisce in Supabase
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

      // Converti voto AniList (0-10) → Geekore (0-5)
      const rating = item.score ? Math.round((item.score / 10) * 5 * 2) / 2 : null

      return {
        user_id: user.id,
        external_id: externalId,
        title,
        type,
        cover_image: media.coverImage?.large || null,
        current_episode: item.progress || 0,
        episodes: isAnime ? (media.episodes || null) : (media.chapters || null),
        status: STATUS_MAP[item.status] || 'watching',
        rating: rating && rating > 0 ? rating : null,
        genres: media.genres || [],
        tags: topTags,
        notes: item.notes || null,
        display_order: Date.now(),
        updated_at: new Date().toISOString(),
      }
    })

  // Upsert in batch da 50
  let imported = 0
  let skipped = 0

  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50)
    const { data, error } = await supabase
      .from('user_media_entries')
      .upsert(batch, { onConflict: 'user_id,external_id', ignoreDuplicates: false })

    if (!error) {
      imported += batch.length
    } else {
      logger.error('[AniList Import] batch error:', error)
      skipped += batch.length
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