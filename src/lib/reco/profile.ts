import type { CreatorScores, TasteProfile } from './types'
import type { MediaType, UserEntry, UserSearch } from './engine-types'
import { ANILIST_TO_BGG_CATEGORY, ADJACENCY_GRAPH, BGG_MECHANIC_TO_GENRE, BGG_TO_CROSS_GENRE, IGDB_TO_CROSS_GENRE } from './genre-maps'
import { completionMult, getQualityThresholds, inferLanguagePreference, inferRuntimePreference, isNegativeSignal, rewatchMult, sentimentMult, temporalMultV2, temporalRecency } from './scoring'
import { computeClusterVelocity, computeCreatorScores, computeVelocity, detectBingeProfile, determineActiveWindowForType } from './taste-signals'
function amplifyFromWishlist(
  wishlistItems: UserEntry[],
  globalScores: Record<string, number>,
  perTypeScores: Record<string, Record<string, number>>,
  creatorScores: CreatorScores,
  genreToTitles: Record<string, any[]>,
  searchIntentGenreSet?: Set<string>  // Fix 1.5: wishlist intent score
): string[] {
  const wishlistGenres: string[] = []

  for (const item of wishlistItems) {
    const genres: string[] = item.genres || []
    const type = item.type || 'unknown'

    // Fix 1.5: decadimento temporale sulla wishlist (item vecchi pesano meno)
    const rawTemporal = temporalMultV2(item.created_at)
    // Floor a 0.4: un item in wishlist conta ancora anche se aggiunto un anno fa
    const wishTemporal = Math.max(0.4, rawTemporal)
    const baseWishWeight = 12 * wishTemporal

    for (const genre of genres) {
      // Fix 1.5: boost ×1.5 se il genere è anche nelle ricerche recenti (intent amplification)
      const intentBoost = searchIntentGenreSet?.has(genre) ? 1.5 : 1.0
      const wishWeight = baseWishWeight * intentBoost

      globalScores[genre] = (globalScores[genre] || 0) + wishWeight
      if (perTypeScores[type]) {
        perTypeScores[type][genre] = (perTypeScores[type][genre] || 0) + wishWeight * 0.8
      }
      if (!wishlistGenres.includes(genre)) wishlistGenres.push(genre)

      if (!genreToTitles[genre]) genreToTitles[genre] = []
      if (item.title) {
        const existing = genreToTitles[genre].find((t: any) => t.title === item.title)
        if (!existing) {
          genreToTitles[genre].push({ title: item.title, type: type, recency: wishTemporal, rating: 4, isWishlist: true })
        }
      }
    }

    // Creator dalla wishlist
    if (item.studio) {
      creatorScores.studios[item.studio] = (creatorScores.studios[item.studio] || 0) + 8
    }
  }

  return wishlistGenres
}

// ── V3: Search Intent → amplificazione gusti ──────────────────────────────
function inferFromSearchHistory(
  searches: UserSearch[],
  globalScores: Record<string, number>
): string[] {
  const intentGenres: string[] = []
  const now = Date.now()
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000

  // Raggruppa per query nelle ultime 4 settimane
  const recentSearches = searches.filter(s => {
    if (!s.created_at) return false
    const age = now - new Date(s.created_at).getTime()
    return age <= 28 * 24 * 60 * 60 * 1000
  })

  // Conta query ripetute (desiderio non soddisfatto → priorità massima)
  const queryCount: Record<string, number> = {}
  for (const s of recentSearches) {
    const q = (s.query || '').toLowerCase().trim()
    queryCount[q] = (queryCount[q] || 0) + 1
  }

  for (const s of recentSearches) {
    const q = (s.query || '').toLowerCase().trim()
    const clickedGenres: string[] = s.result_clicked_genres || []
    const ageMs = now - new Date(s.created_at!).getTime()
    const recency = Math.max(0.3, 1 - ageMs / (28 * 24 * 60 * 60 * 1000))

    // Boost base: click > no-click
    let boost = s.result_clicked_id ? 6 : 3

    // Query ripetuta senza soddisfazione → boost massimo
    if (queryCount[q] >= 2 && !s.result_clicked_id) boost = 15

    // Fix 1.6: time-of-day boost — ricerche serali/notturne indicano intent immediato
    const searchHour = new Date(s.created_at!).getHours()
    const isEveningSearch = searchHour >= 19 || searchHour <= 2
    const isVeryRecent = ageMs < 4 * 60 * 60 * 1000  // ultime 4 ore
    if (isVeryRecent && isEveningSearch) boost = Math.round(boost * 1.4)

    // Applica ai generi cliccati
    for (const genre of clickedGenres) {
      globalScores[genre] = (globalScores[genre] || 0) + boost * recency
      if (!intentGenres.includes(genre)) intentGenres.push(genre)
    }

    // Inferisci dai termini della query (es. "dark fantasy" → Fantasy, Drama)
    for (const [kw, deep] of Object.entries(KEYWORD_TO_DEEP)) {
      if (q.includes(kw)) {
        for (const theme of (deep.themes || [])) {
          // Mappa theme → genere approssimato
          const mapped = themeToGenre(theme)
          if (mapped && !intentGenres.includes(mapped)) {
            globalScores[mapped] = (globalScores[mapped] || 0) + boost * recency * 0.5
            intentGenres.push(mapped)
          }
        }
      }
    }
  }

  return [...new Set(intentGenres)].slice(0, 5)
}

function themeToGenre(theme: string): string | null {
  const map: Record<string, string> = {
    'isekai': 'Fantasy', 'dark fantasy': 'Fantasy', 'antihero': 'Drama',
    'psychological': 'Psychological', 'survival': 'Action', 'horror': 'Horror',
    'mystery': 'Mystery', 'romance': 'Romance', 'comedy': 'Comedy',
    'magic': 'Fantasy', 'space exploration': 'Science Fiction', 'war': 'Action',
    'heist': 'Thriller', 'cyberpunk': 'Science Fiction', 'dystopia': 'Science Fiction',
    'supernatural': 'Supernatural', 'time travel': 'Science Fiction',
  }
  return map[theme] || null
}


const KEYWORD_TO_DEEP: Record<string, { themes?: string[]; tones?: string[]; settings?: string[] }> = {
  'time travel': { themes: ['time travel'], tones: ['mind-bending'] },
  'revenge': { themes: ['revenge'] },
  'redemption': { themes: ['redemption'] },
  'dystopia': { themes: ['dystopia'], tones: ['dark'], settings: ['dystopian future'] },
  'apocalypse': { themes: ['apocalypse'], tones: ['dark', 'tense'] },
  'superhero': { themes: ['superhero'], tones: ['action-packed'] },
  'artificial intelligence': { themes: ['AI', 'technology'], settings: ['sci-fi future'] },
  'serial killer': { themes: ['crime', 'psychology'], tones: ['dark', 'tense'] },
  'heist': { themes: ['heist', 'crime'], tones: ['tense'] },
  'coming of age': { themes: ['coming of age'], tones: ['emotional'] },
  'magic': { themes: ['magic'], settings: ['fantasy world'] },
  'war': { themes: ['war'], tones: ['dark', 'intense'] },
  'space': { themes: ['space exploration'], settings: ['outer space'] },
  'medieval': { settings: ['medieval'] },
  'post-apocalyptic': { themes: ['survival'], tones: ['dark'], settings: ['post-apocalyptic'] },
  'political': { themes: ['politics'], tones: ['complex'] },
  'philosophical': { tones: ['philosophical'] },
  'friendship': { themes: ['friendship'] },
  'romance': { themes: ['romance'] },
  'psychological': { tones: ['psychological', 'dark'] },
  'supernatural': { themes: ['supernatural'] },
  'mystery': { themes: ['mystery'], tones: ['tense'] },
  'samurai': { settings: ['feudal japan'] },
  'cyberpunk': { themes: ['technology', 'dystopia'], settings: ['cyberpunk'] },
  'zombie': { themes: ['survival', 'apocalypse'], tones: ['horror'] },
  'alien': { themes: ['alien contact'], settings: ['outer space'] },
  'detective': { themes: ['investigation'], tones: ['tense'] },
  'mafia': { themes: ['crime', 'mafia'], tones: ['dark'] },
  'survival': { themes: ['survival'], tones: ['tense'] },
  'open world': { themes: ['exploration'] },
  'monsters': { themes: ['monsters'], settings: ['fantasy world'] },
  'isekai': { themes: ['isekai', 'transported to another world'], settings: ['fantasy world'] },
  'dark fantasy': { themes: ['dark fantasy'], tones: ['dark', 'gritty'] },
  'antihero': { themes: ['antihero', 'moral ambiguity'], tones: ['complex'] },
  'seinen': { tones: ['mature', 'complex'] },
  'shonen': { tones: ['action-packed', 'coming of age'] },
  'cozy': { tones: ['relaxing', 'cozy'], themes: ['slice of life'] },
}

function inferGenresFromName(name: string): string[] {
  const n = name.toLowerCase()
  if (n.includes('horror') || n.includes('dead') || n.includes('evil') || n.includes('silent')) return ['Horror', 'Thriller']
  if (n.includes('witcher') || n.includes('elder scrolls') || n.includes('dragon age') || n.includes('baldur')) return ['Role-playing (RPG)', 'Fantasy', 'Adventure']
  if (n.includes('dark souls') || n.includes('elden ring') || n.includes('sekiro') || n.includes('bloodborne')) return ['Action', 'Role-playing (RPG)', 'Fantasy']
  if (n.includes('grand theft') || n.includes('gta') || n.includes('mafia')) return ['Action', 'Crime', 'Adventure']
  if (n.includes('civilization') || n.includes('total war') || n.includes('xcom')) return ['Strategy']
  if (n.includes('minecraft') || n.includes('terraria') || n.includes('subnautica')) return ['Adventure', 'Survival', 'Simulation']
  if (n.includes('mass effect') || n.includes('cyberpunk') || n.includes('deus ex')) return ['Role-playing (RPG)', 'Science Fiction', 'Action']
  if (n.includes('final fantasy') || n.includes('persona') || n.includes('tales of')) return ['Role-playing (RPG)', 'Fantasy', 'Drama']
  if (n.includes('call of duty') || n.includes('battlefield') || n.includes('halo') || n.includes('doom')) return ['Shooter', 'Action']
  if (n.includes('assassin') || n.includes('hitman')) return ['Action', 'Stealth', 'Adventure']
  if (n.includes('racing') || n.includes('forza') || n.includes('need for speed')) return ['Racing', 'Sports']
  return []
}

export function computeTasteProfile(
  entries: UserEntry[],
  preferences: Record<string, string[]>,
  wishlistItems: UserEntry[],
  searchHistory: UserSearch[]
): TasteProfile {
  const globalScores: Record<string, number> = {}
  const negativeGenreScores: Record<string, number> = {}
  const perTypeScores: Record<string, Record<string, number>> = {
    anime: {}, manga: {}, movie: {}, tv: {}, game: {}, boardgame: {},
  }
  const genreToTitles: Record<string, Array<any>> = {}
  const deepKeywords: Record<string, number> = {}
  const deepThemes: Record<string, number> = {}
  const deepTones: Record<string, number> = {}
  const deepSettings: Record<string, number> = {}
  const droppedTitles = new Set<string>()

  const addScore = (genre: string, weight: number, type: string, title: string, recency: number, rating: number, velocity?: number) => {
    globalScores[genre] = (globalScores[genre] || 0) + weight
    if (perTypeScores[type]) {
      perTypeScores[type][genre] = (perTypeScores[type][genre] || 0) + weight
    }
    if (!genreToTitles[genre]) genreToTitles[genre] = []
    const existing = genreToTitles[genre].find(t => t.title === title)
    if (existing) {
      if (recency > existing.recency) existing.recency = recency
    } else {
      genreToTitles[genre].push({ title, type, recency, rating, velocity })
    }
  }

  const addNegative = (genre: string, weight: number, type: string) => {
    negativeGenreScores[genre] = (negativeGenreScores[genre] || 0) + weight
    if (perTypeScores[type]) {
      perTypeScores[type][genre] = Math.max(0, (perTypeScores[type][genre] || 0) - weight * 0.3)
    }
  }

  // Fix 1.3: traccia conteggi drop per genere per rilevare hard-dislike pattern
  const droppedGenreCounts: Record<string, number> = {}

  const addDeep = (signals: { themes?: string[]; tones?: string[]; settings?: string[] }, weight: number) => {
    for (const kw of signals.themes || []) deepThemes[kw] = (deepThemes[kw] || 0) + weight
    for (const kw of signals.tones || []) deepTones[kw] = (deepTones[kw] || 0) + weight
    for (const kw of signals.settings || []) deepSettings[kw] = (deepSettings[kw] || 0) + weight
  }

  // Adaptive window per tipo (V3)
  const activeWindowByType: Record<string, number> = {}
  for (const type of ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']) {
    activeWindowByType[type] = determineActiveWindowForType(entries, type as MediaType)
  }
  const activeWindow = Math.round(
    Object.values(activeWindowByType).reduce((s, v) => s + v, 0) / 6
  )

  // Context titoli top per spiegazioni V3 behavioral
  const topTitlesForContext: TasteProfile['topTitlesForContext'] = []

  // Fix 1.7: nicheScore continuo (0-1) + nicheUser basato su percentuale
  let nicheSignals = 0
  const totalWithScore = entries.filter(e => (e.community_score || 0) > 0).length
  for (const entry of entries) {
    if ((entry.rating || 0) >= 4 && (entry.community_score || 0) < 65 && (entry.community_score || 0) > 0) nicheSignals++
  }
  const nicheScore = totalWithScore > 0 ? nicheSignals / totalWithScore : 0
  // nicheUser = almeno 20% della collezione con score community basso, min 5 titoli assoluti
  const nicheUser = nicheScore >= 0.20 && nicheSignals >= 5

  // V3: Creator scores (dichiarato prima del loop per consentire aggiornamenti inline)
  const creatorScores = computeCreatorScores(entries, preferences)

  for (const entry of entries) {
    const title: string = entry.title || ''
    const type: string = entry.type || 'game'
    const rating: number = entry.rating || 0
    const hoursOrEp: number = entry.current_episode || 0
    let genres: string[] = entry.genres || []
    const tags: string[] = entry.tags || []
    const keywords: string[] = entry.keywords || []
    const themes: string[] = entry.themes || []

    if (genres.length === 0 && (entry.is_steam || type === 'game')) {
      genres = inferGenresFromName(title)
    }
    if (genres.length === 0) continue

    // Per i giochi: espandi i generi IGDB con i loro equivalenti cross-media
    // così il profilo viene arricchito con "Fantasy" quando il gioco ha "Role-playing (RPG)"
    if (type === 'game' || entry.is_steam) {
      const crossExpanded = new Set<string>(genres)
      for (const g of genres) {
        const mapped = IGDB_TO_CROSS_GENRE[g]
        if (mapped) for (const cg of mapped) crossExpanded.add(cg)
      }
      genres = [...crossExpanded]
    }

    // Per i boardgame: espandi categorie BGG → generi cross-media
    if (type === 'boardgame') {
      const crossExpanded = new Set<string>(genres)
      for (const g of genres) {
        const mapped = BGG_TO_CROSS_GENRE[g]
        if (mapped) for (const cg of mapped) crossExpanded.add(cg)
      }
      // Espandi anche le meccaniche (in tags) → generi cross-media
      for (const mech of tags) {
        const mapped = BGG_MECHANIC_TO_GENRE[mech]
        if (mapped) for (const cg of mapped) crossExpanded.add(cg)
      }
      genres = [...crossExpanded]
    }

    // Per anime/manga: espandi generi AniList specifici (Isekai, Shounen, ecc.)
    // in generi cross-media standard così alimentano correttamente il profilo globale
    if (type === 'anime' || type === 'manga') {
      const crossExpanded = new Set<string>(genres)
      for (const g of genres) {
        // Generi AniList non-standard → cross-media via mappa dedicata
        const anilistMapped = ANILIST_TO_BGG_CATEGORY[g]
        if (anilistMapped) {
          // Converti categorie BGG in generi cross-media tramite BGG_TO_CROSS_GENRE
          for (const bggCat of anilistMapped) {
            const crossMapped = BGG_TO_CROSS_GENRE[bggCat]
            if (crossMapped) for (const cg of crossMapped) crossExpanded.add(cg)
          }
        }
      }
      genres = [...crossExpanded]
    }

    if (entry.status === 'dropped') droppedTitles.add(title)

    // Fix 1.2: floor dinamico — titoli molto amati non scompaiono dalla memoria
    const rawTemporal = temporalMultV2(entry.updated_at)
    const rewatchForFloor = entry.rewatch_count || 0
    const temporalFloor = rewatchForFloor >= 1 ? 0.5 : rating >= 4.5 ? 0.30 : rating >= 4.0 ? 0.15 : 0.05
    const temporal = Math.max(rawTemporal, temporalFloor)
    const recency = temporalRecency(entry.updated_at)
    const completion = completionMult(entry)
    const sentiment = sentimentMult(rating)
    const velocity = (type === 'movie' || type === 'tv')
      ? computeClusterVelocity(entries, genres, entry.updated_at)  // Fix 1.4: cluster velocity
      : computeVelocity(entry)     // V3
    const rewatch = rewatchMult(entry)            // V3

    let baseWeight: number
    if (entry.is_steam || type === 'game') {
      baseWeight = hoursOrEp === 0 ? 0.5 : Math.min(Math.log10(hoursOrEp + 1) * 10, 25)
    } else if (type === 'movie') {
      // Film non hanno episodi — il peso si basa su rating e status
      const ratingW = rating >= 1 ? rating * 4 : 3
      const statusBonus = entry.status === 'completed' ? 4 : entry.status === 'dropped' ? 0 : 2
      baseWeight = ratingW + statusBonus
    } else {
      // anime, manga, tv, altri
      const ratingW = rating >= 1 ? rating * 3 : 2
      const engW = Math.min(hoursOrEp / 5, 5)
      baseWeight = ratingW + engW
    }

    // V6: peso finale = base × temporal × completion × sentiment × velocity × rewatch
    // Cap ridotto a ×8 (era ×15) per evitare monocultura del profilo (fix 1.1)
    const rawMultiplier = temporal * completion * sentiment * velocity * rewatch
    const cappedMultiplier = Math.min(rawMultiplier, 8)
    const weight = baseWeight * cappedMultiplier

    const isNegative = isNegativeSignal(entry)

    for (const genre of genres) {
      if (isNegative) {
        addNegative(genre, baseWeight * temporal * 0.8, type)
        if (entry.status === 'dropped') {
          droppedGenreCounts[genre] = (droppedGenreCounts[genre] || 0) + 1
        }
      } else {
        addScore(genre, weight, type, title, recency, rating, velocity)
      }
    }

    // Segnali profondi
    if (!isNegative) {
      const deepWeight = weight * 0.5
      for (const tag of tags) {
        const tl = tag.toLowerCase()
        deepKeywords[tl] = (deepKeywords[tl] || 0) + deepWeight
        const mapped = KEYWORD_TO_DEEP[tl]
        if (mapped) addDeep(mapped, deepWeight)
      }
      // Per boardgame: traccia designer (in authors) come creator scores
      if (type === 'boardgame') {
        for (const designer of (entry.authors || [])) {
          if (designer) {
            creatorScores.authors[designer] = (creatorScores.authors[designer] || 0) + (weight * 0.4)
          }
        }
      }
      for (const kw of keywords) {
        const kl = kw.toLowerCase()
        deepKeywords[kl] = (deepKeywords[kl] || 0) + deepWeight
        const mapped = KEYWORD_TO_DEEP[kl]
        if (mapped) addDeep(mapped, deepWeight)
      }
      for (const theme of themes) {
        const tl = theme.toLowerCase()
        deepThemes[tl] = (deepThemes[tl] || 0) + weight * 0.6
      }

      // Traccia top titles per spiegazioni V3
      if (rating >= 4 || (entry.rewatch_count || 0) >= 1) {
        topTitlesForContext.push({
          title,
          type,
          rating,
          velocity: velocity > 1 ? velocity : undefined,
          rewatchCount: entry.rewatch_count || 0,
        })
      }
    }
  }

  // Applica penalità negative
  for (const [genre, negScore] of Object.entries(negativeGenreScores)) {
    if (globalScores[genre]) {
      globalScores[genre] = Math.max(0, globalScores[genre] - negScore * 0.6)
    }
  }

  // Fix 1.3: hard floor — se i drop superano i positivi del 70%, aggiungi ai soft-disliked
  // (sovrascrive temporaneamente per questa sessione senza toccare le preferenze persistite)
  const sessionSoftDisliked = new Set<string>()
  for (const [genre, dropCount] of Object.entries(droppedGenreCounts)) {
    const posScore = globalScores[genre] || 0
    const negScore = negativeGenreScores[genre] || 0
    if (dropCount >= 3 && negScore > posScore * 0.7) {
      sessionSoftDisliked.add(genre)
    }
  }
  for (const genre of sessionSoftDisliked) {
    if (globalScores[genre]) globalScores[genre] *= 0.3
  }

  // V3: Wishlist come amplificatore
  // V3: Search intent (prima, per passare i generi a wishlist intent score)
  const searchIntentGenres = inferFromSearchHistory(searchHistory, globalScores)
  const searchIntentGenreSet = new Set(searchIntentGenres)

  // Fix 1.5: wishlist amplification con temporal decay e intent score
  const wishlistGenres = amplifyFromWishlist(
    wishlistItems, globalScores, perTypeScores, creatorScores, genreToTitles, searchIntentGenreSet
  )

  // Preferenze esplicite utente
  const hardDisliked = new Set<string>(preferences?.disliked_genres || [])
  const softDisliked = new Set<string>(preferences?.soft_disliked_genres || [])

  if (preferences) {
    const allFavGenres = [
      ...(preferences.fav_game_genres || []),
      ...(preferences.fav_anime_genres || []),
      ...(preferences.fav_movie_genres || []),
      ...(preferences.fav_tv_genres || []),
      ...(preferences.fav_manga_genres || []),
    ]
    for (const genre of allFavGenres) {
      if (globalScores[genre]) globalScores[genre] *= 2.2
      else globalScores[genre] = 18
    }

    for (const genre of hardDisliked) {
      delete globalScores[genre]
      for (const t of Object.keys(perTypeScores)) delete perTypeScores[t][genre]
      delete genreToTitles[genre]
    }

    for (const genre of softDisliked) {
      if (globalScores[genre]) globalScores[genre] *= 0.5
    }
  }

  // Fix 1.1: soft-cap per genere — nessun genere supera il 40% del totale
  // Impedisce la monocultura del profilo (es. Fantasy domina tutto)
  const totalGlobalScore = Object.values(globalScores).reduce((s, v) => s + v, 0)
  if (totalGlobalScore > 0) {
    const maxAllowed = totalGlobalScore * 0.40
    for (const genre of Object.keys(globalScores)) {
      if (globalScores[genre] > maxAllowed) globalScores[genre] = maxAllowed
    }
  }

  const globalGenres = Object.entries(globalScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([genre, score]) => ({ genre, score }))

  const topGenres = {} as TasteProfile['topGenres']
  for (const [type, scores] of Object.entries(perTypeScores)) {
    topGenres[type as MediaType] = Object.entries(scores)
      .filter(([genre]) => !hardDisliked.has(genre))
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([genre, score]) => ({ genre, score }))
  }

  const collectionSize: Record<string, number> = {}
  for (const entry of entries) {
    collectionSize[entry.type] = (collectionSize[entry.type] || 0) + 1
  }

  const topGenreNames = new Set(globalGenres.slice(0, 5).map(g => g.genre))
  const discoveryGenres = globalGenres
    .slice(0, 4)
    .flatMap(g => ADJACENCY_GRAPH[g.genre] || [])
    .filter(g => !topGenreNames.has(g) && !hardDisliked.has(g) && !softDisliked.has(g))
    .filter(g => {
      // Esclude generi dove l'utente ha già segnali forti (anche via cross-expansion)
      // globalScores > 0 significa che il genere è già presente nel profilo
      const profileScore = globalScores[g] || 0
      const maxGlobalScore = globalGenres[0]?.score || 1
      return profileScore / maxGlobalScore < 0.15  // meno del 15% del genere top → genuinamente nuovo
    })
    .slice(0, 3)

  // V3: Binge profile
  const bingeProfile = detectBingeProfile(entries)

  // Top titles sorted by relevance (per spiegazioni V3)
  topTitlesForContext.sort((a, b) => {
    const scoreA = a.rating * (a.rewatchCount > 0 ? 3 : 1) * (a.velocity ? a.velocity : 1)
    const scoreB = b.rating * (b.rewatchCount > 0 ? 3 : 1) * (b.velocity ? b.velocity : 1)
    return scoreB - scoreA
  })

  const totalEntries = entries.length
  const lowConfidence = totalEntries < 15

  // V5
  const runtimePreference = inferRuntimePreference(entries)
  const languagePreference = inferLanguagePreference(entries)
  const qualityThresholds = getQualityThresholds(nicheUser)

  return {
    globalGenres,
    topGenres,
    genreToTitles,
    collectionSize,
    recentWindow: activeWindow,
    deepSignals: { keywords: deepKeywords, themes: deepThemes, tones: deepTones, settings: deepSettings },
    negativeGenres: negativeGenreScores,
    softDisliked,
    droppedTitles,
    discoveryGenres,
    creatorScores,
    bingeProfile,
    wishlistGenres,
    wishlistCreators: { studios: {}, directors: {}, authors: {}, developers: {} },
    searchIntentGenres,
    topTitlesForContext: topTitlesForContext.slice(0, 10),
    lowConfidence,
    nicheUser,
    runtimePreference,
    languagePreference,
    qualityThresholds,
  }
}

// ── V2+V3: Match score ────────────────────────────────────────────────────────
export function computeMatchScore(
  recGenres: string[],
  recTags: string[],
  tasteProfile: TasteProfile,
  recStudios?: string[],
  recDirectors?: string[],
  recType?: string
): number {
  if (recGenres.length === 0) return 30

  const topGenreScores = Object.fromEntries(tasteProfile.globalGenres.map(g => [g.genre, g.score]))
  const maxScore = tasteProfile.globalGenres[0]?.score || 1

  // Espandi i generi della raccomandazione con i loro equivalenti cross-media
  // es. "Role-playing (RPG)" → ["Fantasy", "Adventure", "Drama"]
  // Questo permette il match tra generi IGDB e il profilo utente cross-media
  const expandedGenres = new Set<string>(recGenres)
  for (const g of recGenres) {
    const crossEquiv = IGDB_TO_CROSS_GENRE[g]
    if (crossEquiv) for (const cg of crossEquiv) expandedGenres.add(cg)
  }

  // Genre overlap score (0-55)
  let genreScore = 0
  for (const g of expandedGenres) {
    const s = topGenreScores[g] || 0
    // I generi espansi (cross-equivalenti) pesano meno dei generi diretti
    const isOriginal = recGenres.includes(g)
    genreScore += (s / maxScore) * (isOriginal ? 40 : 26)

    // V3: boost per binge genres
    if (tasteProfile.bingeProfile.bingeGenres.includes(g)) genreScore += 6
    // V3: boost per wishlist genres
    if (tasteProfile.wishlistGenres.includes(g)) genreScore += 5
    // V3: boost per search intent genres
    if (tasteProfile.searchIntentGenres.includes(g)) genreScore += 4
  }
  genreScore = Math.min(72, genreScore)

  // Tag/theme overlap score (0-25)
  const topKeywords = new Set(
    Object.entries(tasteProfile.deepSignals.keywords)
      .sort(([, a], [, b]) => b - a).slice(0, 15).map(([k]) => k)
  )
  const topThemes = new Set(
    Object.entries(tasteProfile.deepSignals.themes)
      .sort(([, a], [, b]) => b - a).slice(0, 10).map(([k]) => k)
  )
  let tagScore = 0
  for (const tag of recTags) {
    const tl = tag.toLowerCase()
    if (topKeywords.has(tl)) tagScore += 4
    if (topThemes.has(tl)) tagScore += 3
    for (const kw of topKeywords) {
      if (tl.includes(kw) || kw.includes(tl)) { tagScore += 1; break }
    }
  }
  tagScore = Math.min(25, tagScore)

  // V3: Creator boost
  let creatorScore = 0
  const topStudios = Object.entries(tasteProfile.creatorScores.studios).sort(([,a],[,b]) => b - a).slice(0, 10)
  const topDirectors = Object.entries(tasteProfile.creatorScores.directors).sort(([,a],[,b]) => b - a).slice(0, 10)
  const topDevs = Object.entries(tasteProfile.creatorScores.developers).sort(([,a],[,b]) => b - a).slice(0, 10)

  for (const studio of (recStudios || [])) {
    if (topStudios.some(([s]) => s === studio)) creatorScore += 10
  }
  for (const director of (recDirectors || [])) {
    if (topDirectors.some(([d]) => d === director)) creatorScore += 8
  }
  // Autori libri: controllati separatamente da directors per non confonderli con registi
  const topAuthors = Object.entries(tasteProfile.creatorScores.authors).sort(([,a],[,b]) => b - a).slice(0, 10)
  for (const director of (recDirectors || [])) {
    if (topAuthors.some(([a]) => a === director)) creatorScore += 10
  }
  creatorScore = Math.min(15, creatorScore)

  // Fix 1.14: developer score separato per giochi — stesso peso degli studio anime (+15 max)
  let developerScore = 0
  if (recType === 'game') {
    for (const dev of (recStudios || [])) {  // per i giochi recStudios contiene il developer
      if (topDevs.some(([d]) => d === dev)) developerScore += 15
    }
    developerScore = Math.min(15, developerScore)
    creatorScore = developerScore  // sostituisce il creatorScore per i giochi
  }

  // Penalità soft dislike
  let penalty = 0
  for (const g of recGenres) {
    if (tasteProfile.softDisliked.has(g)) penalty += 15
  }

  const raw = genreScore + tagScore + creatorScore - penalty
  return Math.max(5, Math.min(100, Math.round(raw)))
}

// ── V3: Explanation Engine — behavioral, creator, social ─────────────────────
export function buildWhyV3(
  recGenres: string[],
  recId: string,
  recTitle: string,
  tasteProfile: TasteProfile,
  matchScore: number,
  isDiscovery: boolean,
  options: {
    recStudios?: string[]
    recDirectors?: string[]
    recDeveloper?: string
    isContinuity?: boolean
    continuityFrom?: string
    trendingBoost?: number
    creatorBoost?: string     // ← AGGIUNTA SOLO QUESTA PROPRIETÀ
  } = {}
): string {
  const { recStudios, recDirectors, recDeveloper, isContinuity, continuityFrom, trendingBoost, creatorBoost } = options

  // V3: Continuity explanation — massima priorità
  if (isContinuity && continuityFrom) {
    return `Hai completato "${continuityFrom}" → continua con questo`
  }

  // V3: Creator-based explanation
  if (recStudios?.length) {
    const topStudios = Object.entries(tasteProfile.creatorScores.studios).sort(([,a],[,b]) => b - a).slice(0, 5)
    for (const studio of recStudios) {
      if (topStudios.some(([s]) => s === studio)) {
        return `Stesso studio di titoli che ami (${studio})`
      }
    }
  }
  if (recDirectors?.length) {
    const topDirs = Object.entries(tasteProfile.creatorScores.directors).sort(([,a],[,b]) => b - a).slice(0, 5)
    for (const dir of recDirectors) {
      if (topDirs.some(([d]) => d === dir)) {
        return `Dal regista/autore di titoli che ami (${dir})`
      }
    }
  }
  if (recDeveloper) {
    const topDevs = Object.entries(tasteProfile.creatorScores.developers).sort(([,a],[,b]) => b - a).slice(0, 5)
    if (topDevs.some(([d]) => d === recDeveloper)) {
      return `Dallo sviluppatore di giochi che hai adorato (${recDeveloper})`
    }
  }

  // V3: Creator boost dal parametro creatorBoost (usato in anime e manga)
  if (creatorBoost) {
    return `Stesso creatore/studio che ami (${creatorBoost})`
  }

  // V3: Discovery explanation
  if (isDiscovery) {
    const sourceGenre = tasteProfile.globalGenres.find(g =>
      (ADJACENCY_GRAPH[g.genre] || []).some(adj => recGenres.includes(adj))
    )
    if (sourceGenre) return `Basandoti su ${sourceGenre.genre} → scopri qualcosa di nuovo`
    return 'Una nuova direzione da esplorare'
  }

  // V3: Search intent explanation
  const searchIntent = recGenres.find(g => tasteProfile.searchIntentGenres.includes(g))
  if (searchIntent) {
    return `Hai cercato contenuti simili di recente`
  }

  // V3: Wishlist explanation
  const wishlistMatch = recGenres.find(g => tasteProfile.wishlistGenres.includes(g))
  if (wishlistMatch) {
    return `In linea con la tua wishlist`
  }

  // V3: Behavioral explanation — velocity e rewatch
  const fastTitle = tasteProfile.topTitlesForContext.find(t =>
    t.velocity && t.velocity >= 2.0 &&
    (tasteProfile.genreToTitles[recGenres[0]] || []).some((gt: any) => gt.title === t.title)
  )
  if (fastTitle) {
    const days = fastTitle.velocity ? Math.round((fastTitle.type === 'anime' ? 12 : 6) / fastTitle.velocity) : null
    if (days) return `Hai finito titoli simili in ${days} giorni — stessa intensità`
  }

  const rewatchTitle = tasteProfile.topTitlesForContext.find(t =>
    t.rewatchCount >= 1 &&
    (tasteProfile.genreToTitles[recGenres[0]] || []).some((gt: any) => gt.title === t.title)
  )
  if (rewatchTitle) {
    return `Nel tuo top assoluto: hai rivisto "${rewatchTitle.title}"`
  }

  // V3: Trending boost explanation
  if (trendingBoost && trendingBoost > 0.5) {
    return `Sta esplodendo nel tuo genere preferito`
  }

  // Fallback: V2 logic
  // Mappa compatibilità tipo raccomandazione → tipi validi di titoli nel profilo da citare
  const COMPATIBLE_TYPES: Record<string, string[]> = {
    'anime':  ['anime', 'manga'],
    'manga':  ['manga', 'anime'],
    'movie':  ['movie', 'tv'],
    'tv':     ['tv', 'movie'],
    'game':   ['game'],
  }
  const validSourceTypes = new Set(COMPATIBLE_TYPES[
    recId.startsWith('tmdb-anime-') || recId.startsWith('anilist-anime') ? 'anime' :
    recId.startsWith('anilist-manga') ? 'manga' : 'unknown'] ||
    COMPATIBLE_TYPES[recGenres.length > 0 ? 'tv' : 'movie'] || // fallback generico
    ['movie', 'tv', 'anime', 'manga', 'game'])

  // Inferisci il tipo della raccomandazione dal contesto (passato come parte di recId o recGenres)
  // Usiamo il tipo dell'entry che ha chiamato buildWhyV3 — non disponibile qui,
  // quindi usiamo una euristica: se recId è numerico = TMDb (movie/tv), se anilist = anime/manga
  let recType = 'unknown'
  if (recId.startsWith('tmdb-anime-') || recId.startsWith('anilist-anime')) recType = 'anime'
  else if (recId.startsWith('anilist-manga')) recType = 'manga'
  else if (!isNaN(Number(recId))) recType = 'tmdb' // movie o tv

  const compatibleTypes = recType === 'anime' ? new Set(['anime', 'manga'])
    : recType === 'manga' ? new Set(['manga', 'anime'])
    : recType === 'tmdb' ? new Set(['movie', 'tv'])
    : new Set(['movie', 'tv', 'anime', 'manga', 'game'])

  const candidates: Array<{ title: string; type: string; score: number; recency: number; rating: number }> = []
  for (const genre of recGenres) {
    const titles = tasteProfile.genreToTitles[genre] || []
    const genreScore = tasteProfile.globalGenres.find(g => g.genre === genre)?.score || 1
    for (const t of titles) {
      if ((t as any).isWishlist) continue
      // Non citare titoli di tipo incompatibile (es. giochi per spiegare serie TV)
      if (!compatibleTypes.has(t.type)) continue
      const existing = candidates.find(c => c.title === t.title)
      if (existing) existing.score += genreScore
      else candidates.push({ ...t, score: genreScore })
    }
  }

  if (candidates.length === 0) {
    const topGenre = tasteProfile.globalGenres.find(g => recGenres.includes(g.genre))
    if (topGenre) return `Basato sui tuoi gusti: ${topGenre.genre}`
    return 'Selezionato per te'
  }

  candidates.sort((a, b) => {
    const scoreA = a.score * (1 + a.recency) * (a.rating > 0 ? a.rating / 5 : 0.8)
    const scoreB = b.score * (1 + b.recency) * (b.rating > 0 ? b.rating / 5 : 0.8)
    return scoreB - scoreA
  })

  const top = candidates.slice(0, 4)
  const idSum = recId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const chosen = top[idSum % top.length]

  const TYPE_LABEL: Record<string, string> = { anime: 'anime', manga: 'manga', movie: 'film', tv: 'serie', game: 'gioco' }
  const label = TYPE_LABEL[chosen.type] || chosen.type

  if (chosen.recency >= 0.85) {
    if (chosen.rating >= 4) return `Stai adorando "${chosen.title}"`
    return `Stai seguendo "${chosen.title}"`
  }
  if (chosen.recency >= 0.5) {
    if (chosen.rating >= 4.5) return `Hai amato "${chosen.title}" → questo è il prossimo`
    return `Hai visto di recente "${chosen.title}"`
  }
  if (chosen.rating >= 4.5) {
    const matchedGenres = recGenres.filter(g => (tasteProfile.genreToTitles[g] || []).some(t => t.title === chosen.title))
    if (matchedGenres.length > 1) return `Stesso ${matchedGenres[0]} + ${matchedGenres[1]} di "${chosen.title}"`
    return `Nel tuo top: hai dato ★★★★★ a "${chosen.title}"`
  }
  if (chosen.rating >= 3.5) return `Perché hai apprezzato "${chosen.title}" (${label})`
  if (matchScore >= 85) return `Alta compatibilità con i tuoi gusti`
  if (matchScore >= 70) return `In linea con quello che ami`
  return `Basato su "${chosen.title}" (${label})`
}

// ── V3: Slot-based diversity ─────────────────────────────────────────────────
