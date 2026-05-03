import { translateWithCache } from '@/lib/deepl'
import { truncateAtSentence } from '@/lib/utils'

const IT_HINTS = new Set([
  ' il ', ' lo ', ' la ', ' gli ', ' le ', ' un ', ' una ', ' che ', ' dei ', ' degli ', ' delle ',
  ' questo ', ' questa ', ' sono ', ' viene ', ' nella ', ' nello ', ' dalla ', ' dalla ', ' con ',
  ' per ', ' non ', ' più ', ' può ', ' quando ', ' dopo ', ' prima ', ' mentre ', ' anche ', ' storia ',
])

const EN_HINTS = new Set([
  ' the ', ' and ', ' of ', ' to ', ' in ', ' that ', ' with ', ' for ', ' from ', ' this ', ' his ',
  ' her ', ' their ', ' when ', ' after ', ' before ', ' while ', ' into ', ' against ', ' about ',
  ' follows ', ' story ', ' world ', ' life ', ' must ', ' has ', ' have ', ' will ', ' can ',
])

function normalizeSpaces(text: string): string {
  return text.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim()
}

export function cleanDescriptionText(value: unknown, maxLen = 900): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = normalizeSpaces(value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
  )

  if (!clean) return undefined
  if (/^(0|null|undefined|nan|n\/a)$/i.test(clean)) return undefined
  return clean
}

export function isProbablyEnglish(text: string): boolean {
  const clean = ` ${normalizeSpaces(text).toLowerCase()} `
  if (!clean.trim()) return false

  let en = 0
  let it = 0
  for (const token of EN_HINTS) if (clean.includes(token)) en += 1
  for (const token of IT_HINTS) if (clean.includes(token)) it += 1

  // Accenti e parole italiane forti: non tradurre.
  if (/[àèéìòù]/i.test(clean) && it >= 1) return false
  if (/(\bperché\b|\bpiù\b|\bcosì\b|\bpuò\b|\bè\b)/i.test(clean)) return false

  // Parole inglesi forti o struttura molto inglese.
  if (/(\bthe\b|\band\b|\bwith\b|\bfollows\b|\bmust\b|\btheir\b|\bworld\b)/i.test(clean) && en > it) return true
  return en >= 3 && en > it + 1
}

export async function translateDescriptionIfNeeded(
  id: string,
  description: unknown,
  options?: { maxLen?: number; force?: boolean; cachePrefix?: string }
): Promise<string | undefined> {
  const maxLen = options?.maxLen ?? 900
  const clean = cleanDescriptionText(description, Math.max(maxLen, 1200))
  if (!clean) return undefined

  if (!options?.force && !isProbablyEnglish(clean)) {
    return clean
  }

  const cacheId = `${options?.cachePrefix || 'description'}:${id}`
  const translated = await translateWithCache([{ id: cacheId, text: clean }], 'IT', 'EN')
  return translated[cacheId] || clean
}

export async function translateRecommendationDescriptions<T extends Record<string, any>>(
  recommendations: Record<string, T[]> | T[],
  options?: { maxLen?: number; cachePrefix?: string }
): Promise<typeof recommendations> {
  const groups = Array.isArray(recommendations)
    ? { items: recommendations }
    : recommendations

  const items = Object.values(groups).flat().filter(Boolean)
  const toTranslate = items
    .map((item: any) => {
      const clean = cleanDescriptionText(item.description, Math.max(options?.maxLen ?? 900, 1200))
      if (!clean || !isProbablyEnglish(clean)) {
        if (clean) item.description = clean
        return null
      }
      return {
        id: `${options?.cachePrefix || 'recommendation'}:${item.type || 'media'}:${item.id || item.external_id || item.title}`,
        text: clean,
        item,
      }
    })
    .filter((x): x is { id: string; text: string; item: any } => Boolean(x))

  if (toTranslate.length > 0) {
    const translated = await translateWithCache(toTranslate.map(({ id, text }) => ({ id, text })), 'IT', 'EN')
    for (const row of toTranslate) {
      row.item.description = translated[row.id] || row.text
    }
  }

  return recommendations
}

export async function translatePayloadDescriptions<T extends Record<string, any>>(
  payload: T,
  options?: { maxLen?: number; cachePrefix?: string }
): Promise<T> {
  if (payload?.recommendations) {
    await translateRecommendationDescriptions(payload.recommendations as any, options)
  }
  if (Array.isArray(payload?.items)) {
    await translateRecommendationDescriptions(payload.items as any, options)
  }
  if (Array.isArray(payload?.rails)) {
    for (const rail of payload.rails) {
      if (Array.isArray(rail?.items)) await translateRecommendationDescriptions(rail.items as any, options)
    }
  }
  return payload
}
