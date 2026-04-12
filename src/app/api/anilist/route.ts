// DESTINAZIONE: src/app/api/anilist/route.ts
// V3: aggiunta studios, staff (regista/autore), relations (sequel) nella risposta
// per alimentare il creator tracking e il continuity engine

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
      genres averageScore trending
      tags { name rank }
      # V3: studios per creator tracking
      studios(isMain: true) { nodes { name } }
      # V3: staff per director/author tracking
      staff(sort: RELEVANCE) {
        edges {
          role
          node { name { full } }
        }
      }
      # V3: relations per continuity engine
      relations {
        edges {
          relationType
          node {
            id type
            title { romaji }
            coverImage { large }
            seasonYear
            genres
          }
        }
      }
    }
  }
}
`

// Ruoli che identifichiamo come "director" per anime
const DIRECTOR_ROLES = new Set(['Director', 'Series Director', 'Original Creator', 'Chief Animation Director'])
// Ruoli che identifichiamo come "author" per manga
const AUTHOR_ROLES = new Set(['Story', 'Story & Art', 'Original Creator', 'Art'])
// Tipi di relazione rilevanti per continuity
const CONTINUITY_RELATIONS = new Set(['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE'])

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
        .map((m: any) => {
          const isAnime = m.type === 'ANIME'
          const type = isAnime ? 'anime' : 'manga'

          // V3: estrai studios
          const studios: string[] = (m.studios?.nodes || []).map((s: any) => s.name).filter(Boolean)

          // V3: estrai director/author dalla staff list
          const directors: string[] = []
          const authors: string[] = []
          for (const edge of (m.staff?.edges || [])) {
            const role: string = edge.role || ''
            const name: string = edge.node?.name?.full || ''
            if (!name) continue
            if (isAnime && DIRECTOR_ROLES.has(role)) directors.push(name)
            if (!isAnime && AUTHOR_ROLES.has(role)) authors.push(name)
          }

          // V3: estrai relazioni per continuity engine
          const relations: Array<{
            relationType: string
            id: string
            type: string
            title: string
            coverImage?: string
            year?: number
            genres: string[]
          }> = []
          for (const edge of (m.relations?.edges || [])) {
            if (!CONTINUITY_RELATIONS.has(edge.relationType)) continue
            const node = edge.node
            if (!node) continue
            relations.push({
              relationType: edge.relationType,
              id: `anilist-${node.type === 'ANIME' ? 'anime' : 'manga'}-${node.id}`,
              type: node.type === 'ANIME' ? 'anime' : 'manga',
              title: node.title?.romaji || '',
              coverImage: node.coverImage?.large,
              year: node.seasonYear,
              genres: node.genres || [],
            })
          }

          return {
            id: `anilist-${type}-${m.id}`,
            title: m.title?.romaji || m.title?.english || 'Senza titolo',
            type,
            coverImage: m.coverImage.large,
            year: m.seasonYear,
            episodes: isAnime ? m.episodes : m.chapters,
            description: m.description ? m.description.replace(/<[^>]+>/g, '').slice(0, 400) : undefined,
            genres: m.genres || [],
            tags: (m.tags || [])
              .filter((t: any) => t.rank >= 60)
              .sort((a: any, b: any) => b.rank - a.rank)
              .slice(0, 15)
              .map((t: any) => t.name),
            score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
            trending: m.trending || 0,
            source: 'anilist',
            // V3: creator data
            studios,
            directors,
            authors,
            // V3: relations per continuity
            relations: relations.slice(0, 5),
          }
        })
      )
    } catch { /* continua */ }
  }

  return NextResponse.json(allResults, { headers: rl.headers })
}