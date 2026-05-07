// src/app/api/trending/route.ts
// Discover trending API.
//
// Obiettivo: una sola API pulita, economica e veloce per le sezioni iniziali
// della Discover page. Supporta sia richieste singole:
//   /api/trending?section=game&lang=en
// sia batch:
//   /api/trending?section=all&lang=en
//
// Strategia costi/performance:
// - cache in-memory per section+locale con stale fallback;
// - Next fetch cache/revalidate su ogni chiamata esterna;
// - timeout brevi e fallback per non bloccare la pagina;
// - IGDB usa cover.image_id e URL CDN diretto;
// - TMDb usa poster_path w500;
// - AniList usa coverImage.extraLarge/large;
// - BGG usa /hot + /thing batch per recuperare image/thumbnail.

import { NextRequest, NextResponse } from 'next/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { getRequestLocale } from '@/lib/i18n/serverLocale'
import { apiMessage } from '@/lib/i18n/apiErrors'

const ANILIST_API = 'https://graphql.anilist.co'
const TMDB_BASE = 'https://api.themoviedb.org/3'
const BGG_BASE = 'https://boardgamegeek.com/xmlapi2'

type Locale = 'it' | 'en'
type Section = 'anime' | 'manga' | 'movie' | 'tv' | 'game' | 'boardgame'

type TrendingItem = {
  id: string
  external_id?: string
  title: string
  title_original?: string
  title_en?: string
  title_it?: string
  type: Section
  coverImage?: string
  cover_image?: string
  cover_image_en?: string
  cover_image_it?: string
  description?: string
  description_en?: string
  description_it?: string
  localized?: Record<string, any>
  year?: number
  genres?: string[]
  score?: number
  source: 'anilist' | 'tmdb' | 'igdb' | 'steam' | 'bgg'
}

type CacheEntry = {
  items: TrendingItem[]
  expiresAt: number
  staleUntil: number
  source: string
  fetchedAt: number
}

const SECTIONS: Section[] = ['anime', 'game', 'tv', 'manga', 'movie', 'boardgame']
const FRESH_TTL_MS = 6 * 60 * 60 * 1000
const STALE_TTL_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 6500
const BGG_TIMEOUT_MS = 8500
const PER_SECTION_LIMIT = 60
const BGG_DETAIL_BATCH_SIZE = 20
const TRENDING_CACHE_VERSION = 'v7-cursor-depth'

const memoryCache = new Map<string, CacheEntry>()
let cachedIgdbToken: { token: string; expiresAt: number } | null = null

const ANILIST_TRENDING_QUERY = `
query ($type: MediaType, $page: Int, $perPage: Int, $sort: [MediaSort]) {
  Page(page: $page, perPage: $perPage) {
    media(type: $type, sort: $sort, isAdult: false) {
      id
      type
      format
      title { romaji english native }
      coverImage { extraLarge large }
      seasonYear
      genres
      averageScore
      description(asHtml: false)
    }
  }
}
`

function normalizeLocale(value: string | null | undefined): Locale {
  return value === 'en' || value === 'en-US' ? 'en' : 'it'
}

function cacheKey(section: Section, locale: Locale, cursor: number) {
  return `${TRENDING_CACHE_VERSION}:${section}:${locale}:${cursor}`
}

function now() {
  return Date.now()
}

function getFresh(section: Section, locale: Locale, cursor: number): CacheEntry | null {
  const entry = memoryCache.get(cacheKey(section, locale, cursor))
  if (!entry) return null
  if (entry.expiresAt > now()) return entry
  return null
}

function getStale(section: Section, locale: Locale, cursor: number): CacheEntry | null {
  const entry = memoryCache.get(cacheKey(section, locale, cursor))
  if (!entry) return null
  if (entry.staleUntil > now()) return entry
  return null
}

function setCache(section: Section, locale: Locale, cursor: number, items: TrendingItem[], source: string) {
  memoryCache.set(cacheKey(section, locale, cursor), {
    items,
    source,
    fetchedAt: now(),
    expiresAt: now() + FRESH_TTL_MS,
    staleUntil: now() + STALE_TTL_MS,
  })
}

function jsonHeaders(extra?: HeadersInit): HeadersInit {
  return {
    'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    ...extra,
  }
}

function uniqueById(items: TrendingItem[]): TrendingItem[] {
  const seen = new Set<string>()
  const out: TrendingItem[] = []
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out.slice(0, PER_SECTION_LIMIT)
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function tmdbHeaders() {
  const token = process.env.TMDB_API_KEY || process.env.TMDB_READ_ACCESS_TOKEN
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  }
}

function hasTmdbConfig() {
  return Boolean(process.env.TMDB_API_KEY || process.env.TMDB_READ_ACCESS_TOKEN)
}

function tmdbImage(path: string | null | undefined) {
  if (!path) return undefined
  return `https://image.tmdb.org/t/p/w500${path}`
}

function igdbConfig() {
  return {
    clientId: process.env.IGDB_CLIENT_ID || process.env.TWITCH_CLIENT_ID,
    clientSecret: process.env.IGDB_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET,
  }
}

function igdbCoverUrl(imageId: string | null | undefined, size = 'cover_big_2x') {
  if (!imageId) return undefined
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`
}

function bggHeaders(): HeadersInit {
  const token = process.env.BGG_BEARER_TOKEN
  return {
    'User-Agent': 'Geekore/1.0 (geekore.it)',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function xmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#10;/g, ' ')
    .replace(/&#\d+;/g, '')
    .trim()
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, 'i'))
  return match ? xmlDecode(match[1] || '') : ''
}

function extractText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return match ? xmlDecode(match[1] || '') : ''
}

function extractItemChunks(xml: string): string[] {
  const chunks: string[] = []
  const re = /<item\b[\s\S]*?<\/item>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(xml)) !== null) chunks.push(match[0])
  return chunks
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function extractBggIds(xmlOrHtml: string): string[] {
  const ids: string[] = []
  const xmlRe = /<item[^>]*id="(\d+)"/g
  let xmlMatch: RegExpExecArray | null
  while ((xmlMatch = xmlRe.exec(xmlOrHtml)) !== null) ids.push(xmlMatch[1])

  const htmlRe = /\/boardgame\/(\d+)(?:\/|["?#])/g
  let htmlMatch: RegExpExecArray | null
  while ((htmlMatch = htmlRe.exec(xmlOrHtml)) !== null) ids.push(htmlMatch[1])

  return uniqueStrings(ids)
}

function anilistTitle(title: any) {
  // Anime/manga: titolo commerciale/canonico, niente traduzione artificiale.
  return cleanString(title?.english) || cleanString(title?.romaji) || cleanString(title?.native) || 'Untitled'
}

async function fetchAniListTrending(type: 'anime' | 'manga', cursor: number): Promise<TrendingItem[]> {
  const mediaType = type === 'anime' ? 'ANIME' : 'MANGA'
  const page = Math.max(1, cursor + 1)
  const sort = cursor % 3 === 1
    ? ['POPULARITY_DESC']
    : cursor % 3 === 2
      ? ['SCORE_DESC']
      : ['TRENDING_DESC']
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: ANILIST_TRENDING_QUERY, variables: { type: mediaType, page, perPage: PER_SECTION_LIMIT, sort } }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    next: { revalidate: 21600 },
  })

  if (!res.ok) return []
  const json = await res.json().catch(() => null)
  const media: any[] = json?.data?.Page?.media || []

  return uniqueById(media
    .filter((m: any) => {
      if (!m?.coverImage?.extraLarge && !m?.coverImage?.large) return false
      if (type === 'anime' && m.format === 'MOVIE') return false
      return true
    })
    .map((m: any) => {
      const title = anilistTitle(m.title)
      const cover = m.coverImage?.extraLarge || m.coverImage?.large
      return {
        id: `anilist-${type}-${m.id}`,
        external_id: `anilist-${type}-${m.id}`,
        title,
        title_original: cleanString(m.title?.romaji) || title,
        title_en: title,
        type,
        coverImage: cover,
        cover_image: cover,
        year: m.seasonYear || undefined,
        genres: Array.isArray(m.genres) ? m.genres : [],
        score: typeof m.averageScore === 'number' ? m.averageScore : undefined,
        description: cleanString(m.description),
        description_en: cleanString(m.description),
        localized: { en: { title, description: cleanString(m.description), coverImage: cover }, it: { title, description: cleanString(m.description), coverImage: cover } },
        source: 'anilist',
      } as TrendingItem
    }))
}

async function getIgdbToken(): Promise<string | null> {
  const { clientId, clientSecret } = igdbConfig()
  if (!clientId || !clientSecret) return null

  const t = now()
  if (cachedIgdbToken && cachedIgdbToken.expiresAt > t + 60_000) return cachedIgdbToken.token

  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    next: { revalidate: 3300 },
  })

  if (!tokenRes.ok) return null
  const tokenData = await tokenRes.json().catch(() => null)
  const token = tokenData?.access_token
  if (!token) return null

  cachedIgdbToken = {
    token,
    expiresAt: t + (Number(tokenData?.expires_in) || 3600) * 1000,
  }
  return token
}


type IgdbDiagnostic = {
  label: string
  ok: boolean
  status?: number
  count?: number
  error?: string
  bodyPreview?: string
}

let lastIgdbDiagnostics: IgdbDiagnostic[] = []

function resetIgdbDiagnostics() {
  lastIgdbDiagnostics = []
}

function pushIgdbDiagnostic(entry: IgdbDiagnostic) {
  lastIgdbDiagnostics.push(entry)
  if (lastIgdbDiagnostics.length > 20) lastIgdbDiagnostics = lastIgdbDiagnostics.slice(-20)
}

async function igdbGamesRequest(body: string, label = 'games'): Promise<any[]> {
  const { clientId } = igdbConfig()
  const token = await getIgdbToken()
  if (!clientId || !token) {
    pushIgdbDiagnostic({ label, ok: false, error: !clientId ? 'missing_client_id' : 'missing_token' })
    return []
  }

  try {
    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain',
        Accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: 21600 },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      pushIgdbDiagnostic({
        label,
        ok: false,
        status: res.status,
        error: res.statusText || 'igdb_error',
        bodyPreview: text.slice(0, 500),
      })
      return []
    }

    const data = await res.json().catch(() => [])
    const arr = Array.isArray(data) ? data : []
    pushIgdbDiagnostic({ label, ok: true, status: res.status, count: arr.length })
    return arr
  } catch (error: any) {
    pushIgdbDiagnostic({ label, ok: false, error: error?.message || 'request_failed' })
    return []
  }
}

function escapeIgdbSearch(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function isLikelyGoodGameTitle(name: string): boolean {
  const n = name.toLowerCase()
  if (!n) return false
  const blocked = [
    'prime status upgrade',
    'soundtrack',
    'artbook',
    'demo',
    'server',
    'tool',
    'sdk',
    'dedicated server',
    'upgrade',
    'collection upgrade',
  ]
  return !blocked.some(b => n.includes(b))
}


function mapIgdbGame(game: any): TrendingItem | null {
  const id = game?.id
  const title = cleanString(game?.name)
  const imageId = cleanString(game?.cover?.image_id) || cleanString(game?.cover?.imageId)
  const cover = igdbCoverUrl(imageId)

  if (!id || !title || !cover) return null

  const releaseSeconds = Number(game?.first_release_date || 0)
  const year = releaseSeconds > 0 ? new Date(releaseSeconds * 1000).getUTCFullYear() : undefined
  const genres = Array.isArray(game?.genres)
    ? game.genres.map((g: any) => cleanString(g?.name)).filter(Boolean) as string[]
    : []

  const scoreRaw = Number(game?.total_rating ?? game?.aggregated_rating ?? game?.rating ?? 0)
  const score = Number.isFinite(scoreRaw) && scoreRaw > 0 ? Math.round(scoreRaw) : undefined

  return {
    id: `igdb-${id}`,
    external_id: `igdb-${id}`,
    title,
    title_original: title,
    title_en: title,
    type: 'game',
    coverImage: cover,
    cover_image: cover,
    year,
    genres,
    score,
    description: cleanString(game?.summary) || cleanString(game?.storyline),
    description_en: cleanString(game?.summary) || cleanString(game?.storyline),
    localized: { en: { title, description: cleanString(game?.summary) || cleanString(game?.storyline), coverImage: cover }, it: { title, description: cleanString(game?.summary) || cleanString(game?.storyline), coverImage: cover } },
    source: 'igdb',
  }
}

async function fetchIgdbCuratedFallback(): Promise<TrendingItem[]> {
  const curatedNames = [
    'Baldur\'s Gate 3',
    'ELDEN RING',
    'Cyberpunk 2077',
    'Red Dead Redemption 2',
    'Hades II',
    'Stardew Valley',
    'The Witcher 3: Wild Hunt',
    'Clair Obscur: Expedition 33',
    'Monster Hunter Wilds',
    'Hollow Knight: Silksong',
    'Split Fiction',
    'God of War',
  ]

  const fields = 'fields name, summary, storyline, cover.image_id, first_release_date, genres.name, total_rating, aggregated_rating, rating, total_rating_count;'
  const settled = await Promise.allSettled(curatedNames.map((name) => {
    const body = `search "${escapeIgdbSearch(name)}"; ${fields} where cover != null; limit 3;`
    return igdbGamesRequest(body, `curated:${name}`)
  }))

  const out: TrendingItem[] = []
  const seen = new Set<string | number>()
  for (const entry of settled) {
    if (entry.status !== 'fulfilled') continue
    for (const game of entry.value) {
      if (!game?.id || seen.has(game.id)) continue
      const mapped = mapIgdbGame(game)
      if (!mapped || !isLikelyGoodGameTitle(mapped.title)) continue
      seen.add(game.id)
      out.push(mapped)
      break
    }
  }

  return uniqueById(out)
}

async function fetchIgdbTrending(cursor: number): Promise<TrendingItem[]> {
  resetIgdbDiagnostics()

  const fields = 'fields name, summary, storyline, cover.image_id, first_release_date, genres.name, total_rating, aggregated_rating, rating, total_rating_count, hypes;'
  const mainGameWithCover = 'where cover != null & category = 0'
  const offset = Math.max(0, cursor) * 50
  const queries = [
    `${fields} ${mainGameWithCover} & total_rating_count > 50; sort total_rating_count desc; limit 50; offset ${offset};`,
    `${fields} ${mainGameWithCover} & hypes > 3; sort hypes desc; limit 50; offset ${offset};`,
    `${fields} ${mainGameWithCover} & rating > 70; sort rating desc; limit 50; offset ${offset};`,
    `${fields} where cover != null & total_rating_count > 100; sort total_rating_count desc; limit 50; offset ${offset};`,
  ]

  const settled = await Promise.allSettled(queries.map((q, index) => igdbGamesRequest(q, `trending:${index + 1}`)))
  const raw: any[] = []
  for (const entry of settled) {
    if (entry.status === 'fulfilled') raw.push(...entry.value)
  }

  const seen = new Set<number | string>()
  const mapped: TrendingItem[] = []
  for (const game of raw) {
    if (!game?.id || seen.has(game.id)) continue
    seen.add(game.id)
    const item = mapIgdbGame(game)
    if (item && isLikelyGoodGameTitle(item.title)) mapped.push(item)
  }

  const trending = uniqueById(mapped)
  if (trending.length >= 6) return trending

  const curated = await fetchIgdbCuratedFallback().catch(() => [])
  return uniqueById([...trending, ...curated])
}

function steamPoster(appid: number | string) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`
}

function normalizeSteamItem(item: any): TrendingItem | null {
  const appid = Number(item?.id ?? item?.appid ?? item?.steam_appid)
  const name = cleanString(item?.name)
  if (!appid || !name) return null
  const cover = steamPoster(appid)
  return {
    id: `steam-${appid}`,
    external_id: `steam-${appid}`,
    title: name,
    title_original: name,
    title_en: name,
    type: 'game',
    coverImage: cover,
    cover_image: cover,
    genres: [],
    source: 'steam',
  }
}

async function fetchSteamFallback(locale: Locale): Promise<TrendingItem[]> {
  const cc = locale === 'it' ? 'it' : 'us'
  const language = locale === 'it' ? 'italian' : 'english'

  const featured = await fetch(`https://store.steampowered.com/api/featuredcategories?cc=${cc}&l=${language}`, {
    headers: { 'User-Agent': 'Geekore/1.0' },
    signal: AbortSignal.timeout(4500),
    next: { revalidate: 21600 },
  }).then(r => r.ok ? r.json() : null).catch(() => null)

  const buckets = [featured?.top_sellers?.items, featured?.new_releases?.items, featured?.specials?.items]
  const fromFeatured: TrendingItem[] = []
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue
    for (const raw of bucket) {
      const item = normalizeSteamItem(raw)
      if (item) fromFeatured.push(item)
    }
  }
  const uniqueFeatured = uniqueById(fromFeatured)
  if (uniqueFeatured.length >= 6) return uniqueFeatured

  const fallbackAppIds = [730, 570, 1086940, 1245620, 1091500, 271590, 413150, 292030, 105600, 252490]
  const staticItems = fallbackAppIds
    .map(appid => normalizeSteamItem({ id: appid, name: undefined }))
    .filter(Boolean) as TrendingItem[]

  // Se Steam featured non ha nomi sufficienti, teniamo almeno le immagini stabili da appid noti.
  // I nomi sono opzionali qui perché questo ramo serve solo come ultima rete di sicurezza.
  const staticNamed: TrendingItem[] = [
    { id: 'steam-730', external_id: 'steam-730', title: 'Counter-Strike 2', title_en: 'Counter-Strike 2', type: 'game', coverImage: steamPoster(730), cover_image: steamPoster(730), source: 'steam' },
    { id: 'steam-570', external_id: 'steam-570', title: 'Dota 2', title_en: 'Dota 2', type: 'game', coverImage: steamPoster(570), cover_image: steamPoster(570), source: 'steam' },
    { id: 'steam-1086940', external_id: 'steam-1086940', title: 'Baldur\'s Gate 3', title_en: 'Baldur\'s Gate 3', type: 'game', coverImage: steamPoster(1086940), cover_image: steamPoster(1086940), source: 'steam' },
    { id: 'steam-1245620', external_id: 'steam-1245620', title: 'ELDEN RING', title_en: 'ELDEN RING', type: 'game', coverImage: steamPoster(1245620), cover_image: steamPoster(1245620), source: 'steam' },
    { id: 'steam-1091500', external_id: 'steam-1091500', title: 'Cyberpunk 2077', title_en: 'Cyberpunk 2077', type: 'game', coverImage: steamPoster(1091500), cover_image: steamPoster(1091500), source: 'steam' },
    { id: 'steam-271590', external_id: 'steam-271590', title: 'Grand Theft Auto V Legacy', title_en: 'Grand Theft Auto V Legacy', type: 'game', coverImage: steamPoster(271590), cover_image: steamPoster(271590), source: 'steam' },
    { id: 'steam-413150', external_id: 'steam-413150', title: 'Stardew Valley', title_en: 'Stardew Valley', type: 'game', coverImage: steamPoster(413150), cover_image: steamPoster(413150), source: 'steam' },
    { id: 'steam-292030', external_id: 'steam-292030', title: 'The Witcher 3: Wild Hunt', title_en: 'The Witcher 3: Wild Hunt', type: 'game', coverImage: steamPoster(292030), cover_image: steamPoster(292030), source: 'steam' },
  ]

  return uniqueById([...uniqueFeatured, ...staticNamed, ...staticItems])
}

async function fetchGameTrending(locale: Locale, cursor: number): Promise<{ items: TrendingItem[]; source: string }> {
  const igdb = await fetchIgdbTrending(cursor).catch((error) => {
    pushIgdbDiagnostic({ label: 'fetchIgdbTrending', ok: false, error: error?.message || 'mapping_failed' })
    return []
  })
  if (igdb.length >= 6) return { items: igdb, source: 'igdb' }

  // Steam resta solo ultima rete di sicurezza. In condizioni normali, con IGDB configurato,
  // la Discover deve mostrare cover IGDB stabili, non URL Steam library_600x900 fragili.
  const steam = await fetchSteamFallback(locale).catch(() => [])
  return { items: uniqueById([...igdb, ...steam]), source: igdb.length > 0 ? 'igdb+steam' : 'steam' }
}

const BGG_SEARCH_TERMS = [
  'strategy', 'adventure', 'family', 'cooperative', 'card game', 'deck building',
  'worker placement', 'civilization', 'fantasy', 'science fiction', 'mystery',
  'war game', 'party game', 'abstract', 'economic', 'tile placement', 'campaign',
  'solo', 'eurogame', 'area control', 'deduction', 'horror', 'historical',
  'puzzle', 'legacy', 'nature', 'city building', 'space', 'negotiation',
  'engine building', 'dice', 'miniatures', 'exploration', 'trains',
]
const BGG_FALLBACK_IDS = [
  '224517', '342942', '161936', '174430', '397598', '316554', '233078', '115746',
  '167791', '187645', '162886', '291457', '220308', '12333', '84876', '418059',
  '338960', '182028', '421006', '193738', '295770', '28720', '246900', '173346',
  '167355', '169786', '177736', '266507', '124361', '312484', '341169', '205637',
  '373106', '237182', '120677', '164928', '192135', '266192', '96848', '251247',
  '321608', '199792', '324856', '183394', '284378', '521', '366013', '285774',
  '175914', '247763', '244521', '178900', '55690', '230802', '209010', '185343',
  '146021', '4098', '68448', '28143', '35677', '70323', '3076', '9209',
  '148228', '172386', '126163', '146508', '176494', '159675', '284083', '266810',
]

async function fetchBggIdsFromHot(): Promise<string[]> {
  const res = await fetch(`${BGG_BASE}/hot?type=boardgame`, {
    headers: bggHeaders(),
    signal: AbortSignal.timeout(BGG_TIMEOUT_MS),
    next: { revalidate: 21600 },
  }).catch(() => null)
  if (!res?.ok) return []
  return extractBggIds(await res.text())
}

async function fetchBggIdsFromBrowse(page: number): Promise<string[]> {
  const res = await fetch(`https://boardgamegeek.com/browse/boardgame/page/${page}`, {
    headers: bggHeaders(),
    signal: AbortSignal.timeout(BGG_TIMEOUT_MS),
    next: { revalidate: 86400 },
  }).catch(() => null)
  if (!res?.ok) return []
  return extractBggIds(await res.text())
}

async function fetchBggIdsFromSearch(term: string): Promise<string[]> {
  const res = await fetch(`${BGG_BASE}/search?query=${encodeURIComponent(term)}&type=boardgame`, {
    headers: bggHeaders(),
    signal: AbortSignal.timeout(BGG_TIMEOUT_MS),
    next: { revalidate: 86400 },
  }).catch(() => null)
  if (!res?.ok) return []
  return extractBggIds(await res.text())
}

async function fetchBggDetails(ids: string[]): Promise<string> {
  const batches: string[][] = []
  for (let i = 0; i < ids.length; i += BGG_DETAIL_BATCH_SIZE) {
    batches.push(ids.slice(i, i + BGG_DETAIL_BATCH_SIZE))
  }

  const xml: string[] = []
  for (const batch of batches) {
    const chunk = await fetch(`${BGG_BASE}/thing?id=${batch.join(',')}&stats=1`, {
      headers: bggHeaders(),
      signal: AbortSignal.timeout(BGG_TIMEOUT_MS),
      next: { revalidate: 21600 },
    }).then(res => res.ok ? res.text() : '').catch(() => '')
    if (chunk) xml.push(chunk)
  }

  return xml.join('\n')
}

async function fetchBggTrending(cursor: number): Promise<TrendingItem[]> {
  const ids: string[] = []
  if (cursor === 0) ids.push(...await fetchBggIdsFromHot())

  const browseStart = Math.max(1, cursor * 5 + 1)
  const browsePages = [browseStart, browseStart + 1, browseStart + 2, browseStart + 3, browseStart + 4]
  const browseResults = await Promise.allSettled(browsePages.map(fetchBggIdsFromBrowse))
  for (const result of browseResults) {
    if (result.status === 'fulfilled') ids.push(...result.value)
  }

  if (uniqueStrings(ids).length < PER_SECTION_LIMIT) {
    const termStart = (cursor * 8) % BGG_SEARCH_TERMS.length
    const terms = Array.from({ length: 8 }, (_, index) => BGG_SEARCH_TERMS[(termStart + index) % BGG_SEARCH_TERMS.length])
    const searchResults = await Promise.allSettled(terms.map(fetchBggIdsFromSearch))
    for (const result of searchResults) {
      if (result.status === 'fulfilled') ids.push(...result.value)
    }
  }

  if (uniqueStrings(ids).length < PER_SECTION_LIMIT) {
    const fallbackStart = (cursor * PER_SECTION_LIMIT) % BGG_FALLBACK_IDS.length
    ids.push(...Array.from({ length: PER_SECTION_LIMIT }, (_, index) =>
      BGG_FALLBACK_IDS[(fallbackStart + index) % BGG_FALLBACK_IDS.length],
    ))
  }

  const uniqueIds = uniqueStrings(ids).slice(0, PER_SECTION_LIMIT)
  if (uniqueIds.length === 0) return []

  const detailsXml = await fetchBggDetails(uniqueIds)
  if (!detailsXml) return []
  const detailChunks = extractItemChunks(detailsXml)
  const byId = new Map<string, TrendingItem>()

  for (const chunk of detailChunks) {
    const id = extractAttr(chunk, 'item', 'id')
    if (!id) continue
    const title = extractAttr(chunk, 'name', 'value') || 'Untitled board game'
    const cover = extractText(chunk, 'image') || extractText(chunk, 'thumbnail') || undefined
    if (!cover) continue
    const yearValue = extractAttr(chunk, 'yearpublished', 'value')
    const average = extractAttr(chunk, 'average', 'value')
    byId.set(id, {
      id: `bgg-${id}`,
      external_id: `bgg-${id}`,
      title,
      title_original: title,
      title_en: title,
      type: 'boardgame',
      coverImage: cover,
      cover_image: cover,
      year: yearValue ? Number(yearValue) || undefined : undefined,
      genres: [],
      score: average ? Math.round(Number(average) * 10) : undefined,
      description: extractText(chunk, 'description') || undefined,
      description_en: extractText(chunk, 'description') || undefined,
      localized: { en: { title, description: extractText(chunk, 'description') || undefined, coverImage: cover }, it: { title, description: extractText(chunk, 'description') || undefined, coverImage: cover } },
      source: 'bgg',
    })
  }

  return uniqueIds.map(id => byId.get(id)).filter(Boolean) as TrendingItem[]
}

async function fetchTmdbTrending(section: 'movie' | 'tv', locale: Locale, cursor: number): Promise<TrendingItem[]> {
  if (!hasTmdbConfig()) return []
  const language = locale === 'it' ? 'it-IT' : 'en-US'
  const startPage = Math.max(1, cursor * 3 + 1)
  const pages = await Promise.allSettled([startPage, startPage + 1, startPage + 2].map(page =>
    fetch(`${TMDB_BASE}/trending/${section}/week?language=${language}&page=${page}`, {
      headers: tmdbHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: 21600 },
    }).then(res => res.ok ? res.json() : null),
  ))
  const results: any[] = pages.flatMap(result =>
    result.status === 'fulfilled' && Array.isArray(result.value?.results)
      ? result.value.results
      : [],
  )

  return uniqueById(results
    .filter((r: any) => r?.poster_path)
    .map((r: any) => {
      const title = r.title || r.name || r.original_title || r.original_name || 'Untitled'
      const cover = tmdbImage(r.poster_path)
      return {
        id: `tmdb-${section}-${r.id}`,
        external_id: `tmdb-${section}-${r.id}`,
        title,
        title_original: r.original_title || r.original_name || title,
        title_en: locale === 'en' ? title : undefined,
        title_it: locale === 'it' ? title : undefined,
        type: section,
        coverImage: cover,
        cover_image: cover,
        ...(locale === 'en' ? { cover_image_en: cover } : { cover_image_it: cover }),
        year: parseInt((r.release_date || r.first_air_date || '').slice(0, 4), 10) || undefined,
        genres: [],
        score: Math.round((Number(r.vote_average) || 0) * 10) || undefined,
        description: cleanString(r.overview),
        ...(locale === 'en' ? { description_en: cleanString(r.overview) } : { description_it: cleanString(r.overview) }),
        localized: { [locale]: { title, description: cleanString(r.overview), coverImage: cover } },
        source: 'tmdb',
      } as TrendingItem
    }))
}

async function fetchSectionFresh(section: Section, locale: Locale, cursor: number): Promise<{ items: TrendingItem[]; source: string }> {
  if (section === 'anime') return { items: await fetchAniListTrending('anime', cursor), source: 'anilist' }
  if (section === 'manga') return { items: await fetchAniListTrending('manga', cursor), source: 'anilist' }
  if (section === 'movie' || section === 'tv') return { items: await fetchTmdbTrending(section, locale, cursor), source: 'tmdb' }
  if (section === 'boardgame') return { items: await fetchBggTrending(cursor), source: 'bgg' }
  return fetchGameTrending(locale, cursor)
}

async function getSection(section: Section, locale: Locale, cursor: number): Promise<{ items: TrendingItem[]; source: string; cache: 'fresh' | 'refreshed' | 'stale' | 'empty' }> {
  const fresh = getFresh(section, locale, cursor)
  if (fresh) return { items: fresh.items, source: fresh.source, cache: 'fresh' }

  try {
    const { items, source } = await fetchSectionFresh(section, locale, cursor)
    if (items.length > 0) {
      setCache(section, locale, cursor, items, source)
      return { items, source, cache: 'refreshed' }
    }
  } catch {
    // fallback sotto
  }

  const stale = getStale(section, locale, cursor)
  if (stale) return { items: stale.items, source: stale.source, cache: 'stale' }

  return { items: [], source: 'none', cache: 'empty' }
}

function buildDebugPayload(section: string, locale: Locale, result: any) {
  const { clientId, clientSecret } = igdbConfig()
  return {
    section,
    locale,
    hasTmdbToken: hasTmdbConfig(),
    hasIgdbClientId: Boolean(clientId),
    hasIgdbClientSecret: Boolean(clientSecret),
    hasBggBearerToken: Boolean(process.env.BGG_BEARER_TOKEN),
    cacheKeys: Array.from(memoryCache.keys()),
    igdbDiagnostics: lastIgdbDiagnostics,
    result,
  }
}

export async function GET(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'trending' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyRequests') }, { status: 429, headers: rl.headers })

  const { searchParams } = new URL(request.url)
  const requestedSection = (searchParams.get('section') || 'anime').toLowerCase()
  const explicitLang = searchParams.get('lang')
  const locale = normalizeLocale(explicitLang || await getRequestLocale(request))
  const debug = searchParams.get('debug') === '1'
  const cursor = Math.max(0, Math.min(30, Number(searchParams.get('cursor') || 0) || 0))

  if (requestedSection === 'all') {
    const settled = await Promise.allSettled(SECTIONS.map(section => getSection(section, locale, cursor)))
    const payload: Record<Section, TrendingItem[]> = {
      anime: [], game: [], tv: [], manga: [], movie: [], boardgame: [],
    }
    const meta: Record<string, any> = {}

    settled.forEach((entry, index) => {
      const section = SECTIONS[index]
      if (entry.status === 'fulfilled') {
        payload[section] = entry.value.items
        meta[section] = { source: entry.value.source, cache: entry.value.cache, count: entry.value.items.length, cursor }
      } else {
        meta[section] = { source: 'error', cache: 'empty', count: 0 }
      }
    })

    const body = debug ? buildDebugPayload('all', locale, { meta, payload }) : payload
    return NextResponse.json(body, { headers: jsonHeaders(rl.headers) })
  }

  if (!SECTIONS.includes(requestedSection as Section)) {
    return NextResponse.json(debug ? buildDebugPayload(requestedSection, locale, []) : [], { headers: jsonHeaders(rl.headers) })
  }

  const result = await getSection(requestedSection as Section, locale, cursor)
  const body = debug ? buildDebugPayload(requestedSection, locale, {
    source: result.source,
    cache: result.cache,
    cursor,
    count: result.items.length,
    sample: result.items.slice(0, 3),
  }) : result.items

  return NextResponse.json(body, { headers: jsonHeaders(rl.headers) })
}
