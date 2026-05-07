import { logger } from '@/lib/logger'

const MEDIA_TYPES = new Set(['anime', 'manga', 'movie', 'tv', 'game', 'boardgame'])

type SupabaseLike = {
  from: (table: string) => any
  rpc?: (fn: string, args?: Record<string, any>) => any
}

type CatalogItem = {
  id?: string
  external_id?: string
  title?: string
  title_original?: string
  title_en?: string
  title_it?: string
  description?: string
  description_en?: string
  description_it?: string
  coverImage?: string
  cover_image?: string
  cover_image_en?: string
  cover_image_it?: string
  year?: number
  genres?: string[]
  score?: number
  type?: string
  source?: string
  localized?: Record<string, any>
}

type Locale = 'it' | 'en'

function cleanString(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null
  const clean = value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max).trim()
  return clean || null
}

function cleanArray(value: unknown, max = 24): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of value) {
    const clean = cleanString(raw, 80)
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
    if (out.length >= max) break
  }
  return out
}

function scoreFromItem(item: CatalogItem) {
  const raw = Number(item.score || 0)
  if (!Number.isFinite(raw) || raw <= 0) return 0
  return raw > 10 ? Math.round(raw) : Math.round(raw * 10)
}

function qualityScore(item: CatalogItem) {
  let quality = 0
  const score = scoreFromItem(item)
  if (score >= 85) quality += 35
  else if (score >= 75) quality += 28
  else if (score >= 68) quality += 18
  else if (score >= 60) quality += 10

  if (item.coverImage || item.cover_image) quality += 20
  if (item.description || item.description_en || item.description_it) quality += 10
  if (Array.isArray(item.genres) && item.genres.length > 0) quality += 8
  if (Number(item.year || 0) >= new Date().getFullYear() - 2) quality += 4

  return Math.max(0, Math.min(100, quality))
}

function toCatalogRow(item: CatalogItem) {
  const type = cleanString(item.type, 40)
  const externalId = cleanString(item.external_id || item.id, 200)
  const title = cleanString(item.title || item.title_en || item.title_it || item.title_original, 300)
  const source = cleanString(item.source, 80) || 'external'
  const cover = cleanString(item.cover_image || item.coverImage, 1000)
  if (!type || !MEDIA_TYPES.has(type) || !externalId || !title || !cover) return null

  const score = scoreFromItem(item)
  const quality = qualityScore(item)
  if (quality < 25) return null

  return {
    media_type: type,
    external_id: externalId,
    title,
    title_original: cleanString(item.title_original, 300) || title,
    title_en: cleanString(item.title_en, 300),
    title_it: cleanString(item.title_it, 300),
    description: cleanString(item.description, 2500),
    description_en: cleanString(item.description_en, 2500),
    description_it: cleanString(item.description_it, 2500),
    cover_image: cover,
    cover_image_en: cleanString(item.cover_image_en, 1000),
    cover_image_it: cleanString(item.cover_image_it, 1000),
    year: Number.isFinite(Number(item.year)) ? Math.trunc(Number(item.year)) : null,
    genres: cleanArray(item.genres),
    score: score || null,
    popularity_score: score,
    quality_score: quality,
    source,
    localized: item.localized && typeof item.localized === 'object' ? item.localized : {},
    extra: {},
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function preferredTitle(row: any, locale: Locale) {
  if (locale === 'it') return row.title_it || row.title_en || row.title_original || row.title
  return row.title_en || row.title_original || row.title || row.title_it
}

function preferredDescription(row: any, locale: Locale) {
  if (locale === 'it') return row.description_it || row.description_en || row.description
  return row.description_en || row.description || row.description_it
}

function preferredCover(row: any, locale: Locale) {
  if (locale === 'it') return row.cover_image_it || row.cover_image_en || row.cover_image
  return row.cover_image_en || row.localized?.en?.coverImage || row.localized?.en?.cover_image || row.cover_image || row.cover_image_it
}

function rowToTrendingItem(row: any, locale: Locale) {
  const title = preferredTitle(row, locale)
  const cover = preferredCover(row, locale)
  const description = preferredDescription(row, locale)
  return {
    id: row.external_id,
    external_id: row.external_id,
    title,
    title_original: row.title_original || row.title,
    title_en: row.title_en || undefined,
    title_it: row.title_it || undefined,
    type: row.media_type,
    coverImage: cover,
    cover_image: cover,
    cover_image_en: row.cover_image_en || undefined,
    cover_image_it: row.cover_image_it || undefined,
    year: row.year || undefined,
    genres: Array.isArray(row.genres) ? row.genres : [],
    score: Number(row.score || 0) || undefined,
    description: description || undefined,
    description_en: row.description_en || undefined,
    description_it: row.description_it || undefined,
    localized: row.localized || {},
    source: row.source || 'catalog',
  }
}

export async function upsertMediaCatalogItems(supabase: SupabaseLike, items: CatalogItem[]) {
  const rows = items.map(toCatalogRow).filter((row): row is NonNullable<ReturnType<typeof toCatalogRow>> => Boolean(row))
  if (rows.length === 0) return { inserted: 0 }

  if (typeof supabase.rpc === 'function') {
    const { data, error } = await supabase.rpc('upsert_media_catalog_items', { p_items: rows })
    if (!error) return { inserted: Number(data || rows.length) }
    logger.warn('media_catalog', 'rpc upsert failed, falling back to insert-only', { error })
  }

  const { error } = await supabase
    .from('media_catalog')
    .upsert(rows, {
      onConflict: 'media_type,external_id',
      // The global catalog is shared by every user. Treat it as append-first:
      // new titles are added, existing rows are not overwritten by live API data
      // that may be thinner or less reliable than what we already have.
      ignoreDuplicates: true,
    })

  if (error) {
    logger.warn('media_catalog', 'upsert failed', { error })
    return { inserted: 0, error }
  }

  return { inserted: rows.length }
}

export async function fetchMediaCatalogSection(supabase: SupabaseLike, mediaType: string, cursor = 0, limit = 60, locale: Locale = 'it') {
  if (!MEDIA_TYPES.has(mediaType)) return []
  const from = Math.max(0, cursor) * limit
  const to = from + limit - 1
  const { data, error } = await supabase
    .from('media_catalog')
    .select('media_type,external_id,title,title_original,title_en,title_it,description,description_en,description_it,cover_image,cover_image_en,cover_image_it,year,genres,score,source,localized,quality_score,popularity_score')
    .eq('media_type', mediaType)
    .gte('quality_score', 25)
    .order('quality_score', { ascending: false })
    .order('popularity_score', { ascending: false })
    .range(from, to)

  if (error || !Array.isArray(data)) return []
  return data.map(row => rowToTrendingItem(row, locale))
}
