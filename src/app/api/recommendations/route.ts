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

// ── In-memory cache (server-side, per worker process) ────────────────────────
// Evita round-trip Supabase per utenti che navigano frequentemente sulla pagina.
// TTL: 10 minuti. Al restart del processo il cache si svuota (OK per Vercel).
interface MemCacheEntry {
  data: Record<string, any[]>
  tasteProfile: any
  expiresAt: number
}
const MEM_CACHE = new Map<string, MemCacheEntry>()
const MEM_CACHE_TTL_MS = 10 * 60 * 1000 // 10 min

function memCacheGet(userId: string): MemCacheEntry | null {
  const entry = MEM_CACHE.get(userId)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) { MEM_CACHE.delete(userId); return null }
  return entry
}

function memCacheSet(userId: string, data: Record<string, any[]>, tasteProfile: any) {
  // Evita memory leak: max 500 entries in cache
  if (MEM_CACHE.size >= 500) {
    const first = MEM_CACHE.keys().next().value
    if (first) MEM_CACHE.delete(first)
  }
  MEM_CACHE.set(userId, { data, tasteProfile, expiresAt: Date.now() + MEM_CACHE_TTL_MS })
}

function memCacheInvalidate(userId: string) {
  MEM_CACHE.delete(userId)
}

// ── Tipi ────────────────────────────────────────────────────────────────────

type MediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game' | 'boardgame'

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
  // V4
  lowConfidence: boolean
  nicheUser: boolean
  // V5
  runtimePreference: RuntimeRange
  languagePreference: { preferNonEnglish: boolean; onlyAnime: boolean }
  qualityThresholds: ReturnType<typeof getQualityThresholds>
}

interface Recommendation {
  id: string
  title: string
  type: MediaType
  coverImage?: string
  year?: number
  genres: string[]
  tags?: string[]
  keywords?: string[]
  recStudios?: string[]
  score?: number
  description?: string
  why: string
  matchScore: number
  isDiscovery?: boolean
  isContinuity?: boolean   // V3: sequel/prequel/spinoff
  continuityFrom?: string  // V3: titolo originale
  creatorBoost?: string    // V3: studio/regista che ha generato il boost
  // V4
  isSerendipity?: boolean  // jolly fuori profilo
  isAwardWinner?: boolean  // acclamato dalla critica
  isSeasonal?: boolean     // anime in corso questa stagione
  // V5
  socialBoost?: string     // amico con gusti simili che ha amato questo
}

// ── Mappe generi ─────────────────────────────────────────────────────────────



// ── V4: stagione corrente anime (date range per TMDB discover) ────────────────
function getCurrentAnimeSeasonDates(): { from: string; to: string; label: string } {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const [startMonth, endMonth, label] =
    month <= 3  ? [1, 3,   'Inverno'] :
    month <= 6  ? [4, 6,   'Primavera'] :
    month <= 9  ? [7, 9,   'Estate'] :
                  [10, 12, 'Autunno']
  const endDay = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][endMonth]
  return {
    from: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    to:   `${year}-${String(endMonth).padStart(2, '0')}-${endDay}`,
    label: `${label} ${year}`,
  }
}

// ── V4: Quality Gate — score minimo dinamico ──────────────────────────────────
function getQualityThresholds(nicheUser: boolean) {
  return {
    tmdbVoteAvg: nicheUser ? 5.5 : 6.0,
    tmdbVoteCount: 80,
    anilistScore: nicheUser ? 50 : 55,
    anilistPopularity: nicheUser ? 300 : 500,
    igdbRating: nicheUser ? 55 : 60,
    igdbRatingCount: 30,
  }
}

// ── V4: Release Freshness multiplier ─────────────────────────────────────────
function releaseFreshnessMult(year: number | undefined, communityScore?: number, communityPop?: number): number {
  if (!year) return 1.0
  const age = new Date().getFullYear() - year
  const isClassic = (communityScore && communityScore > 85) || (communityPop && communityPop > 100000)
  if (isClassic) return 1.0
  if (age <= 2) return 1.3
  if (age <= 5) return 1.1
  if (age <= 10) return 1.0
  return Math.max(0.7, 0.85 - (age - 10) * 0.01)
}

// ── V4: Award boost ───────────────────────────────────────────────────────────
function isAwardWorthy(score: number | undefined, popularity: number | undefined, voteCount: number | undefined, scoreType: 'tmdb' | 'anilist' | 'igdb'): boolean {
  if (scoreType === 'tmdb') return (score || 0) >= 8.0 && (voteCount || 0) >= 1000
  if (scoreType === 'anilist') return (score || 0) >= 85 && (popularity || 0) >= 50000
  if (scoreType === 'igdb') return (score || 0) >= 85 && (voteCount || 0) >= 500
  return false
}

// ── V5: Runtime preference inference ─────────────────────────────────────────
type RuntimeRange = 'short' | 'standard' | 'long' | null

function inferRuntimePreference(entries: any[]): RuntimeRange {
  const movies = entries.filter(e => e.type === 'movie' && e.runtime && e.status !== 'dropped')
  if (movies.length >= 3) {
    const avg = movies.reduce((s: number, e: any) => s + (e.runtime || 0), 0) / movies.length
    if (avg < 90) return 'short'
    if (avg <= 130) return 'standard'
    return 'long'
  }

  // Fix 1.8: fallback su serie TV — usa episode_run_time
  const tvSeries = entries.filter(e => e.type === 'tv' && e.episode_run_time && e.status !== 'dropped')
  if (tvSeries.length >= 3) {
    const avgEp = tvSeries.reduce((s: number, e: any) => s + (e.episode_run_time || 0), 0) / tvSeries.length
    // Episodi corti (< 30min) → preferisce film corti; episodi lunghi (> 50min) → preferisce film standard/lunghi
    if (avgEp < 30) return 'short'
    if (avgEp <= 50) return 'standard'
    return 'long'
  }

  // Fix 1.8: fallback su anime — episodi standard 24min (short) vs 48min+ (standard/long)
  const anime = entries.filter(e => e.type === 'anime' && e.episode_run_time && e.status !== 'dropped')
  if (anime.length >= 5) {
    const avgAnimeEp = anime.reduce((s: number, e: any) => s + (e.episode_run_time || 0), 0) / anime.length
    return avgAnimeEp < 30 ? 'short' : 'standard'
  }

  return null
}

function runtimePenalty(runtime: number | undefined, pref: RuntimeRange): number {
  if (!runtime || !pref) return 1.0
  if (pref === 'short' && runtime > 130) return 0.80
  if (pref === 'long' && runtime < 90) return 0.80
  if (pref === 'standard' && (runtime < 80 || runtime > 150)) return 0.85
  return 1.0
}

// ── V5: Lingua/Origine preference ────────────────────────────────────────────
function inferLanguagePreference(entries: any[]): { preferNonEnglish: boolean; onlyAnime: boolean } {
  const withLang = entries.filter(e => e.original_language)
  const nonEnglishCount = withLang.filter(e => e.original_language !== 'en').length
  const animeCount = entries.filter(e => e.type === 'anime' || e.type === 'manga').length
  const totalMedia = entries.filter(e => e.type === 'movie' || e.type === 'tv').length
  return {
    preferNonEnglish: withLang.length > 5 && nonEnglishCount / withLang.length > 0.8,
    onlyAnime: animeCount > 5 && totalMedia < 2,
  }
}

// ── V5: Format Diversity — applica max 2 consecutivi dello stesso sotto-genere
function applyFormatDiversity(recs: any[], type?: string, maxPerSubGenre = 4): any[] {
  // Per i giochi non applicare: hanno già pochissimi candidati e generi IGDB sovrapposti
  if (type === 'game') return recs

  const result: any[] = []
  const subGenreCount: Record<string, number> = {}
  for (const rec of recs) {
    // Usa il primo genere come chiave (più stabile del secondo)
    const subGenre = rec.genres?.[0] || 'unknown'
    subGenreCount[subGenre] = (subGenreCount[subGenre] || 0) + 1
    // Max 4 per sotto-genere in tutta la sezione (non consecutivo)
    if (subGenreCount[subGenre] <= maxPerSubGenre) {
      result.push(rec)
    }
  }
  return result
}

// ── Mappa generi cross-media → generi IGDB reali ─────────────────────────────
// IGDB accetta solo questi come genres.name. Generi come "Fantasy", "Drama",
// "Horror" non esistono come generi IGDB — esistono come themes.
// Questa mappa traduce il profilo utente (basato su anime/film) in generi IGDB validi.
// Fix 1.11: CROSS_TO_IGDB_GENRE affinato — mappings più precisi, rimossi mapping vaghi
// Psychological → Visual Novel era troppo vago; Drama → solo RPG narrativi; Horror via themes
const CROSS_TO_IGDB_GENRE: Record<string, string[]> = {
  'Action':           ['Action', "Hack and slash/Beat 'em up", 'Fighting', 'Shooter'],
  'Adventure':        ['Adventure', 'Role-playing (RPG)', 'Point-and-click'],
  'Fantasy':          ['Role-playing (RPG)', 'Adventure'],
  'Science Fiction':  ['Shooter', 'Strategy', 'Role-playing (RPG)'],
  'Horror':           ['Adventure'],        // Horror è theme IGDB (19), non genere — gestito via igdbThemeIds
  'Mystery':          ['Adventure', 'Puzzle', 'Point-and-click'],
  'Drama':            ['Role-playing (RPG)', 'Visual Novel'],  // Drama narrativo → RPG/VN
  'Romance':          ['Visual Novel'],   // Romance → solo VN, non Adventure generica
  'Comedy':           ['Platform', 'Arcade'],  // Comedy → platformer/arcade, non Adventure
  'Thriller':         ['Action', 'Shooter'],   // Thriller → azione tesa, non solo Shooter
  'Psychological':    ['Role-playing (RPG)', 'Puzzle'],  // Psych → RPG narrativi o puzzle
  'Supernatural':     ['Role-playing (RPG)', 'Adventure'],
  'Slice of Life':    ['Simulation'],  // Slice of Life → solo Sim (staccato da Visual Novel)
  'Sports':           ['Sport', 'Racing'],
  'Sci-Fi':           ['Shooter', 'Strategy', 'Role-playing (RPG)'],
  'Mecha':            ['Action', 'Shooter'],
  'Strategy':         ['Strategy', 'Real Time Strategy (RTS)', 'Turn-based strategy (TBS)', 'Tactical'],
  'Simulation':       ['Simulation'],
  'Crime':            ['Action', 'Adventure'],  // Crime → avventura noir o action
  'Survival':         ['Adventure', 'Action'],
  'Role-playing (RPG)': ['Role-playing (RPG)'],
  'Shooter':          ['Shooter'],
  'Platform':         ['Platform'],
  'Puzzle':           ['Puzzle'],
  'Indie':            ['Indie'],
  'Sandbox':          ['Simulation', 'Adventure'],
  'Fighting':         ['Fighting', "Hack and slash/Beat 'em up"],
}

// Fix 1.11: themes IGDB da usare in query per generi che sono themes, non generi
// Horror=19, Thriller=20, Drama=31, SF=18, Fantasy=17
const CROSS_TO_IGDB_THEME: Record<string, number[]> = {
  'Horror':        [19],
  'Thriller':      [20],
  'Drama':         [31],
  'Science Fiction': [18],
  'Sci-Fi':        [18],
  'Fantasy':       [17],
  'Psychological': [31, 20],  // Drama + Thriller come proxy psicologico
}

// Generi IGDB validi (whitelist definitiva)
const IGDB_VALID_GENRES = new Set([
  'Action', 'Adventure', 'Role-playing (RPG)', 'Shooter', 'Strategy',
  'Simulation', 'Puzzle', 'Racing', 'Sport', 'Fighting', 'Platform',
  "Hack and slash/Beat 'em up", 'Real Time Strategy (RTS)', 'Turn-based strategy (TBS)',
  'Tactical', 'Visual Novel', 'Card & Board Game', 'Massively Multiplayer Online (MMO)',
  'Battle Royale', 'Indie', 'Arcade', 'Music', 'Point-and-click',
])

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

// Cross-genre da categorie BGG verso generi universali
const BGG_TO_CROSS_GENRE: Record<string, string[]> = {
  'Fantasy': ['Fantasy', 'Adventure', 'Drama'],
  'Science Fiction': ['Science Fiction', 'Thriller', 'Action'],
  'Horror': ['Horror', 'Thriller', 'Mystery'],
  'Adventure': ['Adventure', 'Action', 'Fantasy'],
  'Mystery': ['Mystery', 'Thriller', 'Crime'],
  'Thriller': ['Thriller', 'Mystery', 'Crime'],
  'War': ['Action', 'Drama', 'History'],
  'Strategy': ['Strategy', 'Psychological'],
  'Abstract': ['Strategy', 'Psychological'],
  'Cooperative': ['Adventure', 'Strategy'],
  'Medieval': ['Fantasy', 'Action', 'History'],
  'History': ['Drama', 'Action', 'History'],
  'Political': ['Drama', 'Thriller'],
  'Comedy': ['Comedy', 'Family'],
  'Family': ['Comedy', 'Adventure'],
  'Card Game': ['Strategy'],
  'Dice': ['Strategy'],
  'Party': ['Comedy', 'Family'],
  'Sports': ['Sports', 'Action'],
  'Nature': ['Adventure', 'Drama'],
}

const GENRE_TO_BGG_TERMS: Record<string, string> = {
  'Fantasy': 'fantasy', 'Science Fiction': 'science fiction', 'Sci-Fi': 'science fiction',
  'Horror': 'horror', 'Adventure': 'adventure', 'Mystery': 'mystery',
  'Thriller': 'thriller', 'War': 'wargame', 'History': 'historical',
  'Crime': 'crime', 'Comedy': 'humor', 'Action': 'action',
  'Drama': 'storytelling', 'Psychological': 'psychology',
}

const BGG_CAT_TO_GENRE_REC: Record<string, string> = {
  'Fantasy': 'Fantasy', 'Science Fiction': 'Science Fiction', 'Horror': 'Horror',
  'Adventure': 'Adventure', 'Mystery': 'Mystery', 'Thriller': 'Thriller',
  'Wargame': 'War', 'Historical': 'History', 'Humor': 'Comedy',
  'Deduction': 'Mystery', 'Murder/Mystery': 'Mystery', 'Medieval': 'Fantasy',
  'Zombies': 'Horror', 'Ancient': 'History', 'Civilization': 'History',
  'Exploration': 'Adventure', 'Space Exploration': 'Science Fiction',
}

function parseBggXmlRec(xml: string) {
  const decode = (s: string) =>
    s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
     .replace(/&#10;/g, '\n').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
     .replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"')
     .replace(/&lsquo;/g, "'").replace(/&rsquo;/g, "'")
     .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
     .replace(/&hellip;/g, '…').replace(/&nbsp;/g, ' ')
     .replace(/&#\d+;/g, '').trim()
  return [...xml.matchAll(/<item[^>]+id="(\d+)"[^>]*>([\s\S]*?)<\/item>/g)].flatMap(([, id, body]) => {
    const name = body.match(/<name[^>]+type="primary"[^>]+value="([^"]+)"/)?.[1]
    if (!name) return []
    const rawImg = body.match(/<image>([\s\S]*?)<\/image>/)?.[1]?.trim()
    const rawThumb = body.match(/<thumbnail>([\s\S]*?)<\/thumbnail>/)?.[1]?.trim()
    const rawCover = rawImg || rawThumb
    return [{
      id, name: decode(name),
      year: parseInt(body.match(/<yearpublished[^>]+value="(\d+)"/)?.[1] || '') || undefined,
      thumbnail: rawCover ? (rawCover.startsWith('//') ? `https:${rawCover}` : rawCover) : undefined,
      description: decode((body.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '').replace(/<[^>]*>/g, '').slice(0, 400)),
      categories: [...body.matchAll(/<link type="boardgamecategory"[^>]+value="([^"]+)"/g)].map(m => m[1]),
      mechanics:  [...body.matchAll(/<link type="boardgamemechanic"[^>]+value="([^"]+)"/g)].map(m => m[1]),
      rating:    parseFloat(body.match(/<average[^>]+value="([0-9.]+)"/)?.[1] || '') || undefined,
      usersRated: parseInt(body.match(/<usersrated[^>]+value="(\d+)"/)?.[1] || '') || undefined,
    }]
  })
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
// Fix 1.4: cluster velocity per film — ≥3 film dello stesso genere in 7gg → boost ×1.8
function computeClusterVelocity(entries: any[], targetGenres: string[], currentUpdatedAt: string | null): number {
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

function computeVelocity(entry: any): number {
  const type = entry.type || ''

  // Film: singola visione, velocità non applicabile
  if (type === 'movie') return 1.0

  // Boardgame: usa numero di partite come proxy di engagement
  if (type === 'boardgame') {
    const plays = entry.current_episode || 0
    if (plays >= 10) return 2.0
    if (plays >= 5) return 1.5
    if (plays >= 2) return 1.2
    return 1.0
  }

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
  if (rating >= 2.5) return 0.3   // leggermente negativo ma non ignorato
  if (rating >= 1.5) return 0.0   // non contribuisce al profilo positivo
  if (rating >= 1.0) return 0.0
  return 1.0  // nessun rating = neutro
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

  if (type === 'boardgame') {
    // Per i boardgame current_episode = numero di partite giocate
    if (status === 'dropped') return 0.1
    if (current >= 10) return 1.6
    if (current >= 5) return 1.3
    if (current >= 2) return 1.0
    if (current >= 1) return 0.8
    // Nessuna partita registrata ma in collezione: peso base
    return 0.6
  }

  if (type === 'movie') {
    if (status === 'dropped') return 0.15
    if (status === 'completed') return 1.5
    return 0.8
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
  const type = entry.type || ''
  const current = entry.current_episode || 0
  const total = entry.episodes || 0

  // Film e boardgame non hanno episodi — la completion rate non è rilevante
  if (type === 'movie' || type === 'boardgame') {
    return (status === 'dropped') || (rating > 0 && rating <= 2.5)
  }

  const completionRate = total > 0 ? current / total : 1
  return (
    (status === 'dropped' && completionRate < 0.3) ||
    (rating > 0 && rating <= 2.5)
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
  const minCount = (type === 'game' || type === 'boardgame') ? 2 : 3
  const windows = (type === 'game' || type === 'boardgame')
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
// Fix 3.5: normalizza nomi studio per unificare cross-source (AniList vs TMDb)
// Es. "Production I.G" e "Production I.G." diventano la stessa chiave
function normalizeStudioKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

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
  genreToTitles: Record<string, any[]>,
  searchIntentGenreSet?: Set<string>  // Fix 1.5: wishlist intent score
): string[] {
  const wishlistGenres: string[] = []

  for (const item of wishlistItems) {
    const genres: string[] = item.genres || []
    const type = item.media_type || 'unknown'

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

    // Fix 1.6: time-of-day boost — ricerche serali/notturne indicano intent immediato
    const searchHour = new Date(s.created_at).getHours()
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
    } else if (type === 'movie' || type === 'boardgame') {
      // Film e boardgame non hanno episodi — il peso si basa su rating e status
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
      } else {
        addScore(genre, weight, type, title, recency, rating, velocity)
      }
    }

    // Cross-media per boardgame (peso ridotto: segnale indiretto)
    if (type === 'boardgame' && !isNegative) {
      for (const genre of genres) {
        const crossGenres = BGG_TO_CROSS_GENRE[genre] || []
        for (const cg of crossGenres) {
          if (!genres.includes(cg)) addScore(cg, weight * 0.25, type, title, recency, rating)
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

  // V3: Creator scores
  const creatorScores = computeCreatorScores(entries, preferences)

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
      ...(preferences.fav_boardgame_genres || []),
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
  if (type === 'boardgame') {
    const sourceGenres = tasteProfile.topGenres.boardgame?.map(g => g.genre).filter(g => GENRE_TO_BGG_TERMS[g]) || []
    const fallback = tasteProfile.globalGenres.map(g => g.genre).filter(g => GENRE_TO_BGG_TERMS[g])
    const genres = (sourceGenres.length >= 2 ? sourceGenres : fallback).slice(0, 4)
    if (genres.length === 0) return [
      { genre: 'Fantasy', quota: 5, isDiscovery: false },
      { genre: 'Adventure', quota: 5, isDiscovery: false },
    ]
    return genres.map((g, i) => ({ genre: g, quota: Math.ceil(totalSlots / genres.length), isDiscovery: i >= 2 }))
  }

  const typeGenres = tasteProfile.topGenres[type]?.map(g => g.genre) || []
  const fallbackGenres = tasteProfile.globalGenres.map(g => g.genre)
  const sourceGenres = typeGenres.length >= 2 ? typeGenres : fallbackGenres

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

  for (const slot of slots) {
    const genreId = TMDB_TV_GENRE_MAP[slot.genre]
    // Always include genre 16 (Animation); add mapped genre if available
    const animeGenreIds = [...new Set([16, genreId].filter(Boolean) as number[])]

    try {
      const params = new URLSearchParams({
        with_original_language: 'ja',
        with_genres: animeGenreIds.join(','),
        sort_by: 'vote_average.desc',
        'vote_average.gte': String(qt.tmdbVoteAvg),
        'vote_count.gte': '100',
        language: 'it-IT',
      })
      const res = await fetch(`${TMDB_BASE_ANIME}/discover/tv?${params}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const json = await res.json()
      const media: any[] = json.results || []

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
        .slice(0, slot.quota + 5)

      for (const { m, matchScore, recGenres, mTags, mStudios, mDirectors, socialFriend, year, trendingBoost, creatorBoost } of candidates.slice(0, slot.quota)) {
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
          description: m.overview ? m.overview.slice(0, 300) : undefined,
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

    const query = `
      query($genres: [String], $minScore: Int, $minPop: Int) {
        Page(page: 1, perPage: 60) {
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
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { genres: [genre], minScore: qt.anilistScore, minPop: qt.anilistPopularity } }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const json = await res.json()
      const media = json.data?.Page?.media || []

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
          description: m.description ? m.description.replace(/<[^>]+>/g, '').slice(0, 300) : undefined,
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
        })
      }
    } catch { /* continua */ }
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

      const res = await fetch(
        `https://api.themoviedb.org/3/discover/movie?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=80&vote_average.gte=${voteAvgMin}&language=it-IT&page=1`,
        { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const json = await res.json()
      const candidates = (json.results || [])
        .filter((m: any) => {
          const title = m.title || m.original_title || ''
          return !isAlreadyOwned('movie', m.id.toString(), title) && m.poster_path && !seen.has(m.id.toString())
        })
        .slice(0, 20)

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
          description: m.overview ? m.overview.slice(0, 300) : undefined,
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
      const res = await fetch(
        `https://api.themoviedb.org/3/discover/tv?with_genres=${genreId}&sort_by=vote_average.desc&vote_count.gte=200&vote_average.gte=${voteAvgMin}&popularity.gte=15&language=it-IT&page=1`,
        { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const json = await res.json()
      const candidates = (json.results || [])
        .filter((m: any) => {
          const title = m.name || m.original_name || ''
          return !isAlreadyOwned('tv', m.id.toString(), title) && m.poster_path && !seen.has(m.id.toString())
        })
        .slice(0, 20)

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
          description: m.overview ? m.overview.slice(0, 300) : undefined,
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
               involved_companies.company.name, involved_companies.developer;
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
          description: g.summary ? g.summary.slice(0, 300) : undefined,
          why: buildWhyV3(recGenres, recId, g.name, tasteProfile, matchScore, slot.isDiscovery, {
            recDeveloper: developer, creatorBoost
          }),
          matchScore: finalScore,
          isDiscovery: slot.isDiscovery,
          creatorBoost,
          isAwardWinner: isAwardWorthy(g.rating, undefined, g.rating_count, 'igdb'),
        })
      }
    } catch { /* continua */ }
  }

  const gameDescItems = results
    .filter(r => r.description)
    .map(r => ({ id: `igdb:${r.id}`, text: r.description! }))
  if (gameDescItems.length > 0) {
    const t = await translateWithCache(gameDescItems)
    results.forEach(r => { if (r.description) r.description = t[`igdb:${r.id}`] || r.description })
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

// BGG category names → cross-media genre (per filtrare i risultati)
const GENRE_TO_BGG_CATS: Record<string, string[]> = {
  'Fantasy':         ['Fantasy', 'Medieval', 'Mythology', 'Adventure'],
  'Science Fiction': ['Science Fiction', 'Space Exploration'],
  'Sci-Fi':          ['Science Fiction', 'Space Exploration'],
  'Horror':          ['Horror', 'Zombies', 'Halloween'],
  'Adventure':       ['Adventure', 'Exploration', 'Puzzle'],
  'Mystery':         ['Mystery', 'Deduction', 'Murder/Mystery'],
  'Thriller':        ['Espionage', 'Deduction', 'Murder/Mystery'],
  'War':             ['Wargame', 'World War II', 'Napoleonic', 'American Civil War'],
  'History':         ['Historical', 'Ancient', 'Civilization', 'Renaissance', 'Medieval'],
  'Comedy':          ['Humor', 'Party Game'],
  'Drama':           ['Economic', 'Political', 'Negotiation'],
  'Psychological':   ['Deduction', 'Bluffing', 'Murder/Mystery'],
  'Action':          ['Adventure', 'Fighting', 'Action / Dexterity'],
  'Crime':           ['Deduction', 'Murder/Mystery', 'Espionage'],
  'Supernatural':    ['Horror', 'Fantasy', 'Mythology'],
  'Strategy':        ['Economic', 'City Building', 'Territory Building'],
}

// IDs di fallback per genere (usati se CSV non disponibile)
const BGG_GENRE_SEEDS: Record<string, number[]> = {
  'Fantasy':         [174430, 162886, 96848, 146021, 205637, 150376, 10547, 257499],
  'Science Fiction': [233078, 167791, 39463, 220308, 246900, 161936, 169786],
  'Sci-Fi':          [233078, 167791, 39463, 220308],
  'Horror':          [146021, 150376, 10547, 205637, 113924, 205059, 257499],
  'Adventure':       [30549, 121921, 174430, 161936, 150376, 282524],
  'Mystery':         [148228, 181304, 178900, 1294, 156129],
  'Thriller':        [12333, 148228, 181304, 150376],
  'War':             [12333, 115746, 10630, 187645],
  'History':         [68448, 182028, 31260, 224517, 9209, 136, 193738],
  'Strategy':        [13, 3076, 31260, 266192, 183394, 36218, 822, 9209, 2651, 230802, 68448, 173346, 167791, 169786, 193738, 220308, 199792, 295947],
  'Comedy':          [178900, 39856, 163412, 129622],
  'Crime':           [148228, 1294, 181304, 178900],
  'Drama':           [3076, 31260, 224517, 183394, 182028],
  'Psychological':   [148228, 181304, 12333, 150376],
  'Supernatural':    [146021, 10547, 113924, 181304, 205637],
  'Action':          [174430, 113924, 30549, 164153, 187645],
}

// Mapping genere → colonne CSV BGG per selezione candidati
const GENRE_TO_BGG_RANK_LISTS: Record<string, ('thematic' | 'strategy' | 'wargames' | 'family' | 'party')[]> = {
  'Fantasy':         ['thematic'],
  'Science Fiction': ['thematic', 'strategy'],
  'Sci-Fi':          ['thematic', 'strategy'],
  'Horror':          ['thematic'],
  'Adventure':       ['thematic'],
  'Mystery':         ['thematic', 'family'],
  'Thriller':        ['thematic'],
  'War':             ['wargames'],
  'History':         ['wargames', 'strategy'],
  'Strategy':        ['strategy'],
  'Drama':           ['strategy'],
  'Comedy':          ['party', 'family'],
  'Psychological':   ['thematic'],
  'Crime':           ['thematic'],
  'Supernatural':    ['thematic'],
  'Action':          ['thematic'],
}

// Cache del CSV BGG (persiste tra invocazioni warm serverless)
interface BggRankRow { id: number; rank: number; bayesaverage: number; usersrated: number; thematic_rank: number | null; strategy_rank: number | null; wargames_rank: number | null; family_rank: number | null; party_rank: number | null }
const BGG_CSV_CACHE: { thematic: number[]; strategy: number[]; wargames: number[]; family: number[]; party: number[]; overall: number[]; cachedAt: number } = { thematic: [], strategy: [], wargames: [], family: [], party: [], overall: [], cachedAt: 0 }

function parseBggRanksCsv(csv: string): void {
  const rows: BggRankRow[] = []
  const lines = csv.split('\n')
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const parts: string[] = []
    let cur = '', inQ = false
    for (const c of line) {
      if (c === '"') { inQ = !inQ }
      else if (c === ',' && !inQ) { parts.push(cur); cur = '' }
      else cur += c
    }
    parts.push(cur)
    if (parts.length < 9) continue
    const id = parseInt(parts[0])
    if (isNaN(id)) continue
    if (parts[7] === '1') continue  // skip expansions
    const usersrated = parseInt(parts[6]) || 0
    const bayesaverage = parseFloat(parts[4]) || 0
    if (usersrated < 200 || bayesaverage < 6.0) continue
    rows.push({
      id, rank: parseInt(parts[3]) || 999999, bayesaverage, usersrated,
      thematic_rank:  parts[14] ? parseInt(parts[14]) : null,
      strategy_rank:  parts[13] ? parseInt(parts[13]) : null,
      wargames_rank:  parts[15] ? parseInt(parts[15]) : null,
      family_rank:    parts[11] ? parseInt(parts[11]) : null,
      party_rank:     parts[12] ? parseInt(parts[12]) : null,
    })
  }
  const sortBy = (field: keyof BggRankRow) =>
    rows.filter(r => r[field] !== null).sort((a, b) => (a[field] as number) - (b[field] as number)).map(r => r.id)
  BGG_CSV_CACHE.thematic  = sortBy('thematic_rank')
  BGG_CSV_CACHE.strategy  = sortBy('strategy_rank')
  BGG_CSV_CACHE.wargames  = sortBy('wargames_rank')
  BGG_CSV_CACHE.family    = sortBy('family_rank')
  BGG_CSV_CACHE.party     = sortBy('party_rank')
  BGG_CSV_CACHE.overall   = [...rows].sort((a, b) => a.rank - b.rank).slice(0, 200).map(r => r.id)
  BGG_CSV_CACHE.cachedAt  = Date.now()
}

async function refreshBggCsvIfNeeded(token: string): Promise<void> {
  if (Date.now() - BGG_CSV_CACHE.cachedAt < 24 * 3600_000) return
  try {
    const res = await fetch('https://boardgamegeek.com/data_dumps/bg_ranks', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(30_000),
    })
    console.log('[BGG] CSV download status:', res.status)
    if (!res.ok) return
    parseBggRanksCsv(await res.text())
  } catch (e) { console.log('[BGG] CSV download failed:', e) }
}

async function fetchBoardgameRecs(
  slots: GenreSlot[], ownedIds: Set<string>, tasteProfile: TasteProfile,
  isAlreadyOwned: (type: string, id: string, title: string) => boolean,
  shownIds?: Set<string>,
  supabase?: any
): Promise<Recommendation[]> {
  const token = process.env.BGG_BEARER_TOKEN || ''
  const bggHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
  const results: Recommendation[] = []
  const seen = new Set<string>()
  const targetCats = new Set(slots.flatMap(s => GENRE_TO_BGG_CATS[s.genre] || []))
  console.log('[BGG] fetchBoardgameRecs start — slots:', slots.map(s => s.genre), 'token:', !!token)

  // Aggiorna cache CSV se scaduta (24h)
  await refreshBggCsvIfNeeded(token)

  // Raccoglie ID candidati: dal CSV per categoria + seeds di fallback
  const candidateIdSet = new Set<number>()
  const hasCsvData = BGG_CSV_CACHE.cachedAt > 0
  console.log('[BGG] CSV cache:', hasCsvData ? `${BGG_CSV_CACHE.thematic.length} thematic` : 'empty (using seeds)')

  if (hasCsvData) {
    for (const slot of slots) {
      const lists = GENRE_TO_BGG_RANK_LISTS[slot.genre] || ['thematic']
      for (const listKey of lists) {
        const ids = BGG_CSV_CACHE[listKey as keyof typeof BGG_CSV_CACHE] as number[]
        ids.slice(0, 80).forEach(id => candidateIdSet.add(id))
      }
    }
  } else {
    // Fallback ai seeds hardcoded se CSV non disponibile
    slots.flatMap(s => BGG_GENRE_SEEDS[s.genre] || []).forEach(id => candidateIdSet.add(id))
  }

  // Aggiunge hot list per contenuto fresco
  try {
    const hotRes = await fetch('https://boardgamegeek.com/xmlapi2/hot?type=boardgame', { headers: bggHeaders, signal: AbortSignal.timeout(6000) })
    console.log('[BGG] hot list status:', hotRes.status)
    if (hotRes.ok) {
      const hotXml = await hotRes.text()
      const hotIds = [...hotXml.matchAll(/<item[^>]*id="(\d+)"/g)].map(m => parseInt(m[1]))
      console.log('[BGG] hot list IDs found:', hotIds.length)
      hotIds.forEach(id => candidateIdSet.add(id))
    }
  } catch (e) {
    console.log('[BGG] hot list failed:', e)
  }

  console.log('[BGG] total candidate IDs:', candidateIdSet.size)
  if (candidateIdSet.size === 0) return results

  // Fetch dettagli in batch da MAX 20 (limite BGG API)
  const allGames: ReturnType<typeof parseBggXmlRec> = []
  const ids = [...candidateIdSet]
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20)
    try {
      const thingUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${batch.join(',')}&stats=1`
      let thingRes = await fetch(thingUrl, { headers: bggHeaders, signal: AbortSignal.timeout(10000) })
      console.log(`[BGG] /thing batch ${i/20+1} (${batch.length} IDs) → status ${thingRes.status}`)
      if (thingRes.status === 202) {
        await new Promise(r => setTimeout(r, 2000))
        thingRes = await fetch(thingUrl, { headers: bggHeaders, signal: AbortSignal.timeout(10000) })
      }
      if (thingRes.status === 202) {
        await new Promise(r => setTimeout(r, 3000))
        thingRes = await fetch(thingUrl, { headers: bggHeaders, signal: AbortSignal.timeout(10000) })
      }
      if (!thingRes.ok) { console.log(`[BGG] /thing batch failed: ${thingRes.status}`); continue }
      const parsed = parseBggXmlRec(await thingRes.text())
      console.log(`[BGG] /thing batch parsed ${parsed.length} games`)
      allGames.push(...parsed)
    } catch (e) {
      console.log(`[BGG] /thing batch error:`, e)
    }
    if (i + 20 < ids.length) await new Promise(r => setTimeout(r, 300))
  }

  console.log('[BGG] allGames fetched:', allGames.length)

  // Score per match categorie + qualità
  const scored = allGames
    .filter(g => (g.usersRated || 0) > 100 && (g.rating || 0) > 5.5)
    .map(g => ({ ...g, _catMatch: g.categories.filter(c => targetCats.has(c)).length }))
    .sort((a, b) => b._catMatch !== a._catMatch ? b._catMatch - a._catMatch : (b.rating || 0) - (a.rating || 0))

  for (const g of scored) {
    const id = `bgg-${g.id}`
    if (seen.has(id) || isAlreadyOwned('boardgame', id, g.name)) continue
    if (shownIds?.has(id)) continue
    seen.add(id)
    const recGenres = g.categories.map(c => BGG_CAT_TO_GENRE_REC[c]).filter(Boolean) as string[]
    results.push({
      id, title: g.name, type: 'boardgame',
      coverImage: g.thumbnail || undefined,
      year: g.year, genres: recGenres.length > 0 ? recGenres : ['Strategy'],
      tags: g.mechanics, keywords: g.categories.map(c => c.toLowerCase()),
      score: g.rating ? Math.min(g.rating / 2, 5) : undefined,
      description: g.description || undefined,
      matchScore: g._catMatch > 0 ? 65 : 52,
      why: recGenres.length > 0 ? `Tra i migliori di ${recGenres[0]}` : 'Top board game',
    })
  }

  console.log('[BGG] results after scoring:', results.length)

  // Fallback: se BGG API non ha restituito nulla, usa boardgames_cache (hot list salvata dal discover)
  if (results.length === 0 && supabase) {
    try {
      const { data: cache } = await supabase.from('boardgames_cache').select('data').single()
      if (cache?.data && Array.isArray(cache.data)) {
        console.log('[BGG] using boardgames_cache fallback:', cache.data.length, 'items')
        for (const item of cache.data as any[]) {
          const idMatch = item.url?.match(/boardgame\/(\d+)/)
          if (!idMatch) continue
          const id = `bgg-${idMatch[1]}`
          if (seen.has(id)) continue
          seen.add(id)
          results.push({
            id, title: item.title, type: 'boardgame',
            coverImage: item.urlToImage || undefined,
            genres: ['Strategy'], tags: [], keywords: [],
            matchScore: 48,
            why: 'Board game in tendenza',
          })
        }
      }
    } catch (e) {
      console.log('[BGG] boardgames_cache fallback failed:', e)
    }
  }

  const bggDescItems = results
    .filter(r => r.description)
    .map(r => ({ id: r.id, text: r.description! }))
  if (bggDescItems.length > 0) {
    const t = await translateWithCache(bggDescItems)
    results.forEach(r => { if (r.description) r.description = t[r.id] || r.description })
  }

  return results.sort((a, b) => (b.score || 0) - (a.score || 0))
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

const POOL_SIZE_PER_TYPE = 80   // titoli nel bacino per tipo
const SERVE_SIZE_PER_TYPE = 15  // titoli serviti per tipo ad ogni GET
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
    const rl = rateLimit(request, { limit: 10, windowMs: 60_000 })
    if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const requestedType = searchParams.get('type') || 'all'
    const forceRefresh = searchParams.get('refresh') === '1'
    const similarToId = searchParams.get('similar_to_id') || null  // Fix 1.15: "simili a questo"
    const similarToGenres = searchParams.get('similar_to_genres')?.split(',').filter(Boolean) || []

    // ── In-memory cache check — bypassa se similar_to query (sempre fresh) ───
    if (!forceRefresh && !similarToId) {
      const memHit = memCacheGet(user.id)
      if (memHit) {
        const recs = requestedType === 'all'
          ? memHit.data
          : { [requestedType]: memHit.data[requestedType] || [] }
        return NextResponse.json({ recommendations: recs, tasteProfile: memHit.tasteProfile, cached: true }, {
          headers: { 'X-Cache': 'MEM_HIT' }
        })
      }
    }

    // Leggi collezione completa
    const { data: entries } = await supabase
      .from('user_media_entries')
      .select('type, rating, genres, current_episode, episodes, status, is_steam, title, title_en, external_id, appid, updated_at, tags, keywords, themes, player_perspectives, studios, directors, authors, developer, rewatch_count, started_at')
      .eq('user_id', user.id)

    const allEntries = entries || []

    // Timestamp dell'ultima modifica alla collezione
    const lastCollectionUpdate = allEntries.reduce((latest, e) => {
      const t = new Date(e.updated_at || 0)
      return t > latest ? t : latest
    }, new Date(0))

    // ── Carica preferenze + wishlist + search history ─────────────────────────
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
      if (e.appid) bucket.ids.add(e.appid)
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
      ...allEntries.map(e => e.external_id).filter(Boolean),
      ...allEntries.map(e => e.appid).filter(Boolean),
      ...(wishlistRaw || []).map(w => w.external_id).filter(Boolean),
    ])

    const tmdbToken = process.env.TMDB_API_KEY || ''
    const igdbClientId = process.env.IGDB_CLIENT_ID || ''
    const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || ''

    const typesToFetch: MediaType[] = requestedType === 'all'
      ? ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']
      : [requestedType as MediaType]

    // ── V6: Carica titoli mostrati nella sessione corrente (TTL: 4h) ──────────
    // NON escludiamo titoli per settimane — solo quelli mostrati nelle ultime 4 ore
    // così ogni sessione di navigazione vede facce nuove, ma il pool rimane intatto
    const sessionCutoff = new Date(Date.now() - SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString()
    const { data: sessionShownRows } = await supabase
      .from('recommendations_shown')
      .select('rec_id')
      .eq('user_id', user.id)
      .gte('shown_at', sessionCutoff)

    const sessionShownIds = new Set<string>((sessionShownRows || []).map((r: any) => r.rec_id))

    // ── V6: Carica socialFavorites ────────────────────────────────────────────
    const { data: similarFriends } = await supabase
      .from('taste_similarity')
      .select('other_user_id, similarity_score')
      .eq('user_id', user.id)
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
      .eq('user_id', user.id)
      .in('media_type', typesToFetch)

    // Hash semplice della collezione: numero di entry + timestamp ultima modifica
    const collectionHash = `${allEntries.length}_${lastCollectionUpdate.getTime()}`

    // Determina quali tipi necessitano rigenerazione del pool
    const poolByType = new Map<string, Recommendation[]>()
    const typesNeedingRegen: MediaType[] = []

    for (const type of typesToFetch) {
      const poolRow = poolRows?.find(r => r.media_type === type)
      const poolIsValid =
        poolRow &&
        !forceRefresh &&
        new Date(poolRow.generated_at) > new Date(poolCutoff) &&
        poolRow.collection_hash === collectionHash &&
        Array.isArray(poolRow.data) && poolRow.data.length >= 10

      if (poolIsValid) {
        // Pool valido: filtra i titoli ora in collezione (potrebbero essere stati aggiunti)
        const freshPool = (poolRow.data as Recommendation[]).filter(
          r => !isAlreadyOwned(r.type, r.id, r.title)
        )
        poolByType.set(type, freshPool)
      } else {
        typesNeedingRegen.push(type)
      }
    }

    // ── V6: Rigenera pool per i tipi che ne hanno bisogno ────────────────────
    if (typesNeedingRegen.length > 0) {
      // Il pool usa shownIds vuoto: raccoglie TUTTI i candidati senza esclusioni
      const emptyShownIds = new Set<string>()

      const continuityRecsPromise = (typesNeedingRegen.includes('anime') || typesNeedingRegen.includes('manga'))
        ? fetchContinuityRecs(allEntries, ownedIds, tasteProfile, supabase)
        : Promise.resolve([])

      const [continuityRecs, ...poolResults] = await Promise.all([
        continuityRecsPromise,
        ...typesNeedingRegen.map(async type => {
          // Pool più grande: totalSlots = POOL_SIZE_PER_TYPE
          const slots = buildDiversitySlots(type, tasteProfile, POOL_SIZE_PER_TYPE)
          if (slots.length === 0) return { type, items: [] }

          switch (type) {
            case 'anime': return { type, items: await fetchAnimeRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites) }
            case 'manga': return { type, items: await fetchMangaRecs(slots, ownedIds, tasteProfile, isAlreadyOwned, emptyShownIds, socialFavorites) }
            case 'movie': return { type, items: await fetchMovieRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites, userPlatformIds) }
            case 'tv':    return { type, items: await fetchTvRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, emptyShownIds, socialFavorites, userPlatformIds) }
            case 'game':       return { type, items: await fetchGameRecs(slots, ownedIds, tasteProfile, igdbClientId, igdbClientSecret, isAlreadyOwned, emptyShownIds) }
            case 'boardgame':  return { type, items: await fetchBoardgameRecs(slots, ownedIds, tasteProfile, isAlreadyOwned, emptyShownIds, supabase) }
            default: return { type, items: [] }
          }
        })
      ])

      // Inietta continuity recs come prime card nel pool
      const continuityByType = new Map<string, Recommendation[]>()
      for (const contRec of continuityRecs) {
        const arr = continuityByType.get(contRec.type) || []
        arr.push(contRec)
        continuityByType.set(contRec.type, arr)
      }

      // Salva i nuovi pool in Supabase e in memoria
      const poolUpserts = poolResults
        .filter(r => r && 'type' in r && r.type)
        .map(result => {
          const type = result.type as MediaType
          let poolItems = applyFormatDiversity(result.items, type)

          // Prepend continuity recs (deduplicati)
          const contRecs = continuityByType.get(type) || []
          const poolIds = new Set(poolItems.map(r => r.id))
          const uniqueContRecs = contRecs.filter(r => !poolIds.has(r.id))
          poolItems = [...uniqueContRecs, ...poolItems]

          poolByType.set(type, poolItems)

          return {
            user_id: user.id,
            media_type: type,
            data: poolItems,
            generated_at: new Date().toISOString(),
            collection_hash: collectionHash,
          }
        })

      if (poolUpserts.length > 0) {
        await supabase.from('recommendations_pool').upsert(poolUpserts, {
          onConflict: 'user_id,media_type',
        })
      }

      // Salva creator profile aggiornato
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
    }

    // ── V6: Pesca dal pool — shuffle + slice, evitando solo la sessione corrente
    const recommendations: Record<string, Recommendation[]> = {}

    // Seed basato su userId + ora corrente (cambia ogni ora → rotazione automatica)
    const hourSeed = parseInt(user.id.replace(/[^0-9]/g, '').slice(0, 8) || '0', 10) +
      Math.floor(Date.now() / (60 * 60 * 1000))

    for (const type of typesToFetch) {
      const pool = poolByType.get(type) || []
      if (pool.length === 0) { recommendations[type] = []; continue }

      // Separa titoli non ancora mostrati in sessione da quelli già mostrati
      const notShown = pool.filter(r => !sessionShownIds.has(r.id))
      const alreadyShown = pool.filter(r => sessionShownIds.has(r.id))

      // Shuffle deterministico (seed diverso per tipo)
      const typeOffset = type.charCodeAt(0)
      const shuffled = shuffleSeeded(notShown, hourSeed + typeOffset)

      // Se non abbiamo abbastanza non-mostrati, aggiungi i già-mostrati in fondo
      const combined = [...shuffled, ...shuffleSeeded(alreadyShown, hourSeed + typeOffset + 1)]

      recommendations[type] = combined.slice(0, SERVE_SIZE_PER_TYPE)
    }

    // ── V6: Registra i titoli mostrati (sessione corrente) ────────────────────
    const shownInserts = Object.entries(recommendations).flatMap(([type, recs]) =>
      recs.map(r => ({
        user_id: user.id,
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
    memCacheSet(user.id, recommendations, tasteProfileResponse)

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