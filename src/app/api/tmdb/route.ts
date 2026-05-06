// src/app/api/tmdb/route.ts
// Ricerca film/serie TV su TMDb con titoli ufficiali IT/EN.
// Non traduce i titoli: li importa da TMDb nelle due lingue quando disponibili.

import { NextRequest, NextResponse } from 'next/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { getRequestLocale, localeToTmdbLanguage, type AppLocale } from '@/lib/i18n/serverLocale'
import { apiMessage } from '@/lib/i18n/apiErrors'

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
    Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
    Accept: 'application/json',
  }
}

function tmdbImage(path: string | null | undefined) {
  if (!path) return undefined
  return `https://image.tmdb.org/t/p/w780${path}`
}


function pickPoster(posters: any[], preferredLanguage: 'it' | 'en') {
  if (!Array.isArray(posters) || posters.length === 0) return undefined

  const ranked = [...posters]
    .filter(p => p?.file_path)
    .sort((a, b) => {
      const aLang = a.iso_639_1 === preferredLanguage ? 3 : a.iso_639_1 === null ? 2 : 1
      const bLang = b.iso_639_1 === preferredLanguage ? 3 : b.iso_639_1 === null ? 2 : 1
      if (aLang !== bLang) return bLang - aLang
      const aScore = (Number(a.vote_average) || 0) * 100 + (Number(a.vote_count) || 0)
      const bScore = (Number(b.vote_average) || 0) * 100 + (Number(b.vote_count) || 0)
      return bScore - aScore
    })

  return tmdbImage(ranked[0]?.file_path)
}

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

function pickTitle(item: any, type: 'movie' | 'tv') {
  return type === 'movie'
    ? clean(item.title) || clean(item.original_title)
    : clean(item.name) || clean(item.original_name)
}

function pickOriginalTitle(item: any, type: 'movie' | 'tv') {
  return type === 'movie'
    ? clean(item.original_title) || clean(item.title)
    : clean(item.original_name) || clean(item.name)
}

async function searchTmdb(type: 'movie' | 'tv', term: string, language: 'it-IT' | 'en-US') {
  const res = await fetch(
    `${TMDB_BASE}/search/${type}?query=${encodeURIComponent(term)}&language=${language}&page=1`,
    { headers: tmdbHeaders(), signal: AbortSignal.timeout(8000) },
  )
  if (!res.ok) return []
  const json = await res.json()
  return json.results || []
}

async function fetchTmdbDetails(type: 'movie' | 'tv', id: number | string, locale: AppLocale) {
  const language = localeToTmdbLanguage(locale)
  const endpoint = type === 'movie' ? 'movie' : 'tv'

  try {
    const detailRes = await fetch(
      `${TMDB_BASE}/${endpoint}/${id}?language=${language}`,
      { headers: tmdbHeaders(), signal: AbortSignal.timeout(4000) },
    )

    if (!detailRes.ok) return null
    return await detailRes.json()
  } catch {
    return null
  }
}

async function fetchTmdbImages(type: 'movie' | 'tv', id: number | string) {
  try {
    const endpoint = type === 'movie' ? 'movie' : 'tv'
    const res = await fetch(
      `${TMDB_BASE}/${endpoint}/${id}/images?include_image_language=en,it,null`,
      { headers: tmdbHeaders(), signal: AbortSignal.timeout(4000) },
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function fetchKeywords(type: 'movie' | 'tv', id: number | string): Promise<string[]> {
  try {
    const endpoint = type === 'movie' ? 'movie' : 'tv'
    const kwRes = await fetch(
      `${TMDB_BASE}/${endpoint}/${id}/keywords`,
      { headers: tmdbHeaders(), signal: AbortSignal.timeout(3000) },
    )
    if (!kwRes.ok) return []
    const json = await kwRes.json()
    return type === 'movie'
      ? (json.keywords || []).map((k: any) => k.name).slice(0, 20)
      : (json.results || []).map((k: any) => k.name).slice(0, 20)
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 30, windowMs: 60_000, prefix: 'tmdb-search' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyRequests') }, { status: 429, headers: rl.headers })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || searchParams.get('search') || ''
  const typeParam = searchParams.get('type')
  const locale = await getRequestLocale(request)
  const currentLanguage = localeToTmdbLanguage(locale)

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
      const [currentResults, enResults, itResults] = await Promise.all([
        searchTmdb(mediaType, term, currentLanguage),
        currentLanguage === 'en-US' ? Promise.resolve([]) : searchTmdb(mediaType, term, 'en-US'),
        currentLanguage === 'it-IT' ? Promise.resolve([]) : searchTmdb(mediaType, term, 'it-IT'),
      ])

      const enMap = new Map<number, any>()
      const itMap = new Map<number, any>()

      for (const item of enResults) enMap.set(item.id, item)
      for (const item of itResults) itMap.set(item.id, item)

      const mapped = await Promise.all(
        currentResults
          .filter((m: any) => m.poster_path)
          .slice(0, 10)
          .map(async (m: any) => {
            const enItem = currentLanguage === 'en-US' ? m : enMap.get(m.id)
            const itItem = currentLanguage === 'it-IT' ? m : itMap.get(m.id)

            // Se la search parallela non ha trovato la stessa ID, dettaglio diretto.
            // Nota: non richiamiamo più i dettagli TMDb solo per stagioni/episodi.
            // Il drawer non usa più queste informazioni per le serie TV.
            const [enDetail, itDetail, images, keywords] = await Promise.all([
              enItem ? Promise.resolve(enItem) : fetchTmdbDetails(mediaType, m.id, 'en'),
              itItem ? Promise.resolve(itItem) : fetchTmdbDetails(mediaType, m.id, 'it'),
              fetchTmdbImages(mediaType, m.id),
              fetchKeywords(mediaType, m.id),
            ])

            const titleEn = pickTitle(enDetail, mediaType) || pickOriginalTitle(m, mediaType) || pickTitle(m, mediaType)
            const titleIt = pickTitle(itDetail, mediaType) || pickTitle(m, mediaType) || titleEn
            const titleOriginal = pickOriginalTitle(m, mediaType) || titleEn || titleIt
            const title = locale === 'it' ? (titleIt || titleEn || titleOriginal) : (titleEn || titleOriginal || titleIt)

            const descriptionEn = clean(enDetail?.overview)
            const descriptionIt = clean(itDetail?.overview)
            const description = locale === 'it'
              ? (descriptionIt || descriptionEn)
              : (descriptionEn || descriptionIt)

            const coverImageEn = pickPoster(images?.posters || [], 'en') || tmdbImage(enDetail?.poster_path) || tmdbImage(m.poster_path)
            const coverImageIt = pickPoster(images?.posters || [], 'it') || tmdbImage(itDetail?.poster_path) || coverImageEn || tmdbImage(m.poster_path)
            const coverImage = locale === 'it' ? (coverImageIt || coverImageEn) : (coverImageEn || coverImageIt)

            return {
              id: m.id.toString(),
              external_id: m.id.toString(),
              title: title || 'No title',
              title_original: titleOriginal,
              title_en: titleEn,
              title_it: titleIt,
              type: mediaType,
              coverImage,
              cover_image_en: coverImageEn,
              cover_image_it: coverImageIt,
              year: m.release_date
                ? parseInt(m.release_date.substring(0, 4))
                : m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined,
              description,
              description_en: descriptionEn,
              description_it: descriptionIt,
              localized: {
                ...(titleEn || descriptionEn ? {
                  en: {
                    ...(titleEn ? { title: titleEn } : {}),
                    ...(descriptionEn ? { description: descriptionEn } : {}),
                    ...(coverImageEn ? { coverImage: coverImageEn } : {}),
                  },
                } : {}),
                ...(titleIt || descriptionIt ? {
                  it: {
                    ...(titleIt ? { title: titleIt } : {}),
                    ...(descriptionIt ? { description: descriptionIt } : {}),
                    ...(coverImageIt ? { coverImage: coverImageIt } : {}),
                  },
                } : {}),
              },
              genres: resolveGenreNames(m.genre_ids || [], mediaType),
              keywords,
              score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
              source: 'tmdb',
            }
          }),
      )

      allResults.push(...mapped.filter(Boolean))
    } catch {
      // continua con l'altro tipo
    }
  }

  return NextResponse.json(allResults, { headers: rl.headers })
}
