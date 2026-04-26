// DESTINAZIONE: src/app/api/anilist/route.ts
// V3: aggiunta studios, staff (regista/autore), relations (sequel) nella risposta
// per alimentare il creator tracking e il continuity engine

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { translateWithCache } from '@/lib/deepl'
import { truncateAtSentence } from '@/lib/utils'

const ANILIST_API = 'https://graphql.anilist.co'

const QUERY = `
query ($search: String, $type: MediaType) {
  Page(page: 1, perPage: 50) {
    media(search: $search, type: $type, sort: [SEARCH_MATCH, POPULARITY_DESC], isAdult: false) {
      id type
      format
      title { romaji english native }
      synonyms
      coverImage { extraLarge large }
      seasonYear episodes chapters
      description(asHtml: false)
      genres averageScore trending
      tags { name rank }
      studios(isMain: true) { nodes { name } }
      staff(sort: RELEVANCE) {
        edges {
          role
          node { name { full } }
        }
      }
      relations {
        edges {
          relationType
          node {
            id type
            title { romaji }
            coverImage { extraLarge large }
            seasonYear
            genres
          }
        }
      }
    }
  }
}
`

const DIRECTOR_ROLES = new Set(['Director', 'Series Director', 'Original Creator', 'Chief Animation Director'])
const AUTHOR_ROLES = new Set(['Story', 'Story & Art', 'Original Creator', 'Art'])
const CONTINUITY_RELATIONS = new Set(['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE'])

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'anilist-search' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || searchParams.get('search') || ''
  const typeParam = (searchParams.get('type') || '').toLowerCase()
  const lang = searchParams.get('lang') || 'it'

  if (!q || q.trim().length < 2) return NextResponse.json([], { headers: rl.headers })

  const term = q.trim().slice(0, 100)
  let types: ('ANIME' | 'MANGA')[] = ['ANIME', 'MANGA']
  if (typeParam === 'anime') types = ['ANIME']
  else if (typeParam === 'manga') types = ['MANGA']

  // Se la lingua è IT, traduci il termine in EN per migliorare il match su AniList
  // AniList non indicizza titoli italiani, ma indicizza titoli inglesi e romaji
  let termEn: string | null = null
  if (lang === 'it') {
    try {
      const deeplKey = process.env.DEEPL_API_KEY
      if (deeplKey) {
        const deeplBase = deeplKey.endsWith(':fx')
          ? 'https://api-free.deepl.com/v2'
          : 'https://api.deepl.com/v2'
        const tr = await fetch(`${deeplBase}/translate`, {
          method: 'POST',
          headers: { 'Authorization': `DeepL-Auth-Key ${deeplKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: [term], source_lang: 'IT', target_lang: 'EN' }),
          signal: AbortSignal.timeout(3000),
        })
        if (tr.ok) {
          const tj = await tr.json()
          const translated = tj.translations?.[0]?.text?.trim()
          if (translated && translated.toLowerCase() !== term.toLowerCase()) termEn = translated
        }
      }
    } catch { /* skip, usa solo term originale */ }
  }

  const allResults: any[] = []

  const seenIds = new Set<string>()

  for (const mediaType of types) {
    try {
      // Cerca in parallelo col termine originale e con la traduzione EN (se disponibile)
      const searchTerms = [term, ...(termEn ? [termEn] : [])]
      const responses = await Promise.all(searchTerms.map(t =>
        fetch(ANILIST_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: QUERY, variables: { search: t, type: mediaType } }),
          signal: AbortSignal.timeout(8000),
        }).then(r => r.ok ? r.json() : { data: null }).catch(() => ({ data: null }))
      ))
      const media: any[] = responses.flatMap((json: any) => json.data?.Page?.media || [])

      allResults.push(...media
        .filter((m: any) => {
          if (!m.coverImage?.large) return false
          if (m.format === 'MOVIE') return false  // film anime → esclusi, vanno su TMDB
          const uid = `${m.type}-${m.id}`
          if (seenIds.has(uid)) return false
          seenIds.add(uid)
          return true
        })
        .map((m: any) => {
          const isAnime = m.type === 'ANIME'
          const type = isAnime ? 'anime' : 'manga'

          const studios: string[] = (m.studios?.nodes || []).map((s: any) => s.name).filter(Boolean)

          const directors: string[] = []
          const authors: string[] = []
          for (const edge of (m.staff?.edges || [])) {
            const role: string = edge.role || ''
            const name: string = edge.node?.name?.full || ''
            if (!name) continue
            if (isAnime && DIRECTOR_ROLES.has(role)) directors.push(name)
            if (!isAnime && AUTHOR_ROLES.has(role)) authors.push(name)
          }

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
              coverImage: node.coverImage?.extraLarge || node.coverImage?.large,
              year: node.seasonYear,
              genres: node.genres || [],
            })
          }

          return {
            id: `anilist-${type}-${m.id}`,
            title: m.title?.english || m.title?.romaji || 'Senza titolo',
            titleRomaji: m.title?.romaji || undefined,
            type,
            coverImage: m.coverImage.extraLarge || m.coverImage.large,
            year: m.seasonYear,
            episodes: isAnime ? m.episodes : m.chapters,
            description: m.description ? truncateAtSentence(m.description.replace(/<[^>]+>/g, ''), 400) : undefined,
            genres: m.genres || [],
            tags: (m.tags || [])
              .filter((t: any) => t.rank >= 60)
              .sort((a: any, b: any) => b.rank - a.rank)
              .slice(0, 15)
              .map((t: any) => t.name),
            score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
            trending: m.trending || 0,
            source: 'anilist',
            studios,
            directors,
            authors,
            relations: relations.slice(0, 5),
          }
        })
      )
    } catch { /* continua */ }
  }

  if (lang === 'it') {
    const toTranslate = allResults.filter((r: any) => r.description)
    if (toTranslate.length > 0) {
      const items = toTranslate.map((r: any) => ({ id: r.id, text: r.description }))
      const translated = await translateWithCache(items, 'IT', 'EN')
      toTranslate.forEach((r: any) => {
        if (translated[r.id]) r.description = translated[r.id]
      })
    }
  }

  return NextResponse.json(allResults, { headers: rl.headers })
}