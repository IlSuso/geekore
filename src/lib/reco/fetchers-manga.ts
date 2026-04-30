import { truncateAtSentence } from '@/lib/utils'
import type { Recommendation, TasteProfile } from './types'
import type { GenreSlot } from './slots'
import { buildWhyV3, computeMatchScore } from './profile'
import { applyFormatDiversity, getCurrentAnimeSeasonDates, isAwardWorthy, releaseFreshnessMult, runtimePenalty } from './scoring'
import { BGG_TO_CROSS_GENRE, CROSS_TO_BGG_CATEGORY, CROSS_TO_IGDB_GENRE, CROSS_TO_IGDB_THEME, IGDB_VALID_GENRES, TMDB_GENRE_MAP, TMDB_TV_GENRE_MAP } from './genre-maps'
import { batchedParallel } from './concurrent'
const ANILIST_MANGA_GENRES = new Set([
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Sports', 'Supernatural', 'Thriller',
])

// Remap generi cross-media → generi AniList validi
const MANGA_GENRE_REMAP: Record<string, string> = {
  'Science Fiction': 'Sci-Fi',
  'Science-Fiction': 'Sci-Fi',
  'Animation': '',   // non esiste su AniList — salta
  'Kids': 'Comedy',
  'War': 'Action',
  'Crime': 'Mystery',
  'Family': 'Comedy',
}
export async function fetchMangaRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile, isAlreadyOwned: (type: string, id: string, title: string) => boolean,
  shownIds?: Set<string>, socialFavorites?: Map<string, string>
): Promise<Recommendation[]> {
  const results: Recommendation[] = []
  const seen = new Set<string>()
  const qt = tasteProfile.qualityThresholds
  const topThemes = Object.entries(tasteProfile.deepSignals.themes)
    .sort(([, a], [, b]) => b - a).slice(0, 6).map(([t]) => t)
  const topKeywords = Object.entries(tasteProfile.deepSignals.keywords)
    .sort(([, a], [, b]) => b - a).slice(0, 8).map(([k]) => k)

  const topAuthorsSet = new Set(
    Object.entries(tasteProfile.creatorScores.authors).sort(([,a],[,b]) => b - a).slice(0, 8).map(([a]) => a)
  )

  for (const slot of slots) {
    const remapped = MANGA_GENRE_REMAP[slot.genre]
    if (remapped === '') continue  // genere non valido su AniList
    const genre = (() => { const r = remapped || slot.genre; return ANILIST_MANGA_GENRES.has(r) ? r : null })()
    if (!genre) continue

    const pagesToFetchManga = slot.quota > 20 ? [1, 2] : [1]
    const mangaQuery = (page: number) => `
      query($genres: [String], $minScore: Int, $minPop: Int) {
        Page(page: ${page}, perPage: 50) {
          media(genre_in: $genres, type: MANGA, format_in: [MANGA, ONE_SHOT],
                sort: [SCORE_DESC, POPULARITY_DESC],
                averageScore_greater: $minScore, popularity_greater: $minPop) {
            id title { romaji english } coverImage { extraLarge large }
            seasonYear chapters genres description(asHtml: false) averageScore popularity trending
            tags { name rank }
            staff(sort: RELEVANCE) { edges { role node { name { full } } } }
          }
        }
      }
    `
    try {
      const mangaPageResults = await Promise.all(pagesToFetchManga.map(page =>
        fetch('https://graphql.anilist.co', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: mangaQuery(page), variables: { genres: [genre], minScore: qt.anilistScore, minPop: qt.anilistPopularity } }),
          signal: AbortSignal.timeout(8000),
        }).then(r => r.ok ? r.json() : { data: null }).catch(() => ({ data: null }))
      ))
      const media = mangaPageResults.flatMap((json: any) => json.data?.Page?.media || [])

      const candidates = media
        .filter((m: any) => {
          const id = `anilist-manga-${m.id}`
          const title = m.title?.romaji || m.title?.english || ''
          if (isAlreadyOwned('manga', id, title) || seen.has(id)) return false
          if (shownIds?.has(id)) return false
          return !!(m.coverImage?.extraLarge || m.coverImage?.large)
        })
        .map((m: any) => {
          const mTags: string[] = (m.tags || []).map((t: any) => t.name.toLowerCase())
          const mAuthors: string[] = (m.staff?.edges || [])
            .filter((e: any) => ['Story', 'Story & Art', 'Original Creator'].includes(e.role))
            .map((e: any) => e.node?.name?.full).filter(Boolean)

          let boost = 0
          for (const theme of topThemes) { if (mTags.some(t => t.includes(theme))) boost += 3 }
          for (const kw of topKeywords) { if (mTags.some(t => t.includes(kw))) boost += 2 }

          let creatorBoost: string | undefined
          for (const author of mAuthors) {
            if (topAuthorsSet.has(author)) { boost += 8; creatorBoost = author; break }
          }

          const trendingBoost = Math.min(4, (m.trending || 0) / 200)
          boost += trendingBoost

          // Social boost
          const socialFriend = socialFavorites?.get(`anilist-manga-${m.id}`)
          if (socialFriend) { const _sim = parseInt(socialFriend) || 75; boost += Math.round((_sim - 70) / 30 * 20) }  // Fix 1.12

          const recGenres: string[] = m.genres || []
          let matchScore = computeMatchScore(recGenres, mTags, tasteProfile, [], mAuthors)
          // Freshness inline
          matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(m.seasonYear, m.averageScore, m.popularity)))
          return { m, boost, matchScore, recGenres, mTags, mAuthors, creatorBoost, trendingBoost, socialFriend }
        })
        .filter(({ matchScore }: any) => matchScore >= 40)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota + 5)

      for (const { m, matchScore, recGenres, mTags, mAuthors, creatorBoost, trendingBoost, socialFriend } of candidates.slice(0, slot.quota)) {
        const recId = `anilist-manga-${m.id}`
        if (seen.has(recId)) continue
        seen.add(recId)
        let finalScore = matchScore
        if (socialFriend) finalScore = Math.min(100, finalScore + 15)
        if (isAwardWorthy(m.averageScore, m.popularity, undefined, 'anilist')) finalScore = Math.min(100, finalScore + 8)
        results.push({
          id: recId,
          title: m.title.romaji || m.title.english || 'Senza titolo',
          type: 'manga',
          coverImage: m.coverImage?.extraLarge || m.coverImage?.large,
          year: m.seasonYear,
          genres: recGenres,
          tags: mTags,
          score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
          description: m.description ? truncateAtSentence(m.description.replace(/<[^>]+>/g, ''), 300) : undefined,
          why: socialFriend
            ? `Il tuo amico con gusti simili all'${socialFriend} ha adorato questo`
            : buildWhyV3(recGenres, recId, m.title.romaji || '', tasteProfile, matchScore, slot.isDiscovery, {
                recStudios: [], recDirectors: mAuthors, trendingBoost, creatorBoost
              }),
          matchScore: finalScore,
          isDiscovery: slot.isDiscovery,
          isSerendipity: slot.isSerendipity,
          creatorBoost,
          isAwardWinner: isAwardWorthy(m.averageScore, m.popularity, undefined, 'anilist'),
          socialBoost: socialFriend,
          authors: mAuthors.length > 0 ? mAuthors : undefined,
          episodes: m.chapters || undefined,
        })
      }
    } catch { /* continua */ }
  }

  // ── TOP-UP parallelo: fetch tutte le query insieme ───────────────────────
  const MANGA_POOL_TARGET = 200
  if (results.length < MANGA_POOL_TARGET) {
    const availableGenres = slots
      .map(s => { const r = MANGA_GENRE_REMAP[s.genre]; if (r === '') return null; const mapped = r || s.genre; return ANILIST_MANGA_GENRES.has(mapped) ? mapped : null })
      .filter(Boolean) as string[]
    const fallbackGenres = ['Action', 'Drama', 'Fantasy', 'Comedy', 'Sci-Fi', 'Romance', 'Supernatural']
    const genresToUse = [...new Set([...(availableGenres.length > 0 ? availableGenres : fallbackGenres), ...fallbackGenres])].slice(0, 6)

    // Costruisci tutte le query in una volta e fetchale in parallelo
    const topupQueries = genresToUse.flatMap(genre =>
      [
        { genre, page: 1, minScore: qt.anilistScore, minPop: qt.anilistPopularity },
        { genre, page: 2, minScore: qt.anilistScore, minPop: qt.anilistPopularity },
        { genre, page: 1, minScore: 50, minPop: 300 },
        { genre, page: 1, minScore: 45, minPop: 100 },
      ]
    )

    const mangaQuery = (page: number) => `
      query($genres: [String], $minScore: Int, $minPop: Int) {
        Page(page: ${page}, perPage: 50) {
          media(genre_in: $genres, type: MANGA, format_in: [MANGA, ONE_SHOT],
                sort: [SCORE_DESC, POPULARITY_DESC],
                averageScore_greater: $minScore, popularity_greater: $minPop) {
            id title { romaji english } coverImage { extraLarge large }
            seasonYear chapters genres description(asHtml: false) averageScore popularity
            tags { name rank }
            staff(sort: RELEVANCE) { edges { role node { name { full } } } }
          }
        }
      }
    `

    const topupResults = await batchedParallel(
      topupQueries.map(({ genre, page, minScore, minPop }) => () =>
        fetch('https://graphql.anilist.co', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: mangaQuery(page), variables: { genres: [genre], minScore, minPop } }),
          signal: AbortSignal.timeout(8000),
        }).then(r => r.ok ? r.json() : { data: null }).catch(() => ({ data: null }))
      ),
      8  // max 8 parallele
    )

    for (const result of topupResults) {
      if (results.length >= MANGA_POOL_TARGET) break
      if (result.status !== 'fulfilled') continue
      const media = result.value.data?.Page?.media || []
      for (const m of media) {
        if (results.length >= MANGA_POOL_TARGET) break
        const id = `anilist-manga-${m.id}`
        const title = m.title?.romaji || m.title?.english || ''
        if (isAlreadyOwned('manga', id, title) || seen.has(id)) continue
        if (!(m.coverImage?.extraLarge || m.coverImage?.large)) continue
        seen.add(id)
        const mTags: string[] = (m.tags || []).map((t: any) => t.name.toLowerCase())
        const mAuthors: string[] = (m.staff?.edges || [])
          .filter((e: any) => ['Story', 'Story & Art', 'Original Creator'].includes(e.role))
          .map((e: any) => e.node?.name?.full).filter(Boolean)
        const recGenres: string[] = m.genres || []
        let matchScore = computeMatchScore(recGenres, mTags, tasteProfile, [], mAuthors)
        matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(m.seasonYear, m.averageScore, m.popularity)))
        if (matchScore < 30) continue
        if (isAwardWorthy(m.averageScore, m.popularity, undefined, 'anilist')) matchScore = Math.min(100, matchScore + 8)
        results.push({
          id, title: title || 'Senza titolo', type: 'manga',
          coverImage: m.coverImage?.extraLarge || m.coverImage?.large,
          year: m.seasonYear, genres: recGenres, tags: mTags,
          score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
          description: m.description ? truncateAtSentence(m.description.replace(/<[^>]+>/g, ''), 300) : undefined,
          why: buildWhyV3(recGenres, id, title, tasteProfile, matchScore, false, { recStudios: [], recDirectors: mAuthors }),
          matchScore,
          authors: mAuthors.length > 0 ? mAuthors : undefined,
          episodes: m.chapters || undefined,
        })
      }
    }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Film V3 (TMDb con trending) ─────────────────────────────────────
// Mappa ID genere TMDb → nome cross-media (usata per popolare recGenres correttamente)
