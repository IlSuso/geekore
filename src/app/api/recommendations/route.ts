// DESTINAZIONE: src/app/api/recommendations/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// TASTE ENGINE V3 — "TikTok Level"
//
// Novità rispetto al V2:
//   • Wishlist come AMPLIFICATORE del profilo (non solo esclusione)
//   • Session Velocity: quanto velocemente consumi = quanto ami
//   • Rewatch signal: titolo rivisto = peso ×3-5
//   • Creator/Studio tracking: studio/regista come segnale taste
//   • Continuity Engine: sequel/prequel/spinoff come prima card
//   • Sub-genre precision: tag AniList a livello fine
//   • Explanation V3: behavioral, creator-based, social-precision
//   • Binge Pattern Detection: watcher vs binger
//   • Trending × Taste boost
//   • Adaptive Windows per tipo di media
// ═══════════════════════════════════════════════════════════════════════════

import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

// ── Tipi ────────────────────────────────────────────────────────────────────

type MediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game'

interface CreatorScores {
  studios: Record<string, number>
  directors: Record<string, number>
  authors: Record<string, number>
  developers: Record<string, number>
}

interface BingeProfile {
  isBinger: boolean
  avgCompletionDays: number
  bingeGenres: string[]
  slowGenres: string[]
}

interface TasteProfile {
  globalGenres: Array<{ genre: string; score: number }>
  topGenres: Record<MediaType, Array<{ genre: string; score: number }>>
  genreToTitles: Record<string, Array<{ title: string; type: string; recency: number; rating: number; velocity?: number }>>
  collectionSize: Record<string, number>
  recentWindow: number
  deepSignals: {
    keywords: Record<string, number>
    themes: Record<string, number>
    tones: Record<string, number>
    settings: Record<string, number>
  }
  negativeGenres: Record<string, number>
  softDisliked: Set<string>
  droppedTitles: Set<string>
  discoveryGenres: string[]
  // V3 additions
  creatorScores: CreatorScores
  bingeProfile: BingeProfile
  wishlistGenres: string[]       // generi da wishlist (amplificatore)
  wishlistCreators: CreatorScores // creator da wishlist
  searchIntentGenres: string[]   // generi inferiti dalle ricerche recenti
  topTitlesForContext: Array<{ title: string; type: string; rating: number; velocity?: number; rewatchCount: number }>
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
  matchScore: number
  isDiscovery?: boolean
  isContinuity?: boolean   // V3: sequel/prequel/spinoff
  continuityFrom?: string  // V3: titolo originale
  creatorBoost?: string    // V3: studio/regista che ha generato il boost
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

// V3: Relazioni tra sotto-generi (sub-genre precision)
const GENRE_RELATIONSHIPS: Record<string, string[]> = {
  'Action': ['Martial Arts', 'Military', 'Super Power', 'Mecha'],
  'Horror': ['Gore', 'Psychological Horror', 'Supernatural Horror', 'Survival Horror'],
  'Romance': ['Harem', 'Shoujo', 'Josei'],
  'Comedy': ['Parody', 'Slapstick', 'Dark Comedy'],
  'Drama': ['Melodrama', 'Slice of Life', 'Coming of Age'],
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

// ── V3: Session Velocity — quanto velocemente consumi = quanto ami ────────────
function computeVelocity(entry: any): number {
  const startedAt = entry.started_at
  const updatedAt = entry.updated_at
  const episodes = entry.current_episode || 0
  const status = entry.status || ''

  if (!startedAt || episodes === 0) return 1.0

  const days = Math.max(1, (new Date(updatedAt || Date.now()).getTime() - new Date(startedAt).getTime()) / 86400000)
  const velocity = episodes / days

  // Multiplier basato sulla velocity
  if (velocity >= 3.0) return 3.5  // maratona totale
  if (velocity >= 1.5) return 2.5  // binge netto
  if (velocity >= 0.5) return 1.5  // ritmo sostenuto
  if (velocity >= 0.1) return 1.0  // ritmo normale
  return 0.4                        // si stava forzando
}

// ── V3: Rewatch multiplier ─────────────────────────────────────────────────
function rewatchMult(entry: any): number {
  const count = entry.rewatch_count || 0
  if (count >= 2) return 5.0
  if (count === 1) return 3.0
  return 1.0
}

// ── V2: Temporal decay esponenziale ──────────────────────────────────────────
function temporalMultV2(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0.25
  const days = (Date.now() - new Date(updatedAt).getTime()) / 86400000
  const decay = Math.exp(-0.012 * days)
  return Math.max(0.2, decay * 3.5)
}

function temporalRecency(updatedAt: string | null | undefined): number {
  return temporalMultV2(updatedAt) / 3.5
}

// ── V2: Sentiment multiplier ──────────────────────────────────────────────────
function sentimentMult(rating: number): number {
  if (rating >= 4.5) return 2.8
  if (rating >= 4.0) return 2.0
  if (rating >= 3.5) return 1.5
  if (rating >= 3.0) return 1.0
  if (rating >= 2.0) return 0.25
  if (rating >= 1.0) return 0.0
  return 1.0
}

// ── V2: Completion rate multiplier ────────────────────────────────────────────
function completionMult(entry: any): number {
  const status = entry.status || 'watching'
  const current = entry.current_episode || 0
  const total = entry.episodes || 0
  const type = entry.type || ''

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
    if (total > 0 && current / total < 0.2) return 0.05
    return 0.2
  }
  if (status === 'paused') return 0.6

  if (total > 0 && current > 0) {
    const rate = current / total
    if (rate >= 0.8) return 1.3
    if (rate >= 0.4) return 1.0
    if (rate >= 0.1) return 0.7
    return 0.5
  }

  return 0.8
}

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

// ── V3: Determina finestra attiva PER TIPO (adaptive windows) ─────────────
function determineActiveWindowForType(entries: any[], type: MediaType): number {
  const typeEntries = entries.filter(e => e.type === type)
  const now = Date.now()
  const countInDays = (days: number) => typeEntries.filter(e => {
    if (!e.updated_at) return false
    return (now - new Date(e.updated_at).getTime()) / 86400000 <= days
  }).length

  // Window adattiva per tipo: i gamer hanno sessioni più lunghe e sparse
  const minCount = type === 'game' ? 2 : 3
  const windows = type === 'game'
    ? [90, 180, 365, 24 * 30]
    : [60, 120, 180, 365]

  for (const w of windows) {
    if (countInDays(w) >= minCount) return Math.round(w / 30)
  }
  return 12
}

// ── V3: Binge Pattern Detection ───────────────────────────────────────────────
function detectBingeProfile(entries: any[]): BingeProfile {
  const completed = entries.filter(e => e.status === 'completed' && e.started_at && e.updated_at)
  if (completed.length === 0) return { isBinger: false, avgCompletionDays: 30, bingeGenres: [], slowGenres: [] }

  const completionTimes = completed.map(e => {
    const days = Math.max(1, (new Date(e.updated_at).getTime() - new Date(e.started_at).getTime()) / 86400000)
    const genres: string[] = e.genres || []
    return { days, genres }
  })

  const avgDays = completionTimes.reduce((s, c) => s + c.days, 0) / completionTimes.length
  const isBinger = completionTimes.some(c => c.days <= 7) || avgDays < 15

  // Identifica generi binge-watched (< 7 giorni) vs slow (> 30 giorni)
  const bingeGenreCounts: Record<string, number> = {}
  const slowGenreCounts: Record<string, number> = {}

  for (const { days, genres } of completionTimes) {
    for (const g of genres) {
      if (days <= 7) bingeGenreCounts[g] = (bingeGenreCounts[g] || 0) + 1
      else if (days >= 30) slowGenreCounts[g] = (slowGenreCounts[g] || 0) + 1
    }
  }

  const bingeGenres = Object.entries(bingeGenreCounts).sort(([,a],[,b]) => b - a).slice(0, 5).map(([g]) => g)
  const slowGenres = Object.entries(slowGenreCounts).sort(([,a],[,b]) => b - a).slice(0, 5).map(([g]) => g)

  return { isBinger, avgCompletionDays: avgDays, bingeGenres, slowGenres }
}

// ── V3: Creator profile da entries ────────────────────────────────────────────
function computeCreatorScores(entries: any[], preferences?: any): CreatorScores {
  const studios: Record<string, number> = {}
  const directors: Record<string, number> = {}
  const authors: Record<string, number> = {}
  const developers: Record<string, number> = {}

  for (const entry of entries) {
    if (isNegativeSignal(entry)) continue

    const rating = entry.rating || 0
    const temporal = temporalMultV2(entry.updated_at)
    const sentiment = sentimentMult(rating)
    const rewatch = rewatchMult(entry)
    const weight = temporal * sentiment * rewatch

    for (const studio of (entry.studios || [])) {
      studios[studio] = (studios[studio] || 0) + weight
    }
    for (const director of (entry.directors || [])) {
      directors[director] = (directors[director] || 0) + weight
    }
    for (const author of (entry.authors || [])) {
      authors[author] = (authors[author] || 0) + weight
    }
    if (entry.developer) {
      developers[entry.developer] = (developers[entry.developer] || 0) + weight
    }
  }

  return { studios, directors, authors, developers }
}

// ── V3: Wishlist come AMPLIFICATORE del profilo ────────────────────────────
function amplifyFromWishlist(
  wishlistItems: any[],
  globalScores: Record<string, number>,
  perTypeScores: Record<string, Record<string, number>>,
  creatorScores: CreatorScores,
  genreToTitles: Record<string, any[]>
): string[] {
  const wishlistGenres: string[] = []

  for (const item of wishlistItems) {
    const genres: string[] = item.genres || []
    const type = item.media_type || 'unknown'
    // Wishlist vale come un titolo "watching" con rating 4, temporal decay ZERO
    const wishWeight = 12

    for (const genre of genres) {
      globalScores[genre] = (globalScores[genre] || 0) + wishWeight
      if (perTypeScores[type]) {
        perTypeScores[type][genre] = (perTypeScores[type][genre] || 0) + wishWeight * 0.8
      }
      if (!wishlistGenres.includes(genre)) wishlistGenres.push(genre)

      if (!genreToTitles[genre]) genreToTitles[genre] = []
      if (item.title) {
        const existing = genreToTitles[genre].find((t: any) => t.title === item.title)
        if (!existing) {
          genreToTitles[genre].push({ title: item.title, type: type, recency: 1.0, rating: 4, isWishlist: true })
        }
      }
    }

    // Creator dalla wishlist
    for (const studio of (item.studios || [])) {
      creatorScores.studios[studio] = (creatorScores.studios[studio] || 0) + 8
    }
  }

  return wishlistGenres
}

// ── V3: Search Intent → amplificazione gusti ──────────────────────────────
function inferFromSearchHistory(
  searches: any[],
  globalScores: Record<string, number>
): string[] {
  const intentGenres: string[] = []
  const now = Date.now()
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000

  // Raggruppa per query nelle ultime 4 settimane
  const recentSearches = searches.filter(s => {
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
    const ageMs = now - new Date(s.created_at).getTime()
    const recency = Math.max(0.3, 1 - ageMs / (28 * 24 * 60 * 60 * 1000))

    // Boost base: click > no-click
    let boost = s.result_clicked_id ? 6 : 3

    // Query ripetuta senza soddisfazione → boost massimo
    if (queryCount[q] >= 2 && !s.result_clicked_id) boost = 15

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

// ── V3: Compute taste profile COMPLETO ───────────────────────────────────────
function computeTasteProfile(
  entries: any[],
  preferences: any,
  wishlistItems: any[],
  searchHistory: any[]
): TasteProfile {
  const globalScores: Record<string, number> = {}
  const negativeGenreScores: Record<string, number> = {}
  const perTypeScores: Record<string, Record<string, number>> = {
    anime: {}, manga: {}, movie: {}, tv: {}, game: {},
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

  const addDeep = (signals: { themes?: string[]; tones?: string[]; settings?: string[] }, weight: number) => {
    for (const kw of signals.themes || []) deepThemes[kw] = (deepThemes[kw] || 0) + weight
    for (const kw of signals.tones || []) deepTones[kw] = (deepTones[kw] || 0) + weight
    for (const kw of signals.settings || []) deepSettings[kw] = (deepSettings[kw] || 0) + weight
  }

  // Adaptive window per tipo (V3)
  const activeWindowByType: Record<string, number> = {}
  for (const type of ['anime', 'manga', 'movie', 'tv', 'game']) {
    activeWindowByType[type] = determineActiveWindowForType(entries, type as MediaType)
  }
  const activeWindow = Math.round(
    Object.values(activeWindowByType).reduce((s, v) => s + v, 0) / 5
  )

  // Context titoli top per spiegazioni V3 behavioral
  const topTitlesForContext: TasteProfile['topTitlesForContext'] = []

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
    const velocity = computeVelocity(entry)     // V3
    const rewatch = rewatchMult(entry)            // V3

    let baseWeight: number
    if (entry.is_steam || type === 'game') {
      baseWeight = hoursOrEp === 0 ? 0.5 : Math.min(Math.log10(hoursOrEp + 1) * 10, 25)
    } else {
      const ratingW = rating >= 1 ? rating * 3 : 2
      const engW = Math.min(hoursOrEp / 5, 5)
      baseWeight = ratingW + engW
    }

    // V3: peso finale = base × temporal × completion × sentiment × velocity × rewatch
    const weight = baseWeight * temporal * completion * sentiment * velocity * rewatch

    const isNegative = isNegativeSignal(entry)

    for (const genre of genres) {
      if (isNegative) {
        addNegative(genre, baseWeight * temporal * 0.8, type)
      } else {
        addScore(genre, weight, type, title, recency, rating, velocity)
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

    // Segnali profondi
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

  // V3: Creator scores
  const creatorScores = computeCreatorScores(entries, preferences)

  // V3: Wishlist come amplificatore
  const wishlistGenres = amplifyFromWishlist(
    wishlistItems, globalScores, perTypeScores, creatorScores, genreToTitles
  )

  // V3: Search intent
  const searchIntentGenres = inferFromSearchHistory(searchHistory, globalScores)

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
      const count = entries.filter(e => (e.genres || []).includes(g)).length
      return count < 2
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
    wishlistCreators: { studios: {}, directors: {}, authors: {}, developers: {} }, // populated by amplifyFromWishlist
    searchIntentGenres,
    topTitlesForContext: topTitlesForContext.slice(0, 10),
  }
}

// ── V2+V3: Match score ────────────────────────────────────────────────────────
function computeMatchScore(
  recGenres: string[],
  recTags: string[],
  tasteProfile: TasteProfile,
  recStudios?: string[],
  recDirectors?: string[]
): number {
  if (recGenres.length === 0) return 30

  const topGenreScores = Object.fromEntries(tasteProfile.globalGenres.map(g => [g.genre, g.score]))
  const maxScore = tasteProfile.globalGenres[0]?.score || 1

  // Genre overlap score (0-55)
  let genreScore = 0
  for (const g of recGenres) {
    const s = topGenreScores[g] || 0
    genreScore += (s / maxScore) * 27

    // V3: boost per binge genres
    if (tasteProfile.bingeProfile.bingeGenres.includes(g)) genreScore += 5
    // V3: boost per wishlist genres
    if (tasteProfile.wishlistGenres.includes(g)) genreScore += 4
    // V3: boost per search intent genres
    if (tasteProfile.searchIntentGenres.includes(g)) genreScore += 3
  }
  genreScore = Math.min(55, genreScore)

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

  // V3: Creator boost (0-15)
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
  creatorScore = Math.min(15, creatorScore)

  // Penalità soft dislike
  let penalty = 0
  for (const g of recGenres) {
    if (tasteProfile.softDisliked.has(g)) penalty += 15
  }

  const raw = genreScore + tagScore + creatorScore - penalty
  return Math.max(5, Math.min(100, Math.round(raw)))
}

// ── V3: Explanation Engine — behavioral, creator, social ─────────────────────
function buildWhyV3(
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
  const candidates: Array<{ title: string; type: string; score: number; recency: number; rating: number }> = []
  for (const genre of recGenres) {
    const titles = tasteProfile.genreToTitles[genre] || []
    const genreScore = tasteProfile.globalGenres.find(g => g.genre === genre)?.score || 1
    for (const t of titles) {
      if ((t as any).isWishlist) continue // non citare items dalla wishlist nelle spiegazioni
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
interface GenreSlot {
  genre: string
  quota: number
  isDiscovery: boolean
}

function buildDiversitySlots(type: MediaType, tasteProfile: TasteProfile, totalSlots = 15): GenreSlot[] {
  const typeGenres = tasteProfile.topGenres[type]?.map(g => g.genre) || []
  const isGameType = type === 'game'

  const IGDB_ONLY = new Set(['Role-playing (RPG)', "Hack and slash/Beat 'em up", 'Turn-based strategy (TBS)', 'Real Time Strategy (RTS)', 'Massively Multiplayer Online (MMO)', 'Battle Royale', 'Tactical', 'Visual Novel', 'Card & Board Game', 'Arcade', 'Platform'])
  const valid = isGameType ? typeGenres : typeGenres.filter(g => !IGDB_ONLY.has(g))

  if (valid.length === 0) return []

  const slots: GenreSlot[] = []
  const discoveryGenres = tasteProfile.discoveryGenres
    .filter(g => !valid.includes(g))
    .filter(g => !isGameType ? !IGDB_ONLY.has(g) : true)
    .slice(0, 1)

  const distributions = [0.40, 0.30, 0.20, 0.10]

  for (let i = 0; i < Math.min(valid.length, 3); i++) {
    const quota = Math.max(1, Math.round(totalSlots * distributions[i]))
    slots.push({ genre: valid[i], quota, isDiscovery: false })
  }

  if (discoveryGenres.length > 0) {
    const discoveryQuota = Math.max(1, Math.round(totalSlots * 0.10))
    slots.push({ genre: discoveryGenres[0], quota: discoveryQuota, isDiscovery: true })
  }

  return slots
}

// ── V3: Continuity Engine — fetch sequel/prequel dalla DB ────────────────────
async function fetchContinuityRecs(
  entries: any[],
  ownedIds: Set<string>,
  tasteProfile: TasteProfile,
  supabase: any
): Promise<Recommendation[]> {
  const continuityRecs: Recommendation[] = []
  const seen = new Set<string>()

  // Trova entries completate con rating ≥ 3
  const completedEntries = entries.filter(e =>
    (e.status === 'completed' || (e.current_episode && e.episodes && e.current_episode / e.episodes >= 0.8)) &&
    (e.rating || 0) >= 3 &&
    e.external_id
  )

  if (completedEntries.length === 0) return []

  // Cerca sequel/prequel in DB locale
  const fromIds = completedEntries.map(e => e.external_id).slice(0, 20)
  const { data: continuityEdges } = await supabase
    .from('media_continuity')
    .select('*')
    .in('from_id', fromIds)
    .order('priority', { ascending: true })

  // Se non ci sono edge nel DB locale, tenta di fetcharli da AniList
  const anilistCompleted = completedEntries.filter(e => e.external_id?.startsWith('anilist-'))
  const continuityFromAniList = await fetchAniListContinuity(anilistCompleted, ownedIds)

  const allEdges = [...(continuityEdges || []), ...continuityFromAniList]

  for (const edge of allEdges) {
    if (ownedIds.has(edge.to_id) || seen.has(edge.to_id)) continue
    seen.add(edge.to_id)

    const sourceEntry = completedEntries.find(e => e.external_id === edge.from_id)
    if (!sourceEntry) continue

    const recGenres: string[] = sourceEntry.genres || []
    const matchScore = computeMatchScore(recGenres, [], tasteProfile)

    continuityRecs.push({
      id: edge.to_id,
      title: edge.to_title || `Continua: ${sourceEntry.title}`,
      type: (edge.to_type as MediaType) || sourceEntry.type,
      coverImage: edge.to_cover,
      year: edge.to_year,
      genres: recGenres,
      why: buildWhyV3(recGenres, edge.to_id, edge.to_title || '', tasteProfile, matchScore, false, {
        isContinuity: true,
        continuityFrom: sourceEntry.title,
      }),
      matchScore: Math.min(100, matchScore + 20), // priority boost
      isContinuity: true,
      continuityFrom: sourceEntry.title,
    })
  }

  return continuityRecs.slice(0, 3) // max 3 continuity cards
}

// Fetch sequels direttamente da AniList per le entry anilist
async function fetchAniListContinuity(entries: any[], ownedIds: Set<string>): Promise<any[]> {
  const results: any[] = []

  for (const entry of entries.slice(0, 5)) {
    const id = entry.external_id?.replace('anilist-anime-', '').replace('anilist-manga-', '')
    if (!id || isNaN(Number(id))) continue

    const mediaType = entry.external_id?.includes('anime') ? 'ANIME' : 'MANGA'
    const query = `
      query($id: Int) {
        Media(id: $id) {
          relations {
            edges {
              relationType
              node { id type title { romaji } coverImage { large } seasonYear genres averageScore }
            }
          }
        }
      }
    `
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id: Number(id) } }),
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) continue
      const json = await res.json()
      const edges = json.data?.Media?.relations?.edges || []

      for (const edge of edges) {
        const rel = edge.relationType
        if (!['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE'].includes(rel)) continue

        const node = edge.node
        const toId = `anilist-${node.type === 'ANIME' ? 'anime' : 'manga'}-${node.id}`
        if (ownedIds.has(toId)) continue

        const priority = rel === 'SEQUEL' ? 1 : rel === 'PREQUEL' ? 2 : 3
        results.push({
          from_id: entry.external_id,
          to_id: toId,
          to_type: node.type === 'ANIME' ? 'anime' : 'manga',
          to_title: node.title?.romaji || '',
          to_cover: node.coverImage?.large,
          to_year: node.seasonYear,
          edge_type: rel.toLowerCase(),
          priority,
        })
      }
    } catch { /* continua */ }
  }

  return results.sort((a, b) => a.priority - b.priority)
}

// ── Fetcher: Anime V3 (con studio/staff data e trending) ─────────────────────
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

  // V3: top studios per boost
  const topStudiosSet = new Set(
    Object.entries(tasteProfile.creatorScores.studios).sort(([,a],[,b]) => b - a).slice(0, 8).map(([s]) => s)
  )

  for (const slot of slots) {
    const genre = ANILIST_VALID_GENRES.has(slot.genre) ? slot.genre : null
    if (!genre) continue

    // V3: Include studios e staff nella query AniList
    const query = `
      query($genres: [String]) {
        Page(page: 1, perPage: 40) {
          media(genre_in: $genres, type: ANIME, sort: [SCORE_DESC, POPULARITY_DESC], isAdult: false) {
            id title { romaji english } coverImage { large }
            seasonYear episodes genres description(asHtml: false) averageScore trending
            tags { name rank }
            studios(isMain: true) { nodes { name } }
            staff(sort: RELEVANCE) { edges { role node { name { full } } } }
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
          const mStudios: string[] = (m.studios?.nodes || []).map((s: any) => s.name)
          const mDirectors: string[] = (m.staff?.edges || [])
            .filter((e: any) => ['Director', 'Series Director', 'Original Creator'].includes(e.role))
            .map((e: any) => e.node?.name?.full).filter(Boolean)

          let boost = 0
          for (const theme of topThemes) { if (mTags.some(t => t.includes(theme))) boost += 3 }
          for (const kw of topKeywords) { if (mTags.some(t => t.includes(kw))) boost += 2 }

          // V3: Creator boost
          let creatorBoost: string | undefined
          for (const studio of mStudios) {
            if (topStudiosSet.has(studio)) { boost += 8; creatorBoost = studio; break }
          }

          // V3: Trending boost
          const trendingScore = m.trending || 0
          const trendingBoost = Math.min(5, trendingScore / 200)
          boost += trendingBoost

          const recGenres: string[] = m.genres || []
          const matchScore = computeMatchScore(recGenres, mTags, tasteProfile, mStudios, mDirectors)
          return { m, boost, matchScore, recGenres, mTags, mStudios, mDirectors, creatorBoost, trendingBoost }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota + 2)

      for (const { m, matchScore, recGenres, mTags, mStudios, mDirectors, creatorBoost, trendingBoost } of candidates.slice(0, slot.quota)) {
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
          why: buildWhyV3(recGenres, recId, m.title.romaji || '', tasteProfile, matchScore, slot.isDiscovery, {
            recStudios: mStudios, recDirectors: mDirectors, trendingBoost, creatorBoost
          }),
          matchScore,
          isDiscovery: slot.isDiscovery,
          creatorBoost,
        })
      }
    } catch { /* continua */ }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Manga V3 ─────────────────────────────────────────────────────────
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

  const topAuthorsSet = new Set(
    Object.entries(tasteProfile.creatorScores.authors).sort(([,a],[,b]) => b - a).slice(0, 8).map(([a]) => a)
  )

  for (const slot of slots) {
    const genre = ANILIST_MANGA_GENRES.has(slot.genre) ? slot.genre : null
    if (!genre) continue

    const query = `
      query($genres: [String]) {
        Page(page: 1, perPage: 35) {
          media(genre_in: $genres, type: MANGA, format_in: [MANGA, ONE_SHOT], sort: [SCORE_DESC, POPULARITY_DESC]) {
            id title { romaji english } coverImage { large }
            seasonYear chapters genres description(asHtml: false) averageScore trending
            tags { name rank }
            staff(sort: RELEVANCE) { edges { role node { name { full } } } }
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
          const mAuthors: string[] = (m.staff?.edges || [])
            .filter((e: any) => ['Story', 'Story & Art', 'Original Creator'].includes(e.role))
            .map((e: any) => e.node?.name?.full).filter(Boolean)

          let boost = 0
          for (const theme of topThemes) { if (mTags.some(t => t.includes(theme))) boost += 3 }

          let creatorBoost: string | undefined
          for (const author of mAuthors) {
            if (topAuthorsSet.has(author)) { boost += 8; creatorBoost = author; break }
          }

          const trendingBoost = Math.min(4, (m.trending || 0) / 200)
          boost += trendingBoost

          const recGenres: string[] = m.genres || []
          const matchScore = computeMatchScore(recGenres, mTags, tasteProfile, [], mAuthors)
          return { m, boost, matchScore, recGenres, mAuthors, creatorBoost, trendingBoost }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota)

      for (const { m, matchScore, recGenres, mAuthors, creatorBoost, trendingBoost } of candidates) {
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
          why: buildWhyV3(recGenres, recId, m.title.romaji || '', tasteProfile, matchScore, slot.isDiscovery, {
            recStudios: [], recDirectors: mAuthors, trendingBoost, creatorBoost
          }),
          matchScore,
          isDiscovery: slot.isDiscovery,
          creatorBoost,
        })
      }
    } catch { /* continua */ }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Film V3 (TMDb con trending) ─────────────────────────────────────
async function fetchMovieRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile, token: string
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
      const res = await fetch(
        `https://api.themoviedb.org/3/discover/movie?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=80&language=it-IT&page=1`,
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
          const isTrending = trendingIds.has(m.id.toString())
          if (isTrending) boost += 5
          const recGenres = [slot.genre]
          const matchScore = computeMatchScore(recGenres, kws, tasteProfile)
          return { m, boost, matchScore, recGenres, kws, trendingBoost: isTrending ? 0.8 : 0 }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota)

      for (const { m, matchScore, recGenres, trendingBoost } of scored) {
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
          why: buildWhyV3(recGenres, recId, m.title || '', tasteProfile, matchScore, slot.isDiscovery, { trendingBoost }),
          matchScore,
          isDiscovery: slot.isDiscovery,
        })
      }
    } catch { /* continua */ }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Serie TV V3 ──────────────────────────────────────────────────────
async function fetchTvRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile, token: string
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
          const isTrending = trendingIds.has(m.id.toString())
          if (isTrending) boost += 5
          const recGenres = [slot.genre]
          const matchScore = computeMatchScore(recGenres, kws, tasteProfile)
          return { m, boost, matchScore, recGenres, trendingBoost: isTrending ? 0.8 : 0 }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota)

      for (const { m, matchScore, recGenres, trendingBoost } of scored) {
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
          why: buildWhyV3(recGenres, recId, m.name || '', tasteProfile, matchScore, slot.isDiscovery, { trendingBoost }),
          matchScore,
          isDiscovery: slot.isDiscovery,
        })
      }
    } catch { /* continua */ }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Giochi V3 (IGDB con developer tracking) ─────────────────────────
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

  const topDevsSet = new Set(
    Object.entries(tasteProfile.creatorScores.developers).sort(([,a],[,b]) => b - a).slice(0, 5).map(([d]) => d)
  )

  for (const slot of slots) {
    try {
      const body = `
        fields name, cover.url, first_release_date, summary, genres.name, themes.name,
               player_perspectives.name, rating, rating_count, keywords.name,
               involved_companies.company.name, involved_companies.developer;
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

          // V3: developer detection
          const developer = (g.involved_companies || [])
            .filter((ic: any) => ic.developer)
            .map((ic: any) => ic.company?.name)
            .filter(Boolean)[0] as string | undefined

          let boost = 0
          for (const tone of topTones) { if (gameThemes.some(t => t.includes(tone))) boost += 2 }

          let creatorBoost: string | undefined
          if (developer && topDevsSet.has(developer)) { boost += 10; creatorBoost = developer }

          const recGenres: string[] = g.genres?.map((gen: any) => gen.name) || []
          const matchScore = computeMatchScore(recGenres, allTags, tasteProfile, [], [], developer ? [developer] : [])
          return { g, boost, matchScore, recGenres, developer, creatorBoost }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
        .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))
        .slice(0, slot.quota)

      for (const { g, matchScore, recGenres, developer, creatorBoost } of scored) {
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
          why: buildWhyV3(recGenres, recId, g.name, tasteProfile, matchScore, slot.isDiscovery, {
            recDeveloper: developer, creatorBoost
          }),
          matchScore,
          isDiscovery: slot.isDiscovery,
          creatorBoost,
        })
      }
    } catch { /* continua */ }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// Helper per computeMatchScore con developer
function computeMatchScoreWithDev(
  recGenres: string[],
  recTags: string[],
  tasteProfile: TasteProfile,
  recStudios: string[] = [],
  recDirectors: string[] = [],
  recDevelopers: string[] = []
): number {
  const base = computeMatchScore(recGenres, recTags, tasteProfile, recStudios, recDirectors)
  let devBonus = 0
  const topDevs = new Set(
    Object.entries(tasteProfile.creatorScores.developers).sort(([,a],[,b]) => b - a).slice(0, 5).map(([d]) => d)
  )
  for (const dev of recDevelopers) {
    if (topDevs.has(dev)) devBonus += 10
  }
  return Math.min(100, base + devBonus)
}

// ── Handler principale V3 ─────────────────────────────────────────────────────
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

    // Leggi collezione completa (V3: include campi nuovi)
    const { data: entries } = await supabase
      .from('user_media_entries')
      .select('type, rating, genres, current_episode, episodes, status, is_steam, title, external_id, appid, updated_at, tags, keywords, themes, player_perspectives, studios, directors, authors, developer, rewatch_count, started_at')
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

    // V3: Carica preferenze + wishlist COMPLETA (con generi) + search history
    const [
      { data: preferences },
      { data: wishlistRaw },
      { data: searchHistory },
    ] = await Promise.all([
      supabase.from('user_preferences').select('*').eq('user_id', user.id).single(),
      supabase.from('wishlist').select('external_id, genres, media_type, title, studios').eq('user_id', user.id),
      supabase.from('search_history').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(100),
    ])

    const wishlistItems = wishlistRaw || []
    const searches = searchHistory || []

    // V3: Compute taste profile con tutti i segnali
    const tasteProfile = computeTasteProfile(allEntries, preferences, wishlistItems, searches)

    const ownedIds = new Set<string>([
      ...allEntries.map(e => e.external_id).filter(Boolean),
      ...allEntries.map(e => e.appid).filter(Boolean),
      ...(wishlistRaw || []).map(w => w.external_id).filter(Boolean),
    ])

    const tmdbToken = process.env.NEXT_PUBLIC_TMDB_API_KEY || ''
    const igdbClientId = process.env.IGDB_CLIENT_ID || ''
    const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || ''

    const typesToFetch: MediaType[] = requestedType === 'all'
      ? ['anime', 'manga', 'movie', 'tv', 'game']
      : [requestedType as MediaType]

    // V3: Continuity engine in parallelo con le altre fetch
    const continuityRecsPromise = (requestedType === 'all' || requestedType === 'anime' || requestedType === 'manga')
      ? fetchContinuityRecs(allEntries, ownedIds, tasteProfile, supabase)
      : Promise.resolve([])

    const [continuityRecs, ...mainResults] = await Promise.all([
      continuityRecsPromise,
      ...typesToFetch.map(async type => {
        const slots = buildDiversitySlots(type, tasteProfile, 15)
        if (slots.length === 0) return { type, items: [] }

        switch (type) {
          case 'anime': return { type, items: await fetchAnimeRecs(slots, ownedIds, tasteProfile) }
          case 'manga': return { type, items: await fetchMangaRecs(slots, ownedIds, tasteProfile) }
          case 'movie': return { type, items: await fetchMovieRecs(slots, ownedIds, tasteProfile, tmdbToken) }
          case 'tv':    return { type, items: await fetchTvRecs(slots, ownedIds, tasteProfile, tmdbToken) }
          case 'game':  return { type, items: await fetchGameRecs(slots, ownedIds, tasteProfile, igdbClientId, igdbClientSecret) }
          default: return { type, items: [] }
        }
      })
    ])

    const recommendations: Record<string, Recommendation[]> = {}

    for (const result of mainResults) {
      if (result && 'type' in result && result.type) {
        recommendations[result.type] = result.items
      }
    }

    // V3: Inietta i continuity recs come prime card nel tipo appropriato
    for (const contRec of continuityRecs) {
      const targetType = contRec.type
      if (!recommendations[targetType]) recommendations[targetType] = []
      // Rimuovi eventuali duplicati e inserisci in testa
      recommendations[targetType] = [
        contRec,
        ...recommendations[targetType].filter(r => r.id !== contRec.id),
      ]
    }

    // V3: Salva creator profile aggiornato
    const topStudios = Object.entries(tasteProfile.creatorScores.studios).sort(([,a],[,b]) => b - a).slice(0, 30)
    const topDirectors = Object.entries(tasteProfile.creatorScores.directors).sort(([,a],[,b]) => b - a).slice(0, 30)
    await supabase.from('user_creator_profile').upsert({
      user_id: user.id,
      studios: Object.fromEntries(topStudios),
      directors: Object.fromEntries(topDirectors),
      authors: Object.fromEntries(Object.entries(tasteProfile.creatorScores.authors).sort(([,a],[,b]) => b - a).slice(0, 20)),
      developers: Object.fromEntries(Object.entries(tasteProfile.creatorScores.developers).sort(([,a],[,b]) => b - a).slice(0, 20)),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    // Cache
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
        // V3 additions
        creatorScores: {
          topStudios: topStudios.slice(0, 5).map(([name, score]) => ({ name, score })),
          topDirectors: topDirectors.slice(0, 5).map(([name, score]) => ({ name, score })),
        },
        bingeProfile: tasteProfile.bingeProfile,
        wishlistGenres: tasteProfile.wishlistGenres,
        searchIntentGenres: tasteProfile.searchIntentGenres,
      },
      cached: false,
    })

  } catch (error) {
    logger.error('Recommendations V3', error)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}