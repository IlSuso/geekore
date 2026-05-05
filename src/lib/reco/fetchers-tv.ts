import type { Recommendation, TasteProfile } from './types'
import type { GenreSlot } from './slots'
import { buildWhyV3, computeMatchScore } from './profile'
import { isAwardWorthy, releaseFreshnessMult, runtimePenalty } from './scoring'
import { TMDB_GENRE_MAP, TMDB_TV_GENRE_MAP } from './genre-maps'
import { PLATFORM_NAMES_MAP, TMDB_TV_GENRE_NAMES } from './tmdb-shared'
export async function fetchTvRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile, token: string, isAlreadyOwned: (type: string, id: string, title: string) => boolean,
  shownIds?: Set<string>, socialFavorites?: Map<string, string>, userPlatformIds: number[] = []
): Promise<Recommendation[]> {
  if (!token) return []
  const results: Recommendation[] = []
  const seen = new Set<string>()
  const topKeywords = Object.entries(tasteProfile.deepSignals.keywords)
    .sort(([, a], [, b]) => b - a).slice(0, 10).map(([k]) => k)

  let trendingIds = new Set<string>()
  try {
    const tr = await fetch('https://api.themoviedb.org/3/trending/tv/week',
      { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(5000) })
    if (tr.ok) {
      const tj = await tr.json()
      trendingIds = new Set((tj.results || []).map((m: any) => m.id.toString()))
    }
  } catch {}

  for (const slot of slots) {
    const genreId = TMDB_TV_GENRE_MAP[slot.genre]
    if (!genreId) continue

    try {
      const voteAvgMin = tasteProfile.qualityThresholds.tmdbVoteAvg
      const preferNonEn = tasteProfile.languagePreference.preferNonEnglish
      // vote_count.gte=200 (era 40 — troppo basso, portava serie tailandesi con 50 voti)
      // popularity.gte=15 esclude produzioni sconosciute a livello internazionale
      const tvPagesToFetch = slot.quota > 20 ? [1, 2, 3] : [1]
      const tvPageResults = await Promise.all(tvPagesToFetch.map(page =>
        fetch(
          `https://api.themoviedb.org/3/discover/tv?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=${voteAvgMin}&popularity.gte=15&language=it-IT&page=${page}`,
          { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
        ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
      ))
      const candidates = tvPageResults.flatMap((json: any) => json.results || [])
        .filter((m: any) => {
          const title = m.name || m.original_name || ''
          return !isAlreadyOwned('tv', m.id.toString(), title) && m.poster_path && !seen.has(m.id.toString())
        })
        .slice(0, slot.quota + 10)

      const kwMap = new Map<number, string[]>()
      const providerMap = new Map<number, Set<number>>()

      // Keyword calls rimosse: costavano 10 HTTP calls per slot.
      // Solo provider map se l'utente ha piattaforme configurate.
      if (userPlatformIds.length > 0) {
        await Promise.allSettled(candidates.slice(0, 8).map(async (m: any) => {
          try {
            const pr = await fetch(`https://api.themoviedb.org/3/tv/${m.id}/watch/providers`,
              { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(3000) })
            if (pr?.ok) {
              const pj = await pr.json()
              const itProviders = pj.results?.IT
              const allProviders: any[] = [
                ...(itProviders?.flatrate || []),
                ...(itProviders?.free || []),
                ...(itProviders?.ads || []),
              ]
              providerMap.set(m.id, new Set(allProviders.map((p: any) => p.provider_id)))
            }
          } catch {}
        }))
      }

      const scored = candidates
        .map((m: any) => {
          const kws = kwMap.get(m.id) || []
          const showProviders = providerMap.get(m.id) || new Set<number>()
          let boost = 0
          const isTrending = trendingIds.has(m.id.toString())
          if (isTrending) boost += 5
          const platformMatch = userPlatformIds.length > 0 && userPlatformIds.some(pid => showProviders.has(pid))
          if (platformMatch) boost += 12
          const NON_ENGLISH_LANGS = new Set(['ja','ko','fr','de','it','es','zh','pt','pl','tr'])
          const NICHE_LANGS = new Set(['th','vi','id','ar','hi','tl','ms','ro','hu','cs'])
          if (preferNonEn && m.original_language && NON_ENGLISH_LANGS.has(m.original_language)) boost += 8
          if (!preferNonEn && m.original_language && NICHE_LANGS.has(m.original_language)) boost -= 20
          const recGenres = m.genre_ids
            ? m.genre_ids.map((id: number) => TMDB_TV_GENRE_NAMES[id]).filter(Boolean)
            : [slot.genre]
          let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [slot.genre], kws, tasteProfile)
          if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
          const year = m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined
          matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))
          return { m, boost, matchScore, recGenres, kws, trendingBoost: isTrending ? 0.8 : 0, platformMatch }
        })
        .filter(({ matchScore }: any) => matchScore >= 40)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota + 3)

      for (const { m, matchScore, recGenres, kws, trendingBoost, platformMatch } of scored) {
        const recId = m.id.toString()
        if (seen.has(recId)) continue
        if (shownIds?.has(recId)) continue
        seen.add(recId)
        const socialFriend = socialFavorites?.get(recId)
        let finalScore = matchScore
        if (socialFriend) finalScore = Math.min(100, finalScore + 15)
        const year = m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined

        // #8: badge piattaforma
        let platformWhy: string | undefined
        if (platformMatch && userPlatformIds.length > 0) {
          const showProviders2 = providerMap.get(m.id) || new Set<number>()
          const matchedPlatform = PLATFORM_NAMES_MAP[userPlatformIds.find(pid => showProviders2.has(pid))!]
          if (matchedPlatform) platformWhy = `Disponibile su ${matchedPlatform}`
        }

        results.push({
          id: recId,
          title: m.name || m.original_name || 'Senza titolo',
          type: 'tv',
          coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
          year,
          genres: recGenres,
          keywords: kws,
          score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
          description: m.overview || undefined,
          why: socialFriend
            ? `Il tuo amico con gusti simili all'${socialFriend} ha adorato questo`
            : platformWhy
              ? `${platformWhy} · ${buildWhyV3(recGenres, recId, m.name || '', tasteProfile, matchScore, slot.isDiscovery, { trendingBoost })}`
              : buildWhyV3(recGenres, recId, m.name || '', tasteProfile, matchScore, slot.isDiscovery, { trendingBoost }),
          matchScore: finalScore,
          isDiscovery: slot.isDiscovery,
          isAwardWinner: isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb'),
          socialBoost: socialFriend,
        })
      }
    } catch { /* continua */ }
  }

  // ── TOP-UP TV: fetch parallelo per genere ────────────────────────────────
  const TV_FETCH_TARGET = 400
  if (results.length < TV_FETCH_TARGET) {
    const baseVoteAvg = tasteProfile.qualityThresholds.tmdbVoteAvg
    const allProfileTvGenreIds = [...new Set([
      ...(tasteProfile.topGenres['tv'] || []).map(g => TMDB_TV_GENRE_MAP[g.genre]).filter(Boolean),
      ...tasteProfile.globalGenres.map(g => TMDB_TV_GENRE_MAP[g.genre]).filter(Boolean),
      ...slots.map(s => TMDB_TV_GENRE_MAP[s.genre]).filter(Boolean),
    ])].slice(0, 8)

    const topupPages = results.length < TV_FETCH_TARGET / 2 ? [2, 3, 4, 5] : [2, 3]
    const topupResults = await Promise.allSettled(
      allProfileTvGenreIds.flatMap(genreId =>
        topupPages.map(page =>
          fetch(
            `https://api.themoviedb.org/3/discover/tv?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=100&vote_average.gte=${baseVoteAvg}&language=it-IT&page=${page}`,
            { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
          ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
        )
      )
    )

    for (const result of topupResults) {
      if (results.length >= TV_FETCH_TARGET) break
      if (result.status !== 'fulfilled') continue
      for (const m of (result.value.results || [])) {
        if (results.length >= TV_FETCH_TARGET) break
        const title = m.name || m.original_name || ''
        const recId = m.id.toString()
        if (isAlreadyOwned('tv', recId, title) || seen.has(recId) || shownIds?.has(recId)) continue
        if (!m.poster_path) continue
        seen.add(recId)
        const recGenres = m.genre_ids?.map((id: number) => TMDB_TV_GENRE_NAMES[id]).filter(Boolean) || []
        let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [], [], tasteProfile)
        if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
        const year = m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined
        matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))
        if (matchScore < 35) continue
        results.push({
          id: recId, title, type: 'tv',
          coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`, year, genres: recGenres,
          score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
          description: m.overview || undefined,
          why: buildWhyV3(recGenres, recId, title, tasteProfile, matchScore, false, {}),
          matchScore, isAwardWinner: isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb'),
        })
      }
    }
  }

  // Safety net controllata per cold-start/depletion: poche pagine popolari,
  // nessuna keyword call, sempre rispettando owned e shown recenti/negativi.
  if (results.length < 200) {
    const broadPages = [1, 2, 3, 4]
    const broadResults = await Promise.allSettled(
      broadPages.map(page =>
        fetch(
          `https://api.themoviedb.org/3/discover/tv?sort_by=popularity.desc&vote_count.gte=150&vote_average.gte=6.5&language=it-IT&page=${page}`,
          { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
        ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
      )
    )

    for (const result of broadResults) {
      if (results.length >= 200) break
      if (result.status !== 'fulfilled') continue
      for (const m of (result.value.results || [])) {
        if (results.length >= 200) break
        const title = m.name || m.original_name || ''
        const recId = m.id.toString()
        if (isAlreadyOwned('tv', recId, title) || seen.has(recId) || shownIds?.has(recId)) continue
        if (!m.poster_path) continue
        seen.add(recId)

        const recGenres = m.genre_ids?.map((id: number) => TMDB_TV_GENRE_NAMES[id]).filter(Boolean) || []
        let matchScore = computeMatchScore(recGenres, [], tasteProfile)
        if (trendingIds.has(recId)) matchScore = Math.min(100, matchScore + 5)
        if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
        const year = m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined
        matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))

        results.push({
          id: recId,
          title: title || 'Senza titolo',
          type: 'tv',
          coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
          year,
          genres: recGenres,
          score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
          description: m.overview || undefined,
          why: buildWhyV3(recGenres, recId, title, tasteProfile, matchScore, true, {}),
          matchScore: Math.max(matchScore, 35),
          isDiscovery: true,
          isAwardWinner: isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb'),
        })
      }
    }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Giochi V3 (IGDB con developer tracking) ─────────────────────────
