// src/app/api/tmdb/route.ts
// Route GET per ricerca film/serie TV su TMDb.
// Chiamata dal Discover: /api/tmdb?q=<termine>&type=movie|tv

import { NextRequest, NextResponse } from 'next/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { truncateAtSentence } from '@/lib/utils'
import { getRequestLocale, localeToTmdbLanguage } from '@/lib/i18n/serverLocale'

const TMDB_BASE = 'https://api.themoviedb.org/3'

const TMDB_MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
}
const TMDB_TV_GENRES: Record<number, string> = {
  10759: 'Action', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 10762: 'Kids', 9648: 'Mystery', 10763: 'News',
  10764: 'Reality', 10765: 'Science Fiction', 10766: 'Soap', 10767: 'Talk',
  10768: 'War', 37: 'Western',
}

function resolveGenreNames(ids: number[], type: 'movie' | 'tv'): string[] {
  const map = type === 'movie' ? TMDB_MOVIE_GENRES : TMDB_TV_GENRES
  return (ids || []).map(id => map[id]).filter(Boolean)
}

function tmdbHeaders() {
  return {
    'Authorization': `Bearer ${process.env.TMDB_API_KEY}`,
    'Accept': 'application/json',
  }
}

function tmdbImage(path: string | null | undefined) {
  if (!path) return undefined
  return `https://image.tmdb.org/t/p/w780${path}`
}

export async function GET(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 30, windowMs: 60_000, prefix: 'tmdb-search' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || searchParams.get('search') || ''
  const typeParam = searchParams.get('type')
  const locale = await getRequestLocale(request)
  const tmdbLang = localeToTmdbLanguage(locale)

  if (!q || q.trim().length < 2) return NextResponse.json([], { headers: rl.headers })

  const term = q.trim().slice(0, 100)
  const token = process.env.TMDB_API_KEY
  if (!token) return NextResponse.json([], { headers: rl.headers })

  let types: ('movie' | 'tv')[] = ['movie', 'tv']
  if (typeParam === 'movie') types = ['movie']
  else if (typeParam === 'tv') types = ['tv']

  const allResults: any[] = []

  for (const mediaType of types) {
    try {
      const res = await fetch(
        `${TMDB_BASE}/search/${mediaType}?query=${encodeURIComponent(term)}&language=${tmdbLang}&page=1`,
        { headers: tmdbHeaders(), signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const json = await res.json()
      const results: any[] = (json.results || []).slice(0, 15)

      let enMap: Map<number, string> = new Map()
      if (tmdbLang !== 'en-US') {
        try {
          const enRes = await fetch(
            `${TMDB_BASE}/search/${mediaType}?query=${encodeURIComponent(term)}&language=en-US&page=1`,
            { headers: tmdbHeaders(), signal: AbortSignal.timeout(6000) }
          )
          if (enRes.ok) {
            const enJson = await enRes.json()
            for (const r of (enJson.results || [])) {
              enMap.set(r.id, r.title || r.name || '')
            }
          }
        } catch { /* skip */ }
      }

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
                fetch(`${TMDB_BASE}/tv/${m.id}?language=${tmdbLang}`, { headers: tmdbHeaders(), signal: AbortSignal.timeout(3000) }),
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

          const localTitle = m.title || m.name || ''
          const titleEn = tmdbLang === 'en-US'
            ? localTitle
            : (enMap.get(m.id) || m.original_title || m.original_name || localTitle)
          const description = m.overview ? truncateAtSentence(m.overview, 400) : undefined

          return {
            id: m.id.toString(),
            title: localTitle || titleEn || 'No title',
            title_original: m.original_title || m.original_name || titleEn || localTitle || undefined,
            title_en: titleEn || localTitle || 'No title',
            title_it: locale === 'it' ? (localTitle || undefined) : undefined,
            type: mediaType,
            coverImage: tmdbImage(m.poster_path),
            year: m.release_date
              ? parseInt(m.release_date.substring(0, 4))
              : m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined,
            description,
            description_en: locale === 'en' ? description : undefined,
            description_it: locale === 'it' ? description : undefined,
            localized: {
              [locale]: { title: localTitle || titleEn || 'No title', description },
              ...(titleEn ? { en: { title: titleEn } } : {}),
            },
            genres: resolveGenreNames(m.genre_ids || [], mediaType),
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