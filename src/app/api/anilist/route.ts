// src/app/api/anilist/route.ts
// Route GET per ricerca anime/manga su AniList tramite GraphQL.
// Chiamata dal Discover: /api/anilist?q=<termine>&type=anime|manga

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

const ANILIST_API = 'https://graphql.anilist.co'

const QUERY = `
query ($search: String, $type: MediaType) {
  Page(page: 1, perPage: 20) {
    media(search: $search, type: $type, sort: [SEARCH_MATCH, POPULARITY_DESC], isAdult: false) {
      id type
      title { romaji english }
      coverImage { large }
      seasonYear episodes chapters
      description(asHtml: false)
      genres averageScore
      tags { name rank }
    }
  }
}
`

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'anilist-search' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || searchParams.get('search') || ''
  const typeParam = searchParams.get('type')

  if (!q || q.trim().length < 2) return NextResponse.json([], { headers: rl.headers })

  const term = q.trim().slice(0, 100)
  let types: ('ANIME' | 'MANGA')[] = ['ANIME', 'MANGA']
  if (typeParam === 'anime') types = ['ANIME']
  else if (typeParam === 'manga') types = ['MANGA']

  const allResults: any[] = []

  for (const mediaType of types) {
    try {
      const res = await fetch(ANILIST_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: QUERY, variables: { search: term, type: mediaType } }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const json = await res.json()
      const media: any[] = json.data?.Page?.media || []

      allResults.push(...media
        .filter((m: any) => m.coverImage?.large)
        .map((m: any) => ({
          id: `anilist-${m.type === 'ANIME' ? 'anime' : 'manga'}-${m.id}`,
          title: m.title?.romaji || m.title?.english || 'Senza titolo',
          type: m.type === 'ANIME' ? 'anime' : 'manga',
          coverImage: m.coverImage.large,
          year: m.seasonYear,
          episodes: m.type === 'ANIME' ? m.episodes : m.chapters,
          description: m.description ? m.description.replace(/<[^>]+>/g, '').slice(0, 400) : undefined,
          genres: m.genres || [],
          tags: (m.tags || []).filter((t: any) => t.rank >= 60).sort((a: any, b: any) => b.rank - a.rank).slice(0, 15).map((t: any) => t.name),
          score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
          source: 'anilist',
        }))
      )
    } catch { /* continua */ }
  }

  return NextResponse.json(allResults, { headers: rl.headers })
}