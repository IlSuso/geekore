// src/app/api/tmdb/route.ts
// Route GET per ricerca film/serie TV su TMDb.
// Chiamata dal Discover: /api/tmdb?q=<termine>&type=movie|tv

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

const TMDB_BASE = 'https://api.themoviedb.org/3'

function tmdbHeaders() {
  return {
    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_TMDB_API_KEY}`,
    'Accept': 'application/json',
  }
}

function tmdbImage(path: string | null | undefined) {
  if (!path) return undefined
  return `https://image.tmdb.org/t/p/w500${path}`
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'tmdb-search' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || searchParams.get('search') || ''
  const typeParam = searchParams.get('type') // 'movie' | 'tv' | null

  if (!q || q.trim().length < 2) return NextResponse.json([], { headers: rl.headers })

  const term = q.trim().slice(0, 100)
  const token = process.env.NEXT_PUBLIC_TMDB_API_KEY
  if (!token) return NextResponse.json([], { headers: rl.headers })

  let types: ('movie' | 'tv')[] = ['movie', 'tv']
  if (typeParam === 'movie') types = ['movie']
  else if (typeParam === 'tv') types = ['tv']

  const allResults: any[] = []

  for (const mediaType of types) {
    try {
      const res = await fetch(
        `${TMDB_BASE}/search/${mediaType}?query=${encodeURIComponent(term)}&language=it-IT&page=1`,
        { headers: tmdbHeaders(), signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const json = await res.json()
      const results: any[] = (json.results || []).slice(0, 15)

      // Fetch dettagli stagioni per le serie (in batch limitato)
      const mapped = await Promise.all(results
        .filter((m: any) => m.poster_path)
        .slice(0, 10)
        .map(async (m: any) => {
          let seasons: Record<number, { episode_count: number }> | undefined
          let totalEpisodes: number | undefined
          let keywords: string[] = []

          if (mediaType === 'tv') {
            try {
              const [detailRes, kwRes] = await Promise.all([
                fetch(`${TMDB_BASE}/tv/${m.id}?language=it-IT`, { headers: tmdbHeaders(), signal: AbortSignal.timeout(3000) }),
                fetch(`${TMDB_BASE}/tv/${m.id}/keywords`, { headers: tmdbHeaders(), signal: AbortSignal.timeout(3000) }),
              ])
              if (detailRes.ok) {
                const detail = await detailRes.json()
                totalEpisodes = detail.number_of_episodes
                seasons = {}
                for (const s of (detail.seasons || [])) {
                  if (s.season_number > 0) seasons[s.season_number] = { episode_count: s.episode_count || 0 }
                }
              }
              if (kwRes.ok) {
                const kj = await kwRes.json()
                keywords = (kj.results || []).map((k: any) => k.name).slice(0, 20)
              }
            } catch { /* skip */ }
          } else {
            try {
              const kwRes = await fetch(`${TMDB_BASE}/movie/${m.id}/keywords`, { headers: tmdbHeaders(), signal: AbortSignal.timeout(3000) })
              if (kwRes.ok) {
                const kj = await kwRes.json()
                keywords = (kj.keywords || []).map((k: any) => k.name).slice(0, 20)
              }
            } catch { /* skip */ }
          }

          return {
            id: m.id.toString(),
            title: m.title || m.name || 'Senza titolo',
            type: mediaType,
            coverImage: tmdbImage(m.poster_path),
            year: m.release_date
              ? parseInt(m.release_date.substring(0, 4))
              : m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined,
            description: m.overview ? m.overview.slice(0, 400) : undefined,
            episodes: totalEpisodes,
            totalSeasons: seasons ? Object.keys(seasons).length : undefined,
            seasons,
            keywords,
            score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
            source: 'tmdb',
          }
        })
      )

      allResults.push(...mapped.filter(Boolean))
    } catch { /* continua */ }
  }

  return NextResponse.json(allResults, { headers: rl.headers })
}