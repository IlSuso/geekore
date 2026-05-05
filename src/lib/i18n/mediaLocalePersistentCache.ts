import type { Locale } from '@/lib/i18n/serverLocale'
import { createServiceClient } from '@/lib/supabase/service'

type MediaLike = Record<string, any>

export type MediaLocaleAsset = {
  media_key: string
  locale: Locale
  media_type?: string | null
  external_id?: string | null
  source_title?: string | null
  title?: string | null
  description?: string | null
  cover_image?: string | null
  details?: Record<string, any> | null
  missing_fields?: string[] | null
  stale_after?: string | null
}

const DETAIL_KEYS = [
  'year', 'release_year', 'episodes', 'totalSeasons', 'seasons', 'season_episodes',
  'genres', 'score', 'rating', 'avg_rating', 'playing_time', 'min_players', 'max_players',
  'complexity', 'mechanics', 'designers', 'authors', 'studios', 'directors', 'developers',
  'themes', 'platforms', 'cast', 'watchProviders', 'italianSupportTypes', 'publisher',
  'pages', 'isbn', 'externalUrl', 'source', 'title_original',
]

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined
  const bad = text.toLowerCase()
  if (bad === 'null' || bad === 'undefined' || bad === 'nan' || bad === 'n/a' || bad === 'none') return undefined
  return text
}

function normalizeType(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'serie' || raw === 'series' || raw === 'tv_show' || raw === 'show') return 'tv'
  if (raw === 'film') return 'movie'
  if (raw === 'board_game' || raw === 'board-game' || raw === 'board') return 'boardgame'
  if (raw === 'videogame' || raw === 'video_game' || raw === 'video-game' || raw === 'games') return 'game'
  return raw || 'media'
}

function stableText(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

function strictTitle(item: MediaLike, locale: Locale): string | undefined {
  return clean(item.localized?.[locale]?.title)
    || clean(item[`title_${locale}`])
    || clean(locale === 'en' ? item.title_en : item.title_it)
}

function strictDescription(item: MediaLike, locale: Locale): string | undefined {
  return clean(item.localized?.[locale]?.description)
    || clean(item[`description_${locale}`])
    || clean(locale === 'en' ? item.description_en : item.description_it)
}

function strictCover(item: MediaLike, locale: Locale): string | undefined {
  return clean(item.localized?.[locale]?.coverImage)
    || clean(item.localized?.[locale]?.cover_image)
    || clean(item[`cover_image_${locale}`])
    || clean(item[`coverImage_${locale}`])
}

function fallbackTitle(item: MediaLike, locale: Locale): string | undefined {
  return strictTitle(item, locale)
    || clean(item.title)
    || clean(item.media_title)
    || clean(item.name)
    || clean(locale === 'en' ? item.title_it : item.title_en)
    || clean(item.title_original)
}

function fallbackDescription(item: MediaLike, locale: Locale): string | undefined {
  return strictDescription(item, locale)
    || clean(item.description)
    || clean(item.media_description)
}

function fallbackCover(item: MediaLike, locale: Locale): string | undefined {
  return strictCover(item, locale)
    || clean(item.coverImage)
    || clean(item.cover_image)
    || clean(item.media_cover)
}

export function mediaLocaleKeyFor(item: MediaLike): string | null {
  const type = normalizeType(item.type || item.media_type || item.source)
  const id = clean(item.external_id) || clean(item.media_id) || clean(item.id)
  if (id) return `${type}:${id}`

  const title = clean(item.title)
    || clean(item.media_title)
    || clean(item.name)
    || clean(item.title_original)
    || clean(item.title_en)
    || clean(item.title_it)

  const slug = stableText(title)
  return slug ? `${type}:title:${slug}` : null
}


function hasUsefulBoardgameDetails(item: MediaLike): boolean {
  const details = item.details && typeof item.details === 'object' ? item.details : {}
  const bgg = item.bgg || details.bgg || item.achievement_data?.bgg || {}
  const arrays = [item.mechanics, details.mechanics, bgg.mechanics, item.designers, details.designers, bgg.designers]
  const hasArray = arrays.some(value => Array.isArray(value) && value.length > 0)
  const hasNumber = [
    item.min_players, details.min_players, bgg.min_players,
    item.max_players, details.max_players, bgg.max_players,
    item.playing_time, details.playing_time, bgg.playing_time,
    item.complexity, details.complexity, bgg.complexity,
  ].some(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)))
  return hasArray || hasNumber
}

export function mediaLocaleItemIsComplete(item: MediaLike, locale: Locale, mode: 'basic' | 'full' = 'basic'): boolean {
  const cached = item.__locale_cache_hit === true
  const title = cached ? fallbackTitle(item, locale) : strictTitle(item, locale)
  const cover = cached ? fallbackCover(item, locale) : strictCover(item, locale)
  if (!title || !cover) return false
  if (mode === 'full') {
    const description = cached ? fallbackDescription(item, locale) : strictDescription(item, locale)
    if (!description && !item.__locale_description_missing) return false

    // Il drawer non ha bisogno solo di descrizione: per i boardgame deve
    // ricevere anche i dettagli BGG. Vecchie righe di media_locale_assets
    // potevano avere title/cover/description ma details vuoto; in quel caso
    // NON sono complete e il backend deve rifare fetch BGG.
    if (normalizeType(item.type || item.media_type || item.source) === 'boardgame' && !hasUsefulBoardgameDetails(item)) {
      return false
    }
  }
  return true
}

export function mergeCachedLocaleAsset<T extends MediaLike>(item: T, asset: MediaLocaleAsset, locale: Locale): T {
  const title = clean(asset.title)
  const description = clean(asset.description)
  const cover = clean(asset.cover_image)
  const details = asset.details && typeof asset.details === 'object' ? asset.details : {}

  const next: MediaLike = {
    ...item,
    ...details,
    __locale_cache_hit: true,
    __locale_description_missing: Array.isArray(asset.missing_fields) && asset.missing_fields.includes('description'),
  }

  if (asset.external_id && !next.external_id) next.external_id = asset.external_id
  if (asset.media_type && !next.type) next.type = asset.media_type

  if (title) {
    next[`title_${locale}`] = title
    next.title = title
    next.media_title = title
  }
  if (description) {
    next[`description_${locale}`] = description
    next.description = description
  }
  if (cover) {
    next[`cover_image_${locale}`] = cover
    next.coverImage = cover
    next.cover_image = cover
    next.media_cover = cover
  }

  next.localized = {
    ...(next.localized || {}),
    [locale]: {
      ...(next.localized?.[locale] || {}),
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(cover ? { coverImage: cover } : {}),
    },
  }

  return next as T
}

export async function readMediaLocaleAssets(items: MediaLike[], locale: Locale): Promise<Map<string, MediaLocaleAsset>> {
  const keys = [...new Set(items.map(mediaLocaleKeyFor).filter(Boolean) as string[])]
  const out = new Map<string, MediaLocaleAsset>()
  if (keys.length === 0) return out

  try {
    const supabase = createServiceClient('media-localize:persistent-locale-cache-read')
    const { data, error } = await supabase
      .from('media_locale_assets')
      .select('media_key, locale, media_type, external_id, source_title, title, description, cover_image, details, missing_fields, stale_after')
      .eq('locale', locale)
      .in('media_key', keys)
      .or(`stale_after.is.null,stale_after.gt.${new Date().toISOString()}`)

    if (error || !Array.isArray(data)) return out
    for (const row of data as MediaLocaleAsset[]) {
      if (row.media_key) out.set(row.media_key, row)
    }
  } catch {
    // Tabella non ancora creata / service key assente: fallback provider normale.
  }

  return out
}

export function buildMediaLocaleAsset(item: MediaLike, locale: Locale, mode: 'basic' | 'full' = 'basic'): MediaLocaleAsset | null {
  const media_key = mediaLocaleKeyFor(item)
  if (!media_key) return null

  const title = fallbackTitle(item, locale)
  const cover_image = fallbackCover(item, locale)
  const description = fallbackDescription(item, locale)
  const missing_fields: string[] = []
  if (!title) missing_fields.push('title')
  if (!cover_image) missing_fields.push('cover_image')
  if (mode === 'full' && !description) missing_fields.push('description')

  if (!title && !cover_image && !description) return null

  const details: Record<string, any> = {}
  for (const key of DETAIL_KEYS) {
    const value = item[key]
    if (value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) details[key] = value
  }

  return {
    media_key,
    locale,
    media_type: normalizeType(item.type || item.media_type),
    external_id: clean(item.external_id) || clean(item.media_id) || clean(item.id) || null,
    source_title: clean(item.title) || clean(item.media_title) || clean(item.name) || null,
    title: title || null,
    description: description || null,
    cover_image: cover_image || null,
    details,
    missing_fields,
    stale_after: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45).toISOString(),
  }
}

export async function writeMediaLocaleAssets(items: MediaLike[], locale: Locale, mode: 'basic' | 'full' = 'basic'): Promise<void> {
  const rows = items
    .map(item => buildMediaLocaleAsset(item, locale, mode))
    .filter(Boolean) as MediaLocaleAsset[]

  if (rows.length === 0) return

  const unique = new Map<string, MediaLocaleAsset>()
  for (const row of rows) unique.set(`${row.media_key}:${row.locale}`, row)

  try {
    const supabase = createServiceClient('media-localize:persistent-locale-cache-write')
    await supabase
      .from('media_locale_assets')
      .upsert(Array.from(unique.values()), { onConflict: 'media_key,locale' })
  } catch {
    // Cache opportunistica: se non scrive, non blocca mai la UX.
  }
}
