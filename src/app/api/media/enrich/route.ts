// POST /api/media/enrich
// Recupera dati episodi/capitoli per un media item mancante di quelle info.
// Supporta: TV via TMDB, anime/manga via Jikan (MAL ID) e AniList GraphQL.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { checkOrigin } from '@/lib/csrf'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const JIKAN_BASE = 'https://api.jikan.moe/v4'
const ANILIST_GQL = 'https://graphql.anilist.co'

function tmdbHeaders() {
  return { Authorization: `Bearer ${process.env.TMDB_API_KEY}`, Accept: 'application/json' }
}

async function fetchTvByTmdbId(tmdbId: number): Promise<{ episodes: number; season_episodes: Record<number, { episode_count: number }> } | null> {
  try {
    const res = await fetch(`${TMDB_BASE}/tv/${tmdbId}?language=it-IT`, {
      headers: tmdbHeaders(),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const detail = await res.json()
    const season_episodes: Record<number, { episode_count: number }> = {}
    for (const s of (detail.seasons || [])) {
      if (s.season_number > 0) season_episodes[s.season_number] = { episode_count: s.episode_count || 0 }
    }
    return { episodes: detail.number_of_episodes || 0, season_episodes }
  } catch { return null }
}

async function searchTmdbTv(title: string): Promise<{ episodes: number; season_episodes: Record<number, { episode_count: number }> } | null> {
  try {
    const res = await fetch(
      `${TMDB_BASE}/search/tv?query=${encodeURIComponent(title)}&language=it-IT&page=1`,
      { headers: tmdbHeaders(), signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const json = await res.json()
    const first = (json.results || [])[0]
    if (!first?.id) return null
    return fetchTvByTmdbId(first.id)
  } catch { return null }
}

async function fetchJikanAnime(malId: number): Promise<{ episodes: number } | null> {
  try {
    const res = await fetch(`${JIKAN_BASE}/anime/${malId}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const json = await res.json()
    const eps = json?.data?.episodes
    return eps ? { episodes: eps } : null
  } catch { return null }
}

async function fetchJikanManga(malId: number): Promise<{ episodes: number } | null> {
  try {
    const res = await fetch(`${JIKAN_BASE}/manga/${malId}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const json = await res.json()
    const chapters = json?.data?.chapters
    return chapters ? { episodes: chapters } : null
  } catch { return null }
}

async function fetchAniList(id: number, mediaType: 'ANIME' | 'MANGA'): Promise<{ episodes: number } | null> {
  try {
    const field = mediaType === 'ANIME' ? 'episodes' : 'chapters'
    const query = `query { Media(id: ${id}, type: ${mediaType}) { ${field} } }`
    const res = await fetch(ANILIST_GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const val = json?.data?.Media?.[field]
    return val ? { episodes: val } : null
  } catch { return null }
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 20, windowMs: 60_000, prefix: 'media-enrich' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401, headers: rl.headers })

  const body = await request.json().catch(() => ({}))
  const { user_media_id } = body

  if (!user_media_id) return NextResponse.json({ error: 'user_media_id mancante' }, { status: 400, headers: rl.headers })

  const { data: entry } = await supabase
    .from('user_media_entries')
    .select('id, type, external_id, title, user_id')
    .eq('id', user_media_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!entry) return NextResponse.json({ error: 'Non trovato' }, { status: 404, headers: rl.headers })

  const { type, external_id, title } = entry
  let result: { episodes?: number; season_episodes?: Record<number, { episode_count: number }> } | null = null

  if (type === 'tv') {
    if (external_id && /^\d+$/.test(external_id)) {
      result = await fetchTvByTmdbId(parseInt(external_id))
    } else {
      result = await searchTmdbTv(title)
    }
  } else if (type === 'anime') {
    const malMatch = external_id?.match(/^mal-anime-(\d+)$/)
    const aniMatch = external_id?.match(/^anilist-anime-(\d+)$/)
    if (malMatch) {
      result = await fetchJikanAnime(parseInt(malMatch[1]))
    } else if (aniMatch) {
      result = await fetchAniList(parseInt(aniMatch[1]), 'ANIME')
    } else if (external_id && /^\d+$/.test(external_id)) {
      result = await fetchAniList(parseInt(external_id), 'ANIME')
    }
  } else if (type === 'manga') {
    const malMatch = external_id?.match(/^mal-manga-(\d+)$/)
    const aniMatch = external_id?.match(/^anilist-manga-(\d+)$/)
    if (malMatch) {
      result = await fetchJikanManga(parseInt(malMatch[1]))
    } else if (aniMatch) {
      result = await fetchAniList(parseInt(aniMatch[1]), 'MANGA')
    } else if (external_id && /^\d+$/.test(external_id)) {
      result = await fetchAniList(parseInt(external_id), 'MANGA')
    }
  }

  if (!result) return NextResponse.json({ error: 'Nessun dato trovato' }, { status: 404, headers: rl.headers })

  const dbUpdate: Record<string, unknown> = {}
  if (result.episodes) dbUpdate.episodes = result.episodes
  if (result.season_episodes && Object.keys(result.season_episodes).length > 0) {
    dbUpdate.season_episodes = result.season_episodes
  }

  if (Object.keys(dbUpdate).length === 0) return NextResponse.json({ error: 'Nessun dato utile trovato' }, { status: 404, headers: rl.headers })

  const { error: dbErr } = await supabase
    .from('user_media_entries')
    .update(dbUpdate)
    .eq('id', user_media_id)
    .eq('user_id', user.id)

  if (dbErr) return NextResponse.json({ error: 'Errore DB' }, { status: 500, headers: rl.headers })

  return NextResponse.json(dbUpdate, { headers: rl.headers })
}
