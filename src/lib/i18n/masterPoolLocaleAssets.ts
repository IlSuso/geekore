import type { Locale } from '@/lib/i18n/serverLocale'
import type { Recommendation } from '@/lib/reco/types'
import { localizeRecommendationsRecord } from '@/lib/i18n/recommendationLocale'
import { writeMediaLocaleAssets } from '@/lib/i18n/mediaLocalePersistentCache'

type SupabaseLike = {
  from: (table: string) => any
}

type MasterPoolRow = {
  media_type: string
  data: unknown
}

const LOCALES: Locale[] = ['it', 'en']

function otherLocale(locale: Locale): Locale {
  return locale === 'it' ? 'en' : 'it'
}

function normalizeType(value: unknown): string {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'serie' || raw === 'series' || raw === 'tv_show' || raw === 'show') return 'tv'
  if (raw === 'film') return 'movie'
  if (raw === 'board_game' || raw === 'board-game' || raw === 'board') return 'boardgame'
  if (raw === 'videogame' || raw === 'video_game' || raw === 'video-game' || raw === 'games') return 'game'
  return raw || 'media'
}

function flattenRows(rows: MasterPoolRow[]): Recommendation[] {
  const out: Recommendation[] = []
  for (const row of rows || []) {
    if (!Array.isArray(row.data)) continue
    for (const raw of row.data) {
      if (!raw || typeof raw !== 'object') continue
      const item = raw as Recommendation
      out.push({
        ...item,
        type: normalizeType((item as any).type || row.media_type) as any,
      })
    }
  }
  return out
}

function groupByType(items: Recommendation[]): Record<string, Recommendation[]> {
  const grouped: Record<string, Recommendation[]> = {}
  for (const item of items || []) {
    const type = normalizeType((item as any).type || (item as any).media_type)
    if (!grouped[type]) grouped[type] = []
    grouped[type].push({ ...item, type: type as any })
  }
  return grouped
}

export async function persistLocaleAssetsForRecommendationItems(
  items: Recommendation[],
  locale: Locale,
  options?: { maxSyncTranslations?: number; maxSyncTitles?: number },
): Promise<void> {
  if (!Array.isArray(items) || items.length === 0) return

  const grouped = groupByType(items)
  const localized = await localizeRecommendationsRecord(grouped, locale, {
    // Qui NON stiamo renderizzando una griglia: stiamo preparando il master pool.
    // Quindi le descrizioni devono essere importate subito nella lingua richiesta.
    maxSyncTranslations: options?.maxSyncTranslations ?? items.length,
    maxSyncTitles: options?.maxSyncTitles ?? Math.min(items.length, 240),
  })

  const flat = Object.values(localized).flat()
  await writeMediaLocaleAssets(flat, locale, 'full')
}

export async function persistLocaleAssetsForMasterRows(
  rows: MasterPoolRow[],
  locale: Locale,
  options?: { includeAlternateLocale?: boolean; maxSyncTranslations?: number; maxSyncTitles?: number },
): Promise<void> {
  const items = flattenRows(rows)
  if (items.length === 0) return

  const locales = options?.includeAlternateLocale
    ? LOCALES
    : [locale]

  for (const targetLocale of locales) {
    await persistLocaleAssetsForRecommendationItems(items, targetLocale, {
      maxSyncTranslations: options?.maxSyncTranslations ?? items.length,
      maxSyncTitles: options?.maxSyncTitles ?? Math.min(items.length, 240),
    })
  }
}

export async function persistLocaleAssetsForUserMasterPool({
  supabase,
  userId,
  locale,
  includeAlternateLocale = false,
}: {
  supabase: SupabaseLike
  userId: string
  locale: Locale
  includeAlternateLocale?: boolean
}): Promise<void> {
  const { data } = await supabase
    .from('master_recommendations_pool')
    .select('media_type, data')
    .eq('user_id', userId)

  if (!Array.isArray(data) || data.length === 0) return

  await persistLocaleAssetsForMasterRows(data as MasterPoolRow[], locale, {
    includeAlternateLocale,
  })
}

export function isLocaleWarningZoneActive(headers: Headers, searchParams?: URLSearchParams): boolean {
  return headers.get('x-geekore-locale-dual') === '1'
    || headers.get('x-geekore-warning-zone') === '1'
    || searchParams?.get('dualLocale') === '1'
}

export function alternateLocale(locale: Locale): Locale {
  return otherLocale(locale)
}
