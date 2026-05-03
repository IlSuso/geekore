import type { MediaType } from '@/types'

export const MEDIA_TYPES = new Set<MediaType>([
  'anime',
  'manga',
  'game',
  'tv',
  'movie',
  'boardgame',
])

export const MEDIA_TYPES_WITH_LEGACY = new Set<string>([
  'anime',
  'manga',
  'game',
  'tv',
  'movie',
  'boardgame',
  'board_game',
  'book',
])

const BAD_STRING_VALUES = new Set([
  '0',
  'null',
  'undefined',
  'nan',
  'none',
  'n/a',
  'na',
  '-',
  '--',
])

export function cleanString(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null
  const clean = value
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()

  if (!clean) return null
  if (BAD_STRING_VALUES.has(clean.toLowerCase())) return null
  return clean
}

export function cleanLongText(value: unknown, max = 3000): string | null {
  if (typeof value !== 'string') return null
  const clean = value
    .replace(/\u0000/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!clean) return null
  if (BAD_STRING_VALUES.has(clean.toLowerCase())) return null
  return clampAtSentence(clean, max)
}

export function clampAtSentence(text: string, maxLen = 900): string {
  const clean = text.replace(/\s+([,.;:!?])/g, '$1').trim()
  if (!clean || clean.length <= maxLen) return clean

  const slice = clean.slice(0, maxLen)
  const sentenceEnd = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('! '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('; '),
    slice.lastIndexOf('.\n'),
    slice.lastIndexOf('!\n'),
    slice.lastIndexOf('?\n'),
  )

  if (sentenceEnd > maxLen * 0.55) return slice.slice(0, sentenceEnd + 1).trim()

  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim()
}

export function cleanStringArray(value: unknown, maxItems = 60, maxLen = 120): string[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const out: string[] = []

  for (const raw of value) {
    const clean = cleanString(typeof raw === 'number' ? String(raw) : raw, maxLen)
    if (!clean) continue

    const normalized = clean.toLowerCase()
    if (BAD_STRING_VALUES.has(normalized)) continue

    // Quasi sempre questi sono ID numerici sporchi, non label utente.
    if (/^\d+$/.test(normalized)) continue

    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(clean)

    if (out.length >= maxItems) break
  }

  return out
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function positiveNumberOrNull(value: unknown): number | null {
  const n = numberOrNull(value)
  return n !== null && n > 0 ? n : null
}

export function cleanYear(value: unknown): number | null {
  const n = numberOrNull(value)
  if (n === null) return null
  const year = Math.trunc(n)
  const currentYear = new Date().getFullYear() + 3
  if (year < 1870 || year > currentYear) return null
  return year
}

export function cleanRating(value: unknown): number | null {
  const n = numberOrNull(value)
  if (n === null) return null
  if (n < 0) return null
  return Math.min(5, Math.round(n * 2) / 2)
}

export function cleanScore(value: unknown): number | null {
  const n = numberOrNull(value)
  if (n === null) return null
  if (n < 0) return null
  return Math.round(Math.min(n, 100) * 10) / 10
}

export function cleanMatchScore(value: unknown): number {
  const n = numberOrNull(value)
  if (n === null) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function cleanHttpsUrl(value: unknown, max = 1000): string | null {
  const clean = cleanString(value, max)
  if (!clean) return null

  try {
    const url = new URL(clean)
    if (url.protocol !== 'https:') return null
    return clean
  } catch {
    return null
  }
}

export function cleanMediaType(value: unknown, allowLegacy = false): string | null {
  const clean = cleanString(value, 40)
  if (!clean) return null
  if (allowLegacy && MEDIA_TYPES_WITH_LEGACY.has(clean)) return clean
  if (MEDIA_TYPES.has(clean as MediaType)) return clean
  return null
}

export function normalizeExternalId(value: unknown): string | null {
  return cleanString(value, 200)
}

export function normalizeTitle(value: unknown): string | null {
  return cleanString(value, 300)
}

export function normalizeMediaCore(raw: any, options?: { allowLegacyTypes?: boolean }) {
  const externalId = normalizeExternalId(raw?.id ?? raw?.external_id)
  const title = normalizeTitle(raw?.title)
  const type = cleanMediaType(raw?.type, options?.allowLegacyTypes === true)

  if (!externalId || !title || !type) return null

  return {
    external_id: externalId,
    title,
    type,
    cover_image: cleanHttpsUrl(raw?.coverImage ?? raw?.cover_image),
    year: cleanYear(raw?.year),
    genres: cleanStringArray(raw?.genres),
    score: cleanScore(raw?.score),
    description: cleanLongText(raw?.description, 3000),
    why: cleanLongText(raw?.why, 1000),
    match_score: cleanMatchScore(raw?.matchScore ?? raw?.match_score),
    episodes: positiveNumberOrNull(raw?.episodes),
    authors: cleanStringArray(raw?.authors),
    developers: cleanStringArray(raw?.developers),
    platforms: cleanStringArray(raw?.platforms),
    source: cleanString(raw?.source, 120),
  }
}
