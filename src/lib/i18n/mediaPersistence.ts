import type { AppLocale } from './serverLocale'

type MediaInput = Record<string, any>

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  const low = text.toLowerCase()
  if (low === 'null' || low === 'undefined' || low === 'nan' || low === 'n/a' || low === 'none') return null
  return text
}

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

export function buildLocalizedMediaPayload(input: MediaInput, locale: AppLocale = 'en') {
  const title = cleanText(input.title) || cleanText(input.name) || cleanText(input.title_en) || cleanText(input.title_original)
  const description = cleanText(input.description) ? stripHtml(String(input.description)) : null

  const titleOriginal = cleanText(input.title_original) || title
  const titleEn = cleanText(input.title_en) || (locale === 'en' ? title : titleOriginal)
  const titleIt = cleanText(input.title_it) || (locale === 'it' ? title : null)

  const descriptionEn = cleanText(input.description_en) || (locale === 'en' ? description : null)
  const descriptionIt = cleanText(input.description_it) || (locale === 'it' ? description : null)

  const localized = {
    ...(input.localized && typeof input.localized === 'object' ? input.localized : {}),
    ...(titleEn || descriptionEn ? {
      en: {
        ...(input.localized?.en || {}),
        ...(titleEn ? { title: titleEn } : {}),
        ...(descriptionEn ? { description: descriptionEn } : {}),
      },
    } : {}),
    ...(titleIt || descriptionIt ? {
      it: {
        ...(input.localized?.it || {}),
        ...(titleIt ? { title: titleIt } : {}),
        ...(descriptionIt ? { description: descriptionIt } : {}),
      },
    } : {}),
  }

  return {
    title_original: titleOriginal,
    title_en: titleEn,
    title_it: titleIt,
    description_en: descriptionEn,
    description_it: descriptionIt,
    localized,
  }
}
