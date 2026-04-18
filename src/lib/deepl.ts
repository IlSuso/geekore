// DeepL translation utility — server-side only
// Free-tier keys end with ":fx"; all others use the Pro endpoint.
// In-memory cache capped at MAX_ENTRIES to avoid unbounded growth across
// warm Vercel invocations.

const MAX_ENTRIES = 2000
const cache = new Map<string, string>()

function apiBase(): string {
  const key = process.env.DEEPL_API_KEY ?? ''
  return key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2'
    : 'https://api.deepl.com/v2'
}

/**
 * Batch-translate an array of English strings to Italian.
 * Returns the original strings unchanged if DEEPL_API_KEY is missing,
 * the text is empty, or DeepL returns an error.
 */
export async function translateTexts(
  texts: string[],
  targetLang = 'IT',
  sourceLang = 'EN',
): Promise<string[]> {
  const key = process.env.DEEPL_API_KEY
  if (!key || texts.length === 0) return texts

  const results: string[] = new Array(texts.length)
  const toTranslate: { i: number; text: string }[] = []

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]
    if (!t) { results[i] = t; continue }
    const hit = cache.get(t)
    if (hit !== undefined) {
      results[i] = hit
    } else {
      results[i] = t
      toTranslate.push({ i, text: t })
    }
  }

  if (toTranslate.length === 0) return results

  try {
    const res = await fetch(`${apiBase()}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: toTranslate.map(t => t.text),
        source_lang: sourceLang,
        target_lang: targetLang,
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) return results

    const json = await res.json()
    const translations: Array<{ text: string }> = json.translations ?? []

    for (let j = 0; j < toTranslate.length; j++) {
      const translated = translations[j]?.text
      if (!translated) continue
      results[toTranslate[j].i] = translated
      if (cache.size >= MAX_ENTRIES) {
        cache.delete(cache.keys().next().value!)
      }
      cache.set(toTranslate[j].text, translated)
    }
  } catch {
    // Graceful degradation: return original English text
  }

  return results
}

export async function translateText(
  text: string,
  targetLang = 'IT',
  sourceLang = 'EN',
): Promise<string> {
  if (!text) return text
  const [result] = await translateTexts([text], targetLang, sourceLang)
  return result
}
