import { translateWithCache } from '@/lib/deepl'
import { truncateAtSentence } from '@/lib/utils'
import type { Recommendation, TasteProfile } from './types'
import type { GenreSlot } from './slots'
import { buildWhyV3, computeMatchScore } from './profile'
import { applyFormatDiversity, getCurrentAnimeSeasonDates, isAwardWorthy, releaseFreshnessMult, runtimePenalty } from './scoring'
import { BGG_TO_CROSS_GENRE, CROSS_TO_BGG_CATEGORY, CROSS_TO_IGDB_GENRE, CROSS_TO_IGDB_THEME, IGDB_VALID_GENRES, TMDB_GENRE_MAP, TMDB_TV_GENRE_MAP } from './genre-maps'
import { TMDB_TV_GENRE_NAMES } from './tmdb-shared'
export async function fetchAnimeRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile, token: string, isAlreadyOwned: (type: string, id: string, title: string) => boolean,
  shownIds?: Set<string>, socialFavorites?: Map<string, string>
): Promise<Recommendation[]> {
  if (!token) return []
  const results: Recommendation[] = []
  const seen = new Set<string>()

  const topThemes = Object.entries(tasteProfile.deepSignals.themes)
    .sort(([, a], [, b]) => b - a).slice(0, 6).map(([t]) => t)
  const topKeywords = Object.entries(tasteProfile.deepSignals.keywords)
    .sort(([, a], [, b]) => b - a).slice(0, 8).map(([k]) => k)

  // V5: quality thresholds
  const qt = tasteProfile.qualityThresholds

  // V4: seasonal slot — anime della stagione corrente via TMDB discover
  const { from: seasonFrom, to: seasonTo, label: seasonLabel } = getCurrentAnimeSeasonDates()
  try {
    const sParams = new URLSearchParams({
      with_original_language: 'ja', with_genres: '16',
      'first_air_date.gte': seasonFrom, 'first_air_date.lte': seasonTo,
      sort_by: 'popularity.desc', 'vote_count.gte': '20', language: 'it-IT',
    })
    const sRes = await fetch(`https://api.themoviedb.org/3/discover/tv?${sParams}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000),
    })
    if (sRes.ok) {
      const sJson = await sRes.json()
      for (const m of (sJson.results || []).slice(0, 3)) {
        if (!m.poster_path) continue
        const id = `tmdb-anime-${m.id}`
        const title = m.name || ''
        if (isAlreadyOwned('anime', id, title) || seen.has(id)) continue
        if (shownIds?.has(id)) continue
        seen.add(id)
        const recGenres: string[] = (m.genre_ids || []).map((gid: number) => TMDB_TV_GENRE_NAMES[gid]).filter(Boolean)
        const mTags: string[] = []
        const mStudios: string[] = []
        const year = m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined
        let matchScore = computeMatchScore(recGenres, mTags, tasteProfile, mStudios, [])
        if (isAwardWorthy(m.vote_average, m.popularity, m.vote_count, 'tmdb')) { matchScore = Math.min(100, matchScore + 8) }
        const freshMult = releaseFreshnessMult(year, m.vote_average * 10, m.popularity)
        matchScore = Math.min(100, Math.round(matchScore * freshMult))
        const socialFriend = socialFavorites?.get(id)
        if (socialFriend) { const sim = parseInt(socialFriend) || 75; matchScore = Math.min(100, matchScore + Math.round((sim - 70) / 30 * 20)) }
        results.push({
          id, title, type: 'anime',
          coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`, year, genres: recGenres, tags: mTags,
          score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
          why: socialFriend ? `Il tuo amico con gusti simili ha adorato questo` : `In corso questa stagione — ${seasonLabel}`,
          matchScore, isSeasonal: true,
          isAwardWinner: isAwardWorthy(m.vote_average, m.popularity, m.vote_count, 'tmdb'),
          socialBoost: socialFriend,
        })
      }
    }
  } catch { /* continua */ }

  const TMDB_BASE_ANIME = 'https://api.themoviedb.org/3'
  const MIN_POOL_ITEMS = 200
  const MAX_PAGES = 15

  for (const slot of slots) {
    if (results.length >= MIN_POOL_ITEMS) break
    const genreId = TMDB_TV_GENRE_MAP[slot.genre]
    const animeGenreIds = [...new Set([16, genreId].filter(Boolean) as number[])]

    try {
      const baseParamsAnime = new URLSearchParams({
        with_original_language: 'ja',
        with_genres: animeGenreIds.join(','),
        sort_by: 'vote_average.desc',
        'vote_average.gte': String(qt.tmdbVoteAvg),
        'vote_count.gte': '100',
        language: 'it-IT',
      })

      let currentPage = 1
      let totalPagesAvailable = 999

      while (results.length < MIN_POOL_ITEMS && currentPage <= Math.min(MAX_PAGES, totalPagesAvailable)) {
        const pageBatch = [currentPage, currentPage + 1, currentPage + 2].filter(p => p <= Math.min(MAX_PAGES, totalPagesAvailable))
        currentPage += pageBatch.length

        const animePageResults = await Promise.all(pageBatch.map(page => {
          const p = new URLSearchParams(baseParamsAnime); p.set('page', String(page))
          return fetch(`${TMDB_BASE_ANIME}/discover/tv?${p}`, {
            headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
          }).then(r => r.ok ? r.json() : { results: [], total_pages: 0 }).catch(() => ({ results: [], total_pages: 0 }))
        }))

        if (animePageResults[0]?.total_pages) {
          totalPagesAvailable = animePageResults[0].total_pages
        }

        const media: any[] = animePageResults.flatMap((json: any) => json.results || [])

        const candidates = media
          .filter((m: any) => {
            if (!m.poster_path) return false
            const id = `tmdb-anime-${m.id}`
            const title = m.name || ''
            if (isAlreadyOwned('anime', id, title) || seen.has(id)) return false
            if (shownIds?.has(id)) return false
            return true
          })
          .map((m: any) => {
            const recGenres: string[] = (m.genre_ids || []).map((gid: number) => TMDB_TV_GENRE_NAMES[gid]).filter(Boolean)
            const mTags: string[] = []
            const mStudios: string[] = []
            const mDirectors: string[] = []

            let boost = 0
            for (const theme of topThemes) { if ((m.name || '').toLowerCase().includes(theme)) boost += 1 }
            for (const kw of topKeywords) { if ((m.overview || '').toLowerCase().includes(kw)) boost += 1 }

            const socialFriend = socialFavorites?.get(`tmdb-anime-${m.id}`)
            if (socialFriend) { const _sim = parseInt(socialFriend) || 75; boost += Math.round((_sim - 70) / 30 * 20) }

            if (isAwardWorthy(m.vote_average, m.popularity, m.vote_count, 'tmdb')) boost += 8

            const year = m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined
            const freshMult = releaseFreshnessMult(year, m.vote_average * 10, m.popularity)

            let matchScore = computeMatchScore(recGenres, mTags, tasteProfile, mStudios, mDirectors)
            matchScore = Math.min(100, Math.round(matchScore * freshMult))
            return { m, boost, matchScore, recGenres, mTags, mStudios, mDirectors, socialFriend, year, trendingBoost: 0, creatorBoost: undefined as string | undefined }
          })
          .filter(({ matchScore }: any) => matchScore >= 40)
          .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))

        for (const { m, matchScore, recGenres, mTags, mStudios, mDirectors, socialFriend, year, trendingBoost, creatorBoost } of candidates) {
          const recId = `tmdb-anime-${m.id}`
          if (seen.has(recId)) continue
          seen.add(recId)
          results.push({
            id: recId,
            title: m.name || 'Senza titolo',
            type: 'anime',
            coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
            year, genres: recGenres, tags: mTags,
            score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
            description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
            why: socialFriend
              ? `Il tuo amico con gusti simili all'${socialFriend} ha adorato questo`
              : buildWhyV3(recGenres, recId, m.name || '', tasteProfile, matchScore, slot.isDiscovery, {
                  recStudios: mStudios, recDirectors: mDirectors, trendingBoost, creatorBoost,
                }),
            matchScore,
            isDiscovery: slot.isDiscovery,
            isSerendipity: slot.isSerendipity,
            isSeasonal: false,
            isAwardWinner: isAwardWorthy(m.vote_average, m.popularity, m.vote_count, 'tmdb'),
            socialBoost: socialFriend,
            creatorBoost,
          })
          if (results.length >= MIN_POOL_ITEMS) break
        }
      }
    } catch { /* continua */ }
  }

  if (results.length < MIN_POOL_ITEMS) {
    let page = 1
    while (results.length < MIN_POOL_ITEMS && page <= 12) {
      try {
        const p = new URLSearchParams({
          with_original_language: 'ja',
          with_genres: '16',
          sort_by: page <= 6 ? 'popularity.desc' : 'vote_average.desc',
          'vote_count.gte': page <= 6 ? '30' : '50',
          'vote_average.gte': String(Math.min(qt.tmdbVoteAvg, 6)),
          language: 'it-IT',
          page: String(page),
        })
        const json = await fetch(`${TMDB_BASE_ANIME}/discover/tv?${p}`, {
          headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
        }).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))

        for (const m of (json.results || [])) {
          if (results.length >= MIN_POOL_ITEMS) break
          if (!m.poster_path) continue
          const recId = `tmdb-anime-${m.id}`
          const title = m.name || ''
          if (isAlreadyOwned('anime', recId, title) || seen.has(recId)) continue
          seen.add(recId)
          const recGenres: string[] = (m.genre_ids || []).map((gid: number) => TMDB_TV_GENRE_NAMES[gid]).filter(Boolean)
          const year = m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined
          let matchScore = computeMatchScore(recGenres, [], tasteProfile, [], [])
          if (isAwardWorthy(m.vote_average, m.popularity, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
          matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year, m.vote_average * 10, m.popularity)))
          if (matchScore < 40) continue
          results.push({
            id: recId,
            title: title || 'Senza titolo',
            type: 'anime',
            coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
            year,
            genres: recGenres,
            score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
            description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
            why: buildWhyV3(recGenres, recId, title, tasteProfile, matchScore, false, {}),
            matchScore,
            isAwardWinner: isAwardWorthy(m.vote_average, m.popularity, m.vote_count, 'tmdb'),
          })
        }
      } catch { /* continua */ }
      page++
    }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Manga V3 ─────────────────────────────────────────────────────────
