import { truncateAtSentence } from '@/lib/utils'
import type { Recommendation, TasteProfile } from './types'
import type { GenreSlot } from './slots'
import { buildWhyV3, computeMatchScore } from './profile'
import { isAwardWorthy, releaseFreshnessMult, runtimePenalty } from './scoring'
import { TMDB_GENRE_MAP, TMDB_TV_GENRE_MAP } from './genre-maps'
import { PLATFORM_NAMES_MAP, TMDB_MOVIE_GENRE_NAMES } from './tmdb-shared'
export async function fetchMovieRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile, token: string, isAlreadyOwned: (type: string, id: string, title: string) => boolean,
  shownIds?: Set<string>, socialFavorites?: Map<string, string>, userPlatformIds: number[] = []
): Promise<Recommendation[]> {
  if (!token) return []
  const results: Recommendation[] = []
  const seen = new Set<string>()
  const topKeywords = Object.entries(tasteProfile.deepSignals.keywords)
    .sort(([, a], [, b]) => b - a).slice(0, 10).map(([k]) => k)

  // V3: trending movie IDs
  let trendingIds = new Set<string>()
  try {
    const tr = await fetch('https://api.themoviedb.org/3/trending/movie/week',
      { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(5000) })
    if (tr.ok) {
      const tj = await tr.json()
      trendingIds = new Set((tj.results || []).map((m: any) => m.id.toString()))
    }
  } catch {}

  for (const slot of slots) {
    const genreId = TMDB_GENRE_MAP[slot.genre]
    if (!genreId) continue

    try {
      const voteAvgMin = tasteProfile.qualityThresholds.tmdbVoteAvg
      const preferNonEn = tasteProfile.languagePreference.preferNonEnglish

      const moviePagesToFetch = slot.quota > 20 ? [1, 2, 3] : [1]
      const moviePageResults = await Promise.all(moviePagesToFetch.map(page =>
        fetch(
          `https://api.themoviedb.org/3/discover/movie?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=80&vote_average.gte=${voteAvgMin}&language=it-IT&page=${page}`,
          { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
        ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
      ))
      const candidates = moviePageResults.flatMap((json: any) => json.results || [])
        .filter((m: any) => {
          const title = m.title || m.original_title || ''
          return !isAlreadyOwned('movie', m.id.toString(), title) && m.poster_path && !seen.has(m.id.toString())
        })
        .slice(0, slot.quota + 10)

      const kwMap = new Map<number, string[]>()
      const providerMap = new Map<number, Set<number>>()

      // Keyword calls rimosse: costavano 10 HTTP calls per slot (~100 totali per regen).
      // Solo provider map se l'utente ha piattaforme configurate.
      if (userPlatformIds.length > 0) {
        await Promise.allSettled(candidates.slice(0, 8).map(async (m: any) => {
          try {
            const pr = await fetch(`https://api.themoviedb.org/3/movie/${m.id}/watch/providers`,
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
          const movieProviders = providerMap.get(m.id) || new Set<number>()
          let boost = 0
          const isTrending = trendingIds.has(m.id.toString())
          if (isTrending) boost += 5
          const platformMatch = userPlatformIds.length > 0 && userPlatformIds.some(pid => movieProviders.has(pid))
          if (platformMatch) boost += 12
          const NON_ENGLISH_LANGS = new Set(['ja','ko','fr','de','it','es','zh','pt','pl','tr'])
          const NICHE_LANGS = new Set(['th','vi','id','ar','hi','tl','ms','ro','hu','cs'])
          if (preferNonEn && m.original_language && NON_ENGLISH_LANGS.has(m.original_language)) boost += 8
          if (!preferNonEn && m.original_language && NICHE_LANGS.has(m.original_language)) boost -= 20
          const recGenres = m.genre_ids
            ? m.genre_ids.map((id: number) => TMDB_MOVIE_GENRE_NAMES[id]).filter(Boolean)
            : [slot.genre]
          let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [slot.genre], kws, tasteProfile)
          const rtPenalty = runtimePenalty(m.runtime, tasteProfile.runtimePreference)
          matchScore = Math.round(matchScore * rtPenalty)
          if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
          const year = m.release_date ? parseInt(m.release_date.substring(0, 4)) : undefined
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
        const year = m.release_date ? parseInt(m.release_date.substring(0, 4)) : undefined

        // #8: costruisci badge piattaforma per la spiegazione why
        let platformWhy: string | undefined
        if (platformMatch && userPlatformIds.length > 0) {
          const movieProviders = providerMap.get(m.id) || new Set<number>()
          const matchedPlatform = PLATFORM_NAMES_MAP[userPlatformIds.find(pid => movieProviders.has(pid))!]
          if (matchedPlatform) platformWhy = `Disponibile su ${matchedPlatform}`
        }

        results.push({
          id: recId,
          title: m.title || m.original_title || 'Senza titolo',
          type: 'movie',
          coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
          year,
          genres: recGenres,
          keywords: kws,
          score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
          description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
          why: socialFriend
            ? `Il tuo amico con gusti simili all'${socialFriend} ha adorato questo`
            : platformWhy
              ? `${platformWhy} · ${buildWhyV3(recGenres, recId, m.title || '', tasteProfile, matchScore, slot.isDiscovery, { trendingBoost })}`
              : buildWhyV3(recGenres, recId, m.title || '', tasteProfile, matchScore, slot.isDiscovery, { trendingBoost }),
          matchScore: finalScore,
          isDiscovery: slot.isDiscovery,
          isAwardWinner: isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb'),
          socialBoost: socialFriend,
        })
      }
    } catch { /* continua */ }
  }

  // ── TOP-UP Movie: fetch parallelo per genere ─────────────────────────────
  // Il fetcher porta fino a 400 candidati al pool-builder (che ne seleziona 200).
  // Le chiamate sono parallele per genere — nessun loop seriale.
  const MOVIE_FETCH_TARGET = 400  // candidati da portare al pool-builder, non quelli serviti
  if (results.length < MOVIE_FETCH_TARGET) {
    const baseVoteAvg = tasteProfile.qualityThresholds.tmdbVoteAvg
    const allProfileGenreIds = [...new Set([
      ...(tasteProfile.topGenres['movie'] || []).map(g => TMDB_GENRE_MAP[g.genre]).filter(Boolean),
      ...tasteProfile.globalGenres.map(g => TMDB_GENRE_MAP[g.genre]).filter(Boolean),
      ...slots.map(s => TMDB_GENRE_MAP[s.genre]).filter(Boolean),
    ])].slice(0, 8)  // max 8 generi per non esplodere le chiamate

    // Fetch parallelo: pagine subito successive al primary pass.
    // Prima saltavamo 2-3 e partivamo da 4, perdendo candidati forti ma non gia in page 1.
    const topupPages = results.length < MOVIE_FETCH_TARGET / 2 ? [2, 3, 4, 5] : [2, 3]
    const topupResults = await Promise.allSettled(
      allProfileGenreIds.flatMap(genreId =>
        topupPages.map(page =>
          fetch(
            `https://api.themoviedb.org/3/discover/movie?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=80&vote_average.gte=${baseVoteAvg}&language=it-IT&page=${page}`,
            { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
          ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
        )
      )
    )

    for (const result of topupResults) {
      if (results.length >= MOVIE_FETCH_TARGET) break
      if (result.status !== 'fulfilled') continue
      for (const m of (result.value.results || [])) {
        if (results.length >= MOVIE_FETCH_TARGET) break
        const title = m.title || m.original_title || ''
        const recId = m.id.toString()
        if (isAlreadyOwned('movie', recId, title) || seen.has(recId) || shownIds?.has(recId)) continue
        if (!m.poster_path) continue
        seen.add(recId)
        const recGenres = m.genre_ids?.map((id: number) => TMDB_MOVIE_GENRE_NAMES[id]).filter(Boolean) || []
        let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [], [], tasteProfile)
        if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
        const year = m.release_date ? parseInt(m.release_date.substring(0, 4)) : undefined
        matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))
        if (matchScore < 35) continue
        results.push({
          id: recId, title, type: 'movie',
          coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`, year, genres: recGenres,
          score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
          description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
          why: buildWhyV3(recGenres, recId, title, tasteProfile, matchScore, false, {}),
          matchScore, isAwardWinner: isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb'),
        })
      }
    }
  }

  // Final safety net: se il profilo/genre mapping produce pochi candidati,
  // completa con film popolari e ben valutati. E' il cold-start/backfill
  // controllato: niente chiamate per keyword, solo discover pages ampie.
  if (results.length < 200) {
    const broadPages = [1, 2, 3, 4, 5, 6]
    const broadResults = await Promise.allSettled(
      broadPages.map(page =>
        fetch(
          `https://api.themoviedb.org/3/discover/movie?sort_by=popularity.desc&vote_count.gte=250&vote_average.gte=6.5&include_adult=false&language=it-IT&page=${page}`,
          { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
        ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
      )
    )

    for (const result of broadResults) {
      if (results.length >= 200) break
      if (result.status !== 'fulfilled') continue
      for (const m of (result.value.results || [])) {
        if (results.length >= 200) break
        const title = m.title || m.original_title || ''
        const recId = m.id.toString()
        if (isAlreadyOwned('movie', recId, title) || seen.has(recId) || shownIds?.has(recId)) continue
        if (!m.poster_path) continue
        seen.add(recId)

        const recGenres = m.genre_ids?.map((id: number) => TMDB_MOVIE_GENRE_NAMES[id]).filter(Boolean) || []
        let matchScore = computeMatchScore(recGenres, [], tasteProfile)
        if (trendingIds.has(recId)) matchScore = Math.min(100, matchScore + 5)
        if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
        const year = m.release_date ? parseInt(m.release_date.substring(0, 4)) : undefined
        matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))

        results.push({
          id: recId,
          title: title || 'Senza titolo',
          type: 'movie',
          coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
          year,
          genres: recGenres,
          score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
          description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
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

// ── Fetcher: Serie TV V3 ──────────────────────────────────────────────────────
