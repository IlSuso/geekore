// Translation utility — server-side only
// Primary: DeepL (alta qualità, 500k char/mese free)
// Fallback: Google Translate free endpoint (nessun limite pratico, nessuna chiave)
// Cache: Supabase translations_cache (persistente) + in-memory (per processo)

import { createClient } from '@supabase/supabase-js'

const MEM_MAX = 500
const memCache = new Map<string, string>()
const DEEPL_BATCH_MAX = 20
const FREE_CONCURRENCY = 8  // richieste parallele al fallback

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

// ── Google Translate free endpoint ───────────────────────────────────────────
// Nessuna chiave, nessun limite mensile, parallelo.

async function googleTranslateOne(text: string, targetLang: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const json = await res.json()
    // formato: [[["tradotto","originale",...]], ...]
    const parts: string[] = (json?.[0] || [])
      .map((part: any) => part?.[0] || '')
      .filter(Boolean)
    const translated = parts.join('')
    return translated && translated !== text ? translated : null
  } catch {
    return null
  }
}

export async function freeTranslateBatch(texts: string[], targetLang = 'IT'): Promise<string[]> {
  const lang = targetLang.toLowerCase()
  const results = new Array<string>(texts.length)

  // Pool di concorrenza limitata
  let idx = 0
  async function worker() {
    while (idx < texts.length) {
      const i = idx++
      const text = texts[i]
      if (!text) { results[i] = text; continue }
      const hit = memCache.get(text)
      if (hit !== undefined) { results[i] = hit; continue }
      const translated = await googleTranslateOne(text, lang)
      results[i] = translated || text
      if (translated) {
        if (memCache.size >= MEM_MAX) memCache.delete(memCache.keys().next().value!)
        memCache.set(text, translated)
      }
    }
  }

  const workers = Array.from({ length: Math.min(FREE_CONCURRENCY, texts.length) }, worker)
  await Promise.all(workers)

  const successCount = results.filter((r, i) => r !== texts[i]).length
  console.log('[Translate] Google fallback:', successCount, '/', texts.length, 'tradotti')
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

  console.log('[Translate] translateTexts', {
    engine: apiKey ? 'DeepL' : 'Google (no key)',
    textsCount: texts.length,
    keyPreview: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : 'MANCANTE',
    isFree: apiKey?.endsWith(':fx'),
  })

  if (!apiKey) {
    console.warn('[Translate] DEEPL_API_KEY mancante — uso Google Translate')
    return freeTranslateBatch(texts, targetLang)
  }

  // Controlla mem-cache
  const results: string[] = new Array(texts.length)
  const toTranslate: { i: number; text: string }[] = []
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i]
    if (!t) { results[i] = t; continue }
    const hit = memCache.get(t)
    if (hit !== undefined) { results[i] = hit }
    else { results[i] = t; toTranslate.push({ i, text: t }) }
  }

  if (toTranslate.length === 0) return results

  // Chunk DeepL per non bruciare quota
  const chunks: typeof toTranslate[] = []
  for (let i = 0; i < toTranslate.length; i += DEEPL_BATCH_MAX) {
    chunks.push(toTranslate.slice(i, i + DEEPL_BATCH_MAX))
  }

  let useGoogleFromNow = false

  for (const chunk of chunks) {
    if (useGoogleFromNow) {
      const fallback = await freeTranslateBatch(chunk.map(c => c.text), targetLang)
      chunk.forEach((c, j) => { results[c.i] = fallback[j] || c.text })
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

      console.log('[Translate] DeepL chunk:', { status: res.status, size: chunk.length })

      if (res.status === 456) {
        const body = await res.text().catch(() => '')
        console.warn('[Translate] DeepL quota esaurita (456):', body, '→ switch a Google')
        useGoogleFromNow = true
        const fallback = await freeTranslateBatch(chunk.map(c => c.text), targetLang)
        chunk.forEach((c, j) => { results[c.i] = fallback[j] || c.text })
        continue
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error('[Translate] DeepL errore:', res.status, body, '→ switch a Google')
        useGoogleFromNow = true
        const fallback = await freeTranslateBatch(chunk.map(c => c.text), targetLang)
        chunk.forEach((c, j) => { results[c.i] = fallback[j] || c.text })
        continue
      }

      const json = await res.json()
      const translations: Array<{ text: string }> = json.translations ?? []
      let ok = 0
      for (let j = 0; j < chunk.length; j++) {
        const t = translations[j]?.text
        if (!t) continue
        results[chunk[j].i] = t
        if (memCache.size >= MEM_MAX) memCache.delete(memCache.keys().next().value!)
        memCache.set(chunk[j].text, t)
        ok++
      }
      console.log('[Translate] DeepL chunk OK:', ok, '/', chunk.length)
    } catch (err) {
      console.error('[Translate] DeepL eccezione:', err, '→ switch a Google')
      useGoogleFromNow = true
      const fallback = await freeTranslateBatch(chunk.map(c => c.text), targetLang)
      chunk.forEach((c, j) => { results[c.i] = fallback[j] || c.text })
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
  console.log('[Translate] translateWithCache', { items: items.length })

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
        console.error('[Translate] translations_cache errore:', error.message,
          '— crea la tabella: CREATE TABLE translations_cache (id TEXT PRIMARY KEY, text_it TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())')
      } else {
        console.log('[Translate] DB cache hit:', data?.length ?? 0, '/', withText.length)
        for (const row of data ?? []) {
          dbCached.set(row.id, row.text_it)
          result[row.id] = row.text_it
        }
      }
    } catch (err) {
      console.error('[Translate] Supabase eccezione:', err)
    }
  } else {
    console.warn('[Translate] Supabase non disponibile — SUPABASE_SERVICE_ROLE_KEY mancante?')
  }

  const misses = withText.filter(i => !dbCached.has(i.id))
  console.log('[Translate] miss:', misses.length, '/ cached:', dbCached.size)
  if (misses.length === 0) return result

  const translated = await freeTranslateBatch(misses.map(i => i.text), targetLang)

  const rows: Array<{ id: string; text_it: string }> = []
  for (let j = 0; j < misses.length; j++) {
    const t = translated[j]
    if (!t) continue
    result[misses[j].id] = t
    if (t !== misses[j].text) rows.push({ id: misses[j].id, text_it: t })
  }

  if (supabase && rows.length > 0) {
    const { error } = await supabase
      .from('translations_cache')
      .upsert(rows, { onConflict: 'id' })
    if (error) console.error('[Translate] upsert fallito:', error.message)
    else console.log('[Translate] persistite', rows.length, 'traduzioni in cache')
  }

  return result
}
