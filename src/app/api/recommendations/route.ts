// DESTINAZIONE: src/app/api/recommendations/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// TASTE ENGINE V2 — Sistema di raccomandazione completamente riscritto
//
// Novità rispetto alla V1:
//   • Sentiment multiplier: rating basso FRENA il genere invece di ignorarlo
//   • Drop/abandon penalty: titoli abbandonati con basso engagement → segnale negativo
//   • Completion rate signal: quanto ha effettivamente guardato/giocato
//   • Temporal decay esponenziale (continua, non a gradini)
//   • Diversity slots: evita monotonia forzando varietà di generi
//   • Discovery layer: generi adiacenti mai esplorati
//   • Match score: punteggio 0-100 di compatibilità per ogni consiglio
//   • Feedback loop: feedback precedenti influenzano il profilo
//   • "Perché" V2: frasi precise e variate
//   • Soft-disliked genres: penalità progressive da feedback
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

// ── Tipi ────────────────────────────────────────────────────────────────────

type MediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game'

interface TasteProfile {
  // Punteggi generi globali (somma pesata di tutti i media)
  globalGenres: Array<{ genre: string; score: number }>
  // Punteggi per tipo specifico
  topGenres: Record<MediaType, Array<{ genre: string; score: number }>>
  // Mappa genere → titoli che lo rappresentano
  genreToTitles: Record<string, Array<{ title: string; type: string; recency: number; rating: number }>>
  // Quanti titoli per tipo
  collectionSize: Record<string, number>
  // Finestra temporale attiva (mesi)
  recentWindow: number
  // Segnali profondi
  deepSignals: {
    keywords: Record<string, number>
    themes: Record<string, number>
    tones: Record<string, number>
    settings: Record<string, number>
  }
  // Generi con segnali negativi (voto basso + drop + feedback)
  negativeGenres: Record<string, number>
  // Generi soft-disliked da feedback UI
  softDisliked: Set<string>
  // Media abbandonati (per non riconsigliarli in generi simili aggressivamente)
  droppedTitles: Set<string>
  // Generi adiacenti da scoprire
  discoveryGenres: string[]
}

interface Recommendation {
  id: string
  title: string
  type: MediaType
  coverImage?: string
  year?: number
  genres: string[]
  score?: number
  description?: string
  why: string
  matchScore: number // 0-100
  isDiscovery?: boolean
}

// ── Mappe generi ─────────────────────────────────────────────────────────────

const TMDB_GENRE_MAP: Record<string, number> = {
  'Action': 28, 'Adventure': 12, 'Animation': 16, 'Comedy': 35, 'Crime': 80,
  'Documentary': 99, 'Drama': 18, 'Family': 10751, 'Fantasy': 14, 'History': 36,
  'Horror': 27, 'Music': 10402, 'Mystery': 9648, 'Romance': 10749,
  'Science Fiction': 878, 'Thriller': 53, 'War': 10752, 'Western': 37,
  'Azione': 28, 'Avventura': 12, 'Animazione': 16, 'Commedia': 35, 'Crimine': 80,
  'Documentario': 99, 'Dramma': 18, 'Fantasia': 14, 'Storia': 36, 'Orrore': 27,
  'Musica': 10402, 'Mistero': 9648, 'Romantico': 10749, 'Fantascienza': 878,
  'Guerra': 10752,
}

const TMDB_TV_GENRE_MAP: Record<string, number> = {
  ...TMDB_GENRE_MAP,
  'Action & Adventure': 10759, 'Kids': 10762, 'Reality': 10764,
  'Sci-Fi & Fantasy': 10765, 'Talk': 10767,
}

const IGDB_TO_CROSS_GENRE: Record<string, string[]> = {
  'Role-playing (RPG)': ['Fantasy', 'Adventure', 'Drama'],
  'Action': ['Action', 'Adventure'],
  'Adventure': ['Adventure', 'Fantasy'],
  'Shooter': ['Action', 'Thriller', 'Science Fiction'],
  "Hack and slash/Beat 'em up": ['Action'],
  'Strategy': ['Strategy'],
  'Simulation': ['Simulation'],
  'Horror': ['Horror', 'Thriller', 'Mystery'],
  'Puzzle': ['Mystery', 'Drama'],
  'Platform': ['Adventure', 'Comedy'],
  'Stealth': ['Thriller', 'Action', 'Crime'],
  'Fighting': ['Action'],
  'Visual Novel': ['Drama', 'Romance', 'Mystery'],
  'Turn-based strategy (TBS)': ['Strategy'],
  'Survival': ['Horror', 'Thriller', 'Adventure'],
  'Battle Royale': ['Action', 'Thriller'],
  'Massively Multiplayer Online (MMO)': ['Fantasy', 'Adventure'],
  'Indie': ['Drama', 'Adventure'],
}

// Grafo adiacenza per il discovery layer
const ADJACENCY_GRAPH: Record<string, string[]> = {
  'Action': ['Thriller', 'Adventure', 'Crime'],
  'Adventure': ['Fantasy', 'Action', 'Science Fiction'],
  'Fantasy': ['Adventure', 'Supernatural', 'Drama', 'Action'],
  'Science Fiction': ['Thriller', 'Mystery', 'Action', 'Drama'],
  'Thriller': ['Mystery', 'Crime', 'Horror', 'Drama'],
  'Horror': ['Mystery', 'Thriller', 'Supernatural'],
  'Drama': ['Romance', 'Mystery', 'Psychological'],
  'Mystery': ['Thriller', 'Crime', 'Psychological', 'Horror'],
  'Romance': ['Drama', 'Comedy', 'Slice of Life'],
  'Comedy': ['Romance', 'Slice of Life', 'Adventure'],
  'Psychological': ['Drama', 'Mystery', 'Thriller', 'Horror'],
  'Supernatural': ['Fantasy', 'Horror', 'Mystery'],
  'Sci-Fi': ['Science Fiction', 'Action', 'Mystery'],
  'Crime': ['Thriller', 'Mystery', 'Drama'],
  'Role-playing (RPG)': ['Fantasy', 'Adventure', 'Action'],
  'Strategy': ['Simulation', 'Puzzle'],
  'Simulation': ['Strategy', 'Adventure'],
  'Sports': ['Action', 'Comedy'],
  'Slice of Life': ['Comedy', 'Romance', 'Drama'],
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

// ── V2: Temporal decay esponenziale (curva continua) ─────────────────────────
function temporalMultV2(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0.25
  const days = (Date.now() - new Date(updatedAt).getTime()) / 86400000
  // λ = 0.012 → dimezza ogni ~58 giorni (2 mesi)
  const decay = Math.exp(-0.012 * days)
  return Math.max(0.2, decay * 3.5)
}

function temporalRecency(updatedAt: string | null | undefined): number {
  return temporalMultV2(updatedAt) / 3.5
}

// ── V2: Sentiment multiplier — il rating è sentiment, non solo peso ────────
function sentimentMult(rating: number): number {
  if (rating >= 4.5) return 2.8
  if (rating >= 4.0) return 2.0
  if (rating >= 3.5) return 1.5
  if (rating >= 3.0) return 1.0  // neutro
  if (rating >= 2.0) return 0.25 // segnale negativo leggero
  if (rating >= 1.0) return 0.0  // segnale negativo forte
  return 1.0 // no rating = neutro
}

// ── V2: Completion rate multiplier ───────────────────────────────────────────
function completionMult(entry: any): number {
  const status = entry.status || 'watching'
  const current = entry.current_episode || 0
  const total = entry.episodes || 0
  const type = entry.type || ''

  // Giochi: usa le ore come proxy
  if (type === 'game' || entry.is_steam) {
    if (status === 'dropped' && current < 2) return 0.05
    if (current >= 100) return 1.6
    if (current >= 20) return 1.3
    if (current >= 5) return 1.0
    if (current >= 1) return 0.8
    return 0.5
  }

  if (status === 'completed') return 1.5
  if (status === 'dropped') {
    if (total > 0 && current / total < 0.2) return 0.05 // abbandonato presto = forte segnale negativo
    return 0.2
  }
  if (status === 'paused') return 0.6

  // watching: calcola completion rate
  if (total > 0 && current > 0) {
    const rate = current / total
    if (rate >= 0.8) return 1.3
    if (rate >= 0.4) return 1.0
    if (rate >= 0.1) return 0.7
    return 0.5
  }

  return 0.8
}

// ── V2: è una entry con segnale negativo forte? ───────────────────────────
function isNegativeSignal(entry: any): boolean {
  const rating = entry.rating || 0
  const status = entry.status || ''
  const current = entry.current_episode || 0
  const total = entry.episodes || 0
  const completionRate = total > 0 ? current / total : 1

  return (
    (status === 'dropped' && completionRate < 0.3) ||
    (rating > 0 && rating <= 2)
  )
}

// ── V2: determina finestra attiva ─────────────────────────────────────────
function determineActiveWindow(entries: any[]): number {
  const now = Date.now()
  const countInDays = (days: number) => entries.filter(e => {
    if (!e.updated_at) return false
    return (now - new Date(e.updated_at).getTime()) / 86400000 <= days
  }).length

  if (countInDays(60) >= 3) return 2
  if (countInDays(120) >= 3) return 4
  if (countInDays(180) >= 3) return 6
  return 12
}

// ── V2: Compute taste profile ─────────────────────────────────────────────
function computeTasteProfile(entries: any[], preferences: any): TasteProfile {
  const globalScores: Record<string, number> = {}
  const negativeGenreScores: Record<string, number> = {}
  const perTypeScores: Record<string, Record<string, number>> = {
    anime: {}, manga: {}, movie: {}, tv: {}, game: {},
  }
  const genreToTitles: Record<string, Array<{ title: string; type: string; recency: number; rating: number }>> = {}

  const deepKeywords: Record<string, number> = {}
  const deepThemes: Record<string, number> = {}
  const deepTones: Record<string, number> = {}
  const deepSettings: Record<string, number> = {}

  const droppedTitles = new Set<string>()
  const activeWindow = determineActiveWindow(entries)

  const addScore = (genre: string, weight: number, type: string, title: string, recency: number, rating: number) => {
    globalScores[genre] = (globalScores[genre] || 0) + weight
    if (perTypeScores[type]) {
      perTypeScores[type][genre] = (perTypeScores[type][genre] || 0) + weight
    }
    if (!genreToTitles[genre]) genreToTitles[genre] = []
    const existing = genreToTitles[genre].find(t => t.title === title)
    if (existing) {
      if (recency > existing.recency) existing.recency = recency
    } else {
      genreToTitles[genre].push({ title, type, recency, rating })
    }
  }

  const addNegative = (genre: string, weight: number, type: string) => {
    negativeGenreScores[genre] = (negativeGenreScores[genre] || 0) + weight
    if (perTypeScores[type]) {
      perTypeScores[type][genre] = Math.max(0, (perTypeScores[type][genre] || 0) - weight * 0.3)
    }
  }

  const addDeep = (signals: { themes?: string[]; tones?: string[]; settings?: string[] }, weight: number) => {
    for (const kw of signals.themes || []) deepThemes[kw] = (deepThemes[kw] || 0) + weight
    for (const kw of signals.tones || []) deepTones[kw] = (deepTones[kw] || 0) + weight
    for (const kw of signals.settings || []) deepSettings[kw] = (deepSettings[kw] || 0) + weight
  }

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

    if (entry.status === 'dropped') droppedTitles.add(title)

    const temporal = temporalMultV2(entry.updated_at)
    const recency = temporalRecency(entry.updated_at)
    const completion = completionMult(entry)
    const sentiment = sentimentMult(rating)

    // Peso base
    let baseWeight: number
    if (entry.is_steam || type === 'game') {
      baseWeight = hoursOrEp === 0 ? 0.5 : Math.min(Math.log10(hoursOrEp + 1) * 10, 25)
    } else {
      const ratingW = rating >= 1 ? rating * 3 : 2
      const engW = Math.min(hoursOrEp / 5, 5)
      baseWeight = ratingW + engW
    }

    // Peso finale V2: base × temporal × completion × sentiment
    const weight = baseWeight * temporal * completion * sentiment

    const isNegative = isNegativeSignal(entry)

    for (const genre of genres) {
      if (isNegative) {
        addNegative(genre, baseWeight * temporal * 0.8, type)
      } else {
        addScore(genre, weight, type, title, recency, rating)
      }
    }

    // Cross-media per giochi
    if (type === 'game' && !isNegative) {
      for (const genre of genres) {
        const crossGenres = IGDB_TO_CROSS_GENRE[genre] || []
        for (const cg of crossGenres) {
          if (!genres.includes(cg)) addScore(cg, weight * 0.35, type, title, recency, rating)
        }
      }
    }

    // Segnali profondi (solo per entry positive)
    if (!isNegative) {
      const deepWeight = weight * 0.5
      for (const tag of tags) {
        const tl = tag.toLowerCase()
        deepKeywords[tl] = (deepKeywords[tl] || 0) + deepWeight
        const mapped = KEYWORD_TO_DEEP[tl]
        if (mapped) addDeep(mapped, deepWeight)
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
    }
  }

  // Applica penalità negative: abbassa i generi che non piacciono
  for (const [genre, negScore] of Object.entries(negativeGenreScores)) {
    if (globalScores[genre]) {
      globalScores[genre] = Math.max(0, globalScores[genre] - negScore * 0.6)
    }
  }

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

    // Hard dislike: rimuovi completamente
    for (const genre of hardDisliked) {
      delete globalScores[genre]
      for (const t of Object.keys(perTypeScores)) delete perTypeScores[t][genre]
      delete genreToTitles[genre]
    }

    // Soft dislike: penalità -50%
    for (const genre of softDisliked) {
      if (globalScores[genre]) globalScores[genre] *= 0.5
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

  // Discovery genres: adiacenti ai top generi che l'utente NON ha già esplorato
  const topGenreNames = new Set(globalGenres.slice(0, 5).map(g => g.genre))
  const collectedGenres = new Set<string>()
  for (const entry of entries) {
    for (const g of (entry.genres || [])) collectedGenres.add(g)
  }

  const discoveryGenres = globalGenres
    .slice(0, 4)
    .flatMap(g => ADJACENCY_GRAPH[g.genre] || [])
    .filter(g => !topGenreNames.has(g) && !hardDisliked.has(g) && !softDisliked.has(g))
    .filter(g => {
      // Considera "non esplorato" se ha meno di 2 titoli in collezione
      const count = entries.filter(e => (e.genres || []).includes(g)).length
      return count < 2
    })
    .slice(0, 3)

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
  }
}

// ── V2: Match score ────────────────────────────────────────────────────────
function computeMatchScore(
  recGenres: string[],
  recTags: string[],
  tasteProfile: TasteProfile
): number {
  if (recGenres.length === 0) return 30

  const topGenreNames = tasteProfile.globalGenres.slice(0, 8).map(g => g.genre)
  const topGenreScores = Object.fromEntries(tasteProfile.globalGenres.map(g => [g.genre, g.score]))
  const maxScore = tasteProfile.globalGenres[0]?.score || 1

  // Genre overlap score (0-60)
  let genreScore = 0
  for (const g of recGenres) {
    const s = topGenreScores[g] || 0
    genreScore += (s / maxScore) * 30
  }
  genreScore = Math.min(60, genreScore)

  // Tag/theme overlap score (0-25)
  const topKeywords = new Set(
    Object.entries(tasteProfile.deepSignals.keywords)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([k]) => k)
  )
  const topThemes = new Set(
    Object.entries(tasteProfile.deepSignals.themes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([k]) => k)
  )
  let tagScore = 0
  for (const tag of recTags) {
    const tl = tag.toLowerCase()
    if (topKeywords.has(tl)) tagScore += 4
    if (topThemes.has(tl)) tagScore += 3
    // partial match
    for (const kw of topKeywords) {
      if (tl.includes(kw) || kw.includes(tl)) { tagScore += 1; break }
    }
  }
  tagScore = Math.min(25, tagScore)

  // Penalità se il genere è nei negativi
  let penalty = 0
  for (const g of recGenres) {
    if (tasteProfile.softDisliked.has(g)) penalty += 15
  }

  const raw = genreScore + tagScore - penalty
  return Math.max(5, Math.min(100, Math.round(raw)))
}

// ── V2: buildWhy — frasi precise e variate ────────────────────────────────
function buildWhyV2(
  recGenres: string[],
  recId: string,
  recTitle: string,
  tasteProfile: TasteProfile,
  matchScore: number,
  isDiscovery: boolean
): string {
  if (isDiscovery) {
    const sourceGenre = tasteProfile.globalGenres.find(g =>
      (ADJACENCY_GRAPH[g.genre] || []).some(adj => recGenres.includes(adj))
    )
    if (sourceGenre) return `Basandoti su ${sourceGenre.genre} → scopri qualcosa di nuovo`
    return 'Una nuova direzione da esplorare'
  }

  // Trova i titoli nella collezione che hanno i generi in comune
  const candidates: Array<{ title: string; type: string; score: number; recency: number; rating: number }> = []

  for (const genre of recGenres) {
    const titles = tasteProfile.genreToTitles[genre] || []
    const genreScore = tasteProfile.globalGenres.find(g => g.genre === genre)?.score || 1
    for (const t of titles) {
      const existing = candidates.find(c => c.title === t.title)
      if (existing) {
        existing.score += genreScore
      } else {
        candidates.push({ ...t, score: genreScore })
      }
    }
  }

  if (candidates.length === 0) {
    const topGenre = tasteProfile.globalGenres.find(g => recGenres.includes(g.genre))
    if (topGenre) return `Basato sui tuoi gusti: ${topGenre.genre}`
    return 'Selezionato per te'
  }

  // Ordina: score × (1 + recency) × (rating/5)
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

  // Frasi variate in base a recency e rating
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

  // Match score alto → enfatizza la compatibilità
  if (matchScore >= 85) return `Alta compatibilità con i tuoi gusti`
  if (matchScore >= 70) return `In linea con quello che ami`

  return `Basato su "${chosen.title}" (${label})`
}

// ── V2: Slot-based diversity ─────────────────────────────────────────────
interface GenreSlot {
  genre: string
  quota: number // quante card riservate a questo genere
  isDiscovery: boolean
}

function buildDiversitySlots(type: MediaType, tasteProfile: TasteProfile, totalSlots = 15): GenreSlot[] {
  const typeGenres = tasteProfile.topGenres[type]?.map(g => g.genre) || []
  const isGameType = type === 'game'

  // Filtra generi non validi per le API
  const IGDB_ONLY = new Set(['Role-playing (RPG)', "Hack and slash/Beat 'em up", 'Turn-based strategy (TBS)', 'Real Time Strategy (RTS)', 'Massively Multiplayer Online (MMO)', 'Battle Royale', 'Tactical', 'Visual Novel', 'Card & Board Game', 'Arcade', 'Platform'])
  const valid = isGameType
    ? typeGenres
    : typeGenres.filter(g => !IGDB_ONLY.has(g))

  if (valid.length === 0) return []

  const slots: GenreSlot[] = []
  const discoveryGenres = tasteProfile.discoveryGenres
    .filter(g => !valid.includes(g))
    .filter(g => {
      if (!isGameType) return !IGDB_ONLY.has(g)
      return true
    })
    .slice(0, 1) // max 1 genere discovery per tipo

  // Distribuzione: 40% / 30% / 20% / 10% discovery
  const distributions = [0.40, 0.30, 0.20, 0.10]

  for (let i = 0; i < Math.min(valid.length, 3); i++) {
    const quota = Math.max(1, Math.round(totalSlots * distributions[i]))
    slots.push({ genre: valid[i], quota, isDiscovery: false })
  }

  // Slot discovery
  if (discoveryGenres.length > 0) {
    const discoveryQuota = Math.max(1, Math.round(totalSlots * 0.10))
    slots.push({ genre: discoveryGenres[0], quota: discoveryQuota, isDiscovery: true })
  }

  return slots
}

// ── Fetcher: Anime (AniList) ──────────────────────────────────────────────
const ANILIST_VALID_GENRES = new Set([
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mecha', 'Music', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi',
  'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
])

async function fetchAnimeRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile
): Promise<Recommendation[]> {
  const results: Recommendation[] = []
  const seen = new Set<string>()

  const topThemes = Object.entries(tasteProfile.deepSignals.themes)
    .sort(([, a], [, b]) => b - a).slice(0, 6).map(([t]) => t)
  const topKeywords = Object.entries(tasteProfile.deepSignals.keywords)
    .sort(([, a], [, b]) => b - a).slice(0, 8).map(([k]) => k)

  for (const slot of slots) {
    const genre = ANILIST_VALID_GENRES.has(slot.genre) ? slot.genre : null
    if (!genre) continue

    const query = `
      query($genres: [String]) {
        Page(page: 1, perPage: 40) {
          media(genre_in: $genres, type: ANIME, sort: [SCORE_DESC, POPULARITY_DESC], isAdult: false) {
            id title { romaji english } coverImage { large }
            seasonYear episodes genres description(asHtml: false) averageScore
            tags { name rank }
          }
        }
      }
    `
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { genres: [genre] } }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const json = await res.json()
      const media = json.data?.Page?.media || []

      const candidates = media
        .filter((m: any) => {
          const id = `anilist-anime-${m.id}`
          return !ownedIds.has(id) && !ownedIds.has(m.id.toString()) && m.coverImage?.large && !seen.has(id)
        })
        .map((m: any) => {
          const mTags: string[] = (m.tags || []).map((t: any) => t.name.toLowerCase())
          let boost = 0
          for (const theme of topThemes) { if (mTags.some(t => t.includes(theme))) boost += 3 }
          for (const kw of topKeywords) { if (mTags.some(t => t.includes(kw))) boost += 2 }
          const recGenres: string[] = m.genres || []
          const matchScore = computeMatchScore(recGenres, mTags, tasteProfile)
          return { m, boost, matchScore, recGenres, mTags }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota + 2)

      for (const { m, matchScore, recGenres, mTags } of candidates.slice(0, slot.quota)) {
        const recId = `anilist-anime-${m.id}`
        if (seen.has(recId)) continue
        seen.add(recId)
        results.push({
          id: recId,
          title: m.title.romaji || m.title.english || 'Senza titolo',
          type: 'anime',
          coverImage: m.coverImage?.large,
          year: m.seasonYear,
          genres: recGenres,
          score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
          description: m.description ? m.description.replace(/<[^>]+>/g, '').slice(0, 300) : undefined,
          why: buildWhyV2(recGenres, recId, m.title.romaji || '', tasteProfile, matchScore, slot.isDiscovery),
          matchScore,
          isDiscovery: slot.isDiscovery,
        })
      }
    } catch { /* continua */ }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Manga (AniList) ───────────────────────────────────────────────
const ANILIST_MANGA_GENRES = new Set([
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life',
  'Sports', 'Supernatural', 'Thriller',
])

async function fetchMangaRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile
): Promise<Recommendation[]> {
  const results: Recommendation[] = []
  const seen = new Set<string>()
  const topThemes = Object.entries(tasteProfile.deepSignals.themes)
    .sort(([, a], [, b]) => b - a).slice(0, 5).map(([t]) => t)

  for (const slot of slots) {
    const genre = ANILIST_MANGA_GENRES.has(slot.genre) ? slot.genre : null
    if (!genre) continue

    const query = `
      query($genres: [String]) {
        Page(page: 1, perPage: 35) {
          media(genre_in: $genres, type: MANGA, format_in: [MANGA, ONE_SHOT], sort: [SCORE_DESC, POPULARITY_DESC]) {
            id title { romaji english } coverImage { large }
            seasonYear chapters genres description(asHtml: false) averageScore
            tags { name rank }
          }
        }
      }
    `
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { genres: [genre] } }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const json = await res.json()
      const media = json.data?.Page?.media || []

      const candidates = media
        .filter((m: any) => !ownedIds.has(`anilist-manga-${m.id}`) && m.coverImage?.large && !seen.has(`anilist-manga-${m.id}`))
        .map((m: any) => {
          const mTags: string[] = (m.tags || []).map((t: any) => t.name.toLowerCase())
          let boost = 0
          for (const theme of topThemes) { if (mTags.some(t => t.includes(theme))) boost += 3 }
          const recGenres: string[] = m.genres || []
          const matchScore = computeMatchScore(recGenres, mTags, tasteProfile)
          return { m, boost, matchScore, recGenres, mTags }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota)

      for (const { m, matchScore, recGenres } of candidates) {
        const recId = `anilist-manga-${m.id}`
        if (seen.has(recId)) continue
        seen.add(recId)
        results.push({
          id: recId,
          title: m.title.romaji || m.title.english || 'Senza titolo',
          type: 'manga',
          coverImage: m.coverImage?.large,
          year: m.seasonYear,
          genres: recGenres,
          score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
          description: m.description ? m.description.replace(/<[^>]+>/g, '').slice(0, 300) : undefined,
          why: buildWhyV2(recGenres, recId, m.title.romaji || '', tasteProfile, matchScore, slot.isDiscovery),
          matchScore,
          isDiscovery: slot.isDiscovery,
        })
      }
    } catch { /* continua */ }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Film (TMDb) ──────────────────────────────────────────────────
async function fetchMovieRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile, token: string
): Promise<Recommendation[]> {
  if (!token) return []
  const results: Recommendation[] = []
  const seen = new Set<string>()
  const topKeywords = Object.entries(tasteProfile.deepSignals.keywords)
    .sort(([, a], [, b]) => b - a).slice(0, 10).map(([k]) => k)

  for (const slot of slots) {
    const genreId = TMDB_GENRE_MAP[slot.genre]
    if (!genreId) continue

    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/discover/movie?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=80&language=it-IT&page=1`,
        { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const json = await res.json()
      const candidates = (json.results || [])
        .filter((m: any) => !ownedIds.has(m.id.toString()) && m.poster_path && !seen.has(m.id.toString()))
        .slice(0, 20)

      // Fetch keywords per i top candidati
      const kwMap = new Map<number, string[]>()
      await Promise.allSettled(candidates.slice(0, 10).map(async (m: any) => {
        try {
          const kr = await fetch(`https://api.themoviedb.org/3/movie/${m.id}/keywords`,
            { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(3000) })
          if (!kr.ok) return
          const kj = await kr.json()
          kwMap.set(m.id, (kj.keywords || []).map((k: any) => k.name.toLowerCase()))
        } catch {}
      }))

      const scored = candidates
        .map((m: any) => {
          const kws = kwMap.get(m.id) || []
          let boost = 0
          for (const kw of topKeywords) { if (kws.some(k => k.includes(kw))) boost += 2 }
          const recGenres = [slot.genre]
          const matchScore = computeMatchScore(recGenres, kws, tasteProfile)
          return { m, boost, matchScore, recGenres, kws }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota)

      for (const { m, matchScore, recGenres } of scored) {
        const recId = m.id.toString()
        if (seen.has(recId)) continue
        seen.add(recId)
        results.push({
          id: recId,
          title: m.title || m.original_title || 'Senza titolo',
          type: 'movie',
          coverImage: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
          year: m.release_date ? parseInt(m.release_date.substring(0, 4)) : undefined,
          genres: recGenres,
          score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
          description: m.overview ? m.overview.slice(0, 300) : undefined,
          why: buildWhyV2(recGenres, recId, m.title || '', tasteProfile, matchScore, slot.isDiscovery),
          matchScore,
          isDiscovery: slot.isDiscovery,
        })
      }
    } catch { /* continua */ }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Serie TV (TMDb) ──────────────────────────────────────────────
async function fetchTvRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile, token: string
): Promise<Recommendation[]> {
  if (!token) return []
  const results: Recommendation[] = []
  const seen = new Set<string>()
  const topKeywords = Object.entries(tasteProfile.deepSignals.keywords)
    .sort(([, a], [, b]) => b - a).slice(0, 10).map(([k]) => k)

  for (const slot of slots) {
    const genreId = TMDB_TV_GENRE_MAP[slot.genre]
    if (!genreId) continue

    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/discover/tv?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=40&language=it-IT&page=1`,
        { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const json = await res.json()
      const candidates = (json.results || [])
        .filter((m: any) => !ownedIds.has(m.id.toString()) && m.poster_path && !seen.has(m.id.toString()))
        .slice(0, 20)

      const kwMap = new Map<number, string[]>()
      await Promise.allSettled(candidates.slice(0, 10).map(async (m: any) => {
        try {
          const kr = await fetch(`https://api.themoviedb.org/3/tv/${m.id}/keywords`,
            { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(3000) })
          if (!kr.ok) return
          const kj = await kr.json()
          kwMap.set(m.id, (kj.results || []).map((k: any) => k.name.toLowerCase()))
        } catch {}
      }))

      const scored = candidates
        .map((m: any) => {
          const kws = kwMap.get(m.id) || []
          let boost = 0
          for (const kw of topKeywords) { if (kws.some(k => k.includes(kw))) boost += 2 }
          const recGenres = [slot.genre]
          const matchScore = computeMatchScore(recGenres, kws, tasteProfile)
          return { m, boost, matchScore, recGenres }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota)

      for (const { m, matchScore, recGenres } of scored) {
        const recId = m.id.toString()
        if (seen.has(recId)) continue
        seen.add(recId)
        results.push({
          id: recId,
          title: m.name || m.original_name || 'Senza titolo',
          type: 'tv',
          coverImage: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
          year: m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined,
          genres: recGenres,
          score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
          description: m.overview ? m.overview.slice(0, 300) : undefined,
          why: buildWhyV2(recGenres, recId, m.name || '', tasteProfile, matchScore, slot.isDiscovery),
          matchScore,
          isDiscovery: slot.isDiscovery,
        })
      }
    } catch { /* continua */ }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Giochi (IGDB) ────────────────────────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null

async function getIgdbToken(clientId: string, secret: string): Promise<string | null> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'client_credentials' }),
  })
  const data = await res.json()
  if (!data.access_token) return null
  cachedToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) * 1000 }
  return cachedToken.token
}

async function fetchGameRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile,
  clientId: string, secret: string
): Promise<Recommendation[]> {
  const token = await getIgdbToken(clientId, secret)
  if (!token) return []

  const results: Recommendation[] = []
  const seen = new Set<string>()
  const topTones = Object.entries(tasteProfile.deepSignals.tones)
    .sort(([, a], [, b]) => b - a).slice(0, 4).map(([t]) => t)

  for (const slot of slots) {
    try {
      const body = `
        fields name, cover.url, first_release_date, summary, genres.name, themes.name,
               player_perspectives.name, rating, rating_count, keywords.name;
        where genres.name = ("${slot.genre}") & rating_count > 30 & cover != null;
        sort rating desc;
        limit 30;
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

      const scored = games
        .filter((g: any) => !ownedIds.has(g.id.toString()) && g.cover?.url && !seen.has(g.id.toString()))
        .map((g: any) => {
          const gameThemes: string[] = (g.themes || []).map((t: any) => t.name.toLowerCase())
          const gameKws: string[] = (g.keywords || []).map((k: any) => k.name.toLowerCase())
          const allTags = [...gameThemes, ...gameKws]
          let boost = 0
          for (const tone of topTones) { if (gameThemes.some(t => t.includes(tone))) boost += 2 }
          const recGenres: string[] = g.genres?.map((gen: any) => gen.name) || []
          const matchScore = computeMatchScore(recGenres, allTags, tasteProfile)
          return { g, boost, matchScore, recGenres }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota)

      for (const { g, matchScore, recGenres } of scored) {
        const recId = g.id.toString()
        if (seen.has(recId)) continue
        seen.add(recId)
        results.push({
          id: recId,
          title: g.name,
          type: 'game',
          coverImage: `https:${g.cover.url.replace('t_thumb', 't_cover_big')}`,
          year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined,
          genres: recGenres,
          score: g.rating ? Math.min(Math.round(g.rating) / 20, 5) : undefined,
          description: g.summary ? g.summary.slice(0, 300) : undefined,
          why: buildWhyV2(recGenres, recId, g.name, tasteProfile, matchScore, slot.isDiscovery),
          matchScore,
          isDiscovery: slot.isDiscovery,
        })
      }
    } catch { /* continua */ }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Handler principale ────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const rl = rateLimit(request, { limit: 10, windowMs: 60_000 })
    if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const requestedType = searchParams.get('type') || 'all'
    const forceRefresh = searchParams.get('refresh') === '1'

    // Leggi collezione completa
    const { data: entries } = await supabase
      .from('user_media_entries')
      .select('type, rating, genres, current_episode, episodes, status, is_steam, title, external_id, appid, updated_at, tags, keywords, themes, player_perspectives')
      .eq('user_id', user.id)

    const allEntries = entries || []

    // Cache check
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('recommendations_cache')
        .select('data, expires_at, generated_at, match_scores')
        .eq('user_id', user.id)
        .eq('media_type', requestedType === 'all' ? 'anime' : requestedType)
        .single()

      if (cached && new Date(cached.expires_at) > new Date()) {
        const lastUpdate = allEntries.reduce((latest, e) => {
          const t = new Date(e.updated_at || 0)
          return t > latest ? t : latest
        }, new Date(0))

        if (lastUpdate <= new Date(cached.generated_at)) {
          if (requestedType === 'all') {
            const { data: allCached } = await supabase
              .from('recommendations_cache')
              .select('media_type, data, match_scores')
              .eq('user_id', user.id)

            if (allCached && allCached.length > 0) {
              const recommendations: Record<string, any[]> = {}
              for (const c of allCached) recommendations[c.media_type] = c.data
              return NextResponse.json({ recommendations, cached: true })
            }
          } else {
            return NextResponse.json({ recommendations: { [requestedType]: cached.data }, cached: true })
          }
        }
      }
    }

    // Carica preferenze + feedback
    const [{ data: preferences }, { data: wishlist }] = await Promise.all([
      supabase.from('user_preferences').select('*').eq('user_id', user.id).single(),
      supabase.from('wishlist').select('external_id').eq('user_id', user.id),
    ])

    // Calcola taste profile V2
    const tasteProfile = computeTasteProfile(allEntries, preferences)

    const ownedIds = new Set<string>([
      ...allEntries.map(e => e.external_id).filter(Boolean),
      ...allEntries.map(e => e.appid).filter(Boolean),
      ...(wishlist || []).map(w => w.external_id).filter(Boolean),
    ])

    const tmdbToken = process.env.NEXT_PUBLIC_TMDB_API_KEY || ''
    const igdbClientId = process.env.IGDB_CLIENT_ID || ''
    const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || ''

    const typesToFetch: MediaType[] = requestedType === 'all'
      ? ['anime', 'manga', 'movie', 'tv', 'game']
      : [requestedType as MediaType]

    const results = await Promise.allSettled(
      typesToFetch.map(async type => {
        const slots = buildDiversitySlots(type, tasteProfile, 15)
        if (slots.length === 0) return { type, items: [] }

        switch (type) {
          case 'anime': return { type, items: await fetchAnimeRecs(slots, ownedIds, tasteProfile) }
          case 'manga': return { type, items: await fetchMangaRecs(slots, ownedIds, tasteProfile) }
          case 'movie': return { type, items: await fetchMovieRecs(slots, ownedIds, tasteProfile, tmdbToken) }
          case 'tv':    return { type, items: await fetchTvRecs(slots, ownedIds, tasteProfile, tmdbToken) }
          case 'game':  return { type, items: await fetchGameRecs(slots, ownedIds, tasteProfile, igdbClientId, igdbClientSecret) }
        }
      })
    )

    const recommendations: Record<string, Recommendation[]> = {}
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        recommendations[result.value.type] = result.value.items
      }
    }

    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()

    await Promise.allSettled(
      typesToFetch.map(type =>
        supabase.from('recommendations_cache').upsert({
          user_id: user.id,
          media_type: type,
          data: recommendations[type] || [],
          taste_snapshot: tasteProfile.topGenres,
          generated_at: now,
          expires_at: expiresAt,
        }, { onConflict: 'user_id,media_type' })
      )
    )

    return NextResponse.json({
      recommendations,
      tasteProfile: {
        globalGenres: tasteProfile.globalGenres,
        topGenres: tasteProfile.topGenres,
        collectionSize: tasteProfile.collectionSize,
        recentWindow: tasteProfile.recentWindow,
        deepSignals: {
          topThemes: Object.entries(tasteProfile.deepSignals.themes)
            .sort(([, a], [, b]) => b - a).slice(0, 5).map(([k]) => k),
          topTones: Object.entries(tasteProfile.deepSignals.tones)
            .sort(([, a], [, b]) => b - a).slice(0, 5).map(([k]) => k),
          topSettings: Object.entries(tasteProfile.deepSignals.settings)
            .sort(([, a], [, b]) => b - a).slice(0, 4).map(([k]) => k),
        },
        discoveryGenres: tasteProfile.discoveryGenres,
        negativeGenres: Object.keys(tasteProfile.negativeGenres).slice(0, 5),
      },
      cached: false,
    })

  } catch (error) {
    logger.error('Recommendations', error)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}