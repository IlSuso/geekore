import { translateWithCache } from '@/lib/deepl'
import type { AppLocale } from './serverLocale'
import { localizeMediaItem } from './localizeMedia'

type MediaLike = Record<string, any>

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function translationId(item: MediaLike, sourceLang: 'en', targetLocale: AppLocale) {
  const source = item.source || item.type || 'media'
  const id = item.external_id || item.id || item.appid || item.title
  return `${source}:${id}:description:${sourceLang}->${targetLocale}`
}

export function withLocalizedFields(
  item: MediaLike,
  locale: AppLocale,
  sourceLocale: 'en' | 'it' = 'en',
) {
  const title = item.title || item.name || item.title_en || item.title_original
  const description = typeof item.description === 'string'
    ? stripHtml(item.description)
    : item.description

  const localized = {
    ...(item.localized || {}),
    [sourceLocale]: {
      ...(item.localized?.[sourceLocale] || {}),
      title,
      description,
    },
  }

  return localizeMediaItem({
    ...item,
    title_original: item.title_original || title,
    title_en: item.title_en || (sourceLocale === 'en' ? title : undefined),
    title_it: item.title_it || (sourceLocale === 'it' ? title : undefined),
    description_en: item.description_en || (sourceLocale === 'en' ? description : undefined),
    description_it: item.description_it || (sourceLocale === 'it' ? description : undefined),
    localized,
  }, locale)
}

export async function ensureItalianDescriptions<T extends MediaLike>(
  items: T[],
  options?: { maxSync?: number },
): Promise<T[]> {
  const maxSync = options?.maxSync ?? 30
  const out = items.map(item => ({ ...item })) as T[]

  const needsTranslation = out
    .filter(item => !item.description_it && !item.localized?.it?.description)
    .filter(item => item.description_en || item.localized?.en?.description || item.description)
    .slice(0, maxSync)

  if (needsTranslation.length === 0) return out

  const payload = needsTranslation.map(item => ({
    id: translationId(item, 'en', 'it'),
    text: stripHtml(String(item.description_en || item.localized?.en?.description || item.description || '')),
  }))

  const translated = await translateWithCache(payload, 'IT', 'EN')

  for (const item of needsTranslation) {
    const id = translationId(item, 'en', 'it')
    const text = translated[id]
    if (!text) continue

    const mutable = item as MediaLike
    mutable.description_it = text
    mutable.localized = {
      ...(mutable.localized || {}),
      it: {
        ...(mutable.localized?.it || {}),
        title: mutable.title_it || mutable.title || mutable.title_en || mutable.title_original,
        description: text,
      },
    }
  }

  return out
}

export async function localizeMediaForResponse<T extends MediaLike>(
  items: T[],
  locale: AppLocale,
  options?: { maxSyncTranslations?: number },
): Promise<T[]> {
  const enriched = locale === 'it'
    ? await ensureItalianDescriptions(items, { maxSync: options?.maxSyncTranslations ?? 30 })
    : items

  return enriched.map(item => localizeMediaItem(item, locale)) as T[]
}

export async function localizeRecommendationMapForResponse<T extends Record<string, MediaLike[]>>(
  recommendations: T,
  locale: AppLocale,
  options?: { maxSyncTranslations?: number },
): Promise<T> {
  const entries = await Promise.all(
    Object.entries(recommendations).map(async ([type, items]) => [
      type,
      Array.isArray(items)
        ? await localizeMediaForResponse(items, locale, options)
        : items,
    ]),
  )

  return Object.fromEntries(entries) as T
}
