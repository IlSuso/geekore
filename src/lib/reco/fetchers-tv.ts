import { truncateAtSentence } from '@/lib/utils'
import type { Recommendation, TasteProfile } from './types'
import type { GenreSlot } from './slots'
import { buildWhyV3, computeMatchScore } from './profile'
import { isAwardWorthy, releaseFreshnessMult, runtimePenalty } from './scoring'
import { TMDB_GENRE_MAP, TMDB_TV_GENRE_MAP } from './genre-maps'
import { PLATFORM_NAMES_MAP, TMDB_MOVIE_GENRE_NAMES, TMDB_TV_GENRE_NAMES } from './tmdb-shared'
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
      const providerMap = new Map<number, Set<number>>()  // #8: provider IDs disponibili in IT

      await Promise.allSettled(candidates.slice(0, 10).map(async (m: any) => {
        try {
          const [kr, pr] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/tv/${m.id}/keywords`,
              { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(3000) }),
            userPlatformIds.length > 0
              ? fetch(`https://api.themoviedb.org/3/tv/${m.id}/watch/providers`,
                  { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(3000) })
              : Promise.resolve(null),
          ])
          if (kr.ok) {
            const kj = await kr.json()
            kwMap.set(m.id, (kj.results || []).map((k: any) => k.name.toLowerCase()))
          }
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

      const scored = candidates
        .map((m: any) => {
          const kws = kwMap.get(m.id) || []
          const showProviders = providerMap.get(m.id) || new Set<number>()
          let boost = 0
          for (const kw of topKeywords) { if (kws.some(k => k.includes(kw))) boost += 2 }
          const isTrending = trendingIds.has(m.id.toString())
          if (isTrending) boost += 5
          // #8: platform boost
          const platformMatch = userPlatformIds.length > 0 && userPlatformIds.some(pid => showProviders.has(pid))
          if (platformMatch) boost += 12
          // #6: language boost/penalità
          const NON_ENGLISH_LANGS = new Set(['ja','ko','fr','de','it','es','zh','pt','pl','tr'])
          // Lingue di nicchia: produzioni quasi mai distribuite a livello internazionale
          const NICHE_LANGS = new Set(['th','vi','id','ar','hi','tl','ms','ro','hu','cs'])
          if (preferNonEn && m.original_language && NON_ENGLISH_LANGS.has(m.original_language)) boost += 8
          // Penalizza lingue di nicchia se l'utente non ha preferenza non-english
          if (!preferNonEn && m.original_language && NICHE_LANGS.has(m.original_language)) boost -= 20
          // Usa i generi reali del film (non solo lo slot) — serve per "Simili a questo"
          const recGenres = m.genre_ids
            ? m.genre_ids.map((id: number) => TMDB_TV_GENRE_NAMES[id]).filter(Boolean)
            : [slot.genre]
          let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [slot.genre], kws, tasteProfile)
          // V4: award boost
          if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
          // V4: freshness
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
          description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
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

  // ── TOP-UP TV: ricerca progressiva a onde finché non si raggiungono 200 titoli ──
  // Stessa logica del movie top-up: Wave 1 → Wave 2 (popularity) → Wave 3 (voteAvg ridotto)
  const TV_POOL_TARGET = 200
  if (results.length < TV_POOL_TARGET) {
    const baseVoteAvg = tasteProfile.qualityThresholds.tmdbVoteAvg
    const allProfileTvGenreIds = [...new Set([
      ...(tasteProfile.topGenres['tv'] || []).map(g => TMDB_TV_GENRE_MAP[g.genre]).filter(Boolean),
      ...tasteProfile.globalGenres.map(g => TMDB_TV_GENRE_MAP[g.genre]).filter(Boolean),
      ...slots.map(s => TMDB_TV_GENRE_MAP[s.genre]).filter(Boolean),
    ])]

    // Wave 1: vote_average, pagine 4→10
    if (results.length < TV_POOL_TARGET) {
      outerTv1:
      for (const genreId of allProfileTvGenreIds) {
        if (results.length >= TV_POOL_TARGET) break
        for (let page = 4; page <= 10; page++) {
          if (results.length >= TV_POOL_TARGET) break outerTv1
          try {
            const r = await fetch(
              `https://api.themoviedb.org/3/discover/tv?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=100&vote_average.gte=${baseVoteAvg}&language=it-IT&page=${page}`,
              { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
            ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
            const candidates = r.results || []
            if (candidates.length === 0) break
            for (const m of candidates) {
              if (results.length >= TV_POOL_TARGET) break
              const title = m.name || m.original_name || ''
              if (isAlreadyOwned('tv', m.id.toString(), title) || seen.has(m.id.toString())) continue
              if (!m.poster_path) continue
              seen.add(m.id.toString())
              const recGenres = m.genre_ids?.map((id: number) => TMDB_TV_GENRE_NAMES[id]).filter(Boolean) || []
              let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [], [], tasteProfile)
              if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
              const year = m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined
              matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))
              if (matchScore < 40) continue
              results.push({
                id: m.id.toString(), title: m.name || m.original_name || 'Senza titolo', type: 'tv',
                coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`, year, genres: recGenres,
                score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
                description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
                why: buildWhyV3(recGenres, m.id.toString(), m.name || '', tasteProfile, matchScore, false, {}),
                matchScore, isAwardWinner: isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb'),
              })
            }
          } catch { /* continua */ }
        }
      }
    }

    // Wave 2: sort by popularity, pagine 1→6
    if (results.length < TV_POOL_TARGET) {
      outerTv2:
      for (const genreId of allProfileTvGenreIds) {
        if (results.length >= TV_POOL_TARGET) break
        for (let page = 1; page <= 6; page++) {
          if (results.length >= TV_POOL_TARGET) break outerTv2
          try {
            const r = await fetch(
              `https://api.themoviedb.org/3/discover/tv?with_genres=${genreId}&sort_by=popularity.desc&vote_count.gte=100&vote_average.gte=${baseVoteAvg}&language=it-IT&page=${page}`,
              { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
            ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
            const candidates = r.results || []
            if (candidates.length === 0) break
            for (const m of candidates) {
              if (results.length >= TV_POOL_TARGET) break
              const title = m.name || m.original_name || ''
              if (isAlreadyOwned('tv', m.id.toString(), title) || seen.has(m.id.toString())) continue
              if (!m.poster_path) continue
              seen.add(m.id.toString())
              const recGenres = m.genre_ids?.map((id: number) => TMDB_TV_GENRE_NAMES[id]).filter(Boolean) || []
              let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [], [], tasteProfile)
              if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
              const year = m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined
              matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))
              if (matchScore < 40) continue
              results.push({
                id: m.id.toString(), title: m.name || m.original_name || 'Senza titolo', type: 'tv',
                coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`, year, genres: recGenres,
                score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
                description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
                why: buildWhyV3(recGenres, m.id.toString(), m.name || '', tasteProfile, matchScore, false, {}),
                matchScore, isAwardWinner: isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb'),
              })
            }
          } catch { /* continua */ }
        }
      }
    }

    // Wave 3: voteAvg ridotto a 5.5, pagine 1→5
    if (results.length < TV_POOL_TARGET) {
      const relaxedVoteAvg = Math.min(baseVoteAvg, 5.5)
      outerTv3:
      for (const genreId of allProfileTvGenreIds) {
        if (results.length >= TV_POOL_TARGET) break
        for (let page = 1; page <= 5; page++) {
          if (results.length >= TV_POOL_TARGET) break outerTv3
          try {
            const r = await fetch(
              `https://api.themoviedb.org/3/discover/tv?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=${relaxedVoteAvg}&language=it-IT&page=${page}`,
              { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
            ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
            const candidates = r.results || []
            if (candidates.length === 0) break
            for (const m of candidates) {
              if (results.length >= TV_POOL_TARGET) break
              const title = m.name || m.original_name || ''
              if (isAlreadyOwned('tv', m.id.toString(), title) || seen.has(m.id.toString())) continue
              if (!m.poster_path) continue
              seen.add(m.id.toString())
              const recGenres = m.genre_ids?.map((id: number) => TMDB_TV_GENRE_NAMES[id]).filter(Boolean) || []
              let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [], [], tasteProfile)
              if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
              const year = m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined
              matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))
              if (matchScore < 40) continue
              results.push({
                id: m.id.toString(), title: m.name || m.original_name || 'Senza titolo', type: 'tv',
                coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`, year, genres: recGenres,
                score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
                description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
                why: buildWhyV3(recGenres, m.id.toString(), m.name || '', tasteProfile, matchScore, false, {}),
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

// ── Fetcher: Giochi V3 (IGDB con developer tracking) ─────────────────────────
