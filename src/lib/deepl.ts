// DeepL translation utility — server-side only
// Falls back to MyMemory (free, no key) when DeepL quota is exceeded or key missing.
import { createClient } from '@supabase/supabase-js'

const MEM_MAX = 500
const memCache = new Map<string, string>()

// Max items per DeepL batch — keeps monthly quota usage predictable
const DEEPL_BATCH_MAX = 20

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

// ── MyMemory fallback ─────────────────────────────────────────────────────────
// Free, no API key required. Rate limit: ~5 req/s, ~1000 words/day per IP.
// Used only when DeepL is unavailable or quota exceeded.

async function myMemoryTranslate(text: string, targetLang = 'IT'): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang.toLowerCase()}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) })
    if (!res.ok) return null
    const json = await res.json()
    const translated = json?.responseData?.translatedText
    if (!translated || translated === text) return null
    return translated
  } catch {
    return null
  }
}

async function myMemoryBatch(texts: string[], targetLang = 'IT'): Promise<string[]> {
  // Sequential with small delay to respect rate limits
  const results: string[] = []
  for (const text of texts) {
    if (!text) { results.push(text); continue }
    const hit = memCache.get(text)
    if (hit !== undefined) { results.push(hit); continue }
    const translated = await myMemoryTranslate(text, targetLang)
    const final = translated || text
    if (translated) {
      if (memCache.size >= MEM_MAX) memCache.delete(memCache.keys().next().value!)
      memCache.set(text, translated)
    }
    results.push(final)
    await new Promise(r => setTimeout(r, 120)) // ~8 req/s, stay under limit
  }
  return results
}

// ── DeepL ─────────────────────────────────────────────────────────────────────

export async function translateTexts(
  texts: string[],
  targetLang = 'IT',
  sourceLang = 'EN',
): Promise<string[]> {
  if (texts.length === 0) return texts

  const apiKey = process.env.DEEPL_API_KEY

  console.log('[DeepL] translateTexts', {
    hasApiKey: !!apiKey,
    keyPreview: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : 'MANCANTE',
    isFree: apiKey?.endsWith(':fx'),
    textsCount: texts.length,
    targetLang,
  })

  if (!apiKey) {
    console.warn('[DeepL] chiave mancante — uso MyMemory come fallback')
    return myMemoryBatch(texts, targetLang)
  }

  // Check mem-cache first
  const results: string[] = new Array(texts.length)
  const toTranslate: { i: number; text: string }[] = []
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]
    if (!t) { results[i] = t; continue }
    const hit = memCache.get(t)
    if (hit !== undefined) { results[i] = hit }
    else { results[i] = t; toTranslate.push({ i, text: t }) }
  }

  const memHits = texts.length - toTranslate.length
  console.log('[DeepL] mem-cache hits:', memHits, '| da tradurre:', toTranslate.length)

  if (toTranslate.length === 0) return results

  // Split in chunks to avoid burning quota in one shot
  const chunks: typeof toTranslate[] = []
  for (let i = 0; i < toTranslate.length; i += DEEPL_BATCH_MAX) {
    chunks.push(toTranslate.slice(i, i + DEEPL_BATCH_MAX))
  }

  let deeplQuotaExceeded = false

  for (const chunk of chunks) {
    if (deeplQuotaExceeded) {
      // Fallback remainder to MyMemory
      const fallbackTexts = chunk.map(c => c.text)
      const fallbackResults = await myMemoryBatch(fallbackTexts, targetLang)
      chunk.forEach((c, j) => { results[c.i] = fallbackResults[j] || c.text })
      continue
    }

    try {
      const res = await fetch(`${deeplBase()}/translate`, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: chunk.map(c => c.text),
          source_lang: sourceLang,
          target_lang: targetLang,
        }),
        signal: AbortSignal.timeout(10_000),
      })

      console.log('[DeepL] chunk risposta HTTP:', { status: res.status, ok: res.ok, size: chunk.length })

      if (res.status === 456) {
        const body = await res.text().catch(() => '')
        console.error('[DeepL] QUOTA ESAURITA (456):', body, '— fallback a MyMemory per il resto')
        deeplQuotaExceeded = true
        const fallbackTexts = chunk.map(c => c.text)
        const fallbackResults = await myMemoryBatch(fallbackTexts, targetLang)
        chunk.forEach((c, j) => { results[c.i] = fallbackResults[j] || c.text })
        continue
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error('[DeepL] ERRORE API:', res.status, body)
        continue
      }

      const json = await res.json()
      const translations: Array<{ text: string }> = json.translations ?? []
      let successCount = 0
      for (let j = 0; j < chunk.length; j++) {
        const translated = translations[j]?.text
        if (!translated) continue
        results[chunk[j].i] = translated
        if (memCache.size >= MEM_MAX) memCache.delete(memCache.keys().next().value!)
        memCache.set(chunk[j].text, translated)
        successCount++
      }
      console.log('[DeepL] chunk OK:', successCount, '/', chunk.length)
    } catch (err) {
      console.error('[DeepL] eccezione chunk:', err)
    }
  }

  return results
}

// ── translateWithCache ────────────────────────────────────────────────────────

export async function translateWithCache(
  items: Array<{ id: string; text: string }>,
  targetLang = 'IT',
  sourceLang = 'EN',
): Promise<Record<string, string>> {
  console.log('[DeepL] translateWithCache', { items: items.length, targetLang })

  const result: Record<string, string> = {}
  for (const item of items) result[item.id] = item.text

  const withText = items.filter(i => i.text)
  if (withText.length === 0) return result

  const supabase = getSupabase()
  const dbCached = new Map<string, string>()

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('translations_cache')
        .select('id, text_it')
        .in('id', withText.map(i => i.id))

      if (error) {
        console.error('[DeepL] translations_cache errore:', error.message,
          '— esegui su Supabase: CREATE TABLE translations_cache (id TEXT PRIMARY KEY, text_it TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())')
      } else {
        console.log('[DeepL] DB cache hit:', data?.length ?? 0, '/', withText.length)
        for (const row of data ?? []) {
          dbCached.set(row.id, row.text_it)
          result[row.id] = row.text_it
        }
      }
    } catch (err) {
      console.error('[DeepL] Supabase eccezione:', err)
    }
  } else {
    console.warn('[DeepL] Supabase non disponibile — SUPABASE_SERVICE_ROLE_KEY mancante?')
  }

  const misses = withText.filter(i => !dbCached.has(i.id))
  console.log('[DeepL] miss da tradurre:', misses.length)

  if (misses.length === 0) return result

  const translated = await translateTexts(misses.map(i => i.text), targetLang, sourceLang)

  const rows: Array<{ id: string; text_it: string }> = []
  for (let j = 0; j < misses.length; j++) {
    const t = translated[j]
    if (!t) continue
    result[misses[j].id] = t
    if (t !== misses[j].text) rows.push({ id: misses[j].id, text_it: t })
  }

  console.log('[DeepL] nuove traduzioni da persistere:', rows.length)

  if (supabase && rows.length > 0) {
    const { error } = await supabase
      .from('translations_cache')
      .upsert(rows, { onConflict: 'id' })
    if (error) console.error('[DeepL] upsert fallito:', error.message)
    else console.log('[DeepL] persistite', rows.length, 'in translations_cache')
  }

  return result
}
