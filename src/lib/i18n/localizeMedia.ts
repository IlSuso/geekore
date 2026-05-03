import type { AppLocale } from './serverLocale'

type MediaLike = Record<string, any>

function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  if (!text) return undefined
  const bad = text.toLowerCase()
  if (bad === 'null' || bad === 'undefined' || bad === 'nan' || bad === 'n/a' || bad === 'none') return undefined
  return text
}

function localizedField(item: MediaLike, locale: AppLocale, field: 'title' | 'description'): string | undefined {
  const fromJson = clean(item.localized?.[locale]?.[field])
  if (fromJson) return fromJson

  const direct = clean(item[`${field}_${locale}`])
  if (direct) return direct

  if (locale === 'it') {
    return clean(item[field])
      || clean(item[`${field}_en`])
      || clean(item[`${field}_original`])
  }

  return clean(item[`${field}_en`])
    || clean(item[`${field}_original`])
    || clean(item[field])
    || clean(item[`${field}_it`])
}

export function localizeMediaItem<T extends MediaLike>(item: T, locale: AppLocale): T {
  const title = localizedField(item, locale, 'title')
    || clean(item.title)
    || clean(item.name)
    || clean(item.title_original)
    || clean(item.title_en)

  const description = localizedField(item, locale, 'description')
    || clean(item.description)

  return {
    ...item,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  }
}

export function localizeMediaList<T extends MediaLike>(items: T[], locale: AppLocale): T[] {
  return items.map(item => localizeMediaItem(item, locale))
}
