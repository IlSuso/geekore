import { truncateAtSentence } from '@/lib/utils'
import type { Recommendation, TasteProfile } from './types'
import type { GenreSlot } from './slots'
import { buildWhyV3, computeMatchScore } from './profile'
import { getCurrentAnimeSeasonDates, isAwardWorthy, releaseFreshnessMult } from './scoring'
import { TMDB_TV_GENRE_NAMES } from './tmdb-shared'
import { batchedParallel } from './concurrent'

const ANILIST_ANIME_GENRES = new Set([
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Sports', 'Supernatural', 'Thriller', 'Mecha', 'Music',
])

const GENRE_REMAP: Record<string, string> = {
  'Science Fiction': 'Sci-Fi',
  'Science-Fiction': 'Sci-Fi',
  'Animation': '',        // non è un genere AniList — viene ignorato, si usa il genere successivo
  'Kids': 'Comedy',
  'War': 'Action',
  'Crime': 'Mystery',
  'Family': 'Comedy',
}

const DIRECTOR_ROLES = new Set(['Director', 'Series Director', 'Chief Animation Director'])
const ANILIST_API = 'https://graphql.anilist.co'

function buildAnimeQuery(page: number) {
  return `
    query($genres: [String], $minScore: Int, $minPop: Int) {
      Page(page: ${page}, perPage: 50) {
        media(
          genre_in: $genres, type: ANIME,
          format_in: [TV, TV_SHORT, ONA, SPECIAL],
          sort: [SCORE_DESC, POPULARITY_DESC],
          averageScore_greater: $minScore,
          popularity_greater: $minPop,
          isAdult: false
        ) {
          id
          title { romaji english }
          coverImage { extraLarge large }
          seasonYear episodes
          description(asHtml: false)
          genres averageScore popularity trending
          tags { name rank }
          studios(isMain: true) { nodes { name } }
          staff(sort: RELEVANCE) { edges { role node { name { full } } } }
        }
      }
    }
  `
}

export async function fetchAnimeRecs(
  slots: GenreSlot[],
  ownedIds: Set<string>,
  tasteProfile: TasteProfile,
  token: string,
  isAlreadyOwned: (type: string, id: string, title: string) => boolean,
  shownIds?: Set<string>,
  socialFavorites?: Map<string, string>
): Promise<Recommendation[]> {
  const results: Recommendation[] = []
  const seen = new Set<string>()
  const qt = tasteProfile.qualityThresholds
  const MIN_POOL_ITEMS = 200

  const topThemes = Object.entries(tasteProfile.deepSignals.themes)
    .sort(([, a], [, b]) => b - a).slice(0, 6).map(([t]) => t.toLowerCase())
  const topKeywords = Object.entries(tasteProfile.deepSignals.keywords)
    .sort(([, a], [, b]) => b - a).slice(0, 8).map(([k]) => k.toLowerCase())
  const topStudiosSet = new Set(
    Object.entries(tasteProfile.creatorScores.studios).sort(([, a], [, b]) => b - a).slice(0, 8).map(([s]) => s)
  )
  const topDirectorsSet = new Set(
    Object.entries(tasteProfile.creatorScores.directors).sort(([, a], [, b]) => b - a).slice(0, 8).map(([d]) => d)
  )

  // ── Seasonal slot via TMDB (manteniamo per freschezza stagionale) ──────────
  if (token) {
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
        for (const m of (sJson.results || []).slice(0, 5)) {
          if (!m.poster_path) continue
          const id = `tmdb-anime-${m.id}`
          const title = m.name || ''
          if (isAlreadyOwned('anime', id, title) || seen.has(id)) continue
          if (shownIds?.has(id)) continue
          seen.add(id)
          const recGenres: string[] = (m.genre_ids || []).map((gid: number) => TMDB_TV_GENRE_NAMES[gid]).filter(Boolean)
          const year = m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined
          let matchScore = computeMatchScore(recGenres, [], tasteProfile, [], [])
          if (isAwardWorthy(m.vote_average, m.popularity, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
          matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year, m.vote_average * 10, m.popularity)))
          const socialFriend = socialFavorites?.get(id)
          if (socialFriend) { const sim = parseInt(socialFriend) || 75; matchScore = Math.min(100, matchScore + Math.round((sim - 70) / 30 * 20)) }
          if (matchScore < 35) continue
          results.push({
            id, title, type: 'anime',
            coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
            year, genres: recGenres,
            score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
            why: socialFriend ? `Il tuo amico con gusti simili ha adorato questo` : `In corso questa stagione — ${seasonLabel}`,
            matchScore, isSeasonal: true,
            isAwardWinner: isAwardWorthy(m.vote_average, m.popularity, m.vote_count, 'tmdb'),
            socialBoost: socialFriend,
          })
        }
      }
    } catch { /* continua */ }
  }

  // ── Fonte principale: AniList per genere ────────────────────────────────────
  for (const slot of slots) {
    if (results.length >= MIN_POOL_ITEMS) break

    const remapped = GENRE_REMAP[slot.genre]
    if (remapped === '') continue  // genere non valido su AniList (es. Animation)
    const anilistGenre = remapped || slot.genre
    if (!ANILIST_ANIME_GENRES.has(anilistGenre)) continue

    const pages = slot.quota > 20 ? [1, 2] : [1]

    try {
      const pageResults = await Promise.all(pages.map(page =>
        fetch(ANILIST_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: buildAnimeQuery(page),
            variables: { genres: [anilistGenre], minScore: qt.anilistScore, minPop: qt.anilistPopularity },
          }),
          signal: AbortSignal.timeout(10000),
        }).then(r => r.ok ? r.json() : { data: null }).catch(() => ({ data: null }))
      ))

      const media: any[] = pageResults.flatMap((json: any) => json.data?.Page?.media || [])

      const candidates = media
        .filter((m: any) => {
          const id = `anilist-anime-${m.id}`
          const title = m.title?.english || m.title?.romaji || ''
          if (isAlreadyOwned('anime', id, title) || seen.has(id)) return false
          if (shownIds?.has(id)) return false
          return !!(m.coverImage?.extraLarge || m.coverImage?.large)
        })
        .map((m: any) => {
          const mGenres: string[] = m.genres || []
          const mTags: string[] = (m.tags || [])
            .filter((t: any) => t.rank >= 55)
            .sort((a: any, b: any) => b.rank - a.rank)
            .slice(0, 15)
            .map((t: any) => t.name.toLowerCase())
          const mStudios: string[] = (m.studios?.nodes || []).map((s: any) => s.name).filter(Boolean)
          const mDirectors: string[] = (m.staff?.edges || [])
            .filter((e: any) => DIRECTOR_ROLES.has(e.role))
            .map((e: any) => e.node?.name?.full).filter(Boolean)

          let boost = 0
          for (const theme of topThemes) { if (mTags.some(t => t.includes(theme))) boost += 3 }
          for (const kw of topKeywords) { if (mTags.some(t => t.includes(kw))) boost += 2 }
          let creatorBoost: string | undefined
          for (const studio of mStudios) { if (topStudiosSet.has(studio)) { boost += 10; creatorBoost = studio; break } }
          for (const director of mDirectors) { if (topDirectorsSet.has(director)) { boost += 8; if (!creatorBoost) creatorBoost = director; break } }
          const socialFriend = socialFavorites?.get(`anilist-anime-${m.id}`)
          if (socialFriend) { const sim = parseInt(socialFriend) || 75; boost += Math.round((sim - 70) / 30 * 20) }
          if (isAwardWorthy(m.averageScore, m.popularity, m.popularity, 'anilist')) boost += 8

          const year = m.seasonYear
          const freshMult = releaseFreshnessMult(year, m.averageScore || 0, m.popularity || 0)
          let matchScore = computeMatchScore(mGenres, mTags, tasteProfile, mStudios, mDirectors)
          matchScore = Math.min(100, Math.round(matchScore * freshMult) + Math.min(boost, 25))

          return { m, matchScore, mGenres, mTags, mStudios, mDirectors, socialFriend, year, creatorBoost }
        })
        .filter(({ matchScore }) => matchScore >= 40)
        .sort((a, b) => b.matchScore - a.matchScore)

      for (const { m, matchScore, mGenres, mTags, mStudios, mDirectors, socialFriend, year, creatorBoost } of candidates) {
        if (results.length >= MIN_POOL_ITEMS) break
        const recId = `anilist-anime-${m.id}`
        if (seen.has(recId)) continue
        seen.add(recId)
        results.push({
          id: recId,
          title: m.title?.english || m.title?.romaji || 'Senza titolo',
          type: 'anime',
          coverImage: m.coverImage?.extraLarge || m.coverImage?.large,
          year, episodes: m.episodes, genres: mGenres, tags: mTags,
          score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
          description: m.description ? truncateAtSentence(m.description.replace(/<[^>]+>/g, ''), 300) : undefined,
          why: socialFriend
            ? `Il tuo amico con gusti simili ha adorato questo`
            : buildWhyV3(mGenres, recId, m.title?.english || m.title?.romaji || '', tasteProfile, matchScore, slot.isDiscovery, {
                recStudios: mStudios, recDirectors: mDirectors, creatorBoost,
              }),
          matchScore, isDiscovery: slot.isDiscovery, isSerendipity: slot.isSerendipity,
          isSeasonal: false,
          isAwardWinner: isAwardWorthy(m.averageScore, m.popularity, m.popularity, 'anilist'),
          socialBoost: socialFriend, creatorBoost,
        })
      }
    } catch { /* continua */ }
  }

  // ── Fallback: fetch parallelo di tutte le wave insieme ──────────────────
  // Invece di loop seriali (30+ chiamate sequenziali = 15s), fetch tutte le
  // pagine in parallelo e poi filtra. Max ~12 chiamate parallele = ~1-2s.
  if (results.length < MIN_POOL_ITEMS) {
    const fallbackQueries = [
      // Wave 1: alta qualità, molto popolari — pagine 1-4
      ...[1, 2, 3, 4].map(page => ({ page, minScore: 65, minPop: 2000, sort: 'POPULARITY_DESC' })),
      // Wave 2: qualità media, abbastanza popolari — pagine 1-4
      ...[1, 2, 3, 4].map(page => ({ page, minScore: 55, minPop: 500, sort: 'SCORE_DESC' })),
      // Wave 3: qualità decente, meno noti — pagine 1-2
      ...[1, 2].map(page => ({ page, minScore: 50, minPop: 200, sort: 'POPULARITY_DESC' })),
    ]

    const fallbackResults = await batchedParallel(
      fallbackQueries.map(({ page, minScore, minPop, sort }) => () =>
        fetch(ANILIST_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `query { Page(page: ${page}, perPage: 50) {
              media(type: ANIME, format_in: [TV, TV_SHORT, ONA, SPECIAL],
                    sort: [${sort}],
                    averageScore_greater: ${minScore},
                    popularity_greater: ${minPop},
                    isAdult: false) {
                id title { romaji english } coverImage { extraLarge large }
                seasonYear episodes description(asHtml: false)
                genres averageScore popularity
                tags { name rank }
                studios(isMain: true) { nodes { name } }
              }
            }}`,
          }),
          signal: AbortSignal.timeout(10000),
        }).then(r => r.ok ? r.json() : { data: null }).catch(() => ({ data: null }))
      ),
      8  // max 8 parallele — AniList rate limit 90/min
    )

    for (const result of fallbackResults) {
      if (results.length >= MIN_POOL_ITEMS) break
      if (result.status !== 'fulfilled') continue
      const media: any[] = result.value.data?.Page?.media || []
      for (const m of media) {
        if (results.length >= MIN_POOL_ITEMS) break
        const recId = `anilist-anime-${m.id}`
        const title = m.title?.english || m.title?.romaji || ''
        if (isAlreadyOwned('anime', recId, title) || seen.has(recId)) continue
        if (shownIds?.has(recId)) continue
        if (!(m.coverImage?.extraLarge || m.coverImage?.large)) continue
        seen.add(recId)
        const mGenres: string[] = m.genres || []
        const mTags: string[] = (m.tags || []).filter((t: any) => t.rank >= 55).map((t: any) => t.name.toLowerCase())
        const mStudios: string[] = (m.studios?.nodes || []).map((s: any) => s.name).filter(Boolean)
        let matchScore = computeMatchScore(mGenres, mTags, tasteProfile, mStudios, [])
        if (isAwardWorthy(m.averageScore, m.popularity, m.popularity, 'anilist')) matchScore = Math.min(100, matchScore + 8)
        if (matchScore < 30) continue
        results.push({
          id: recId, title: title || 'Senza titolo', type: 'anime',
          coverImage: m.coverImage?.extraLarge || m.coverImage?.large,
          year: m.seasonYear, episodes: m.episodes, genres: mGenres, tags: mTags,
          score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
          description: m.description ? truncateAtSentence(m.description.replace(/<[^>]+>/g, ''), 300) : undefined,
          why: buildWhyV3(mGenres, recId, title, tasteProfile, matchScore, false, { recStudios: mStudios }),
          matchScore,
          isAwardWinner: isAwardWorthy(m.averageScore, m.popularity, m.popularity, 'anilist'),
        })
      }
    }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}
