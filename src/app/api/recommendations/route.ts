// DESTINAZIONE: src/app/api/recommendations/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// TASTE ENGINE V5 — "Full Signal Stack"
//
// Novità V5 rispetto al V4:
//   • Anti-ripetizione cross-sessione: tabella recommendations_shown, esclusione
//     titoli visti nelle ultime 2 settimane senza azione
//   • Seasonal Awareness APPLICATA: slot anime stagione corrente nel fetcher
//   • Award Boost APPLICATO: +8 matchScore nei fetcher (prima solo definito)
//   • Quality Gate APPLICATO: filtro vote_average/averageScore nei fetcher
//   • Release Freshness APPLICATA: moltiplicatore nei fetcher
//   • Sub-Genre filtro attivo: topThemes escludono titoli incompatibili
//   • Completion Rate AniList: completionPercentage come segnale qualità
//   • Runtime Preference: soft penalty ±20% per durate fuori range
//   • Lingua/Origine: boost/penalità per original_language su TMDb
//   • Social Proof boost: amici con similarity >70% → +15 matchScore
//   • Format Diversity: max 2 consecutivi dello stesso sotto-genere per sezione
//   • lowConfidence: passa al client per banner "Profilo in costruzione"
//
// Novità V4:
//   • Quality Gate: score minimo dinamico per TMDb/AniList/IGDB
//   • Release Freshness: moltiplicatore sull'anno di uscita
//   • Serendipity Slot: 1 jolly fuori profilo per sezione
//   • Award Boost: titoli acclamati +8 matchScore
//   • Seasonal Awareness: slot anime stagione corrente
//   • Confidence Score: lowConfidence flag quando profilo < 15 titoli
//   • Anti-ripetizione: esclude titoli già mostrati nelle ultime 2 settimane
//
// Novità V3 originali:
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
import { translateWithCache } from '@/lib/deepl'
import { truncateAtSentence } from '@/lib/utils'
import { memCacheGet, memCacheSet, memCacheInvalidate } from '@/lib/reco/cache'
import type { RecoMediaType, CreatorScores, BingeProfile, TasteProfile, Recommendation, MemCacheEntry } from '@/lib/reco/types'
import {
  getCurrentAnimeSeasonDates, getQualityThresholds, releaseFreshnessMult,
  isAwardWorthy, inferRuntimePreference, runtimePenalty, inferLanguagePreference,
  applyFormatDiversity, temporalMultV2, temporalRecency, sentimentMult,
  completionMult, isNegativeSignal, rewatchMult
} from '@/lib/reco/scoring'
import {
  CROSS_TO_IGDB_GENRE, CROSS_TO_IGDB_THEME, IGDB_VALID_GENRES,
  TMDB_GENRE_MAP, TMDB_TV_GENRE_MAP, IGDB_TO_CROSS_GENRE,
  ADJACENCY_GRAPH,
  CROSS_TO_BGG_CATEGORY,
  BGG_TO_CROSS_GENRE,
  BGG_MECHANIC_TO_GENRE,
  ANILIST_TO_BGG_CATEGORY,
} from '@/lib/reco/genre-maps'


// Alias locale per compatibilità con il codice esistente
type MediaType = RecoMediaType
type RuntimeRange = ReturnType<typeof inferRuntimePreference>

// ── Tipi raw dati utente (sostituiscono any[] nei parametri) ─────────────────
interface UserEntry {
  id?: string
  user_id?: string
  title: string
  type: MediaType
  status?: string
  rating?: number
  genres?: string[]
  tags?: string[]
  cover_image?: string
  year?: number
  episodes?: number
  current_episode?: number
  rewatch_count?: number
  updated_at?: string | null
  created_at?: string
  studio?: string
  director?: string
  author?: string
  authors?: string[]   // array autori — usato da libri (e manga via DB)
  developer?: string
  platform?: string[]
  runtime?: number
  original_language?: string
  external_id?: string
  source?: string
  score?: number
  popularity?: number
  vote_count?: number
  is_steam?: boolean
  notes?: string
  started_at?: string | null
  community_score?: number
  keywords?: string[]
  themes?: string[]
  appid?: number
  title_en?: string
}

interface UserSearch {
  query: string
  created_at?: string
  type?: string
  result_clicked_genres?: string[]
  result_clicked_id?: string
}

// Tipo Supabase client (evita any)
type SupabaseClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>


function determineActiveWindowForType(entries: UserEntry[], type: MediaType): number {
  const typeEntries = entries.filter(e => e.type === type)
  const now = Date.now()
  const countInDays = (days: number) => typeEntries.filter(e => {
    if (!e.updated_at) return false
    return (now - new Date(e.updated_at).getTime()) / 86400000 <= days
  }).length

  // Window adattiva per tipo: i gamer hanno sessioni più lunghe e sparse
  const minCount = (type === 'game') ? 2 : 3
  const windows = (type === 'game')
    ? [90, 180, 365, 24 * 30]
    : [60, 120, 180, 365]

  for (const w of windows) {
    if (countInDays(w) >= minCount) return Math.round(w / 30)
  }
  return 12
}

// ── V3: Binge Pattern Detection ───────────────────────────────────────────────
function detectBingeProfile(entries: UserEntry[]): BingeProfile {
  const completed = entries.filter(e => e.status === 'completed' && e.started_at && e.updated_at)
  if (completed.length === 0) return { isBinger: false, avgCompletionDays: 30, bingeGenres: [], slowGenres: [] }

  const completionTimes = completed.map(e => {
    const days = Math.max(1, (new Date(e.updated_at!).getTime() - new Date(e.started_at!).getTime()) / 86400000)
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
// Fix 3.5: normalizza nomi studio per unificare cross-source (AniList vs TMDb)
// Es. "Production I.G" e "Production I.G." diventano la stessa chiave
function normalizeStudioKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function computeCreatorScores(entries: UserEntry[], preferences?: Record<string, string[]>): CreatorScores {
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

    if (entry.studio) {
      studios[entry.studio] = (studios[entry.studio] || 0) + weight
    }
    if (entry.director) {
      directors[entry.director] = (directors[entry.director] || 0) + weight
    }
    if (entry.author) {
      authors[entry.author] = (authors[entry.author] || 0) + weight
    }
    // I libri salvano gli autori come array — li accumuliamo tutti
    if (entry.authors && Array.isArray(entry.authors)) {
      for (const a of entry.authors) {
        if (a) authors[a] = (authors[a] || 0) + weight
      }
    }
    if (entry.developer) {
      developers[entry.developer] = (developers[entry.developer] || 0) + weight
    }
  }

  return { studios, directors, authors, developers }
}

// ── V3: Wishlist come AMPLIFICATORE del profilo ────────────────────────────
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

function computeClusterVelocity(entries: UserEntry[], targetGenres: string[], currentUpdatedAt: string | null | undefined): number {
  if (!currentUpdatedAt) return 1.0
  const windowMs = 7 * 86400000
  const targetTime = new Date(currentUpdatedAt).getTime()
  const windowStart = targetTime - windowMs

  let sameGenreInWindow = 0
  for (const e of entries) {
    if (!e.updated_at || e.updated_at === currentUpdatedAt) continue
    const t = new Date(e.updated_at).getTime()
    if (t < windowStart || t > targetTime + windowMs) continue
    const eg: string[] = e.genres || []
    if (targetGenres.some(g => eg.includes(g))) sameGenreInWindow++
  }
  return sameGenreInWindow >= 3 ? 1.8 : sameGenreInWindow >= 2 ? 1.3 : 1.0
}

function computeVelocity(entry: UserEntry): number {
  const type = entry.type || ''

  if (type === 'movie') return 1.0

  const startedAt = entry.started_at
  const updatedAt = entry.updated_at
  const episodes = entry.current_episode || 0

  if (!startedAt || episodes === 0) return 1.0

  const days = Math.max(1, (new Date(updatedAt || Date.now()).getTime() - new Date(startedAt).getTime()) / 86400000)
  const velocity = episodes / days

  if (velocity >= 3.0) return 3.5
  if (velocity >= 1.5) return 2.5
  if (velocity >= 0.5) return 1.5
  if (velocity >= 0.1) return 1.0
  return 0.4
}

// ── V3: Compute taste profile COMPLETO ───────────────────────────────────────
function computeTasteProfile(
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
function computeMatchScore(
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
    genreScore += (s / maxScore) * (isOriginal ? 27 : 18)

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
interface GenreSlot {
  genre: string
  quota: number
  isDiscovery: boolean
  isSeasonal?: boolean    // V4
  isSerendipity?: boolean // V4
}

function buildDiversitySlots(type: MediaType, tasteProfile: TasteProfile, totalSlots = 20): GenreSlot[] {

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
async function fetchContinuityRecs(
  entries: UserEntry[],
  ownedIds: Set<string>,
  tasteProfile: TasteProfile,
  supabase: SupabaseClient
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
async function fetchAniListContinuity(entries: UserEntry[], ownedIds: Set<string>): Promise<Recommendation[]> {
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

// ── #8 Platform Awareness — mappa ID TMDb → nome piattaforma ─────────────────
const PLATFORM_NAMES_MAP: Record<number, string> = {
  8:    'Netflix',
  119:  'Prime Video',
  337:  'Disney+',
  283:  'Crunchyroll',
  531:  'Paramount+',
  39:   'NOW TV',
  35:   'Apple TV+',
  2:    'Apple iTunes',
  3:    'Google Play',
  192:  'YouTube',
  1773: 'MUBI',
  188:  'Sky Go',
}

// ── Fetcher: Anime — TMDB discover/tv Japanese animation ─────────────────────
async function fetchAnimeRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile, token: string, isAlreadyOwned: (type: string, id: string, title: string) => boolean,
  shownIds?: Set<string>, socialFavorites?: Map<string, string>
): Promise<Recommendation[]> {
  if (!token) return []
  const results: Recommendation[] = []
  const seen = new Set<string>()

  const topThemes = Object.entries(tasteProfile.deepSignals.themes)
    .sort(([, a], [, b]) => b - a).slice(0, 6).map(([t]) => t)
  const topKeywords = Object.entries(tasteProfile.deepSignals.keywords)
    .sort(([, a], [, b]) => b - a).slice(0, 8).map(([k]) => k)

  // V5: quality thresholds
  const qt = tasteProfile.qualityThresholds

  // V4: seasonal slot — anime della stagione corrente via TMDB discover
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
      for (const m of (sJson.results || []).slice(0, 3)) {
        if (!m.poster_path) continue
        const id = `tmdb-anime-${m.id}`
        const title = m.name || ''
        if (isAlreadyOwned('anime', id, title) || seen.has(id)) continue
        if (shownIds?.has(id)) continue
        seen.add(id)
        const recGenres: string[] = (m.genre_ids || []).map((gid: number) => TMDB_TV_GENRE_NAMES[gid]).filter(Boolean)
        const mTags: string[] = []
        const mStudios: string[] = []
        const year = m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined
        let matchScore = computeMatchScore(recGenres, mTags, tasteProfile, mStudios, [])
        if (isAwardWorthy(m.vote_average, m.popularity, m.vote_count, 'tmdb')) { matchScore = Math.min(100, matchScore + 8) }
        const freshMult = releaseFreshnessMult(year, m.vote_average * 10, m.popularity)
        matchScore = Math.round(matchScore * freshMult)
        const socialFriend = socialFavorites?.get(id)
        if (socialFriend) { const sim = parseInt(socialFriend) || 75; matchScore = Math.min(100, matchScore + Math.round((sim - 70) / 30 * 20)) }
        results.push({
          id, title, type: 'anime',
          coverImage: `https://image.tmdb.org/t/p/w500${m.poster_path}`, year, genres: recGenres, tags: mTags,
          score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
          why: socialFriend ? `Il tuo amico con gusti simili ha adorato questo` : `In corso questa stagione — ${seasonLabel}`,
          matchScore, isSeasonal: true,
          isAwardWinner: isAwardWorthy(m.vote_average, m.popularity, m.vote_count, 'tmdb'),
          socialBoost: socialFriend,
        })
      }
    }
  } catch { /* continua */ }

  const TMDB_BASE_ANIME = 'https://api.themoviedb.org/3'
  const MIN_POOL_ITEMS = 200
  const MAX_PAGES = 15

  for (const slot of slots) {
    if (results.length >= MIN_POOL_ITEMS) break
    const genreId = TMDB_TV_GENRE_MAP[slot.genre]
    const animeGenreIds = [...new Set([16, genreId].filter(Boolean) as number[])]

    try {
      const baseParamsAnime = new URLSearchParams({
        with_original_language: 'ja',
        with_genres: animeGenreIds.join(','),
        sort_by: 'vote_average.desc',
        'vote_average.gte': String(qt.tmdbVoteAvg),
        'vote_count.gte': '100',
        language: 'it-IT',
      })

      let currentPage = 1
      let totalPagesAvailable = 999

      while (results.length < MIN_POOL_ITEMS && currentPage <= Math.min(MAX_PAGES, totalPagesAvailable)) {
        const pageBatch = [currentPage, currentPage + 1, currentPage + 2].filter(p => p <= Math.min(MAX_PAGES, totalPagesAvailable))
        currentPage += pageBatch.length

        const animePageResults = await Promise.all(pageBatch.map(page => {
          const p = new URLSearchParams(baseParamsAnime); p.set('page', String(page))
          return fetch(`${TMDB_BASE_ANIME}/discover/tv?${p}`, {
            headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
          }).then(r => r.ok ? r.json() : { results: [], total_pages: 0 }).catch(() => ({ results: [], total_pages: 0 }))
        }))

        if (animePageResults[0]?.total_pages) {
          totalPagesAvailable = animePageResults[0].total_pages
        }

        const media: any[] = animePageResults.flatMap((json: any) => json.results || [])

        const candidates = media
          .filter((m: any) => {
            if (!m.poster_path) return false
            const id = `tmdb-anime-${m.id}`
            const title = m.name || ''
            if (isAlreadyOwned('anime', id, title) || seen.has(id)) return false
            if (shownIds?.has(id)) return false
            return true
          })
          .map((m: any) => {
            const recGenres: string[] = (m.genre_ids || []).map((gid: number) => TMDB_TV_GENRE_NAMES[gid]).filter(Boolean)
            const mTags: string[] = []
            const mStudios: string[] = []
            const mDirectors: string[] = []

            let boost = 0
            for (const theme of topThemes) { if ((m.name || '').toLowerCase().includes(theme)) boost += 1 }
            for (const kw of topKeywords) { if ((m.overview || '').toLowerCase().includes(kw)) boost += 1 }

            const socialFriend = socialFavorites?.get(`tmdb-anime-${m.id}`)
            if (socialFriend) { const _sim = parseInt(socialFriend) || 75; boost += Math.round((_sim - 70) / 30 * 20) }

            if (isAwardWorthy(m.vote_average, m.popularity, m.vote_count, 'tmdb')) boost += 8

            const year = m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined
            const freshMult = releaseFreshnessMult(year, m.vote_average * 10, m.popularity)

            let matchScore = computeMatchScore(recGenres, mTags, tasteProfile, mStudios, mDirectors)
            matchScore = Math.round(matchScore * freshMult)
            return { m, boost, matchScore, recGenres, mTags, mStudios, mDirectors, socialFriend, year, trendingBoost: 0, creatorBoost: undefined as string | undefined }
          })
          .filter(({ matchScore }: any) => matchScore >= 20)
          .sort((a: any, b: any) => (b.boost + b.matchScore) - (a.boost + a.matchScore))

        for (const { m, matchScore, recGenres, mTags, mStudios, mDirectors, socialFriend, year, trendingBoost, creatorBoost } of candidates) {
          const recId = `tmdb-anime-${m.id}`
          if (seen.has(recId)) continue
          seen.add(recId)
          results.push({
            id: recId,
            title: m.name || 'Senza titolo',
            type: 'anime',
            coverImage: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
            year, genres: recGenres, tags: mTags,
            score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
            description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
            why: socialFriend
              ? `Il tuo amico con gusti simili all'${socialFriend} ha adorato questo`
              : buildWhyV3(recGenres, recId, m.name || '', tasteProfile, matchScore, slot.isDiscovery, {
                  recStudios: mStudios, recDirectors: mDirectors, trendingBoost, creatorBoost,
                }),
            matchScore,
            isDiscovery: slot.isDiscovery,
            isSerendipity: slot.isSerendipity,
            isSeasonal: false,
            isAwardWinner: isAwardWorthy(m.vote_average, m.popularity, m.vote_count, 'tmdb'),
            socialBoost: socialFriend,
            creatorBoost,
          })
          if (results.length >= MIN_POOL_ITEMS) break
        }
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
    const genre = ANILIST_MANGA_GENRES.has(slot.genre) ? slot.genre : null
    if (!genre) continue

    const pagesToFetchManga = slot.quota > 20 ? [1, 2] : [1]
    const mangaQuery = (page: number) => `
      query($genres: [String], $minScore: Int, $minPop: Int) {
        Page(page: ${page}, perPage: 50) {
          media(genre_in: $genres, type: MANGA, format_in: [MANGA, ONE_SHOT],
                sort: [SCORE_DESC, POPULARITY_DESC],
                averageScore_greater: $minScore, popularity_greater: $minPop) {
            id title { romaji english } coverImage { large }
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
          return !!m.coverImage?.large
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
          matchScore = Math.round(matchScore * releaseFreshnessMult(m.seasonYear, m.averageScore, m.popularity))
          return { m, boost, matchScore, recGenres, mTags, mAuthors, creatorBoost, trendingBoost, socialFriend }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
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
          coverImage: m.coverImage?.large,
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

  // ── TOP-UP: continua a fetchare finché il pool raggiunge 200 ─────────────
  const MANGA_POOL_TARGET = 200
  if (results.length < MANGA_POOL_TARGET && slots.length > 0) {
    const qt = tasteProfile.qualityThresholds
    // Prendi i generi disponibili dai slot
    const availableGenres = slots
      .map(s => ANILIST_MANGA_GENRES.has(s.genre) ? s.genre : null)
      .filter(Boolean) as string[]
    let topUpPage = 3
    const MAX_TOPUP_PAGES = 10
    while (results.length < MANGA_POOL_TARGET && topUpPage <= MAX_TOPUP_PAGES) {
      try {
        const genreToUse = availableGenres[topUpPage % availableGenres.length] || availableGenres[0]
        const topUpQuery = `
          query($genres: [String], $minScore: Int, $minPop: Int) {
            Page(page: ${topUpPage}, perPage: 50) {
              media(genre_in: $genres, type: MANGA, format_in: [MANGA, ONE_SHOT],
                    sort: [SCORE_DESC, POPULARITY_DESC],
                    averageScore_greater: $minScore, popularity_greater: $minPop) {
                id title { romaji english } coverImage { large }
                seasonYear chapters genres description(asHtml: false) averageScore popularity trending
                tags { name rank }
                staff(sort: RELEVANCE) { edges { role node { name { full } } } }
              }
            }
          }
        `
        const topUpRes = await fetch('https://graphql.anilist.co', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: topUpQuery, variables: { genres: [genreToUse], minScore: qt.anilistScore, minPop: qt.anilistPopularity } }),
          signal: AbortSignal.timeout(8000),
        }).then(r => r.ok ? r.json() : { data: null }).catch(() => ({ data: null }))
        const media = topUpRes.data?.Page?.media || []
        if (media.length === 0) break
        for (const m of media) {
          const id = `anilist-manga-${m.id}`
          const title = m.title?.romaji || m.title?.english || ''
          if (isAlreadyOwned('manga', id, title) || seen.has(id)) continue
          if (!m.coverImage?.large) continue
          seen.add(id)
          const mTags: string[] = (m.tags || []).map((t: any) => t.name.toLowerCase())
          const mAuthors: string[] = (m.staff?.edges || [])
            .filter((e: any) => ['Story', 'Story & Art', 'Original Creator'].includes(e.role))
            .map((e: any) => e.node?.name?.full).filter(Boolean)
          const recGenres: string[] = m.genres || []
          let matchScore = computeMatchScore(recGenres, mTags, tasteProfile, [], mAuthors)
          matchScore = Math.round(matchScore * releaseFreshnessMult(m.seasonYear, m.averageScore, m.popularity))
          if (matchScore < 20) continue
          if (isAwardWorthy(m.averageScore, m.popularity, undefined, 'anilist')) matchScore = Math.min(100, matchScore + 8)
          results.push({
            id,
            title: m.title.romaji || m.title.english || 'Senza titolo',
            type: 'manga',
            coverImage: m.coverImage?.large,
            year: m.seasonYear,
            genres: recGenres,
            tags: mTags,
            score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
            description: m.description ? truncateAtSentence(m.description.replace(/<[^>]+>/g, ''), 300) : undefined,
            why: buildWhyV3(recGenres, id, m.title.romaji || '', tasteProfile, matchScore, false, { recStudios: [], recDirectors: mAuthors }),
            matchScore,
            authors: mAuthors.length > 0 ? mAuthors : undefined,
            episodes: m.chapters || undefined,
          })
          if (results.length >= MANGA_POOL_TARGET) break
        }
      } catch { /* continua */ }
      topUpPage++
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const mangaDescItems = results
    .filter(r => r.description)
    .map(r => ({ id: r.id, text: r.description! }))
  if (mangaDescItems.length > 0) {
    const t = await translateWithCache(mangaDescItems)
    results.forEach(r => { if (r.description) r.description = t[r.id] || r.description })
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Film V3 (TMDb con trending) ─────────────────────────────────────
// Mappa ID genere TMDb → nome cross-media (usata per popolare recGenres correttamente)
const TMDB_MOVIE_GENRE_NAMES: Record<number, string> = {
  28:'Action', 12:'Adventure', 16:'Animation', 35:'Comedy', 80:'Crime',
  99:'Documentary', 18:'Drama', 10751:'Family', 14:'Fantasy', 36:'History',
  27:'Horror', 10402:'Music', 9648:'Mystery', 10749:'Romance', 878:'Science Fiction',
  10770:'TV Movie', 53:'Thriller', 10752:'War', 37:'Western',
}
const TMDB_TV_GENRE_NAMES: Record<number, string> = {
  10759:'Action', 16:'Animation', 35:'Comedy', 80:'Crime', 99:'Documentary',
  18:'Drama', 10751:'Family', 10762:'Kids', 9648:'Mystery', 10763:'News',
  10764:'Reality', 10765:'Science Fiction', 10766:'Soap', 10767:'Talk',
  10768:'War', 37:'Western',
}

async function fetchMovieRecs(
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
          `https://api.themoviedb.org/3/discover/movie?with_genres=${genreId}&without_genres=16&sort_by=vote_average.desc&vote_count.gte=80&vote_average.gte=${voteAvgMin}&language=it-IT&page=${page}`,
          { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
        ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
      ))
      const candidates = moviePageResults.flatMap((json: any) => json.results || [])
        .filter((m: any) => {
          const title = m.title || m.original_title || ''
          const isAnimeMovie = m.original_language === 'ja' && (m.genre_ids || []).includes(16)
          return !isAlreadyOwned('movie', m.id.toString(), title) && m.poster_path && !seen.has(m.id.toString()) && !isAnimeMovie
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
          matchScore = Math.round(matchScore * releaseFreshnessMult(year))
          return { m, boost, matchScore, recGenres, kws, trendingBoost: isTrending ? 0.8 : 0, platformMatch }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
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
          coverImage: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
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

  // ── TOP-UP Movie: continua a fetchare finché pool raggiunge 200 ───────────
  const MOVIE_POOL_TARGET = 200
  if (results.length < MOVIE_POOL_TARGET && slots.length > 0) {
    const voteAvgMin = tasteProfile.qualityThresholds.tmdbVoteAvg
    const availableGenreIds = slots.map(s => TMDB_GENRE_MAP[s.genre]).filter(Boolean)
    let topUpPage = 4
    const MAX_TOPUP_PAGES = 15
    while (results.length < MOVIE_POOL_TARGET && topUpPage <= MAX_TOPUP_PAGES) {
      try {
        const genreId = availableGenreIds[topUpPage % availableGenreIds.length] || availableGenreIds[0]
        const r = await fetch(
          `https://api.themoviedb.org/3/discover/movie?with_genres=${genreId}&without_genres=16&sort_by=vote_average.desc&vote_count.gte=80&vote_average.gte=${voteAvgMin}&language=it-IT&page=${topUpPage}`,
          { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
        ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
        const candidates = r.results || []
        if (candidates.length === 0) break
        for (const m of candidates) {
          const title = m.title || m.original_title || ''
          if (isAlreadyOwned('movie', m.id.toString(), title) || seen.has(m.id.toString())) continue
          if (!m.poster_path) continue
          const isAnimeMovie = m.original_language === 'ja' && (m.genre_ids || []).includes(16)
          if (isAnimeMovie) continue
          seen.add(m.id.toString())
          const recGenres = m.genre_ids
            ? m.genre_ids.map((id: number) => TMDB_MOVIE_GENRE_NAMES[id]).filter(Boolean)
            : []
          let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [], [], tasteProfile)
          if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
          const year = m.release_date ? parseInt(m.release_date.substring(0, 4)) : undefined
          matchScore = Math.round(matchScore * releaseFreshnessMult(year))
          if (matchScore < 20) continue
          results.push({
            id: m.id.toString(),
            title: m.title || m.original_title || 'Senza titolo',
            type: 'movie',
            coverImage: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
            year,
            genres: recGenres,
            score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
            description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
            why: buildWhyV3(recGenres, m.id.toString(), m.title || '', tasteProfile, matchScore, false, {}),
            matchScore,
            isAwardWinner: isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb'),
          })
          if (results.length >= MOVIE_POOL_TARGET) break
        }
      } catch { /* continua */ }
      topUpPage++
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Fetcher: Serie TV V3 ──────────────────────────────────────────────────────
async function fetchTvRecs(
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
          matchScore = Math.round(matchScore * releaseFreshnessMult(year))
          return { m, boost, matchScore, recGenres, kws, trendingBoost: isTrending ? 0.8 : 0, platformMatch }
        })
        .filter(({ matchScore }: any) => matchScore >= 20)
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
          coverImage: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
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

  // ── TOP-UP TV: continua a fetchare finché pool raggiunge 200 ─────────────
  // Strategia corretta: per ogni genere degli slot, fetcha pagine 4→8 sistematicamente.
  // Non usare modulo su page globale (ricicla generi a caso su pagine vuote).
  // vote_count.gte abbassato a 100 nel top-up (qualità ancora accettabile, più risultati).
  // Soglia matchScore >= 20 mantenuta: il profilo crossmediale è ricco anche con pochi TV.
  const TV_POOL_TARGET = 200
  if (results.length < TV_POOL_TARGET && slots.length > 0) {
    const voteAvgMin = tasteProfile.qualityThresholds.tmdbVoteAvg
    // Generi unici degli slot, in ordine di quota decrescente (i più amati prima)
    const uniqueGenreIds = [...new Set(
      slots
        .sort((a, b) => b.quota - a.quota)
        .map(s => TMDB_TV_GENRE_MAP[s.genre])
        .filter(Boolean)
    )]
    const MAX_TOPUP_PAGE_PER_GENRE = 8  // pagine 4→8 per genere = 5 pagine × N generi
    outer:
    for (const genreId of uniqueGenreIds) {
      if (results.length >= TV_POOL_TARGET) break
      for (let page = 4; page <= MAX_TOPUP_PAGE_PER_GENRE; page++) {
        if (results.length >= TV_POOL_TARGET) break outer
        try {
          const r = await fetch(
            `https://api.themoviedb.org/3/discover/tv?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=100&vote_average.gte=${voteAvgMin}&language=it-IT&page=${page}`,
            { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
          ).then(r => r.ok ? r.json() : { results: [] }).catch(() => ({ results: [] }))
          const candidates = r.results || []
          if (candidates.length === 0) break  // questo genere è esaurito, passa al prossimo
          for (const m of candidates) {
            if (results.length >= TV_POOL_TARGET) break
            const title = m.name || m.original_name || ''
            if (isAlreadyOwned('tv', m.id.toString(), title) || seen.has(m.id.toString())) continue
            if (!m.poster_path) continue
            seen.add(m.id.toString())
            const recGenres = m.genre_ids
              ? m.genre_ids.map((id: number) => TMDB_TV_GENRE_NAMES[id]).filter(Boolean)
              : []
            // computeMatchScore usa globalGenres (tutti i media) → profilo crossmediale ricco
            let matchScore = computeMatchScore(recGenres.length > 0 ? recGenres : [], [], tasteProfile)
            if (isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb')) matchScore = Math.min(100, matchScore + 8)
            const year = m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined
            matchScore = Math.round(matchScore * releaseFreshnessMult(year))
            if (matchScore < 20) continue  // soglia invariata: crossmedia garantisce profilo ricco
            results.push({
              id: m.id.toString(),
              title: m.name || m.original_name || 'Senza titolo',
              type: 'tv',
              coverImage: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
              year,
              genres: recGenres,
              score: m.vote_average ? Math.min(Math.round(m.vote_average * 10) / 20, 5) : undefined,
              description: m.overview ? truncateAtSentence(m.overview, 300) : undefined,
              why: buildWhyV3(recGenres, m.id.toString(), m.name || '', tasteProfile, matchScore, false, {}),
              matchScore,
              isAwardWinner: isAwardWorthy(m.vote_average, undefined, m.vote_count, 'tmdb'),
            })
          }
        } catch { /* continua con pagina successiva */ }
      }
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

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
        seen.add(recId)
        const year = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined
        let finalScore = matchScore
        // V4: award boost
        if (isAwardWorthy(g.rating, undefined, g.rating_count, 'igdb')) finalScore = Math.min(100, finalScore + 8)
        // V4: freshness
        finalScore = Math.round(finalScore * releaseFreshnessMult(year))
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
          platforms: (g.platforms || []).map((p: any) => p.name).filter(Boolean).slice(0, 6) as string[] || undefined,
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
            if (isAwardWorthy(g.rating, undefined, g.rating_count, 'igdb')) matchScore = Math.min(100, matchScore + 8)
            const year = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined
            matchScore = Math.round(matchScore * releaseFreshnessMult(year))
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
              platforms: (g.platforms || []).map((p: any) => p.name).filter(Boolean).slice(0, 6) as string[] || undefined,
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
const BGG_CATEGORY_SEED_IDS: Record<string, string[]> = {
  'Strategy': [
    // Grandi classici e moderni noti
    '161936','120677','167791','174430','169786','233078','266192','342942','311031','293006','295947','316554','28720','30549','37111','68448','9209','476','3076','31260','187645','182028','173346','270844',
    // Eccellenti ma meno mainstream
    '192291',  // Great Western Trail
    '218417',  // Pandemic Legacy S2
    '246784',  // Obsession
    '230802',  // Decrypto
    '291572',  // Oath: Chronicles of Empire and Exile
    '256916',  // Pax Pamir 2nd ed
    '220877',  // Architects of the West Kingdom
    '236457',  // Architects of the West Kingdom
    '281549',  // Barrage
    '262712',  // Lost Ruins of Arnak
    '301997',  // Ark Nova
    '316377',  // Nucleum
    '332686',  // Revive
    '332241',  // Marrakesh
    '357563',  // Lacrimosa
    '285967',  // Viscounts of the West Kingdom
    '258779',  // Wingspan European Expansion (come voce a sé)
    '183394',  // Viticulture Essential Ed.
    '183284',  // Pandemic Legacy S1
    '205896',  // Terraforming Mars – Prelude
    '247763',  // Wingspan
    '199792',  // Forbidden Stars
    '146021',  // Patchwork
    '201921',  // The Voyages of Marco Polo
    '202398',  // Five Tribes: The Djinns of Naqala
    '155821',  // Above and Below
    '218603',  // Altiplano
    '209685',  // Clans of Caledonia
    '284083',  // On Mars
    '264220',  // Underwater Cities
    '243456',  // Furnace
    '317985',  // Cascadia
    '329669',  // Ticket to Ride Legacy
    '224517',  // Brass: Birmingham
    '230689',  // Brass: Lancashire
    '291041',  // Res Arcana
    '311885',  // Praga Caput Regni
    '336986',  // Carnegie
    '322289',  // Heat: Pedal to the Metal
    '350184',  // Sky Team
    '372782',  // Kabuto Sumo
    '366013',  // Dune: Imperium – Uprising
  ],
  'Fantasy': [
    '174430','167791','170042','182028','205637','262543','291457','316554','329082','342942','3076','9209','37111','70323','31260','25613','110327','220308','233078',
    '291572',  // Oath
    '256916',  // Pax Pamir
    '220877',  // Architects West Kingdom
    '237182',  // Root
    '291041',  // Res Arcana
    '199792',  // Forbidden Stars
    '155821',  // Above and Below
    '205059',  // Near and Far
    '246900',  // Everdell
    '251247',  // Wingspan (narrativo/fantasy-lite)
    '296720',  // Sleeping Gods
    '306723',  // Sleeping Gods: Distant Skies
    '266524',  // Tainted Grail: Fall of Avalon
    '241464',  // Spirit Island (già presente come SciF ma è fantasy)
    '228939',  // Folklore: The Affliction
    '168435',  // Shadows of Brimstone: City of the Ancients
    '186765',  // Aeon's End
    '213900',  // Raiders of Scythia
    '180263',  // The 7th Continent
    '285645',  // Frosthaven
    '329081',  // Earthborne Rangers
    '351913',  // Wonderlands War
    '317985',  // Cascadia (fantasy-lite natura)
    '271320',  // Hadara
    '261537',  // Nusfjord
    '281549',  // Barrage
  ],
  'Science Fiction': [
    '169786','173346','187645','193840','220308','233078','266192','271324','295947','342942','12333','28720','31260','37111','68448','9209','311031',
    '241464',  // Spirit Island
    '169427',  // Star Wars: Rebellion
    '37111',   // Twilight Imperium
    '148228',  // Cosmic Encounter (vero classico sci-fi)
    '31260',   // Battlestar Galactica
    '9625',    // Space Alert
    '218419',  // The Expanse Board Game
    '254640',  // Ex Libris
    '205059',  // Near and Far
    '262712',  // Lost Ruins of Arnak
    '199478',  // Anachrony
    '232717',  // Pandemic: Fall of Rome (alt history)
    '301217',  // Dune: Imperium
    '262543',  // Twilight Inscription
    '246784',  // Obsession
    '305096',  // Terraforming Mars: Ares Expedition
    '316377',  // Nucleum
    '332686',  // Revive
    '357563',  // Lacrimosa
    '243456',  // Furnace
    '284083',  // On Mars
    '264220',  // Underwater Cities
    '291563',  // Altiplano
    '366013',  // Dune: Imperium – Uprising
    '354986',  // Andromeda's Edge
    '225694',  // Alien Artifacts
  ],
  'Adventure': [
    '167791','174430','182028','220308','233078','270844','291457','316554','329082','342942','3076','9209','37111','70323','110327','25613','266192',
    '180263',  // The 7th Continent
    '296720',  // Sleeping Gods
    '266524',  // Tainted Grail
    '246900',  // Everdell
    '205059',  // Near and Far
    '155821',  // Above and Below
    '237182',  // Root
    '285645',  // Frosthaven
    '329081',  // Earthborne Rangers
    '169427',  // Star Wars: Rebellion
    '193840',  // Dead of Winter: The Long Night
    '157354',  // T.I.M.E Stories
    '219513',  // The Grizzled
    '213900',  // Raiders of Scythia
    '351913',  // Wonderlands War
    '228939',  // Folklore: The Affliction
    '168435',  // Shadows of Brimstone
    '186765',  // Aeon's End
    '262203',  // Arkham Horror LCG (come da tavolo)
    '215312',  // Spirit Island
    '281549',  // Barrage (avventura industriale)
    '246784',  // Obsession
    '329669',  // Ticket to Ride Legacy
  ],
  'Cooperative Play': [
    '161936','174430','182028','215312','220308','271324','291457','316554','329082','342942','9209','37111','12333','68448','266192','293006',
    '180263',  // The 7th Continent
    '296720',  // Sleeping Gods
    '186765',  // Aeon's End
    '285645',  // Frosthaven
    '329081',  // Earthborne Rangers
    '266524',  // Tainted Grail
    '219513',  // The Grizzled
    '9625',    // Space Alert
    '148949',  // Flash Point: Fire Rescue
    '193840',  // Dead of Winter
    '225694',  // Pandemic: Iberia
    '232717',  // Pandemic: Fall of Rome
    '281549',  // Barrage (solo mode)
    '246900',  // Everdell
    '262712',  // Lost Ruins of Arnak
    '350184',  // Sky Team
    '317985',  // Cascadia
    '291041',  // Res Arcana
    '199792',  // Forbidden Stars
    '157354',  // T.I.M.E Stories
    '210996',  // Magic Maze
    '228939',  // Folklore: The Affliction
    '366013',  // Dune: Imperium – Uprising (semi-coop)
  ],
  'Social Deduction': [
    '178900','220308','231080','266192','271324','291457','342942','9220','13','203993','230802',
    '128882',  // One Night Ultimate Werewolf
    '188834',  // Secret Hitler
    '207345',  // Coup: Rebellion G54
    '40692',   // Coup
    '195870',  // Spyfall
    '259703',  // Wavelength
    '213052',  // Mysterium
    '163412',  // Skull
    '108745',  // Dead of Winter
    '276025',  // The Mind
    '364073',  // So Clover!
    '371869',  // Insider
    '287954',  // Just One
    '254640',  // Codenames: Duet
    '178900',  // Dead of Winter (già presente)
    '232717',  // Saboteur (classico)
  ],
  'Deduction': [
    '178900','220308','266192','295947','316554','342942','9220','13','203993','30549','271324',
    '213052',  // Mysterium
    '128882',  // One Night Ultimate Werewolf
    '188834',  // Secret Hitler
    '259703',  // Wavelength
    '231080',  // Decrypto
    '195870',  // Spyfall
    '287954',  // Just One
    '163412',  // Skull
    '254640',  // Codenames Duet
    '364073',  // So Clover!
    '276025',  // The Mind
    '200906',  // Detective: A Modern Crime Board Game
    '171223',  // Unlock! (serie)
    '219062',  // Chronicles of Crime
    '228851',  // Sherlock Holmes Consulting Detective
    '40692',   // Coup
    '207345',  // Resistance: Coup
  ],
  'Wargame': [
    '12333','28720','37111','68448','124361','182028','233078','266192','342942','9209','173346',
    '169427',  // Star Wars: Rebellion
    '256916',  // Pax Pamir
    '199792',  // Forbidden Stars
    '84876',   // Conflict of Heroes: Awakening the Bear
    '35677',   // Hannibal & Hamilcar
    '50380',   // Commands & Colors: Ancients
    '22545',   // Memoir '44
    '9217',    // Twilight Struggle
    '37111',   // Twilight Imperium (già presente)
    '147020',  // A Few Acres of Snow
    '130006',  // Band of Brothers: Ghost Panzer
    '25613',   // War of the Ring
    '291572',  // Oath
    '255984',  // Fort Sumter: The Secession Crisis
    '277537',  // Here I Stand (500th Anniversary)
    '202976',  // Churchill
    '351762',  // Nevsky
    '187645',  // Labyrinth
    '220877',  // Pax Renaissance
  ],
  'Economic': [
    '120677','161936','169786','173346','187645','220308','233078','266192','295947','311031','31260','270844',
    '224517',  // Brass: Birmingham
    '230689',  // Brass: Lancashire
    '209685',  // Clans of Caledonia
    '183394',  // Viticulture
    '246784',  // Obsession
    '281549',  // Barrage
    '284083',  // On Mars
    '264220',  // Underwater Cities
    '243456',  // Furnace
    '316377',  // Nucleum
    '336986',  // Carnegie
    '261537',  // Nusfjord
    '201921',  // Marco Polo
    '322289',  // Heat: Pedal to the Metal
    '311885',  // Praga Caput Regni
    '218417',  // Architects West Kingdom
    '192291',  // Great Western Trail
    '192135',  // Lorenzo il Magnifico
    '176494',  // Grand Austria Hotel
    '224419',  // Century: Spice Road
    '248937',  // Everdell
    '247763',  // Wingspan
    '332241',  // Marrakesh
    '357563',  // Lacrimosa
  ],
  'Role Playing': [
    '161936','174430','182028','220308','291457','316554','329082','342942','9209','3076','70323','266192',
    '291572',  // Oath
    '256916',  // Pax Pamir
    '237182',  // Root
    '296720',  // Sleeping Gods
    '329081',  // Earthborne Rangers
    '266524',  // Tainted Grail
    '228939',  // Folklore: The Affliction
    '205059',  // Near and Far
    '155821',  // Above and Below
    '180263',  // 7th Continent
    '246900',  // Everdell
    '285645',  // Frosthaven
    '168435',  // Shadows of Brimstone
    '186765',  // Aeon's End
    '157354',  // T.I.M.E Stories
    '213900',  // Raiders of Scythia
    '351913',  // Wonderlands War
    '241464',  // Spirit Island
    '262203',  // Arkham Horror LCG
    '70034',   // Dragon Age RPG
  ],
  'Horror': [
    '182028','220308','266192','271324','316554','329082','342942','12333','68448','293006',
    '266524',  // Tainted Grail
    '228939',  // Folklore: The Affliction
    '168435',  // Shadows of Brimstone
    '186765',  // Aeon's End
    '193840',  // Dead of Winter
    '262203',  // Arkham Horror LCG
    '180263',  // 7th Continent
    '296720',  // Sleeping Gods
    '351913',  // Wonderlands War
    '84876',   // Conflict of Heroes (tensione horror)
    '128882',  // One Night Werewolf
    '287878',  // Horrified
    '257978',  // Mansions of Madness 2nd Ed
    '205059',  // Near and Far (post-apoc)
    '332686',  // Revive (post-apoc)
    '219513',  // The Grizzled (guerra, orrore quotidiano)
  ],
  'Party Game': [
    '13','9220','203993','291457','178900','220308','266192','230802','316554',
    '128882',  // One Night Ultimate Werewolf
    '259703',  // Wavelength
    '287954',  // Just One
    '364073',  // So Clover!
    '276025',  // The Mind
    '163412',  // Skull
    '195870',  // Spyfall
    '231080',  // Decrypto
    '254640',  // Codenames: Duet
    '284217',  // Mysterium Park
    '372782',  // Kabuto Sumo
    '40692',   // Coup
    '207345',  // Coup Rebellion
    '371869',  // Insider
    '160974',  // Codenames (originale)
    '249821',  // Wavelength (già sopra)
    '299017',  // Bohnanza (scambio sociale)
    '11901',   // Bohnanza
  ],
  'Murder/Mystery': [
    '178900','9220','13','203993','220308','266192','295947','271324',
    '228851',  // Sherlock Holmes Consulting Detective
    '200906',  // Detective: A Modern Crime Board Game
    '219062',  // Chronicles of Crime
    '171223',  // Unlock!
    '213052',  // Mysterium
    '284217',  // Mysterium Park
    '231080',  // Decrypto
    '259703',  // Wavelength
    '195870',  // Spyfall
    '364073',  // So Clover!
    '188834',  // Secret Hitler
    '128882',  // One Night Werewolf
    '210054',  // Awkward Guests
    '366013',  // Dune Imperium (intrighi)
  ],
  'Puzzle': [
    '342942','295947','266192','220308','169786','120677','31260','293006',
    '317985',  // Cascadia
    '146021',  // Patchwork
    '171223',  // Unlock!
    '219062',  // Chronicles of Crime
    '259703',  // Wavelength
    '276025',  // The Mind
    '287954',  // Just One
    '364073',  // So Clover!
    '283355',  // Azul: Summer Pavilion
    '230802',  // Azul (originale)
    '260180',  // Sagrada
    '198994',  // Santorini
    '198773',  // Hive
    '246784',  // Obsession
    '281343',  // Kanban EV
    '284083',  // On Mars
    '350184',  // Sky Team
    '372782',  // Kabuto Sumo
    '310873',  // Calico
    '329354',  // Forest Shuffle
    '332241',  // Marrakesh
  ],
  'Abstract Strategy': [
    '37111','31260','28720','9209','169786','120677','295947','342942',
    '198994',  // Santorini
    '198773',  // Hive
    '146021',  // Patchwork
    '230802',  // Azul
    '283355',  // Azul: Summer Pavilion
    '260180',  // Sagrada
    '9065',    // Blokus
    '171650',  // Takenoko
    '172818',  // Nusquam / Nmbr 9
    '143741',  // Barenpark
    '163412',  // Skull
    '276025',  // The Mind
    '310873',  // Calico
    '329354',  // Forest Shuffle
    '372782',  // Kabuto Sumo
    '350671',  // Cascadia: Landmarks
    '281343',  // Kanban EV
    '299801',  // Quacks of Quedlinburg
  ],
  // Categorie extra per maggiore varietà
  'Farming': [
    '31260',   // Agricola
    '183394',  // Viticulture
    '247763',  // Wingspan
    '209685',  // Clans of Caledonia
    '246900',  // Everdell
    '317985',  // Cascadia
    '261537',  // Nusfjord
    '329354',  // Forest Shuffle
    '310873',  // Calico
    '220308',  // Terraforming Mars
    '132162',  // Agricola: All Creatures Big and Small
    '299801',  // Quacks of Quedlinburg
    '311043',  // Meadow
  ],
  'Medieval': [
    '174430',  // Gloomhaven
    '167791',  // Mansions of Madness
    '237182',  // Root
    '256916',  // Pax Pamir
    '291572',  // Oath
    '220877',  // Architects West Kingdom
    '285967',  // Viscounts West Kingdom
    '25613',   // War of the Ring
    '192291',  // Great Western Trail
    '176494',  // Grand Austria Hotel
    '192135',  // Lorenzo il Magnifico
    '183394',  // Viticulture
    '246784',  // Obsession
    '209685',  // Clans of Caledonia
    '224517',  // Brass: Birmingham
    '311885',  // Praga Caput Regni
    '336986',  // Carnegie
    '357563',  // Lacrimosa
  ],
  'Trains': [
    '9209',    // Ticket to Ride
    '14996',   // Ticket to Ride: Europe
    '224517',  // Brass: Birmingham
    '230689',  // Brass: Lancashire
    '322289',  // Heat: Pedal to the Metal
    '311885',  // Praga Caput Regni
    '50381',   // Steam
    '27708',   // Age of Steam
    '17133',   // Railways of the World
    '329669',  // Ticket to Ride Legacy
    '173346',  // Alchemists
  ],
  'Deckbuilding': [
    '295947',  // Dominion
    '266192',  // Clank!
    '342942',  // Marvel Champions
    '291041',  // Res Arcana
    '186765',  // Aeon's End
    '301997',  // Ark Nova
    '262712',  // Lost Ruins of Arnak
    '366013',  // Dune Imperium Uprising
    '301217',  // Dune Imperium
    '224419',  // Century Spice Road
    '332686',  // Revive
    '213900',  // Raiders of Scythia
    '246900',  // Everdell
    '285645',  // Frosthaven
    '257078',  // Clank! In! Space!
    '367220',  // Altered (TCG)
  ],
  'Classics': [
    // Classici pre-2005 di altissima qualità che meritano di stare nel pool
    '13',      // Catan
    '68448',   // 7 Wonders
    '30549',   // Pandemic
    '9220',    // Ticket to Ride (2004)
    '31260',   // Agricola
    '9209',    // Carcassonne
    '12333',   // Twilight Struggle
    '25613',   // War of the Ring
    '3076',    // Puerto Rico
    '37111',   // Twilight Imperium 3rd Ed
    '476',     // Risk (storico)
    '9065',    // Blokus
    '522',     // Cluedo/Clue
    '11901',   // Bohnanza
    '40692',   // Coup
    '22545',   // Memoir '44
    '50380',   // Commands & Colors: Ancients
    '9217',    // Twilight Struggle (già presente)
    '148228',  // Cosmic Encounter
    '199478',  // Anachrony
    '163412',  // Skull
    '198773',  // Hive
    '171650',  // Takenoko
    '143741',  // Barenpark
  ],
  'Family': [
    // Giochi adatti a tutti, non solo hardcore — amplia la fascia accessibile
    '13',      // Catan
    '9220',    // Ticket to Ride
    '9209',    // Carcassonne
    '317985',  // Cascadia
    '146021',  // Patchwork
    '230802',  // Azul
    '283355',  // Azul Summer Pavilion
    '260180',  // Sagrada
    '198994',  // Santorini
    '171650',  // Takenoko
    '143741',  // Barenpark
    '276025',  // The Mind
    '287954',  // Just One
    '364073',  // So Clover!
    '310873',  // Calico
    '329354',  // Forest Shuffle
    '299801',  // Quacks of Quedlinburg
    '311043',  // Meadow
    '372782',  // Kabuto Sumo
    '350184',  // Sky Team
    '284217',  // Mysterium Park
    '213052',  // Mysterium
    '219513',  // The Grizzled
    '148949',  // Flash Point: Fire Rescue
    '210996',  // Magic Maze
  ],
}

async function fetchBGGHotList(headers: HeadersInit): Promise<string[]> {
  try {
    const res = await fetch('https://boardgamegeek.com/xmlapi2/hot?type=boardgame', {
      headers, signal: AbortSignal.timeout(8000), next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const xml = await res.text()
    const idRe = /<item[^>]*id="(\d+)"/g
    const ids: string[] = []
    let m
    while ((m = idRe.exec(xml)) !== null) ids.push(m[1])
    return ids
  } catch { return [] }
}

async function fetchBoardgameRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile,
  isAlreadyOwned: (type: string, id: string, title: string) => boolean,
  shownIds?: Set<string>
): Promise<Recommendation[]> {
  const BGG_BASE = 'https://boardgamegeek.com/xmlapi2'
  const bggHeaders: HeadersInit = {
    'User-Agent': 'Geekore/1.0 (geekore.it)',
    ...(process.env.BGG_BEARER_TOKEN ? { Authorization: `Bearer ${process.env.BGG_BEARER_TOKEN}` } : {}),
  }
  const BGG_MIN_YEAR = 1990  // includi classici moderni dal '90
  const BGG_MAX_RANK = 2500  // amplia pool a top 2500 per titoli di nicchia

  // ── Step 1: raccogli ID pool in parallelo ────────────────────────────────
  const activeSlots = slots.slice(0, 12)  // più slot per pool più vario
  const seedIds = new Set<string>()
  for (const slot of activeSlots) {
    const seeds = BGG_CATEGORY_SEED_IDS[slot.genre] || BGG_CATEGORY_SEED_IDS['Strategy'] || []
    for (const id of seeds) seedIds.add(id)
  }
  const hotIds = await fetchBGGHotList(bggHeaders)

  // Fetch top BGG per rank (pagine 1 e 2 = top ~200 titoli oggettivamente buoni)
  // Integra seed ID fissi con titoli che il ranking BGG promuove organicamente
  const topRankedIds = await (async () => {
    try {
      const pages = await Promise.all([1, 2, 3].map(page =>
        fetch(`${BGG_BASE}/search?query=&type=boardgame&page=${page}`, {
          headers: bggHeaders, signal: AbortSignal.timeout(8000), next: { revalidate: 86400 },
        }).then(r => r.ok ? r.text() : '').catch(() => '')
      ))
      const ids: string[] = []
      for (const xml of pages) {
        const re = /<item[^>]*id="(\d+)"/g; let m
        while ((m = re.exec(xml)) !== null) ids.push(m[1])
      }
      return ids
    } catch { return [] as string[] }
  })()

  const allIds = [...new Set([...hotIds, ...topRankedIds, ...seedIds])]
  if (allIds.length === 0) return []

  // ── Step 2: fetch dettagli in batch paralleli da 20 ──────────────────────
  const batches: string[][] = []
  for (let i = 0; i < allIds.length; i += 20) batches.push(allIds.slice(i, i + 20))

  const batchXmls = await Promise.all(batches.map(async (batch) => {
    try {
      const res = await fetch(`${BGG_BASE}/thing?id=${batch.join(',')}&stats=1`, {
        headers: bggHeaders, signal: AbortSignal.timeout(12000), next: { revalidate: 3600 },
      })
      return res.ok ? res.text() : ''
    } catch { return '' }
  }))

  // ── Step 3: parse, filtra, scoringa ──────────────────────────────────────
  const results: Recommendation[] = []
  const seen = new Set<string>()

  for (const thingXml of batchXmls) {
    if (!thingXml) continue
    const itemRe = /<item[^>]*type="boardgame"[^>]*>([\s\S]*?)<\/item>/gi
    let m
    while ((m = itemRe.exec(thingXml)) !== null) {
      const chunk = m[0]
      const idM = chunk.match(/\bid="(\d+)"/)
      if (!idM) continue
      const recId = `bgg-${idM[1]}`
      if (seen.has(recId) || shownIds?.has(recId)) continue
      if (isAlreadyOwned('boardgame', recId, '')) continue

      const nameM = chunk.match(/<name[^>]*type="primary"[^>]*value="([^"]*)"/)
      if (!nameM) continue
      const title = nameM[1].trim()

      // Filtro rank: solo top 1000
      const rankM = chunk.match(/<rank[^>]*name="boardgame"[^>]*value="(\d+)"/)
      const bggRank = rankM ? parseInt(rankM[1]) : undefined
      if (bggRank !== undefined && bggRank > BGG_MAX_RANK) continue

      // Filtro anno: solo dal 2005
      const yearM = chunk.match(/<yearpublished[^>]*value="(\d+)"/)
      const year = yearM ? parseInt(yearM[1]) : undefined
      if (year !== undefined && year < BGG_MIN_YEAR) continue

      // Cover full-res, fallback thumbnail
      const image = (chunk.match(/<image>([^<]+)<\/image>/) || [])[1]?.trim()
      const thumbnail = (chunk.match(/<thumbnail>([^<]+)<\/thumbnail>/) || [])[1]?.trim()
      const cover = image || thumbnail
      if (!cover || cover.length < 10) continue

      const rawDesc = (chunk.match(/<description>([^<]*)<\/description>/) || [])[1] || ''
      const description = rawDesc
        .replace(/&#10;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+;/g, '')
        .replace(/<[^>]+>/g, '').trim().slice(0, 300) || undefined

      const catRe = /<link[^>]*type="boardgamecategory"[^>]*value="([^"]*)"/g
      const categories: string[] = []
      let cm
      while ((cm = catRe.exec(chunk)) !== null) categories.push(cm[1])
      const mechRe = /<link[^>]*type="boardgamemechanic"[^>]*value="([^"]*)"/g
      const mechanics: string[] = []
      while ((cm = mechRe.exec(chunk)) !== null) mechanics.push(cm[1])
      const designerRe = /<link[^>]*type="boardgamedesigner"[^>]*value="([^"]*)"/g
      const designers: string[] = []
      while ((cm = designerRe.exec(chunk)) !== null) {
        if (cm[1] !== '(Uncredited)') designers.push(cm[1])
      }

      const ratingM = chunk.match(/<average[^>]*value="([\d.]+)"/)
      const bggScore = ratingM ? parseFloat(ratingM[1]) : undefined
      if (bggScore !== undefined && bggScore < 5.8) continue

      const minpM = chunk.match(/<minplayers[^>]*value="(\d+)"/)
      const maxpM = chunk.match(/<maxplayers[^>]*value="(\d+)"/)
      const timeM = chunk.match(/<playingtime[^>]*value="(\d+)"/)
      const weightM = chunk.match(/<averageweight[^>]*value="([\d.]+)"/)

      const crossGenres = new Set<string>()
      for (const cat of categories) {
        crossGenres.add(cat)
        const mapped = BGG_TO_CROSS_GENRE[cat]
        if (mapped) for (const cg of mapped) crossGenres.add(cg)
      }
      const recGenres = [...crossGenres]

      const matchScore = computeMatchScore(recGenres, mechanics, tasteProfile, [], [])
      if (matchScore < 3) continue  // soglia minima per pool master ampio — filtra solo titoli totalmente fuori gusto

      const bestSlot = activeSlots.find(s =>
        (BGG_CATEGORY_SEED_IDS[s.genre] || []).includes(idM[1]) ||
        categories.some(c => c.toLowerCase().includes(s.genre.toLowerCase()))
      ) || activeSlots[0]

      let finalScore = matchScore
      const ratingCountM = chunk.match(/<usersrated[^>]*value="(\d+)"/)
      const ratingCount = ratingCountM ? parseInt(ratingCountM[1]) : 0
      if (bggScore !== undefined && bggScore >= 7.5 && ratingCount >= 500) {
        finalScore = Math.min(100, finalScore + 8)
      }
      if (bggRank !== undefined) {
        // Anti-overhype: i titoli arcinoti (top 30) ottengono un bonus ridotto
        // per lasciare spazio a gemme di nicchia nella top 100-800
        if (bggRank <= 30) finalScore = Math.min(100, finalScore + 2)
        else if (bggRank <= 100) finalScore = Math.min(100, finalScore + 5)
        else if (bggRank <= 300) finalScore = Math.min(100, finalScore + 4)  // hidden gem bonus
        else if (bggRank <= 800) finalScore = Math.min(100, finalScore + 2)
      }
      finalScore = Math.round(finalScore * releaseFreshnessMult(year))

      seen.add(recId)
      results.push({
        id: recId, title, type: 'boardgame', coverImage: cover, year,
        genres: categories.length > 0 ? categories : recGenres,
        score: bggScore !== undefined ? Math.round((bggScore / 2) * 10) / 10 : undefined,
        description,
        why: buildWhyV3(recGenres, recId, title, tasteProfile, matchScore, bestSlot.isDiscovery, {}),
        matchScore: finalScore,
        isDiscovery: bestSlot.isDiscovery,
        isAwardWinner: bggScore !== undefined && bggScore >= 7.5 && ratingCount >= 500,
        min_players: minpM ? parseInt(minpM[1]) : undefined,
        max_players: maxpM ? parseInt(maxpM[1]) : undefined,
        playing_time: timeM ? parseInt(timeM[1]) : undefined,
        complexity: weightM ? Math.round(parseFloat(weightM[1]) * 10) / 10 : undefined,
        mechanics: mechanics.slice(0, 8),
        designers: designers.slice(0, 3),
      } as any)
    }
  }

  // Traduci le descrizioni in italiano (stesso pattern di manga e videogiochi)
  const bgDescItems = results
    .filter(r => r.description)
    .map(r => ({ id: `bgg:${r.id}`, text: r.description! }))
  if (bgDescItems.length > 0) {
    const t = await translateWithCache(bgDescItems)
    results.forEach(r => { if (r.description) r.description = t[`bgg:${r.id}`] || r.description })
  }

  // ── TOP-UP BGG: se il pool è sotto 200, usa ID supplementari per rank ────
  // Strategia corretta: BGG XMLAPIv2 non ha browse per rank.
  // Usiamo una lista estesa di ID BGG top 500-2500 noti, non ancora nei seed,
  // e li fetchiamo in batch filtrando per affinità crossmediale.
  // NOTA: search?query=boardgame è errata (cerca titolo "boardgame", non browse).
  // search?query=&type=boardgame è già usata nel loop principale (pag 1-3).
  const BGG_POOL_TARGET = 200
  if (results.length < BGG_POOL_TARGET) {
    // ID supplementari: giochi BGG top 300-2500 non già presenti nei seed per categoria.
    // Selezionati da BGG top list per rappresentare generi vari con alta qualità.
    const BGG_EXTENDED_IDS = [
      // Top 100-300 BGG (mix generi: war, party, cooperative, abstract, family)
      '12333','68448','9209','148228','9625','35424','3232','40692','2651','4098',
      '13','171','822','30549','3076','476','9217','31260','25613','110327',
      '37111','70323','25643','45','532','147020','136888','148949','177590',
      '159675','193458','227966','162886','176494','180263','187425','189643',
      '191189','197574','199792','200680','205059','209685','213900','215312',
      '218417','218603','219513','220308','221107','224517','228939','229853',
      '230689','230802','231571','232717','233078','234669','236457','237182',
      '238690','241464','242302','246784','246900','251247','253344','254640',
      '256916','258779','261537','262203','262543','262712','264220','266192',
      '266524','270844','271320','271324','281549','284083','285645','285967',
      '291041','291457','291572','293006','295947','296720','301217','305096',
      '306723','311031','311885','316377','316554','317985','322289','329081',
      '329082','329669','332241','332686','336986','342942','350184','351913',
      '354986','357563','366013','372782','225694','199478','218419','354018',
      // Top 300-800 BGG meno mainstream ma con alta affinità potenziale
      '163412','163967','164928','166669','167355','168786','170216','171231',
      '171668','172386','174430','175640','176396','177188','178020','179976',
      '180263','182028','183394','185785','187096','187227','188803','190296',
      '191189','192291','193460','195856','196652','197807','199042','200048',
      '201706','203993','205637','206941','208983','210253','211088','212427',
      '214977','216754','217861','220451','221533','222765','224694','226320',
      '228504','230231','231893','233253','234451','238691','240980','242705',
      '244711','248134','249530','251730','253284','255683','256680','258779',
      '261393','262874','265688','266192','268084','270642','273607','278266',
      '280096','281596','283948','286096','287954','289474','292457','294096',
    ]
    // Filtra ID già visti nel loop principale
    const unseenExtendedIds = BGG_EXTENDED_IDS.filter(id => !seen.has(`bgg-${id}`))
    // Fetch in batch da 20 ID (limite BGG consigliato)
    const extBatches: string[][] = []
    for (let i = 0; i < unseenExtendedIds.length; i += 20) extBatches.push(unseenExtendedIds.slice(i, i + 20))

    for (const batch of extBatches) {
      if (results.length >= BGG_POOL_TARGET) break
      try {
        const detailXml = await fetch(
          `${BGG_BASE}/thing?id=${batch.join(',')}&stats=1`,
          { headers: bggHeaders, signal: AbortSignal.timeout(12000), next: { revalidate: 3600 } }
        ).then(r => r.ok ? r.text() : '').catch(() => '')
        if (!detailXml) continue

        // Tutto il resto è identico al loop principale: stesso parsing, stesse soglie, stessa logica di score
        const itemRe2 = /<item[^>]*type="boardgame"[^>]*>([\s\S]*?)<\/item>/gi
        let m2
        while ((m2 = itemRe2.exec(detailXml)) !== null) {
          if (results.length >= BGG_POOL_TARGET) break
          const chunk = m2[0]
          const idM2 = chunk.match(/\bid="(\d+)"/)
          if (!idM2) continue
          const recId = `bgg-${idM2[1]}`
          if (seen.has(recId) || shownIds?.has(recId)) continue
          if (isAlreadyOwned('boardgame', recId, '')) continue

          const nameM2 = chunk.match(/<name[^>]*type="primary"[^>]*value="([^"]*)"/)
          if (!nameM2) continue

          const rankM2 = chunk.match(/<rank[^>]*name="boardgame"[^>]*value="(\d+)"/)
          const bggRank2 = rankM2 ? parseInt(rankM2[1]) : undefined
          if (bggRank2 !== undefined && bggRank2 > BGG_MAX_RANK) continue

          const yearM2 = chunk.match(/<yearpublished[^>]*value="(\d+)"/)
          const year2 = yearM2 ? parseInt(yearM2[1]) : undefined
          if (year2 !== undefined && year2 < BGG_MIN_YEAR) continue

          const image2 = (chunk.match(/<image>([^<]+)<\/image>/) || [])[1]?.trim()
          const thumbnail2 = (chunk.match(/<thumbnail>([^<]+)<\/thumbnail>/) || [])[1]?.trim()
          const cover2 = image2 || thumbnail2
          if (!cover2 || cover2.length < 10) continue

          const ratingM2 = chunk.match(/<average[^>]*value="([\d.]+)"/)
          const bggScore2 = ratingM2 ? parseFloat(ratingM2[1]) : undefined
          if (bggScore2 !== undefined && bggScore2 < 5.8) continue

          const catRe2 = /<link[^>]*type="boardgamecategory"[^>]*value="([^"]*)"/g
          const categories2: string[] = []; let cm2
          while ((cm2 = catRe2.exec(chunk)) !== null) categories2.push(cm2[1])
          const mechRe2 = /<link[^>]*type="boardgamemechanic"[^>]*value="([^"]*)"/g
          const mechanics2: string[] = []
          while ((cm2 = mechRe2.exec(chunk)) !== null) mechanics2.push(cm2[1])

          const crossGenres2 = new Set<string>()
          for (const cat of categories2) {
            crossGenres2.add(cat)
            const mapped = BGG_TO_CROSS_GENRE[cat]
            if (mapped) for (const cg of mapped) crossGenres2.add(cg)
          }
          const recGenres2 = [...crossGenres2]
          // computeMatchScore usa globalGenres (tutti i media) → profilo crossmediale
          const matchScore2 = computeMatchScore(recGenres2, mechanics2, tasteProfile, [], [])
          if (matchScore2 < 3) continue  // stessa soglia del loop principale

          const rawDesc2 = (chunk.match(/<description>([^<]*)<\/description>/) || [])[1] || ''
          const description2 = rawDesc2
            .replace(/&#10;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+;/g, '')
            .replace(/<[^>]+>/g, '').trim().slice(0, 300) || undefined

          const ratingCountM2 = chunk.match(/<usersrated[^>]*value="(\d+)"/)
          const ratingCount2 = ratingCountM2 ? parseInt(ratingCountM2[1]) : 0
          let finalScore2 = matchScore2
          if (bggScore2 !== undefined && bggScore2 >= 7.5 && ratingCount2 >= 500) finalScore2 = Math.min(100, finalScore2 + 8)
          if (bggRank2 !== undefined) {
            if (bggRank2 <= 30) finalScore2 = Math.min(100, finalScore2 + 2)
            else if (bggRank2 <= 100) finalScore2 = Math.min(100, finalScore2 + 5)
            else if (bggRank2 <= 300) finalScore2 = Math.min(100, finalScore2 + 4)
            else if (bggRank2 <= 800) finalScore2 = Math.min(100, finalScore2 + 2)
          }
          finalScore2 = Math.round(finalScore2 * releaseFreshnessMult(year2))

          const minpM2 = chunk.match(/<minplayers[^>]*value="(\d+)"/)
          const maxpM2 = chunk.match(/<maxplayers[^>]*value="(\d+)"/)
          const timeM2 = chunk.match(/<playingtime[^>]*value="(\d+)"/)
          const weightM2 = chunk.match(/<averageweight[^>]*value="([\d.]+)"/)
          const designerRe2 = /<link[^>]*type="boardgamedesigner"[^>]*value="([^"]*)"/g
          const designers2: string[] = []
          while ((cm2 = designerRe2.exec(chunk)) !== null) {
            if (cm2[1] !== '(Uncredited)') designers2.push(cm2[1])
          }

          seen.add(recId)
          results.push({
            id: recId, title: nameM2[1].trim(), type: 'boardgame', coverImage: cover2, year: year2,
            genres: categories2.length > 0 ? categories2 : recGenres2,
            score: bggScore2 !== undefined ? Math.round((bggScore2 / 2) * 10) / 10 : undefined,
            description: description2,
            why: buildWhyV3(recGenres2, recId, nameM2[1].trim(), tasteProfile, matchScore2, false, {}),
            matchScore: finalScore2,
            isAwardWinner: bggScore2 !== undefined && bggScore2 >= 7.5 && ratingCount2 >= 500,
            min_players: minpM2 ? parseInt(minpM2[1]) : undefined,
            max_players: maxpM2 ? parseInt(maxpM2[1]) : undefined,
            playing_time: timeM2 ? parseInt(timeM2[1]) : undefined,
            complexity: weightM2 ? Math.round(parseFloat(weightM2[1]) * 10) / 10 : undefined,
            mechanics: mechanics2.slice(0, 8),
            designers: designers2.slice(0, 3),
          } as any)
        }
      } catch { /* continua con batch successivo */ }
    }

    // Fallback: se ancora sotto target, usa search?query=&type=boardgame pagine 4+
    // (query vuota = tutti i boardgame BGG, ordinati alfabeticamente — non ideale ma funziona)
    if (results.length < BGG_POOL_TARGET) {
      let topUpPage = 4
      const MAX_BGG_TOPUP_PAGES = 12
      while (results.length < BGG_POOL_TARGET && topUpPage <= MAX_BGG_TOPUP_PAGES) {
        try {
          const searchXml = await fetch(
            `${BGG_BASE}/search?query=&type=boardgame&page=${topUpPage}`,
            { headers: bggHeaders, signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } }
          ).then(r => r.ok ? r.text() : '').catch(() => '')

        const pageIds: string[] = []
        const re = /<item[^>]*id="(\d+)"/g; let mi
        while ((mi = re.exec(searchXml)) !== null) {
          if (!seen.has(`bgg-${mi[1]}`)) pageIds.push(mi[1])
        }
        if (pageIds.length === 0) break

        // Fetcha dettagli per questi ID
        const detailXml = await fetch(
          `${BGG_BASE}/thing?id=${pageIds.join(',')}&stats=1`,
          { headers: bggHeaders, signal: AbortSignal.timeout(12000), next: { revalidate: 3600 } }
        ).then(r => r.ok ? r.text() : '').catch(() => '')

        if (!detailXml) { topUpPage++; continue }

        const itemRe2 = /<item[^>]*type="boardgame"[^>]*>([\s\S]*?)<\/item>/gi
        let m2
        while ((m2 = itemRe2.exec(detailXml)) !== null) {
          if (results.length >= BGG_POOL_TARGET) break
          const chunk = m2[0]
          const idM2 = chunk.match(/\bid="(\d+)"/)
          if (!idM2) continue
          const recId = `bgg-${idM2[1]}`
          if (seen.has(recId) || shownIds?.has(recId)) continue
          if (isAlreadyOwned('boardgame', recId, '')) continue

          const nameM2 = chunk.match(/<name[^>]*type="primary"[^>]*value="([^"]*)"/)
          if (!nameM2) continue

          const rankM2 = chunk.match(/<rank[^>]*name="boardgame"[^>]*value="(\d+)"/)
          const bggRank2 = rankM2 ? parseInt(rankM2[1]) : undefined
          if (bggRank2 !== undefined && bggRank2 > BGG_MAX_RANK) continue

          const yearM2 = chunk.match(/<yearpublished[^>]*value="(\d+)"/)
          const year2 = yearM2 ? parseInt(yearM2[1]) : undefined
          if (year2 !== undefined && year2 < BGG_MIN_YEAR) continue

          const image2 = (chunk.match(/<image>([^<]+)<\/image>/) || [])[1]?.trim()
          const thumbnail2 = (chunk.match(/<thumbnail>([^<]+)<\/thumbnail>/) || [])[1]?.trim()
          const cover2 = image2 || thumbnail2
          if (!cover2 || cover2.length < 10) continue

          const ratingM2 = chunk.match(/<average[^>]*value="([\d.]+)"/)
          const bggScore2 = ratingM2 ? parseFloat(ratingM2[1]) : undefined
          if (bggScore2 !== undefined && bggScore2 < 5.8) continue

          const catRe2 = /<link[^>]*type="boardgamecategory"[^>]*value="([^"]*)"/g
          const categories2: string[] = []; let cm2
          while ((cm2 = catRe2.exec(chunk)) !== null) categories2.push(cm2[1])
          const mechRe2 = /<link[^>]*type="boardgamemechanic"[^>]*value="([^"]*)"/g
          const mechanics2: string[] = []
          while ((cm2 = mechRe2.exec(chunk)) !== null) mechanics2.push(cm2[1])

          const crossGenres2 = new Set<string>()
          for (const cat of categories2) {
            crossGenres2.add(cat)
            const mapped = BGG_TO_CROSS_GENRE[cat]
            if (mapped) for (const cg of mapped) crossGenres2.add(cg)
          }
          const recGenres2 = [...crossGenres2]
          const matchScore2 = computeMatchScore(recGenres2, mechanics2, tasteProfile, [], [])
          if (matchScore2 < 3) continue  // stessa soglia minima del loop principale

          const rawDesc2 = (chunk.match(/<description>([^<]*)<\/description>/) || [])[1] || ''
          const description2 = rawDesc2
            .replace(/&#10;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#\d+;/g, '')
            .replace(/<[^>]+>/g, '').trim().slice(0, 300) || undefined

          const ratingCountM2 = chunk.match(/<usersrated[^>]*value="(\d+)"/)
          const ratingCount2 = ratingCountM2 ? parseInt(ratingCountM2[1]) : 0
          let finalScore2 = matchScore2
          if (bggScore2 !== undefined && bggScore2 >= 7.5 && ratingCount2 >= 500) finalScore2 = Math.min(100, finalScore2 + 8)
          if (bggRank2 !== undefined) {
            if (bggRank2 <= 30) finalScore2 = Math.min(100, finalScore2 + 2)
            else if (bggRank2 <= 100) finalScore2 = Math.min(100, finalScore2 + 5)
            else if (bggRank2 <= 300) finalScore2 = Math.min(100, finalScore2 + 4)
            else if (bggRank2 <= 800) finalScore2 = Math.min(100, finalScore2 + 2)
          }
          finalScore2 = Math.round(finalScore2 * releaseFreshnessMult(year2))

          const minpM2 = chunk.match(/<minplayers[^>]*value="(\d+)"/)
          const maxpM2 = chunk.match(/<maxplayers[^>]*value="(\d+)"/)
          const timeM2 = chunk.match(/<playingtime[^>]*value="(\d+)"/)
          const weightM2 = chunk.match(/<averageweight[^>]*value="([\d.]+)"/)
          const designerRe2 = /<link[^>]*type="boardgamedesigner"[^>]*value="([^"]*)"/g
          const designers2: string[] = []
          while ((cm2 = designerRe2.exec(chunk)) !== null) {
            if (cm2[1] !== '(Uncredited)') designers2.push(cm2[1])
          }

          seen.add(recId)
          results.push({
            id: recId, title: nameM2[1].trim(), type: 'boardgame', coverImage: cover2, year: year2,
            genres: categories2.length > 0 ? categories2 : recGenres2,
            score: bggScore2 !== undefined ? Math.round((bggScore2 / 2) * 10) / 10 : undefined,
            description: description2,
            why: buildWhyV3(recGenres2, recId, nameM2[1].trim(), tasteProfile, matchScore2, false, {}),
            matchScore: finalScore2,
            isAwardWinner: bggScore2 !== undefined && bggScore2 >= 7.5 && ratingCount2 >= 500,
            min_players: minpM2 ? parseInt(minpM2[1]) : undefined,
            max_players: maxpM2 ? parseInt(maxpM2[1]) : undefined,
            playing_time: timeM2 ? parseInt(timeM2[1]) : undefined,
            complexity: weightM2 ? Math.round(parseFloat(weightM2[1]) * 10) / 10 : undefined,
            mechanics: mechanics2.slice(0, 8),
            designers: designers2.slice(0, 3),
          } as any)
        }
      } catch { /* continua */ }
      topUpPage++
    }
  }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// ── Handler principale V6 — Pool-based recommendations ───────────────────────
//
// NOVITÀ V6:
//   • Bacino (pool) persistente per tipo (~80 titoli), salvato in recommendations_pool
//   • Il pool viene rigenerato solo se: scaduto (24h) O collezione cambiata O forceRefresh
//   • Ad ogni GET si pesca randomicamente dal pool (shuffle + slice), evitando solo
//     i titoli mostrati nella SESSIONE CORRENTE (non nelle ultime 2 settimane)
//   • recommendations_shown ora traccia solo la sessione corrente (TTL: 4h)
//   • Il bacino non si riduce mai: ogni refresh mostra un sottoinsieme diverso
//     dello stesso pool ampio, ruotando i contenuti senza escluderli definitivamente
// ─────────────────────────────────────────────────────────────────────────────

const MASTER_POOL_SIZE_PER_TYPE = 200  // titoli nel master pool per tipo (grande serbatoio)
const MASTER_POOL_MIN_VALID = 40       // minimo realistico — BGG ha meno titoli di altri sorgenti
const MASTER_POOL_MAX_AGE_DAYS = 7     // rigenera master se più vecchio di N giorni
const SERVE_SIZE_PER_TYPE = 15         // titoli campionati dal master e serviti ad ogni GET

// Delta dinamico basato sul totale titoli nel profilo (tutti i media combined)
// 0-50 titoli   → regen ogni +5 totali
// 51-100        → regen ogni +10 totali
// 101-150       → regen ogni +15 totali
// 151+          → regen ogni +20 totali
function computeRegenDelta(totalEntries: number): number {
  if (totalEntries <= 50) return 5
  if (totalEntries <= 100) return 10
  if (totalEntries <= 150) return 15
  return 20
}
// POOL_SIZE_PER_TYPE rimosso — il recommendations_pool ora contiene sempre esattamente SERVE_SIZE_PER_TYPE titoli
// Fix 1.13: TTL dinamico — più l'utente è attivo, più il pool si rigenera spesso
// Formula: max(4h, min(48h, 24h - (titoli_aggiunti_ultime_12h × 2h)))
// const POOL_TTL_HOURS = 24  // rimpiazzato con computePoolTTL()
function computePoolTTL(entries: any[]): number {
  const twelveHoursAgo = Date.now() - 12 * 3600000
  const recentAdds = entries.filter(e => e.created_at && new Date(e.created_at).getTime() > twelveHoursAgo).length
  return Math.max(4, Math.min(48, 24 - recentAdds * 2))
}
const POOL_TTL_HOURS = 24  // default, sarà sovrascitto dinamicamente sotto
const SESSION_TTL_HOURS = 4     // titoli mostrati in questa sessione (no ripetizioni a breve)

// Fisher-Yates shuffle deterministico (seed = userId + timestamp truncato all'ora)
function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export async function GET(request: NextRequest) {
  try {
    // ── Background regen bypass ───────────────────────────────────────────────
    const { searchParams } = new URL(request.url)
    const serviceUserId = request.headers.get('X-Service-User-Id') || searchParams.get('_suid')
    const serviceSecret = request.headers.get('X-Service-Secret') || searchParams.get('_ssec')
    const isServiceCall = !!(serviceUserId && serviceSecret === (process.env.CRON_SECRET || ''))

    console.log('[RECO] GET called, isServiceCall:', isServiceCall)

    // Rate limit solo per chiamate esterne — le interne sono già serializzate dal cron
    if (!isServiceCall) {
      const rl = rateLimit(request, { limit: 10, windowMs: 60_000 })
      if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    let supabase = await createClient()
    let userId: string

    if (isServiceCall) {
      // Crea client con service role per leggere dati dell'utente
      const { createClient: createServiceClient } = await import('@supabase/supabase-js')
      supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      ) as any
      userId = serviceUserId!
      logger.info('recommendations', `[SERVICE CALL] Regen per userId=${userId}`)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
      userId = user.id
    }

    const requestedType = searchParams.get('type') || 'all'
    const forceRefresh = searchParams.get('refresh') === '1'
    const similarToId = searchParams.get('similar_to_id') || null  // Fix 1.15: "simili a questo"
    const similarToGenres = searchParams.get('similar_to_genres')?.split(',').filter(Boolean) || []
    // Onboarding: utente nuovo senza entries → bypassa il filtro allTypesInCollection
    // e usa i tipi passati esplicitamente (o tutti e 5 se non specificati)
    const isOnboardingCall = searchParams.get('onboarding') === '1'
    const onboardingTypes = searchParams.get('types')?.split(',').filter(Boolean) as MediaType[] | undefined

    // ── FAST PATH: legge solo da recommendations_pool, zero API esterne ──────
    // Usato da page.tsx al mount → risposta in ~50ms
    const poolOnly = searchParams.get('source') === 'pool'
    console.log('[RECO] poolOnly:', poolOnly, 'forceRefresh:', forceRefresh, 'requestedType:', requestedType)
    if (poolOnly && !forceRefresh) {
      const { data: poolRows } = await supabase
        .from('recommendations_pool')
        .select('media_type, data, taste_profile, total_entries, generated_at')
        .eq('user_id', userId)

      if (poolRows && poolRows.length > 0) {
        const recommendations: Record<string, any[]> = {}
        let tasteProfile: any = null
        let totalEntries = 0
        for (const row of poolRows) {
          if (Array.isArray(row.data) && row.data.length > 0) {
            // Applica il limite SERVE_SIZE_PER_TYPE — il pool può contenerne di più
            recommendations[row.media_type] = (row.data as any[]).slice(0, SERVE_SIZE_PER_TYPE)
          }
          if (!tasteProfile && row.taste_profile) tasteProfile = row.taste_profile
          if (row.total_entries) totalEntries = Math.max(totalEntries, row.total_entries)
        }
        const hasData = Object.values(recommendations).some(arr => arr.length > 0)
        if (hasData) {
          return NextResponse.json({
            recommendations,
            tasteProfile: tasteProfile ? { ...tasteProfile, totalEntries } : null,
            cached: true,
            source: 'pool',
          }, { headers: { 'X-Cache': 'POOL_HIT' } })
        }
      }
      // Pool vuota → segnala al client di fare il calcolo completo
      return NextResponse.json({ recommendations: {}, tasteProfile: null, cached: false, source: 'pool_empty' })
    }

    // ── In-memory cache check — bypassa se similar_to query (sempre fresh) ───
    if (!forceRefresh && !similarToId) {
      const memHit = memCacheGet(userId)
      console.log('[RECO] memHit:', !!memHit)
      if (memHit) {
        // Per type=all ritorna SEMPRE tutti i dati — mai un sottoinsieme
        const recs = requestedType === 'all'
          ? memHit.data
          : { [requestedType]: memHit.data[requestedType] || [] }
        // Sanity check: se type=all ma i dati sembrano parziali (un solo tipo), non usare cache
        if (requestedType === 'all') {
          const types = Object.keys(recs).filter(k => Array.isArray(recs[k]) && recs[k].length > 0)
          if (types.length < 1) {
            // Cache vuota o corrotta — cade attraverso al ricalcolo
          } else {
            return NextResponse.json({ recommendations: recs, tasteProfile: memHit.tasteProfile, cached: true }, {
              headers: { 'X-Cache': 'MEM_HIT' }
            })
          }
        } else {
          return NextResponse.json({ recommendations: recs, tasteProfile: memHit.tasteProfile, cached: true }, {
            headers: { 'X-Cache': 'MEM_HIT' }
          })
        }
      }
    }

    // Leggi collezione completa
    const { data: entries } = await supabase
      .from('user_media_entries')
      .select('type, rating, genres, current_episode, episodes, status, is_steam, title, title_en, external_id, appid, updated_at, tags, keywords, themes, player_perspectives, studios, directors, authors, developer, rewatch_count, started_at')
      .eq('user_id', userId)

    const allEntries: UserEntry[] = (entries || []) as UserEntry[]

    // Timestamp dell'ultima modifica alla collezione
    const lastCollectionUpdate = allEntries.reduce((latest: Date, e: UserEntry) => {
      const t = new Date(e.updated_at || 0)
      return t > latest ? t : latest
    }, new Date(0))

    // ── Carica preferenze + wishlist + search history ─────────────────────────
    const [
      { data: preferences },
      { data: wishlistRaw },
      { data: searchHistory },
    ] = await Promise.all([
      supabase.from('user_preferences').select('*').eq('user_id', userId).single(),
      supabase.from('wishlist').select('external_id, genres, media_type, title, studios').eq('user_id', userId),
      supabase.from('search_history').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100),
    ])

    const wishlistItems: UserEntry[] = (wishlistRaw || []).map((w: { external_id: string; genres: string[]; media_type: string; title: string; studios: string }) => ({
      title: w.title || '',
      type: (w.media_type || 'movie') as MediaType,
      external_id: w.external_id,
      genres: w.genres,
      studio: w.studios,
    }))
    const searches = searchHistory || []
    const userPlatformIds: number[] = (preferences as any)?.streaming_platforms || []

    // Compute taste profile
    const tasteProfile = computeTasteProfile(allEntries, preferences, wishlistItems, searches)

    // ── Deduplicazione robusta ────────────────────────────────────────────────
    const normalizeTitle = (t: string) =>
      t.toLowerCase()
       .replace(/^(the|a|an|il|lo|la|i|gli|le|un|uno|una)\s+/i, '')
       .replace(/[^a-z0-9]/g, '')

    const titleTokens = (t: string): Set<string> =>
      new Set(
        t.toLowerCase()
         .replace(/[^a-z0-9\s]/g, '')
         .split(/\s+/)
         .filter(w => w.length >= 4)
      )

    const hasTokenOverlap = (a: Set<string>, b: Set<string>, threshold = 0.6): boolean => {
      if (a.size === 0 || b.size === 0) return false
      let matches = 0
      for (const token of a) { if (b.has(token)) matches++ }
      return matches / Math.min(a.size, b.size) >= threshold
    }

    type OwnedByType = { ids: Set<string>; titles: Set<string>; tokenSets: Array<Set<string>> }
    const ownedByType = new Map<string, OwnedByType>()

    for (const type of ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']) {
      ownedByType.set(type, { ids: new Set(), titles: new Set(), tokenSets: [] })
    }

    for (const e of allEntries) {
      const type = e.type || 'movie'
      const bucket = ownedByType.get(type)
      if (!bucket) continue
      if (e.external_id) bucket.ids.add(e.external_id)
      if (e.appid) bucket.ids.add(String(e.appid))
      if (e.title) {
        bucket.titles.add(normalizeTitle(e.title))
        bucket.tokenSets.push(titleTokens(e.title))
      }
      if (e.title_en) {
        bucket.titles.add(normalizeTitle(e.title_en))
        bucket.tokenSets.push(titleTokens(e.title_en))
      }
    }

    for (const w of (wishlistRaw || [])) {
      const type = w.media_type || 'movie'
      const bucket = ownedByType.get(type)
      if (!bucket) continue
      if (w.external_id) bucket.ids.add(w.external_id)
      if (w.title) {
        bucket.titles.add(normalizeTitle(w.title))
        bucket.tokenSets.push(titleTokens(w.title))
      }
    }

    const isAlreadyOwned = (type: string, id: string, title: string): boolean => {
      const bucket = ownedByType.get(type)
      if (!bucket) return false
      if (bucket.ids.has(id)) return true
      const norm = normalizeTitle(title)
      if (norm && bucket.titles.has(norm)) return true
      const tokens = titleTokens(title)
      if (tokens.size >= 2) {
        for (const existing of bucket.tokenSets) {
          if (hasTokenOverlap(tokens, existing)) return true
        }
      }
      return false
    }

    const ownedIds = new Set<string>([
      ...allEntries.map(e => e.external_id).filter((x): x is string => Boolean(x)),
      ...allEntries.map(e => String(e.appid ?? '')).filter(Boolean),
      ...wishlistItems.map(w => w.external_id).filter((x): x is string => Boolean(x)),
    ])

    const tmdbToken = process.env.TMDB_API_KEY || ''
    const igdbClientId = process.env.IGDB_CLIENT_ID || ''
    const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || ''

    const ALL_MEDIA_TYPES: MediaType[] = ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']

    // Tipi per cui l'utente ha almeno 1 titolo in collezione (o wishlist)
    const allTypesInCollection = new Set<string>([
      ...allEntries.map(e => e.type),
      ...wishlistItems.map(w => w.type),
    ])

    // I tipi vengono inclusi solo se l'utente ha già contenuti di quel tipo —
    // ECCEZIONE: in modalità onboarding il profilo è vuoto per definizione,
    // quindi usiamo i tipi passati esplicitamente (o tutti e 5 come fallback)
    // boardgame è sempre incluso anche senza import BGG (consigli universali)
    const ALWAYS_INCLUDE: MediaType[] = ['boardgame']
    // Per la regen del master pool usiamo sempre tutti i tipi della collezione
    // anche se requestedType è un singolo tipo (es. 'anime') — così il pool viene
    // sempre ricalcolato completo quando scatta la regen
    const typesToFetch: MediaType[] = isOnboardingCall
      ? (onboardingTypes && onboardingTypes.length > 0 ? onboardingTypes : ALL_MEDIA_TYPES)
      : ALL_MEDIA_TYPES.filter(t => allTypesInCollection.has(t) || ALWAYS_INCLUDE.includes(t))
    // Il tipo richiesto esplicitamente viene comunque incluso
    if (requestedType !== 'all' && !typesToFetch.includes(requestedType as MediaType)) {
      typesToFetch.push(requestedType as MediaType)
    }

    // ── V6: Carica titoli mostrati nella sessione corrente (TTL: 4h) ──────────
    // NON escludiamo titoli per settimane — solo quelli mostrati nelle ultime 4 ore
    // così ogni sessione di navigazione vede facce nuove, ma il pool rimane intatto
    const sessionCutoff = new Date(Date.now() - SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString()
    const { data: sessionShownRows } = await supabase
      .from('recommendations_shown')
      .select('rec_id')
      .eq('user_id', userId)
      .gte('shown_at', sessionCutoff)

    const sessionShownIds = new Set<string>((sessionShownRows || []).map((r: any) => r.rec_id))

    // ── V6: Carica socialFavorites ────────────────────────────────────────────
    const { data: similarFriends } = await supabase
      .from('taste_similarity')
      .select('other_user_id, similarity_score')
      .eq('user_id', userId)
      .gte('similarity_score', 70)
      .order('similarity_score', { ascending: false })
      .limit(5)

    const socialFavorites = new Map<string, string>()
    if (similarFriends && similarFriends.length > 0) {
      const friendIds = similarFriends.map((f: any) => f.other_user_id)
      const { data: friendEntries } = await supabase
        .from('user_media_entries')
        .select('user_id, external_id, rating')
        .in('user_id', friendIds)
        .gte('rating', 4)

      if (friendEntries) {
        for (const fe of friendEntries) {
          if (!fe.external_id || ownedIds.has(fe.external_id)) continue
          if (!socialFavorites.has(fe.external_id)) {
            const friend = similarFriends.find((f: any) => f.other_user_id === fe.user_id)
            if (friend) socialFavorites.set(fe.external_id, `${Math.round(friend.similarity_score)}%`)
          }
        }
      }
    }

    // ── V6: Controlla se il pool esiste ed è ancora valido ───────────────────
    // Fix 1.13: TTL dinamico basato sull'attività recente
    const dynamicTTL = computePoolTTL(allEntries)
    const poolCutoff = new Date(Date.now() - dynamicTTL * 60 * 60 * 1000).toISOString()

    const { data: poolRows } = await supabase
      .from('recommendations_pool')
      .select('media_type, data, generated_at, collection_hash')
      .eq('user_id', userId)
      .in('media_type', typesToFetch)

    // Hash semplice della collezione: numero di entry + timestamp ultima modifica
    const collectionHash = `${allEntries.length}_${lastCollectionUpdate.getTime()}`

    // Conta entry per tipo — usato per hasGrown per-tipo e collection_size per-tipo
    const entriesByType = new Map<string, number>()
    for (const type of typesToFetch) {
      entriesByType.set(type, allEntries.filter((e: any) => e.type === type).length)
    }

    // ── MASTER POOL: controlla se esiste ed è ancora valido ──────────────────
    // Una riga per tipo, data = array Recommendation completi (cover, matchScore, isDiscovery inclusi)
    // Viene rigenerato solo se: troppo piccolo, età > 7gg E collezione +10 titoli, o forceRefresh
    const masterPoolCutoff = new Date(Date.now() - MASTER_POOL_MAX_AGE_DAYS * 24 * 3600 * 1000).toISOString()

    const { data: masterPoolRows } = await supabase
      .from('master_recommendations_pool')
      .select('media_type, data, collection_hash, collection_size, generated_at')
      .eq('user_id', userId)
      .in('media_type', typesToFetch)

    // Raggruppa master pool per tipo — data è già array Recommendation completo
    const masterByType = new Map<string, Recommendation[]>()
    for (const row of (masterPoolRows || [])) {
      if (Array.isArray(row.data)) masterByType.set(row.media_type, row.data as Recommendation[])
    }

    // Determina se il master pool va rigenerato
    // Il trigger è basato sul TOTALE titoli nel profilo (tutti i media combined),
    // non per singolo tipo. Il delta cresce con la dimensione del profilo.
    const totalCollectionSize = allEntries.length
    const regenDelta = computeRegenDelta(totalCollectionSize)

    // collection_size salvato nel pool — usiamo il valore del primo tipo disponibile
    // come riferimento del totale al momento dell'ultima regen
    // collection_size ora contiene il totale collezione al momento dell'ultima regen
    // quindi basta prendere il valore di una qualsiasi riga (sono tutti uguali)
    const savedTotalSize = (masterPoolRows || [])[0]?.collection_size || 0

    const totalHasGrown = totalCollectionSize - savedTotalSize >= regenDelta
    const anyTooSmall = typesToFetch.some(type => {
      const items = masterByType.get(type) || []
      const row = (masterPoolRows || []).find((r: any) => r.media_type === type)
      return !row || items.length === 0
    })
    const anyInvalidated = (masterPoolRows || []).some((r: any) => r.collection_size === -1)

    const typesNeedingMasterRegen: MediaType[] = []
    const typesToRegenBackground: MediaType[] = []

    // Se scatta la regen, rigenera SEMPRE tutti i tipi insieme
    if (forceRefresh || anyTooSmall || totalHasGrown || anyInvalidated) {
      for (const type of typesToFetch) {
        typesNeedingMasterRegen.push(type as MediaType)
      }
    }

    console.log('[RECO] typesNeedingMasterRegen:', typesNeedingMasterRegen)
    console.log('[RECO] typesToRegenBackground:', typesToRegenBackground)
    console.log('[RECO] entriesByType:', Object.fromEntries(entriesByType))
    console.log('[RECO] masterPoolRows types:', (masterPoolRows || []).map((r: any) => `${r.media_type}:${r.collection_size}`))

    // ── Rigenera master pool in background per i tipi che lo necessitano ─────
    if (typesNeedingMasterRegen.length > 0) {
      const emptyShownIds = new Set<string>()

      const continuityRecsPromise = (typesNeedingMasterRegen.includes('anime') || typesNeedingMasterRegen.includes('manga'))
        ? fetchContinuityRecs(allEntries, ownedIds, tasteProfile, supabase)
        : Promise.resolve([])

      const [continuityRecs, ...masterResults] = await Promise.all([
        continuityRecsPromise,
        ...typesNeedingMasterRegen.map(async type => {
          // Usa MASTER_POOL_SIZE_PER_TYPE slot → raccoglie molti più candidati
          const slots = buildDiversitySlots(type, tasteProfile, MASTER_POOL_SIZE_PER_TYPE)
          if (slots.length === 0) return { type, items: [] as Recommendation[] }
          switch (type) {
            case 'anime': return { type, items: await fetchAnimeRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites) }
            case 'manga': return { type, items: await fetchMangaRecs(slots, ownedIds, tasteProfile, isAlreadyOwned, emptyShownIds, socialFavorites) }
            case 'movie': return { type, items: await fetchMovieRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites, userPlatformIds) }
            case 'tv':    return { type, items: await fetchTvRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites, userPlatformIds) }
            case 'game':  return { type, items: await fetchGameRecs(slots, ownedIds, tasteProfile, igdbClientId, igdbClientSecret, isAlreadyOwned, emptyShownIds) }
            case 'boardgame': return { type, items: await fetchBoardgameRecs(slots, ownedIds, tasteProfile, isAlreadyOwned, emptyShownIds) }
            default: return { type, items: [] as Recommendation[] }
          }
        })
      ])

      // Prepend continuity recs per tipo
      const continuityByType = new Map<string, Recommendation[]>()
      for (const contRec of continuityRecs) {
        const arr = continuityByType.get(contRec.type) || []
        arr.push(contRec)
        continuityByType.set(contRec.type, arr)
      }

      // Aggiorna masterByType + salva su Supabase (upsert — una riga per tipo)
      const masterUpserts: any[] = []
      for (const result of masterResults) {
        if (!result?.type || !result.items.length) continue
        const type = result.type as MediaType

        const contRecs = continuityByType.get(type) || []
        const contIds = new Set(contRecs.map(r => r.id))
        // Nel master pool NON applicare applyFormatDiversity — serve il serbatoio più ampio possibile
        // applyFormatDiversity viene applicata solo quando si serve al client
        const allItems: Recommendation[] = [
          ...contRecs,
          ...result.items.filter(r => !contIds.has(r.id)),
        ]

        masterByType.set(type, allItems)
        console.log(`[RECO] result type=${type} items=${result.items.length} allItems=${allItems.length}`)
        masterUpserts.push({
          user_id: userId,
          media_type: type,
          data: allItems,
          collection_hash: collectionHash,
          collection_size: totalCollectionSize,
          generated_at: new Date().toISOString(),
        })
      }

      console.log('[RECO] masterResults length:', masterResults.length)
      console.log('[RECO] masterResults types:', masterResults.map(r => `${r?.type}:${r?.items?.length ?? 'null'}`))

      // Await — garantisce che il master sia scritto prima che il pool venga campionato
      if (masterUpserts.length > 0) {
        console.log('[RECO] upserting master pool:', masterUpserts.map(u => `${u.media_type}:${u.data.length}items:size${u.collection_size}`))
        const { error: upsertError, data: upsertData } = await supabase.from('master_recommendations_pool')
          .upsert(masterUpserts, { onConflict: 'user_id,media_type' })
          .select('media_type, collection_size, generated_at')
        if (upsertError) console.log('[RECO] upsert ERROR:', JSON.stringify(upsertError))
        else console.log('[RECO] upsert SUCCESS, rows written:', JSON.stringify(upsertData?.map(r => `${r.media_type}:${r.collection_size}`)))
      } else {
        console.log('[RECO] masterUpserts is EMPTY — nothing written to pool')
      }
    }

    // ── Rigenera in background i tipi ASSENTI dal master pool ────────────────
    // Questi tipi non hanno ancora nessuna riga in master_recommendations_pool.
    // Li rigeneriamo in fire-and-forget: la risposta corrente non li aspetta
    // (saranno disponibili alla prossima chiamata), ma vengono comunque generati
    // e salvati su Supabase dietro le quinte, uno per uno, per evitare timeout.
    if (typesToRegenBackground.length > 0) {
      ;(async () => {
        const emptyShownIds = new Set<string>()
        const continuityRecsForBg = (typesToRegenBackground.includes('anime') || typesToRegenBackground.includes('manga'))
          ? await fetchContinuityRecs(allEntries, ownedIds, tasteProfile, supabase).catch(() => [])
          : []
        const continuityByTypeBg = new Map<string, Recommendation[]>()
        for (const contRec of continuityRecsForBg) {
          const arr = continuityByTypeBg.get(contRec.type) || []
          arr.push(contRec)
          continuityByTypeBg.set(contRec.type, arr)
        }
        for (const type of typesToRegenBackground) {
          try {
            const slots = buildDiversitySlots(type, tasteProfile, MASTER_POOL_SIZE_PER_TYPE)
            if (slots.length === 0) continue
            let items: Recommendation[] = []
            switch (type) {
              case 'anime': items = await fetchAnimeRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites); break
              case 'manga': items = await fetchMangaRecs(slots, ownedIds, tasteProfile, isAlreadyOwned, emptyShownIds, socialFavorites); break
              case 'movie': items = await fetchMovieRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites, userPlatformIds); break
              case 'tv':    items = await fetchTvRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites, userPlatformIds); break
              case 'game':  items = await fetchGameRecs(slots, ownedIds, tasteProfile, igdbClientId, igdbClientSecret, isAlreadyOwned, emptyShownIds); break
              case 'boardgame': items = await fetchBoardgameRecs(slots, ownedIds, tasteProfile, isAlreadyOwned, emptyShownIds); break
            }
            if (!items.length) continue
            const contRecs = continuityByTypeBg.get(type) || []
            const contIds = new Set(contRecs.map(r => r.id))
            const allItems = applyFormatDiversity([
              ...contRecs,
              ...items.filter(r => !contIds.has(r.id)),
            ], type)
            await supabase.from('master_recommendations_pool').upsert({
              user_id: userId,
              media_type: type,
              data: allItems,
              collection_hash: collectionHash,
              collection_size: totalCollectionSize,
              generated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,media_type' })
          } catch { /* ignora errori singoli tipi — non blocca gli altri */ }
        }
      })()
    }

    // ── Campiona dal master pool → recommendations_pool ─────────────────────
    // Il pool NON genera nulla di proprio: pesca sempre e solo SERVE_SIZE_PER_TYPE
    // titoli casuali dal master pool. Se il master non esiste per un tipo → vuoto.
    // Ogni chiamata dà un campione diverso grazie allo shuffle casuale.

    const poolByType = new Map<string, Recommendation[]>()
    const poolUpserts: any[] = []

    for (const type of typesToFetch) {
      const masterItems = masterByType.get(type) || []
      if (masterItems.length === 0) {
        // Master non ancora generato per questo tipo — non inventiamo nulla
        poolByType.set(type, [])
        continue
      }
      // Filtra già posseduti (potrebbero essere stati aggiunti dopo la generazione del master)
      const available = masterItems.filter(r => !isAlreadyOwned(r.type, r.id, r.title))
      // Shuffle casuale — ogni chiamata dà un campione diverso
      const shuffled = [...available].sort(() => Math.random() - 0.5)
      // Pesca esattamente SERVE_SIZE_PER_TYPE titoli — niente di più
      const poolItems = shuffled.slice(0, SERVE_SIZE_PER_TYPE)

      poolByType.set(type, poolItems)
      poolUpserts.push({
        user_id: userId,
        media_type: type,
        data: poolItems,
        generated_at: new Date().toISOString(),
        collection_hash: collectionHash,
        total_entries: allEntries.length,
      })
    }

    if (poolUpserts.length > 0) {
      console.log('[RECO] upserting recommendations_pool:', poolUpserts.map(u => `${u.media_type}:${u.data.length}items`))
      const { error: poolUpsertError } = await supabase.from('recommendations_pool').upsert(poolUpserts, { onConflict: 'user_id,media_type' })
      if (poolUpsertError) console.log('[RECO] recommendations_pool upsert ERROR:', JSON.stringify(poolUpsertError))
      else console.log('[RECO] recommendations_pool upsert SUCCESS')
    }

    // Salva creator profile aggiornato (fire-and-forget)
    ;(async () => {
      const topStudios = Object.entries(tasteProfile.creatorScores.studios).sort(([,a],[,b]) => b - a).slice(0, 30)
      const topDirectors = Object.entries(tasteProfile.creatorScores.directors).sort(([,a],[,b]) => b - a).slice(0, 30)
      await supabase.from('user_creator_profile').upsert({
        user_id: userId,
        studios: Object.fromEntries(topStudios),
        directors: Object.fromEntries(topDirectors),
        authors: Object.fromEntries(Object.entries(tasteProfile.creatorScores.authors).sort(([,a],[,b]) => b - a).slice(0, 20)),
        developers: Object.fromEntries(Object.entries(tasteProfile.creatorScores.developers).sort(([,a],[,b]) => b - a).slice(0, 20)),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
    })()

    // ── Serve dal pool — i 15 titoli sono già stati campionati dal master qui sopra
    // Il pool contiene esattamente SERVE_SIZE_PER_TYPE titoli casuali dal master.
    // Li serviamo direttamente senza ulteriori manipolazioni.
    const recommendations: Record<string, Recommendation[]> = {}
    for (const type of typesToFetch) {
      recommendations[type] = poolByType.get(type) || []
    }

    // ── V6: Registra i titoli mostrati (sessione corrente) ────────────────────
    const shownInserts = Object.entries(recommendations).flatMap(([type, recs]) =>
      recs.map(r => ({
        user_id: userId,
        rec_id: r.id,
        rec_type: type,
        shown_at: new Date().toISOString(),
        action: null,
      }))
    )
    if (shownInserts.length > 0) {
      await supabase.from('recommendations_shown').upsert(shownInserts, {
        onConflict: 'user_id,rec_id',
        ignoreDuplicates: true,
      })
    }

    // ── Popola in-memory cache ────────────────────────────────────────────────
    const topStudiosForResponse = Object.entries(tasteProfile.creatorScores.studios).sort(([,a],[,b]) => b - a).slice(0, 5)
    const topDirectorsForResponse = Object.entries(tasteProfile.creatorScores.directors).sort(([,a],[,b]) => b - a).slice(0, 5)

    const tasteProfileResponse = {
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
      creatorScores: {
        topStudios: topStudiosForResponse.map(([name, score]) => ({ name, score })),
        topDirectors: topDirectorsForResponse.map(([name, score]) => ({ name, score })),
      },
      bingeProfile: tasteProfile.bingeProfile,
      wishlistGenres: tasteProfile.wishlistGenres,
      searchIntentGenres: tasteProfile.searchIntentGenres,
    }
    memCacheSet(userId, recommendations, tasteProfile)

    // Aggiorna solo taste_profile e total_entries nel pool (fast path) — NON sovrascrive data
    // I dati del pool (i 15 titoli) sono già stati scritti sopra dal campionamento master
    const profileUpdateUpserts = Object.keys(recommendations)
      .filter(type => (poolByType.get(type as MediaType) || []).length > 0)
      .map(type => ({
        user_id: userId,
        media_type: type,
        data: poolByType.get(type as MediaType) || [],
        generated_at: new Date().toISOString(),
        collection_hash: collectionHash,
        taste_profile: tasteProfileResponse,
        total_entries: allEntries.length,
      }))
    if (profileUpdateUpserts.length > 0) {
      supabase.from('recommendations_pool').upsert(profileUpdateUpserts, {
        onConflict: 'user_id,media_type',
      }).then(() => {})
    }

    return NextResponse.json({
      recommendations,
      tasteProfile: {
        ...tasteProfileResponse,
        lowConfidence: tasteProfile.lowConfidence,
        totalEntries: allEntries.length,
      },
      cached: false,
    })

  } catch (error) {
    logger.error('Recommendations V6', error)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}

// POST /api/recommendations?invalidateCache=true
// Chiamato dal client dopo aver aggiunto un titolo — svuota la memCache
// così la prossima apertura di Per Te triggera una regen fresca
export async function POST(request: NextRequest) {
  try {
    const invalidateCache = request.nextUrl.searchParams.get('invalidateCache')
    if (invalidateCache !== 'true') return NextResponse.json({ ok: false }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    memCacheInvalidate(user.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}