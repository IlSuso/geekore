import { buildWhyV3, computeMatchScore } from '../profile'
import { releaseFreshnessMult } from '../scoring'
import type { MediaType } from '../engine-types'
import type { Recommendation, TasteProfile } from '../types'
import type { ExposurePolicy } from './exposure-policy'

type SupabaseLike = {
  from: (table: string) => any
}

type IsAlreadyOwned = (type: string, id: string, title: string) => boolean

type CatalogRow = {
  media_type: MediaType
  external_id: string
  title: string
  title_original?: string | null
  title_en?: string | null
  title_it?: string | null
  description?: string | null
  description_en?: string | null
  description_it?: string | null
  cover_image?: string | null
  cover_image_en?: string | null
  cover_image_it?: string | null
  year?: number | null
  genres?: string[] | null
  score?: number | null
  quality_score?: number | null
  popularity_score?: number | null
  source?: string | null
  localized?: Record<string, any> | null
}

const CATALOG_SCAN_LIMIT: Record<MediaType, number> = {
  anime: 900,
  manga: 900,
  movie: 1400,
  tv: 1200,
  game: 1000,
  boardgame: 1200,
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = value.trim()
  return clean || undefined
}

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function canonicalRecommendationId(type: MediaType, externalId: string) {
  if (type === 'movie') return externalId.replace(/^tmdb-movie-/, '')
  if (type === 'tv') return externalId.replace(/^tmdb-tv-/, '')
  if (type === 'game') return externalId.replace(/^igdb-/, '').replace(/^steam-/, 'steam-')
  if (type === 'boardgame') return externalId.replace(/^bgg-/, '')
  return externalId
}

function pickTitle(row: CatalogRow) {
  return cleanString(row.title_en) || cleanString(row.title_original) || cleanString(row.title) || cleanString(row.title_it)
}

function pickDescription(row: CatalogRow) {
  return cleanString(row.description_en) || cleanString(row.description) || cleanString(row.description_it)
}

function pickCover(row: CatalogRow) {
  return cleanString(row.cover_image_en) || cleanString(row.cover_image) || cleanString(row.cover_image_it)
}

function qualityAsFiveStar(row: CatalogRow) {
  const raw = Number(row.score || row.quality_score || 0)
  if (!Number.isFinite(raw) || raw <= 0) return undefined
  return Math.max(0, Math.min(5, Math.round(raw / 2) / 10))
}

function rowToRecommendation(
  row: CatalogRow,
  tasteProfile: TasteProfile,
  isAlreadyOwned: IsAlreadyOwned,
  exposurePolicy?: ExposurePolicy,
): Recommendation | null {
  const title = pickTitle(row)
  const cover = pickCover(row)
  if (!title || !cover || !row.external_id) return null

  const recId = canonicalRecommendationId(row.media_type, row.external_id)
  if (!recId || exposurePolicy?.hardBlockedIds.has(recId) || exposurePolicy?.hardBlockedIds.has(row.external_id)) return null
  if (isAlreadyOwned(row.media_type, recId, title) || isAlreadyOwned(row.media_type, row.external_id, title)) return null

  const genres = Array.isArray(row.genres) ? row.genres.filter(Boolean).slice(0, 16) : []
  const baseMatch = computeMatchScore(genres, [], tasteProfile)
  const quality = Number(row.quality_score || 0)
  const popularity = Number(row.popularity_score || 0)
  const year = Number(row.year || 0) || undefined
  let matchScore = Math.round(baseMatch * 0.72 + Math.min(100, quality || Number(row.score || 0) || 55) * 0.22 + Math.min(100, popularity) * 0.06)
  matchScore = Math.min(100, Math.round(matchScore * releaseFreshnessMult(year)))

  const isStrongQuality = quality >= 72 || Number(row.score || 0) >= 75
  if (isStrongQuality) matchScore = Math.min(100, matchScore + 5)
  if (matchScore < 35 && !isStrongQuality) return null

  const rec: Recommendation = {
    id: recId,
    title,
    type: row.media_type,
    coverImage: cover,
    year,
    genres,
    score: qualityAsFiveStar(row),
    description: pickDescription(row),
    why: buildWhyV3(genres, recId, title, tasteProfile, matchScore, matchScore < 62, {}),
    matchScore: Math.max(35, matchScore),
    isDiscovery: matchScore < 62,
    isSerendipity: matchScore < 52 && isStrongQuality,
    isAwardWinner: quality >= 82 || Number(row.score || 0) >= 82,
  }

  return Object.assign(rec, {
    external_id: row.external_id,
    title_original: row.title_original || undefined,
    title_en: row.title_en || undefined,
    title_it: row.title_it || undefined,
    description_en: row.description_en || undefined,
    description_it: row.description_it || undefined,
    cover_image: cover,
    cover_image_en: row.cover_image_en || undefined,
    cover_image_it: row.cover_image_it || undefined,
    localized: row.localized || {},
    source: row.source || undefined,
  }) as Recommendation
}

async function fetchCatalogWindow(supabase: SupabaseLike, type: MediaType, from: number, limit: number) {
  const { data, error } = await supabase
    .from('media_catalog')
    .select('media_type,external_id,title,title_original,title_en,title_it,description,description_en,description_it,cover_image,cover_image_en,cover_image_it,year,genres,score,quality_score,popularity_score,source,localized')
    .eq('media_type', type)
    .gte('quality_score', 25)
    .order('quality_score', { ascending: false })
    .order('popularity_score', { ascending: false })
    .range(from, from + limit - 1)

  if (error || !Array.isArray(data)) return []
  return data as CatalogRow[]
}

export async function fetchCatalogBackfillCandidates(options: {
  supabase?: SupabaseLike
  type: MediaType
  tasteProfile: TasteProfile
  isAlreadyOwned: IsAlreadyOwned
  exposurePolicy?: ExposurePolicy
  existingItems?: Recommendation[]
  targetSize?: number
}): Promise<Recommendation[]> {
  const { supabase, type, tasteProfile, isAlreadyOwned, exposurePolicy, existingItems = [], targetSize = 200 } = options
  if (!supabase) return []

  const scanLimit = CATALOG_SCAN_LIMIT[type] || 900
  const historicalCount = exposurePolicy?.historicalShownIds.size || 0
  const deepOffset = Math.max(0, Math.floor(historicalCount / Math.max(1, targetSize)) * targetSize)
  const windows = [
    [0, Math.min(scanLimit, targetSize * 3)],
    [deepOffset, Math.min(scanLimit, targetSize * 2)],
  ] as const

  const rows = (await Promise.all(windows.map(([from, limit]) => fetchCatalogWindow(supabase, type, from, limit))))
    .flat()

  const seenIds = new Set(existingItems.map(item => `${item.type}:${item.id}`))
  const seenTitles = new Set(existingItems.map(item => normalizeTitle(item.title)).filter(Boolean))
  const out: Recommendation[] = []

  for (const row of rows) {
    const rec = rowToRecommendation(row, tasteProfile, isAlreadyOwned, exposurePolicy)
    if (!rec) continue
    const idKey = `${rec.type}:${rec.id}`
    const titleKey = normalizeTitle(rec.title)
    if (seenIds.has(idKey) || seenTitles.has(titleKey)) continue
    seenIds.add(idKey)
    seenTitles.add(titleKey)
    out.push(rec)
  }

  return out.sort((a, b) => b.matchScore - a.matchScore).slice(0, targetSize * 3)
}
