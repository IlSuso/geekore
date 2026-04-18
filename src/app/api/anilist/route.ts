// Anime search → TMDB (descrizioni in italiano, stessa infrastruttura)
// Manga search  → AniList (TMDB non copre i manga)

import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'

const ANILIST_API = 'https://graphql.anilist.co'

// ─── TMDB anime ───────────────────────────────────────────────────────────────

function tmdbHeaders() {
  return {
    'Authorization': `Bearer ${process.env.TMDB_API_KEY}`,
    'Accept': 'application/json',
  }
}

const TMDB_TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  10762: 'Kids', 9648: 'Mystery', 10765: 'Sci-Fi & Fantasy', 37: 'Western',
}

async function searchAnimeTMDB(term: string, lang: string): Promise<any[]> {
  const tmdbLang = lang === 'en' ? 'en-US' : 'it-IT'
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/tv?query=${encodeURIComponent(term)}&language=${tmdbLang}&include_adult=false`,
      { headers: tmdbHeaders(), signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return []
    const json = await res.json()
    return (json.results || [])
      .filter((m: any) => m.original_language === 'ja' && m.poster_path)
      .slice(0, 15)
      .map((m: any) => ({
        id: `tmdb-anime-${m.id}`,
        title: m.name || m.original_name || 'Senza titolo',
        type: 'anime',
        coverImage: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
        year: m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined,
        episodes: undefined,
        description: m.overview?.slice(0, 400) || undefined,
        genres: (m.genre_ids || []).map((id: number) => TMDB_TV_GENRES[id]).filter(Boolean),
        score: m.vote_average > 0 ? Math.round(m.vote_average * 5) / 10 : undefined,
        trending: Math.round(m.popularity || 0),
        source: 'tmdb',
        studios: [],
        directors: [],
        authors: [],
        relations: [],
        tags: [],
      }))
  } catch { return [] }
}

// ─── AniList manga ────────────────────────────────────────────────────────────

const MANGA_QUERY = `
query ($search: String) {
  Page(page: 1, perPage: 20) {
    media(search: $search, type: MANGA, sort: [SEARCH_MATCH, POPULARITY_DESC], isAdult: false) {
      id type
      title { romaji english }
      coverImage { large }
      seasonYear chapters
      description(asHtml: false)
      genres averageScore trending
      tags { name rank }
      studios(isMain: true) { nodes { name } }
      staff(sort: RELEVANCE) {
        edges { role node { name { full } } }
      }
      relations {
        edges {
          relationType
          node { id type title { romaji } coverImage { large } seasonYear genres }
        }
      }
    }
  }
}
`

const AUTHOR_ROLES = new Set(['Story', 'Story & Art', 'Original Creator', 'Art'])
const CONTINUITY_RELATIONS = new Set(['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE'])

async function searchMangaAniList(term: string): Promise<any[]> {
  try {
    const res = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: MANGA_QUERY, variables: { search: term } }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const json = await res.json()
    const media: any[] = json.data?.Page?.media || []

    return media
      .filter((m: any) => m.coverImage?.large)
      .map((m: any) => {
        const authors: string[] = []
        for (const edge of (m.staff?.edges || [])) {
          const role: string = edge.role || ''
          const name: string = edge.node?.name?.full || ''
          if (name && AUTHOR_ROLES.has(role)) authors.push(name)
        }

        const relations = (m.relations?.edges || [])
          .filter((e: any) => CONTINUITY_RELATIONS.has(e.relationType) && e.node)
          .slice(0, 5)
          .map((e: any) => ({
            relationType: e.relationType,
            id: `anilist-manga-${e.node.id}`,
            type: 'manga',
            title: e.node.title?.romaji || '',
            coverImage: e.node.coverImage?.large,
            year: e.node.seasonYear,
            genres: e.node.genres || [],
          }))

        return {
          id: `anilist-manga-${m.id}`,
          title: m.title?.romaji || m.title?.english || 'Senza titolo',
          type: 'manga',
          coverImage: m.coverImage.large,
          year: m.seasonYear,
          episodes: m.chapters,
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
          studios: (m.studios?.nodes || []).map((s: any) => s.name).filter(Boolean),
          directors: [],
          authors,
          relations,
        }
      })
  } catch { return [] }
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'anilist-search' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || searchParams.get('search') || ''
  const typeParam = (searchParams.get('type') || '').toLowerCase()
  const lang = searchParams.get('lang') || 'it'

  if (!q || q.trim().length < 2) return NextResponse.json([], { headers: rl.headers })

  const term = q.trim().slice(0, 100)

  const wantsAnime = !typeParam || typeParam === 'anime'
  const wantsManga = !typeParam || typeParam === 'manga'

  const [animeResults, mangaResults] = await Promise.all([
    wantsAnime ? searchAnimeTMDB(term, lang) : Promise.resolve([]),
    wantsManga ? searchMangaAniList(term) : Promise.resolve([]),
  ])

  return NextResponse.json([...animeResults, ...mangaResults], { headers: rl.headers })
}
