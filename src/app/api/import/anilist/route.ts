import { logger } from '@/lib/logger'
// src/app/api/import/anilist/route.ts
//
// Importa anime e manga da AniList tramite GraphQL (username pubblico).
//
// Titoli:
//   La query include idMal. Se l'utente ha già importato da MAL in precedenza,
//   mal_poster_cache contiene il titolo italiano → lo usiamo qui senza chiamate API extra.
//   Priorità: title_it (da MAL cache) → romaji → english
//
// Cover image: URL diretto AniList, incluso già nella risposta GraphQL.
// Nessuna cache aggiuntiva necessaria (nessun lookup per-item extra).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { upsertWithMerge } from '@/lib/importMerge'

// ── Costanti ──────────────────────────────────────────────────────────────────

const ANILIST_API = 'https://graphql.anilist.co'

// ── Mappa status ──────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  CURRENT:   'watching',
  COMPLETED: 'completed',
  PAUSED:    'paused',
  DROPPED:   'dropped',
  PLANNING:  'watching',
  REPEATING: 'watching',
}

// ── GraphQL query ─────────────────────────────────────────────────────────────
// idMal permette di cercare il titolo italiano in mal_poster_cache

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
          idMal
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

// ── Fetch AniList paginato ────────────────────────────────────────────────────

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

// ── Cross-reference MAL per titoli italiani ───────────────────────────────────
//
// Cerca in mal_poster_cache i titoli italiani usando gli ID MAL che AniList
// ci fornisce nel campo idMal. Non fa chiamate API esterne: è solo una query DB.
// Funziona se l'utente (o qualsiasi altro utente) ha già importato da MAL.
//
// Restituisce una Map<mal_id, title_it>.

async function loadMalTitlesIt(
  supabase: any,
  entries: Array<{ mal_id: number; media_type: 'anime' | 'manga' }>
): Promise<Map<number, string>> {
  const result = new Map<number, string>()
  if (entries.length === 0) return result

  for (const type of ['anime', 'manga'] as const) {
    const ids = entries.filter(e => e.media_type === type).map(e => e.mal_id)
    if (ids.length === 0) continue

    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await supabase
        .from('mal_poster_cache')
        .select('mal_id, title_it')
        .eq('media_type', type)
        .not('title_it', 'is', null)
        .in('mal_id', ids.slice(i, i + 500))

      if (error) { logger.error('[AniList Import] mal_poster_cache lookup error:', error); continue }

      for (const row of (data || [])) {
        if (row.title_it) result.set(row.mal_id, row.title_it)
      }
    }
  }

  return result
}


// ── Route ─────────────────────────────────────────────────────────────────────

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

  // ── Streaming response ────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')) } catch {}
      }

      try {
        // ── Fetch lista AniList (con progress per pagina) ───────────────
        const allItems: any[] = []
        const errors: string[] = []
        let totalFetched = 0

        for (const type of validTypes) {
          let page    = 1
          let hasNext = true
          while (hasNext && page <= 10) {
            send({ type: 'progress', step: 'fetch', page,
              message: `Recupero lista AniList... pagina ${page}` })
            try {
              const { items, hasNextPage } = await fetchAniListPage(username, type, page)
              allItems.push(...items.map(i => ({ ...i, _type: type })))
              totalFetched += items.length
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
          send({ type: 'error', message: 'Impossibile recuperare i dati. Il profilo AniList è pubblico?' }); return
        }

        // ── Cross-reference MAL per titoli italiani ─────────────────────
        const malEntries: Array<{ mal_id: number; media_type: 'anime' | 'manga' }> = []
        const seenMalIds = new Set<string>()

        for (const item of allItems) {
          const media = item.media
          if (!media?.idMal) continue
          const media_type = item._type === 'ANIME' ? 'anime' : 'manga'
          const key = `${media_type}-${media.idMal}`
          if (!seenMalIds.has(key)) {
            seenMalIds.add(key)
            malEntries.push({ mal_id: media.idMal, media_type })
          }
        }

        const malTitlesIt = await loadMalTitlesIt(supabase, malEntries)

        // ── Build entries ───────────────────────────────────────────────
        send({ type: 'progress', step: 'save', current: 0, total: 0, message: 'Salvataggio...' })

        const toInsert = allItems
          .filter(item => item.media?.id)
          .map(item => {
            const media   = item.media
            const isAnime = item._type === 'ANIME'
            const type    = isAnime ? 'anime' : 'manga'

            const titleIt = media.idMal ? (malTitlesIt.get(media.idMal) || null) : null
            const title   = titleIt || media.title?.romaji || media.title?.english || 'Senza titolo'

            const topTags = (media.tags || [])
              .filter((t: any) => t.rank >= 60)
              .sort((a: any, b: any) => b.rank - a.rank)
              .slice(0, 15)
              .map((t: any) => t.name)

            const rating = item.score ? Math.round((item.score / 10) * 5 * 2) / 2 : null

            return {
              user_id:         user.id,
              external_id:     `anilist-${type}-${media.id}`,
              title,
              type,
              // Proxy attraverso wsrv.nl per uniformità con MAL e maggiore stabilità
              cover_image:     media.coverImage?.extraLarge || media.coverImage?.large || null,
              current_episode: item.progress || 0,
              episodes:        isAnime ? (media.episodes || null) : (media.chapters || null),
              status:          STATUS_MAP[item.status] || 'watching',
              rating:          rating && rating > 0 ? rating : null,
              genres:          media.genres || [],
              tags:            topTags,
              notes:           item.notes || null,
              import_source:   'anilist',
              display_order:   Date.now(),
              updated_at:      new Date().toISOString(),
            }
          })

        if (toInsert.length === 0) {
          send({ type: 'done', imported: 0, merged: 0, skipped: 0, total: 0,
            message: 'Nessun titolo valido trovato nel profilo AniList' }); return
        }

        const { imported, merged, skipped } = await upsertWithMerge(supabase, toInsert, user.id, '[AniList Import]')

        const italianCount = malTitlesIt.size
        const italianMsg   = italianCount > 0 ? ` (${italianCount} titoli italiani da MAL)` : ''

        send({
          type:    'done',
          imported, merged, skipped,
          total:   toInsert.length,
          errors:  errors.length > 0 ? errors : undefined,
          message: `Importati ${imported} titoli da AniList (@${username})${merged > 0 ? `, ${merged} uniti con duplicati` : ''}${italianMsg}`,
        })
      } catch (e: any) {
        send({ type: 'error', message: e.message || 'Errore imprevisto.' })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    },
  })
}
