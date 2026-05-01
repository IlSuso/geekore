// src/app/api/trending/route.ts
// Returns trending anime + trending films/TV without a search query.
// Used by the Discover page empty state.

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

const ANILIST_API = 'https://graphql.anilist.co'

const TRENDING_QUERY = `
query ($type: MediaType, $perPage: Int) {
  Page(page: 1, perPage: $perPage) {
    media(type: $type, sort: TRENDING_DESC, isAdult: false, format_not_in: [MOVIE, MUSIC, SPECIAL]) {
      id type
      title { romaji english }
      coverImage { extraLarge large }
      seasonYear
      genres
      averageScore
    }
  }
}
`

function tmdbHeaders() {
  return {
    Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
    Accept: 'application/json',
  }
}

function tmdbImage(path: string | null | undefined) {
  if (!path) return undefined
  return `https://image.tmdb.org/t/p/w500${path}`
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'trending' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })

  const { searchParams } = new URL(request.url)
  const section = searchParams.get('section') || 'anime' // 'anime' | 'movie' | 'tv'

  try {
    if (section === 'anime') {
      const res = await fetch(ANILIST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: TRENDING_QUERY, variables: { type: 'ANIME', perPage: 10 } }),
        signal: AbortSignal.timeout(6000),
        next: { revalidate: 3600 },
      })
      if (!res.ok) return NextResponse.json([], { headers: rl.headers })
      const json = await res.json()
      const media: any[] = json.data?.Page?.media || []
      const items = media
        .filter((m: any) => m.coverImage?.large)
        .map((m: any) => ({
          id: `anilist-anime-${m.id}`,
          title: m.title?.english || m.title?.romaji || 'Senza titolo',
          type: 'anime',
          coverImage: m.coverImage.extraLarge || m.coverImage.large,
          year: m.seasonYear,
          genres: m.genres || [],
          score: m.averageScore,
          source: 'anilist',
        }))
      return NextResponse.json(items, { headers: rl.headers })
    }

    if (section === 'movie' || section === 'tv') {
      const url = `https://api.themoviedb.org/3/trending/${section}/week?language=it-IT`
      const res = await fetch(url, {
        headers: tmdbHeaders(),
        signal: AbortSignal.timeout(6000),
        next: { revalidate: 3600 },
      })
      if (!res.ok) return NextResponse.json([], { headers: rl.headers })
      const json = await res.json()
      const results: any[] = json.results || []
      const items = results
        .filter((r: any) => r.poster_path)
        .slice(0, 10)
        .map((r: any) => ({
          id: `tmdb-${section}-${r.id}`,
          title: r.title || r.name || 'Senza titolo',
          type: section,
          coverImage: tmdbImage(r.poster_path),
          year: parseInt((r.release_date || r.first_air_date || '').slice(0, 4)) || undefined,
          genres: [],
          score: Math.round((r.vote_average || 0) * 10),
          source: 'tmdb',
        }))
      return NextResponse.json(items, { headers: rl.headers })
    }

    return NextResponse.json([], { headers: rl.headers })
  } catch {
    return NextResponse.json([], { headers: rl.headers })
  }
}
