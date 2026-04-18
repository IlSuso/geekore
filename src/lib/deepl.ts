// DeepL translation utility — server-side only
// Free-tier keys end with ":fx"; all others use the Pro endpoint.
//
// translateWithCache() is the main entry point for routes:
//   - checks Supabase `translations_cache` first (persistent across cold starts)
//   - calls DeepL only for uncached items
//   - writes new translations back to Supabase
//
// translateTexts() is a lower-level batch call used internally and for
// one-off cases (e.g. news sync) where Supabase is already available.

import { createClient } from '@supabase/supabase-js'

const MEM_MAX = 500
const memCache = new Map<string, string>()

function deeplBase(): string {
  const key = process.env.DEEPL_API_KEY ?? ''
  return key.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2'
    : 'https://api.deepl.com/v2'
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/**
 * Raw DeepL batch call — no DB involvement.
 * Returns original strings on error or missing key.
 */
export async function translateTexts(
  texts: string[],
  targetLang = 'IT',
  sourceLang = 'EN',
): Promise<string[]> {
  const apiKey = process.env.DEEPL_API_KEY
  if (!apiKey || texts.length === 0) return texts

  const results: string[] = new Array(texts.length)
  const toTranslate: { i: number; text: string }[] = []

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]
    if (!t) { results[i] = t; continue }
    const hit = memCache.get(t)
    if (hit !== undefined) {
      results[i] = hit
    } else {
      results[i] = t
      toTranslate.push({ i, text: t })
    }
  }

  if (toTranslate.length === 0) return results

  try {
    const res = await fetch(`${deeplBase()}/translate`, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
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
      if (memCache.size >= MEM_MAX) memCache.delete(memCache.keys().next().value!)
      memCache.set(toTranslate[j].text, translated)
    }
  } catch {
    // Graceful degradation: return original English text
  }

  return results
}

/**
 * Translate items identified by a stable ID (e.g. "igdb:1942", "bgg-12345").
 * Checks Supabase `translations_cache` first — calls DeepL only for misses,
 * then persists new translations. This keeps DeepL usage near-zero once
 * a game's description has been translated once.
 *
 * Requires the table:
 *   CREATE TABLE translations_cache (
 *     id TEXT PRIMARY KEY,
 *     text_it TEXT NOT NULL,
 *     created_at TIMESTAMPTZ DEFAULT NOW()
 *   );
 */
export async function translateWithCache(
  items: Array<{ id: string; text: string }>,
  targetLang = 'IT',
  sourceLang = 'EN',
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const item of items) result[item.id] = item.text   // fallback = original

  const withText = items.filter(i => i.text)
  if (withText.length === 0) return result

  const supabase = getSupabase()

  // 1. Check Supabase cache
  const dbCached = new Map<string, string>()
  if (supabase) {
    try {
      const { data } = await supabase
        .from('translations_cache')
        .select('id, text_it')
        .in('id', withText.map(i => i.id))
      for (const row of data ?? []) {
        dbCached.set(row.id, row.text_it)
        result[row.id] = row.text_it
        if (memCache.size >= MEM_MAX) memCache.delete(memCache.keys().next().value!)
        memCache.set(row.text_it, row.text_it)
      }
    } catch { /* table might not exist yet — fall through */ }
  }

  // 2. Identify misses
  const misses = withText.filter(i => !dbCached.has(i.id))
  if (misses.length === 0) return result

  // 3. Translate misses via DeepL
  const translated = await translateTexts(misses.map(i => i.text), targetLang, sourceLang)

  // 4. Persist and update result
  const rows: Array<{ id: string; text_it: string }> = []
  for (let j = 0; j < misses.length; j++) {
    const t = translated[j]
    if (!t) continue
    result[misses[j].id] = t
    if (t !== misses[j].text) rows.push({ id: misses[j].id, text_it: t })
  }

  if (supabase && rows.length > 0) {
    void supabase
      .from('translations_cache')
      .upsert(rows, { onConflict: 'id' })
  }

  return result
}
