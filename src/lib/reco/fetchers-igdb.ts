import { translateWithCache } from '@/lib/deepl'
import { truncateAtSentence } from '@/lib/utils'
import type { Recommendation, TasteProfile } from './types'
import type { GenreSlot } from './slots'
import { buildWhyV3, computeMatchScore } from './profile'
import { applyFormatDiversity, getCurrentAnimeSeasonDates, isAwardWorthy, releaseFreshnessMult, runtimePenalty } from './scoring'
import { BGG_TO_CROSS_GENRE, CROSS_TO_BGG_CATEGORY, CROSS_TO_IGDB_GENRE, CROSS_TO_IGDB_THEME, IGDB_VALID_GENRES, TMDB_GENRE_MAP, TMDB_TV_GENRE_MAP } from './genre-maps'
let cachedToken: { token: string; expiresAt: number } | null = null

async function getIgdbToken(clientId: string, secret: string): Promise<string | null> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(6000),
  })
  const data = await res.json()
  if (!data.access_token) return null
  cachedToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) * 1000 }
  return cachedToken.token
}

export async function fetchGameRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile,
  clientId: string, secret: string, isAlreadyOwned: (type: string, id: string, title: string) => boolean,
  shownIds?: Set<string>
): Promise<Recommendation[]> {
  const token = await getIgdbToken(clientId, secret)
  if (!token) return []

  const results: Recommendation[] = []
  const seen = new Set<string>()
  const topTones = Object.entries(tasteProfile.deepSignals.tones)
    .sort(([, a], [, b]) => b - a).slice(0, 4).map(([t]) => t)

  const topDevsSet = new Set(
    Object.entries(tasteProfile.creatorScores.developers).sort(([,a],[,b]) => b - a).slice(0, 5).map(([d]) => d)
  )

  // Fix 1.11: calcola theme IDs aggiuntivi dai generi del profilo utente
  // Per es. se l'utente ama Horror/Thriller (che sono themes IGDB, non genres),
  // aggiungiamo themes.id = (19,20) come condizione OR nella query
  const profileThemeIds: number[] = []
  for (const g of tasteProfile.globalGenres.slice(0, 8).map(x => x.genre)) {
    const ids = CROSS_TO_IGDB_THEME[g]
    if (ids) for (const id of ids) if (!profileThemeIds.includes(id)) profileThemeIds.push(id)
  }

  for (const slot of slots) {
    // slot.genre è ora sempre un genere IGDB valido grazie a buildDiversitySlots
    if (!IGDB_VALID_GENRES.has(slot.genre)) continue

    try {
      const igdbRatingMin = tasteProfile.qualityThresholds.igdbRating
      const igdbCountMin = tasteProfile.qualityThresholds.igdbRatingCount
      // Fix 1.11: aggiungi themes.id come condizione OR se il profilo ha generi-tema
      const themeFilter = profileThemeIds.length > 0
        ? ` | (themes = (${profileThemeIds.join(',')}) & genres.name = ("${slot.genre}"))`
        : ''
      const body = `
        fields name, cover.url, first_release_date, summary, genres.name, themes.name,
               player_perspectives.name, rating, rating_count, keywords.name,
               involved_companies.company.name, involved_companies.developer,
               platforms.name;
        where (genres.name = ("${slot.genre}") & rating_count > ${igdbCountMin} & rating >= ${igdbRatingMin} & cover != null)${themeFilter};
        sort rating desc;
        limit 50;
      `
      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body,
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const games = await res.json()
      if (!Array.isArray(games)) continue

      // Top keywords e themes del profilo per il boost
      const topProfileThemes = new Set(
        Object.entries(tasteProfile.deepSignals.themes)
          .sort(([, a], [, b]) => b - a).slice(0, 10).map(([t]) => t.toLowerCase())
      )
      const topProfileKeywords = new Set(
        Object.entries(tasteProfile.deepSignals.keywords)
          .sort(([, a], [, b]) => b - a).slice(0, 15).map(([k]) => k.toLowerCase())
      )
      // Generi cross-media del profilo (per confronto con themes IGDB)
      const profileCrossGenres = new Set(tasteProfile.globalGenres.slice(0, 8).map(g => g.genre.toLowerCase()))

      const scored = games
        .filter((g: any) => {
          const title = g.name || ''
          return !isAlreadyOwned('game', g.id.toString(), title) && g.cover?.url && !seen.has(g.id.toString())
        })
        .map((g: any) => {
          const gameThemes: string[] = (g.themes || []).map((t: any) => t.name.toLowerCase())
          const gameKws: string[] = (g.keywords || []).map((k: any) => k.name.toLowerCase())
          const allTags = [...gameThemes, ...gameKws]

          // V3: developer detection
          const developer = (g.involved_companies || [])
            .filter((ic: any) => ic.developer)
            .map((ic: any) => ic.company?.name)
            .filter(Boolean)[0] as string | undefined

          let boost = 0

          // Boost da tones del profilo
          for (const tone of topTones) { if (gameThemes.some(t => t.includes(tone))) boost += 2 }

          // Boost da themes del profilo (es. profilo ha "horror" → gioco ha theme "horror" → +4)
          for (const theme of topProfileThemes) {
            if (gameThemes.some(t => t === theme || t.includes(theme))) boost += 4
          }

          // Boost da keywords profilo
          for (const kw of topProfileKeywords) {
            if (gameKws.some(k => k.includes(kw) || kw.includes(k))) boost += 2
          }

          // Boost se i themes del gioco corrispondono ai generi cross-media del profilo
          // (es. tema IGDB "fantasy" → genere profilo "Fantasy")
          for (const theme of gameThemes) {
            if (profileCrossGenres.has(theme)) boost += 5
          }

          let creatorBoost: string | undefined
          if (developer && topDevsSet.has(developer)) { boost += 10; creatorBoost = developer }

          const recGenres: string[] = g.genres?.map((gen: any) => gen.name) || []
          const matchScore = computeMatchScore(recGenres, allTags, tasteProfile, [], developer ? [developer] : [])

          return { g, boost, matchScore, recGenres, developer, creatorBoost }
        })
        .filter(({ matchScore }: any) => matchScore >= 10)  // soglia più bassa per giochi (generi IGDB meno precisi)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota + 8)  // buffer extra per compensare seen/shownIds

      for (const { g, matchScore, recGenres, developer, creatorBoost } of scored) {
        const recId = g.id.toString()
        if (seen.has(recId)) continue
        if (shownIds?.has(recId)) continue
        // Escludi giochi esclusivamente su Web browser
        const platformNames: string[] = (g.platforms || []).map((p: any) => (p.name as string || '').toLowerCase())
        if (platformNames.length > 0 && platformNames.every(p => p.includes('web') || p.includes('browser'))) continue
        seen.add(recId)
        const year = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined
        let finalScore = matchScore
        // V4: award boost
        if (isAwardWorthy(g.rating, undefined, g.rating_count, 'igdb')) finalScore = Math.min(100, finalScore + 8)
        // V4: freshness
        finalScore = Math.min(100, Math.round(finalScore * releaseFreshnessMult(year)))
        results.push({
          id: recId,
          title: g.name,
          type: 'game',
          coverImage: `https:${g.cover.url.replace('t_thumb', 't_1080p')}`,
          year,
          genres: recGenres,
          tags: (g.themes || []).map((t: any) => t.name),
          keywords: (g.keywords || []).map((k: any) => k.name).slice(0, 20),
          score: g.rating ? Math.min(Math.round(g.rating) / 20, 5) : undefined,
          description: g.summary ? truncateAtSentence(g.summary, 300) : undefined,
          why: buildWhyV3(recGenres, recId, g.name, tasteProfile, matchScore, slot.isDiscovery, {
            recDeveloper: developer, creatorBoost
          }),
          matchScore: finalScore,
          isDiscovery: slot.isDiscovery,
          creatorBoost,
          isAwardWinner: isAwardWorthy(g.rating, undefined, g.rating_count, 'igdb'),
          developers: developer ? [developer] : undefined,
          platforms: (g.platforms || []).map((p: any) => (p.name as string || '').replace(/ \(Windows\)$/i, '')).filter(Boolean).slice(0, 6) as string[] || undefined,
        })
      }
    } catch { /* continua */ }
  }

  // ── TOP-UP Game: continua con offset IGDB finché pool raggiunge 200 ───────
  const GAME_POOL_TARGET = 200
  if (results.length < GAME_POOL_TARGET && slots.length > 0) {
    const igdbRatingMin = tasteProfile.qualityThresholds.igdbRating
    const igdbCountMin = tasteProfile.qualityThresholds.igdbRatingCount
    const topProfileThemes = new Set(
      Object.entries(tasteProfile.deepSignals.themes)
        .sort(([, a], [, b]) => b - a).slice(0, 10).map(([t]) => t.toLowerCase())
    )
    const topProfileKeywords = new Set(
      Object.entries(tasteProfile.deepSignals.keywords)
        .sort(([, a], [, b]) => b - a).slice(0, 15).map(([k]) => k.toLowerCase())
    )
    const profileCrossGenres = new Set(tasteProfile.globalGenres.slice(0, 8).map(g => g.genre.toLowerCase()))
    const validSlots = slots.filter(s => IGDB_VALID_GENRES.has(s.genre))
    let offsetStep = 0
    const MAX_OFFSET_STEPS = 6
    while (results.length < GAME_POOL_TARGET && offsetStep < MAX_OFFSET_STEPS) {
      offsetStep++
      const offsetVal = offsetStep * 50
      for (const slot of validSlots) {
        if (results.length >= GAME_POOL_TARGET) break
        try {
          const body = `
            fields name, cover.url, first_release_date, summary, genres.name, themes.name,
                   rating, rating_count, keywords.name,
                   involved_companies.company.name, involved_companies.developer,
                   platforms.name;
            where genres.name = ("${slot.genre}") & rating_count > ${igdbCountMin} & rating >= ${igdbRatingMin} & cover != null;
            sort rating desc;
            limit 50;
            offset ${offsetVal};
          `
          const res = await fetch('https://api.igdb.com/v4/games', {
            method: 'POST',
            headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
            body, signal: AbortSignal.timeout(8000),
          })
          if (!res.ok) continue
          const games = await res.json()
          if (!Array.isArray(games) || games.length === 0) continue
          for (const g of games) {
            const title = g.name || ''
            if (isAlreadyOwned('game', g.id.toString(), title) || seen.has(g.id.toString())) continue
            if (!g.cover?.url) continue
            seen.add(g.id.toString())
            const gameThemes: string[] = (g.themes || []).map((t: any) => t.name.toLowerCase())
            const gameKws: string[] = (g.keywords || []).map((k: any) => k.name.toLowerCase())
            const allTags = [...gameThemes, ...gameKws]
            let boost = 0
            for (const theme of topProfileThemes) { if (gameThemes.some(t => t === theme || t.includes(theme))) boost += 4 }
            for (const kw of topProfileKeywords) { if (gameKws.some(k => k.includes(kw) || kw.includes(k))) boost += 2 }
            for (const theme of gameThemes) { if (profileCrossGenres.has(theme)) boost += 5 }
            const developer = (g.involved_companies || [])
              .filter((ic: any) => ic.developer)
              .map((ic: any) => ic.company?.name)
              .filter(Boolean)[0] as string | undefined
            const recGenres: string[] = g.genres?.map((gen: any) => gen.name) || []
            let matchScore = computeMatchScore(recGenres, allTags, tasteProfile, [], developer ? [developer] : [])
            if (matchScore + boost < 10) continue
            // Escludi giochi esclusivamente su Web browser
            const platformNames: string[] = (g.platforms || []).map((p: any) => (p.name as string || '').toLowerCase())
            if (platformNames.length > 0 && platformNames.every(p => p.includes('web') || p.includes('browser'))) continue
            if (isAwardWorthy(g.rating, undefined, g.rating_count, 'igdb')) matchScore = Math.min(100, matchScore + 8)
            const year = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined
            matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))
            if (matchScore < 40) continue
            results.push({
              id: g.id.toString(),
              title: g.name,
              type: 'game',
              coverImage: `https:${g.cover.url.replace('t_thumb', 't_1080p')}`,
              year,
              genres: recGenres,
              tags: (g.themes || []).map((t: any) => t.name),
              keywords: (g.keywords || []).map((k: any) => k.name).slice(0, 20),
              score: g.rating ? Math.min(Math.round(g.rating) / 20, 5) : undefined,
              description: g.summary ? truncateAtSentence(g.summary, 300) : undefined,
              why: buildWhyV3(recGenres, g.id.toString(), g.name, tasteProfile, matchScore, false, { recDeveloper: developer }),
              matchScore,
              isAwardWinner: isAwardWorthy(g.rating, undefined, g.rating_count, 'igdb'),
              developers: developer ? [developer] : undefined,
              platforms: (g.platforms || []).map((p: any) => (p.name as string || '').replace(/ \(Windows\)$/i, '')).filter(Boolean).slice(0, 6) as string[] || undefined,
            })
            if (results.length >= GAME_POOL_TARGET) break
          }
        } catch { /* continua */ }
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const gameDescItems = results
    .filter(r => r.description)
    .map(r => ({ id: `igdb:${r.id}`, text: r.description! }))
  if (gameDescItems.length > 0) {
    const t = await translateWithCache(gameDescItems)
    results.forEach(r => { if (r.description) r.description = t[`igdb:${r.id}`] || r.description })
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}



// ── fetchBoardgameRecs ────────────────────────────────────────────────────────
// V3: hot list BGG + seed ID per categoria → pool master ricco.
// Niente sleep, fetch parallelo, filtro rank<=1000 e anno>=2005.

// ID BGG seed per categoria — pool ampio e vario (top 1000 BGG, non solo mainstream)
// Include titoli eccellenti ma meno conosciuti al grande pubblico, generi di nicchia,
// classici sottovalutati, e gemme recenti non ancora arcinote.
