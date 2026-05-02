import { truncateAtSentence } from '@/lib/utils'
import { logger } from '@/lib/logger'
import {
  NICHE_LANGS,
  TMDB_BASE,
  TMDB_META_KW_BLOCKLIST,
  TMDB_MOVIE_ID_TO_GENRE,
  TMDB_TV_ID_TO_GENRE,
} from './constants'
import type { SimilarAdd, SimilarContext } from './types'

export async function resolveTmdbKeywordIds(keywords: string[], token: string): Promise<number[]> {
  if (!keywords.length) return []
  const toResolve = keywords.slice(0, 8)
  const slots: (number | null)[] = new Array(toResolve.length).fill(null)
  logger.info('SIMILAR', 'Resolving TMDB keywords', { count: toResolve.length })
  await Promise.allSettled(toResolve.map(async (kw, i) => {
    try {
      const res = await fetch(
        `${TMDB_BASE}/search/keyword?query=${encodeURIComponent(kw)}&page=1`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) }
      )
      if (!res.ok) return
      const json = await res.json()
      const first = json.results?.[0]
      logger.info('SIMILAR', 'TMDB keyword resolved', { matched: !!first })
      if (first?.id) slots[i] = first.id
    } catch (e) { logger.warn('SIMILAR', 'TMDB keyword resolve failed', e) }
  }))
  const ordered = slots.filter((id): id is number => id !== null)
  logger.info('SIMILAR', 'TMDB keywords resolved', { count: ordered.length })
  return ordered
}

export async function resolveProxyKeywords(
  sourceType: string, excludeIdNum: number, excludeId: string, tmdbToken: string
): Promise<string[]> {
  if ((sourceType === 'movie' || sourceType === 'tv') && !isNaN(excludeIdNum)) {
    try {
      const endpoint = sourceType === 'movie'
        ? `${TMDB_BASE}/movie/${excludeIdNum}/similar?language=it-IT`
        : `${TMDB_BASE}/tv/${excludeIdNum}/similar?language=it-IT`
      const res = await fetch(endpoint, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const candidates = ((await res.json()).results || []).slice(0, 10)
      for (const candidate of candidates) {
        try {
          const kwUrl = sourceType === 'movie'
            ? `${TMDB_BASE}/movie/${candidate.id}/keywords`
            : `${TMDB_BASE}/tv/${candidate.id}/keywords`
          const kr = await fetch(kwUrl, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(3000) })
          if (!kr.ok) continue
          const kj = await kr.json()
          const kws = ((sourceType === 'movie' ? kj.keywords : kj.results) || [])
            .map((k: any) => k.name as string)
            .filter((k: string) => !TMDB_META_KW_BLOCKLIST.has(k.toLowerCase()))
          if (kws.length >= 2) {
            logger.info('SIMILAR', 'Proxy keywords found', { count: kws.length })
            return kws.slice(0, 8)
          }
        } catch {}
      }
    } catch {}
  }

  if (sourceType === 'anime' && excludeId.startsWith('tmdb-anime-')) {
    const tmdbAnimeId = parseInt(excludeId.replace('tmdb-anime-', ''), 10)
    if (!isNaN(tmdbAnimeId)) {
      try {
        const res = await fetch(`${TMDB_BASE}/tv/${tmdbAnimeId}/keywords`, {
          headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const json = await res.json()
          const tags = (json.results || [])
            .map((k: any) => k.name as string)
            .filter((t: string) => !TMDB_META_KW_BLOCKLIST.has(t.toLowerCase()))
          if (tags.length >= 2) {
            logger.info('SIMILAR', 'Proxy anime tags found', { count: tags.length })
            return tags.slice(0, 10)
          }
        }
      } catch {}
    }
  }
  return []
}

const tvGenreNames = (ids: number[]) =>
  [...new Set(ids.map((id: number) => TMDB_TV_ID_TO_GENRE[id]).filter(Boolean) as string[])]

const movieGenres = (ids: number[]) =>
  [...new Set(ids.map((id: number) => TMDB_MOVIE_ID_TO_GENRE[id]).filter(Boolean) as string[])]

const filterLang = (arr: any[]) => arr.filter((m: any) => !NICHE_LANGS.has(m.original_language || ''))

export async function fetchTmdbAnime(ctx: SimilarContext, add: SimilarAdd) {
  if (!ctx.tmdbToken) return
  try {
    const animeGenreIds = [...new Set([16, ...ctx.tmdbTvIds])].slice(0, 3)
    const params = new URLSearchParams({
      with_original_language: 'ja',
      with_genres: animeGenreIds.join(','),
      sort_by: 'vote_average.desc',
      'vote_count.gte': '100',
      language: 'it-IT',
    })
    const res = await fetch(`${TMDB_BASE}/discover/tv?${params}`, {
      headers: { Authorization: `Bearer ${ctx.tmdbToken}` }, signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      const json = await res.json()
      for (const m of (json.results || []).slice(0, 25)) {
        if (!m.poster_path) continue
        const id = `tmdb-anime-${m.id}`
        const recGenres = tvGenreNames(m.genre_ids || [])
        add({ id, title: m.name || '', type: 'anime',
          coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
          year: m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined,
          genres: recGenres, tags: [],
          description: m.overview ? truncateAtSentence(m.overview, 500) : undefined,
          score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
          matchScore: 50 + ctx.profileBoost(recGenres), why: ctx.whyText(recGenres), _pop: m.popularity || 0 })
      }
    }

    const tmdbKwIds = await ctx.tmdbKeywordIdsPromise
    if (tmdbKwIds.length > 0) {
      const kwParams = new URLSearchParams({
        with_original_language: 'ja',
        with_genres: '16',
        with_keywords: tmdbKwIds.slice(0, 6).join('|'),
        sort_by: 'vote_average.desc',
        'vote_count.gte': '50',
        language: 'it-IT',
      })
      const kwRes = await fetch(`${TMDB_BASE}/discover/tv?${kwParams}`, {
        headers: { Authorization: `Bearer ${ctx.tmdbToken}` }, signal: AbortSignal.timeout(6000),
      })
      if (kwRes.ok) {
        const kwJson = await kwRes.json()
        for (const m of (kwJson.results || []).slice(0, 20)) {
          if (!m.poster_path) continue
          const id = `tmdb-anime-${m.id}`
          const recGenres = tvGenreNames(m.genre_ids || [])
          add({ id, title: m.name || '', type: 'anime',
            coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
            year: m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined,
            genres: recGenres, tags: [],
            description: m.overview ? truncateAtSentence(m.overview, 500) : undefined,
            score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
            matchScore: 58 + ctx.profileBoost(recGenres), why: ctx.whyText(recGenres), _pop: m.popularity || 0 })
        }
      }
    }
  } catch {}
}

export async function fetchTmdbMovies(ctx: SimilarContext, add: SimilarAdd) {
  if (!ctx.tmdbToken || ctx.tmdbMovieIds.length === 0) return
  try {
    const tmdbKwIds = await ctx.tmdbKeywordIdsPromise
    const genreParams = new URLSearchParams({ with_genres: ctx.tmdbMovieIds.slice(0,3).join(','), sort_by: 'vote_average.desc', 'vote_count.gte': '100', language: 'it-IT' })
    const orKwIds = tmdbKwIds.slice(0, 6)
    const kwDiscoverP = orKwIds.length > 0
      ? fetch(`${TMDB_BASE}/discover/movie?${new URLSearchParams({ with_keywords: orKwIds.join('|'), sort_by: 'vote_average.desc', 'vote_count.gte': '100', language: 'it-IT' })}`, { headers: { Authorization: `Bearer ${ctx.tmdbToken}` }, signal: AbortSignal.timeout(6000) })
      : (ctx.sourceType === 'movie' && !isNaN(ctx.excludeIdNum))
        ? fetch(`${TMDB_BASE}/movie/${ctx.excludeIdNum}/similar?language=it-IT`, { headers: { Authorization: `Bearer ${ctx.tmdbToken}` }, signal: AbortSignal.timeout(6000) })
        : Promise.resolve(null as Response | null)
    const [genreRes, kwRes] = await Promise.all([
      fetch(`${TMDB_BASE}/discover/movie?${genreParams}`, { headers: { Authorization: `Bearer ${ctx.tmdbToken}` }, signal: AbortSignal.timeout(6000) }),
      kwDiscoverP,
    ])
    const genreItems: any[] = genreRes.ok ? filterLang((await genreRes.json()).results || []).slice(0, 20) : []
    const kwItems: any[] = kwRes?.ok ? filterLang((await kwRes.json()).results || []).slice(0, 20) : []
    logger.info('SIMILAR', 'TMDB movie keyword discovery', {
      keywordIds: tmdbKwIds.length,
      keywordResults: kwItems.length,
    })

    const genreIdSet = new Set(genreItems.map((m: any) => m.id))
    const kwIdSet = new Set(kwItems.map((m: any) => m.id))
    const allCandidates = [...genreItems, ...kwItems.filter((m: any) => !genreIdSet.has(m.id))]

    const movieActualKws = new Map<string, string[]>()
    await Promise.allSettled(allCandidates.slice(0, 30).map(async (m: any) => {
      try {
        const kr = await fetch(`${TMDB_BASE}/movie/${m.id}/keywords`, { headers: { Authorization: `Bearer ${ctx.tmdbToken}` }, signal: AbortSignal.timeout(2500) })
        if (!kr.ok) return
        const kj = await kr.json()
        const kws = (kj.keywords || []).map((k: any) => k.name.toLowerCase())
        logger.info('SIMILAR', 'Movie keywords fetched', { count: kws.length })
        movieActualKws.set(m.id.toString(), kws)
      } catch {}
    }))

    for (const m of allCandidates) {
      const id = m.id.toString()
      const recGenres = movieGenres(m.genre_ids || [])
      const actualKws = movieActualKws.get(id) || []
      add({ id, title: m.title || '', type: 'movie',
        coverImage: m.poster_path ? `https://image.tmdb.org/t/p/w780${m.poster_path}` : undefined,
        year: m.release_date ? new Date(m.release_date).getFullYear() : undefined,
        genres: recGenres, keywords: actualKws,
        score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
        description: m.overview ? truncateAtSentence(m.overview, 500) : undefined,
        matchScore: 50 + ctx.profileBoost(recGenres), why: ctx.whyText(recGenres),
        _foundByKeyword: kwIdSet.has(m.id), _pop: m.popularity || 0 })
    }
  } catch {}
}

export async function fetchTmdbTv(ctx: SimilarContext, add: SimilarAdd) {
  if (!ctx.tmdbToken || ctx.tmdbTvIds.length === 0) return
  try {
    const tmdbKwIds = await ctx.tmdbKeywordIdsPromise
    const genreParamsTv = new URLSearchParams({ with_genres: ctx.tmdbTvIds.slice(0,3).join(','), sort_by: 'vote_average.desc', 'vote_count.gte': '50', language: 'it-IT' })
    const orKwIdsTv = tmdbKwIds.slice(0, 6)
    const kwDiscoverTvP = orKwIdsTv.length > 0
      ? fetch(`${TMDB_BASE}/discover/tv?${new URLSearchParams({ with_keywords: orKwIdsTv.join('|'), sort_by: 'vote_average.desc', 'vote_count.gte': '50', language: 'it-IT' })}`, { headers: { Authorization: `Bearer ${ctx.tmdbToken}` }, signal: AbortSignal.timeout(6000) })
      : (ctx.sourceType === 'tv' && !isNaN(ctx.excludeIdNum))
        ? fetch(`${TMDB_BASE}/tv/${ctx.excludeIdNum}/similar?language=it-IT`, { headers: { Authorization: `Bearer ${ctx.tmdbToken}` }, signal: AbortSignal.timeout(6000) })
        : Promise.resolve(null as Response | null)
    const [genreResTv, kwResTv] = await Promise.all([
      fetch(`${TMDB_BASE}/discover/tv?${genreParamsTv}`, { headers: { Authorization: `Bearer ${ctx.tmdbToken}` }, signal: AbortSignal.timeout(6000) }),
      kwDiscoverTvP,
    ])
    const genreItemsTv: any[] = genreResTv.ok ? filterLang((await genreResTv.json()).results || []).slice(0, 20) : []
    const kwItemsTv: any[] = kwResTv?.ok ? filterLang((await kwResTv.json()).results || []).slice(0, 20) : []

    const genreIdSetTv = new Set(genreItemsTv.map((m: any) => m.id))
    const kwIdSetTv = new Set(kwItemsTv.map((m: any) => m.id))
    const allCandidatesTv = [...genreItemsTv, ...kwItemsTv.filter((m: any) => !genreIdSetTv.has(m.id))]

    const tvActualKws = new Map<string, string[]>()
    await Promise.allSettled(allCandidatesTv.slice(0, 30).map(async (m: any) => {
      try {
        const kr = await fetch(`${TMDB_BASE}/tv/${m.id}/keywords`, { headers: { Authorization: `Bearer ${ctx.tmdbToken}` }, signal: AbortSignal.timeout(2500) })
        if (!kr.ok) return
        const kj = await kr.json()
        const kws = (kj.results || []).map((k: any) => k.name.toLowerCase())
        tvActualKws.set(m.id.toString(), kws)
      } catch {}
    }))

    for (const m of allCandidatesTv) {
      const id = m.id.toString()
      const recGenres = tvGenreNames(m.genre_ids || [])
      const actualKws = tvActualKws.get(id) || []
      add({ id, title: m.name || '', type: 'tv',
        coverImage: m.poster_path ? `https://image.tmdb.org/t/p/w780${m.poster_path}` : undefined,
        year: m.first_air_date ? new Date(m.first_air_date).getFullYear() : undefined,
        genres: recGenres, keywords: actualKws,
        score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
        description: m.overview ? truncateAtSentence(m.overview, 500) : undefined,
        episodes: m.number_of_episodes ?? undefined,
        matchScore: 50 + ctx.profileBoost(recGenres), why: ctx.whyText(recGenres),
        _foundByKeyword: kwIdSetTv.has(m.id), _pop: m.popularity || 0 })
    }
  } catch {}
}
