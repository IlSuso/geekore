import type { TasteProfile } from './types'
import type { MediaType } from './engine-types'
import { ADJACENCY_GRAPH, ANILIST_TO_BGG_CATEGORY, CROSS_TO_BGG_CATEGORY, CROSS_TO_IGDB_GENRE, IGDB_VALID_GENRES } from './genre-maps'

export interface GenreSlot {
  genre: string
  quota: number
  isDiscovery: boolean
  isSeasonal?: boolean    // V4
  isSerendipity?: boolean // V4
}

export function buildDiversitySlots(type: MediaType, tasteProfile: TasteProfile, totalSlots = 20): GenreSlot[] {

  const typeGenres0 = tasteProfile.topGenres[type]?.map(g => g.genre) || []
  if (typeGenres0.length === 0) {
    const genres = ['Action', 'Adventure', 'Fantasy', 'Drama', 'Romance']
    return genres.map((g, i) => ({ genre: g, quota: Math.ceil(totalSlots / genres.length), isDiscovery: i >= 2 }))
  }

  const typeGenres = tasteProfile.topGenres[type]?.map(g => g.genre) || []
  const fallbackGenres = tasteProfile.globalGenres.map(g => g.genre)
  const sourceGenres = typeGenres.length >= 2 ? typeGenres : fallbackGenres

  // ── Logica specifica per giochi da tavolo (BGG) ──────────────────────────
  // Il gusto dell'utente è cross-media: film, serie, anime, giochi digitali, manga
  // alimentano tutti il profilo globale. I boardgame vengono consigliati partendo
  // da TUTTO il gusto dell'utente — non solo dai boardgame già posseduti.
  //
  // Flusso: globalGenres (da tutti i media) → CROSS_TO_BGG_CATEGORY → slot BGG
  // Se l'utente ha anche boardgame: le sue categorie BGG preferite amplificano il segnale.
  if (type === 'boardgame') {
    const bggCatScore: Record<string, number> = {}

    // ── Segnale 1: gusto globale cross-media (fonte primaria) ──────────────
    // Usa tutti i generi globali pesati — include segnali da film, serie, anime, ecc.
    const globalScoreMap = Object.fromEntries(
      tasteProfile.globalGenres.map(g => [g.genre, g.score])
    )
    // Normalizza rispetto al genere più forte
    const maxGlobalScore = tasteProfile.globalGenres[0]?.score || 1

    for (const { genre: srcGenre, score } of tasteProfile.globalGenres.slice(0, 12)) {
      const normalizedScore = score / maxGlobalScore  // 0-1
      const mapped = CROSS_TO_BGG_CATEGORY[srcGenre]
      if (mapped) {
        for (const bggCat of mapped) {
          bggCatScore[bggCat] = (bggCatScore[bggCat] || 0) + normalizedScore * 10
        }
      } else {
        // Prova prima via ANILIST_TO_BGG_CATEGORY (generi anime-specifici)
        const anilistMapped = ANILIST_TO_BGG_CATEGORY[srcGenre]
        if (anilistMapped) {
          for (const bggCat of anilistMapped) {
            bggCatScore[bggCat] = (bggCatScore[bggCat] || 0) + normalizedScore * 8
          }
        } else {
          // Fallback: inferenza via adiacenza per generi non mappati
          const adjacent = ADJACENCY_GRAPH[srcGenre] || []
          for (const adj of adjacent) {
            const adjMapped = CROSS_TO_BGG_CATEGORY[adj]
            if (adjMapped) {
              for (const bggCat of adjMapped) {
                bggCatScore[bggCat] = (bggCatScore[bggCat] || 0) + normalizedScore * 4
              }
            }
          }
        }
      }
    }

    // ── Segnale 2: generi deep (temi, keywords) → categorie BGG ───────────
    // Esempio: tema "survival" rafforza Horror+Cooperative; "space" rafforza Sci-Fi
    const deepThemeBoosts: Record<string, string[]> = {
      'survival':    ['Horror', 'Cooperative Play', 'Adventure'],
      'space':       ['Science Fiction', 'Space Exploration', 'Strategy'],
      'war':         ['Wargame', 'Strategy'],
      'detective':   ['Deduction', 'Murder/Mystery', 'Social Deduction'],
      'mystery':     ['Deduction', 'Murder/Mystery'],
      'political':   ['Strategy', 'Economic', 'Negotiation'],
      'dungeon':     ['Fantasy', 'Role Playing', 'Adventure'],
      'zombie':      ['Horror', 'Cooperative Play'],
      'medieval':    ['Medieval', 'Fantasy', 'Wargame'],
      'trading':     ['Economic', 'Negotiation'],
      'exploration': ['Adventure', 'Cooperative Play'],
      'social':      ['Social Deduction', 'Party Game', 'Negotiation'],
      'comedy':      ['Party Game', 'Bluffing'],
      'sci-fi':      ['Science Fiction', 'Space Exploration'],
      'fantasy':     ['Fantasy', 'Role Playing', 'Mythology'],
      'crime':       ['Deduction', 'Social Deduction', 'Murder/Mystery'],
      'horror':      ['Horror', 'Cooperative Play'],
      'romance':     ['Party Game', 'Cooperative Play'],
      'psychological': ['Deduction', 'Puzzle', 'Social Deduction'],
    }
    const deepThemes = tasteProfile.deepSignals?.themes || {}
    const maxDeepScore = Math.max(...Object.values(deepThemes), 1)
    for (const [theme, score] of Object.entries(deepThemes)) {
      const themeLower = theme.toLowerCase()
      const boostCats = deepThemeBoosts[themeLower]
      if (boostCats) {
        const norm = score / maxDeepScore
        for (const cat of boostCats) {
          bggCatScore[cat] = (bggCatScore[cat] || 0) + norm * 3
        }
      }
    }

    // ── Segnale 3: boardgame già posseduti amplificano le proprie categorie ─
    // Se l'utente HA boardgame, le loro categorie vengono amplificate (non sostituite)
    if (typeGenres.length >= 2) {
      const boardgameScoreMap = Object.fromEntries(
        tasteProfile.topGenres.boardgame.map(g => [g.genre, g.score])
      )
      const maxBGScore = tasteProfile.topGenres.boardgame[0]?.score || 1
      for (const { genre: bgCat, score } of tasteProfile.topGenres.boardgame) {
        // Le categorie BGG dirette vengono aggiunte come boost (1.5x il segnale cross-media)
        bggCatScore[bgCat] = (bggCatScore[bgCat] || 0) + (score / maxBGScore) * 15
      }
    }

    // ── Segnale 4: wishlist e search intent ────────────────────────────────
    for (const wGenre of (tasteProfile.wishlistGenres || [])) {
      const mapped = CROSS_TO_BGG_CATEGORY[wGenre]
      if (mapped) {
        for (const cat of mapped) {
          bggCatScore[cat] = (bggCatScore[cat] || 0) + 5  // boost fisso wishlist
        }
      }
    }
    for (const sGenre of (tasteProfile.searchIntentGenres || [])) {
      const mapped = CROSS_TO_BGG_CATEGORY[sGenre]
      if (mapped) {
        for (const cat of mapped) {
          bggCatScore[cat] = (bggCatScore[cat] || 0) + 3
        }
      }
    }

    // ── Costruisci slot finali ─────────────────────────────────────────────
    const rankedCats = Object.entries(bggCatScore)
      .sort(([, a], [, b]) => b - a)
      .map(([g]) => g)
      .slice(0, 8)  // fino a 8 categorie per pool più vario

    if (rankedCats.length === 0) {
      // Fallback: profilo completamente vuoto
      return [
        { genre: 'Strategy', quota: 6, isDiscovery: false },
        { genre: 'Adventure', quota: 5, isDiscovery: false },
        { genre: 'Cooperative Play', quota: 4, isDiscovery: false },
        { genre: 'Social Deduction', quota: 3, isDiscovery: true },
        { genre: 'Deduction', quota: 2, isDiscovery: true },
      ]
    }

    // Aggiungi sempre 1-2 slot discovery (categorie adiacenti non già nei top)
    const topCatSet = new Set(rankedCats.slice(0, 5))
    const discoveryCandidates = Object.keys(CROSS_TO_BGG_CATEGORY)
      .flatMap(g => CROSS_TO_BGG_CATEGORY[g])
      .filter(cat => !topCatSet.has(cat))
      .filter(cat => !tasteProfile.softDisliked?.has(cat))
    const discoverySlot = discoveryCandidates[Math.floor(Math.random() * discoveryCandidates.length)]

    const slots: GenreSlot[] = []
    const distributions = [0.25, 0.20, 0.17, 0.13, 0.10, 0.07, 0.05, 0.03]
    for (let i = 0; i < rankedCats.length; i++) {
      const quota = Math.max(2, Math.round(totalSlots * distributions[i]))
      // I primi 5 sono confirmed taste, dal 6° in poi sono discovery
      slots.push({ genre: rankedCats[i], quota, isDiscovery: i >= 5 })
    }
    // Aggiungi discovery slot se non già presente
    if (discoverySlot && !topCatSet.has(discoverySlot)) {
      slots.push({ genre: discoverySlot, quota: 2, isDiscovery: true })
    }
    return slots
  }

  // ── Logica specifica per giochi ──────────────────────────────────────────
  // I generi nel profilo utente sono cross-media (es. Fantasy, Drama, Action).
  // IGDB non li riconosce tutti come generi — vanno tradotti via CROSS_TO_IGDB_GENRE.
  if (type === 'game') {
    // Costruisci lista generi IGDB unici ordinati per rilevanza del genere sorgente
    const igdbGenreScore: Record<string, number> = {}
    const sourceScores = Object.fromEntries(
      (typeGenres.length >= 2 ? tasteProfile.topGenres.game : tasteProfile.globalGenres)
        .map(g => [g.genre, g.score])
    )

    for (const srcGenre of sourceGenres.slice(0, 8)) {
      const mapped = CROSS_TO_IGDB_GENRE[srcGenre] || (IGDB_VALID_GENRES.has(srcGenre) ? [srcGenre] : [])
      const score = sourceScores[srcGenre] || 1
      for (const igdbGenre of mapped) {
        igdbGenreScore[igdbGenre] = (igdbGenreScore[igdbGenre] || 0) + score
      }
    }

    // Ordina per score e prendi i top
    const rankedIgdbGenres = Object.entries(igdbGenreScore)
      .sort(([, a], [, b]) => b - a)
      .map(([g]) => g)

    if (rankedIgdbGenres.length === 0) {
      // Fallback assoluto: i generi IGDB più popolari
      return [
        { genre: 'Action', quota: 5, isDiscovery: false },
        { genre: 'Adventure', quota: 5, isDiscovery: false },
        { genre: 'Role-playing (RPG)', quota: 5, isDiscovery: false },
        { genre: 'Shooter', quota: 3, isDiscovery: false },
        { genre: 'Indie', quota: 2, isDiscovery: true },
      ]
    }

    const slots: GenreSlot[] = []
    const distributions = [0.30, 0.25, 0.20, 0.15, 0.10]
    const numSlots = Math.min(rankedIgdbGenres.length, 5)

    for (let i = 0; i < numSlots; i++) {
      const quota = Math.max(3, Math.round(totalSlots * distributions[i]))
      slots.push({ genre: rankedIgdbGenres[i], quota, isDiscovery: i >= 4 })
    }

    // Slot serendipity: genere IGDB non nel profilo
    const unusedIgdb = [...IGDB_VALID_GENRES].filter(g => !rankedIgdbGenres.includes(g))
    if (unusedIgdb.length > 0) {
      const jolly = unusedIgdb[Math.floor(Math.random() * Math.min(unusedIgdb.length, 8))]
      slots.push({ genre: jolly, quota: 2, isDiscovery: false, isSerendipity: true })
    }

    return slots
  }

  // ── Logica per anime / manga / movie / tv ────────────────────────────────
  const IGDB_ONLY = new Set([
    'Role-playing (RPG)', "Hack and slash/Beat 'em up", 'Turn-based strategy (TBS)',
    'Real Time Strategy (RTS)', 'Massively Multiplayer Online (MMO)', 'Battle Royale',
    'Tactical', 'Visual Novel', 'Card & Board Game', 'Arcade', 'Platform', 'Shooter',
    'Fighting', 'Sport', 'Racing',
  ])
  const valid = sourceGenres.filter(g => !IGDB_ONLY.has(g))

  if (valid.length === 0) return []

  const slots: GenreSlot[] = []
  const discoveryGenres = tasteProfile.discoveryGenres
    .filter(g => !valid.includes(g) && !IGDB_ONLY.has(g))
    .slice(0, 2)  // fino a 2 slot discovery

  // Fix 1.9: distribuzione proporzionale agli score reali invece di quote fisse
  // Se genere #1 e #2 sono quasi pari, le quote lo riflettono (era 28/22% fisso)
  const numMainSlots = Math.min(valid.length, 5)
  const topScores = valid.slice(0, numMainSlots).map(g => {
    const found = (tasteProfile.topGenres[type] || tasteProfile.globalGenres).find(x => x.genre === g)
    return found?.score || 1
  })
  const sumTopScores = topScores.reduce((a, b) => a + b, 0) || 1
  // Riserva 15% degli slot ai discovery — il resto è proporzionale
  const mainSlotsBudget = Math.round(totalSlots * 0.85)
  for (let i = 0; i < numMainSlots; i++) {
    const quota = Math.max(2, Math.round(mainSlotsBudget * (topScores[i] / sumTopScores)))
    slots.push({ genre: valid[i], quota, isDiscovery: false })
  }

  for (const dg of discoveryGenres) {
    slots.push({ genre: dg, quota: 2, isDiscovery: true })
  }

  // Serendipity
  const unusedGenres = fallbackGenres.filter(g => !valid.includes(g) && !discoveryGenres.includes(g) && !IGDB_ONLY.has(g))
  if (unusedGenres.length > 0) {
    const jollyGenre = unusedGenres[Math.floor(Math.random() * Math.min(unusedGenres.length, 5))]
    slots.push({ genre: jollyGenre, quota: 1, isDiscovery: false, isSerendipity: true })
  }

  return slots
}

// ── V3: Continuity Engine — fetch sequel/prequel dalla DB ────────────────────
