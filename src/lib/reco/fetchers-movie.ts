import { truncateAtSentence } from '@/lib/utils'
import type { Recommendation, TasteProfile } from './types'
import type { GenreSlot } from './slots'
import { buildWhyV3, computeMatchScore } from './profile'
import { isAwardWorthy, releaseFreshnessMult, runtimePenalty } from './scoring'
import { TMDB_GENRE_MAP, TMDB_TV_GENRE_MAP } from './genre-maps'
import { PLATFORM_NAMES_MAP, TMDB_MOVIE_GENRE_NAMES, TMDB_TV_GENRE_NAMES } from './tmdb-shared'
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
      const providerMap = new Map<number, Set<number>>()  // #8: provider IDs disponibili in IT

      await Promise.allSettled(candidates.slice(0, 10).map(async (m: any) => {
        try {
          const [kr, pr] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/movie/${m.id}/keywords`,
              { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(3000) }),
            userPlatformIds.length > 0
              ? fetch(`https://api.themoviedb.org/3/movie/${m.id}/watch/providers`,
                  { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(3000) })
              : Promise.resolve(null),
          ])
          if (kr.ok) {
            const kj = await kr.json()
            kwMap.set(m.id, (kj.keywords || []).map((k: any) => k.name.toLowerCase()))
          }
          if (pr?.ok) {
            const pj = await pr.json()
            // Combina flatrate (abbonamento) + free + ads — priorità abbonamento
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

      const scored = candidates
        .map((m: any) => {
          const kws = kwMap.get(m.id) || []
          const movieProviders = providerMap.get(m.id) || new Set<number>()
          let boost = 0
          for (const kw of topKeywords) { if (kws.some(k => k.includes(kw))) boost += 2 }
          const isTrending = trendingIds.has(m.id.toString())
          if (isTrending) boost += 5
          // #8: platform boost — titolo disponibile sulla piattaforma dell'utente
          const platformMatch = userPlatformIds.length > 0 && userPlatformIds.some(pid => movieProviders.has(pid))
          if (platformMatch) boost += 12
          // #6: language boost/penalità
          const NON_ENGLISH_LANGS = new Set(['ja','ko','fr','de','it','es','zh','pt','pl','tr'])
          const NICHE_LANGS = new Set(['th','vi','id','ar','hi','tl','ms','ro','hu','cs'])
          if (preferNonEn && m.original_language && NON_ENGLISH_LANGS.has(m.original_language)) boost += 8
          if (!preferNonEn && m.original_language && NICHE_LANGS.has(m.original_language)) boost -= 20
          // Usa i generi reali del film (non solo lo slot) — serve per "Simili a questo"
          const recGenres = m.genre_ids
            ? m.genre_ids.map((id: number) => TMDB_MOVIE_GENRE_NAMES[id]).filter(Boolean)
            : [slot.genre]
          let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [slot.genre], kws, tasteProfile)
          // V5: runtime penalty
          const rtPenalty = runtimePenalty(m.runtime, tasteProfile.runtimePreference)
          matchScore = Math.round(matchScore * rtPenalty)
          // V4: award boost
          if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
          // V4: freshness
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

  // ── TOP-UP Movie: ricerca progressiva a onde finché non si raggiungono 200 titoli ──
  // Logica: con qualunque profilo esistono SEMPRE 200 film mai visti con matchScore ≥ 40.
  // Si espande in wave: generi primari → generi secondari → sort by popularity → voteAvg ridotto.
  // La soglia qualità ≥ 40 rimane fissa — si cerca di più, non si abbassa lo standard.
  const MOVIE_POOL_TARGET = 200
  if (results.length < MOVIE_POOL_TARGET) {
    const baseVoteAvg = tasteProfile.qualityThresholds.tmdbVoteAvg

    // Tutti i generi del profilo in ordine di preferenza (senza duplicati)
    const allProfileGenreIds = [...new Set([
      ...(tasteProfile.topGenres['movie'] || []).map(g => TMDB_GENRE_MAP[g.genre]).filter(Boolean),
      ...tasteProfile.globalGenres.map(g => TMDB_GENRE_MAP[g.genre]).filter(Boolean),
      ...slots.map(s => TMDB_GENRE_MAP[s.genre]).filter(Boolean),
    ])]

    // Wave 1: generi top del profilo, pagine 4→10, sort vote_average
    if (results.length < MOVIE_POOL_TARGET) {
      outer1:
      for (const genreId of allProfileGenreIds) {
        if (results.length >= MOVIE_POOL_TARGET) break
        for (let page = 4; page <= 10; page++) {
          if (results.length >= MOVIE_POOL_TARGET) break outer1
          try {
            const r = await fetch(
              `https://api.themoviedb.org/3/discover/movie?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=80&vote_average.gte=${baseVoteAvg}&language=it-IT&page=${page}`,
              { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
            ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
            const candidates = r.results || []
            if (candidates.length === 0) break
            for (const m of candidates) {
              if (results.length >= MOVIE_POOL_TARGET) break
              const title = m.title || m.original_title || ''
              if (isAlreadyOwned('movie', m.id.toString(), title) || seen.has(m.id.toString())) continue
              if (!m.poster_path) continue
              seen.add(m.id.toString())
              const recGenres = m.genre_ids?.map((id: number) => TMDB_MOVIE_GENRE_NAMES[id]).filter(Boolean) || []
              let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [], [], tasteProfile)
              if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
              const year = m.release_date ? parseInt(m.release_date.substring(0, 4)) : undefined
              matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))
              if (matchScore < 40) continue
              results.push({
                id: m.id.toString(), title: m.title || m.original_title || 'Senza titolo', type: 'movie',
                coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`, year, genres: recGenres,
                score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
                description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
                why: buildWhyV3(recGenres, m.id.toString(), m.title || '', tasteProfile, matchScore, false, {}),
                matchScore, isAwardWinner: isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb'),
              })
            }
          } catch { /* continua */ }
        }
      }
    }

    // Wave 2: sort by popularity (cattura titoli popolari non top-rated), pagine 1→6
    if (results.length < MOVIE_POOL_TARGET) {
      outer2:
      for (const genreId of allProfileGenreIds) {
        if (results.length >= MOVIE_POOL_TARGET) break
        for (let page = 1; page <= 6; page++) {
          if (results.length >= MOVIE_POOL_TARGET) break outer2
          try {
            const r = await fetch(
              `https://api.themoviedb.org/3/discover/movie?with_genres=${genreId}&sort_by=popularity.desc&vote_count.gte=100&vote_average.gte=${baseVoteAvg}&language=it-IT&page=${page}`,
              { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
            ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
            const candidates = r.results || []
            if (candidates.length === 0) break
            for (const m of candidates) {
              if (results.length >= MOVIE_POOL_TARGET) break
              const title = m.title || m.original_title || ''
              if (isAlreadyOwned('movie', m.id.toString(), title) || seen.has(m.id.toString())) continue
              if (!m.poster_path) continue
              seen.add(m.id.toString())
              const recGenres = m.genre_ids?.map((id: number) => TMDB_MOVIE_GENRE_NAMES[id]).filter(Boolean) || []
              let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [], [], tasteProfile)
              if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
              const year = m.release_date ? parseInt(m.release_date.substring(0, 4)) : undefined
              matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))
              if (matchScore < 40) continue
              results.push({
                id: m.id.toString(), title: m.title || m.original_title || 'Senza titolo', type: 'movie',
                coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`, year, genres: recGenres,
                score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
                description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
                why: buildWhyV3(recGenres, m.id.toString(), m.title || '', tasteProfile, matchScore, false, {}),
                matchScore, isAwardWinner: isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb'),
              })
            }
          } catch { /* continua */ }
        }
      }
    }

    // Wave 3: voteAvg abbassato a 5.5 (film decenti ma meno noti), pagine 1→5
    if (results.length < MOVIE_POOL_TARGET) {
      const relaxedVoteAvg = Math.min(baseVoteAvg, 5.5)
      outer3:
      for (const genreId of allProfileGenreIds) {
        if (results.length >= MOVIE_POOL_TARGET) break
        for (let page = 1; page <= 5; page++) {
          if (results.length >= MOVIE_POOL_TARGET) break outer3
          try {
            const r = await fetch(
              `https://api.themoviedb.org/3/discover/movie?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=${relaxedVoteAvg}&language=it-IT&page=${page}`,
              { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
            ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
            const candidates = r.results || []
            if (candidates.length === 0) break
            for (const m of candidates) {
              if (results.length >= MOVIE_POOL_TARGET) break
              const title = m.title || m.original_title || ''
              if (isAlreadyOwned('movie', m.id.toString(), title) || seen.has(m.id.toString())) continue
              if (!m.poster_path) continue
              seen.add(m.id.toString())
              const recGenres = m.genre_ids?.map((id: number) => TMDB_MOVIE_GENRE_NAMES[id]).filter(Boolean) || []
              let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [], [], tasteProfile)
              if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
              const year = m.release_date ? parseInt(m.release_date.substring(0, 4)) : undefined
              matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))
              if (matchScore < 40) continue
              results.push({
                id: m.id.toString(), title: m.title || m.original_title || 'Senza titolo', type: 'movie',
                coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`, year, genres: recGenres,
                score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
                description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
                why: buildWhyV3(recGenres, m.id.toString(), m.title || '', tasteProfile, matchScore, false, {}),
                matchScore, isAwardWinner: isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb'),
              })
            }
          } catch { /* continua */ }
        }
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Serie TV V3 ──────────────────────────────────────────────────────
