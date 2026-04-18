// DeepL translation utility — server-side only
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
  if (!url || !key) {
    console.warn('[DeepL] getSupabase: mancano env vars', { hasUrl: !!url, hasKey: !!key })
    return null
  }
  return createClient(url, key)
}

export async function translateTexts(
  texts: string[],
  targetLang = 'IT',
  sourceLang = 'EN',
): Promise<string[]> {
  const apiKey = process.env.DEEPL_API_KEY

  console.log('[DeepL] translateTexts chiamata', {
    hasApiKey: !!apiKey,
    keyPreview: apiKey ? `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}` : 'MANCANTE',
    isFree: apiKey?.endsWith(':fx'),
    textsCount: texts.length,
    targetLang,
  })

  if (!apiKey) {
    console.error('[DeepL] ERRORE CRITICO: DEEPL_API_KEY non configurata — traduzioni disabilitate')
    return texts
  }
  if (texts.length === 0) return texts

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

  const memHits = texts.length - toTranslate.length
  console.log('[DeepL] mem-cache:', { hits: memHits, misses: toTranslate.length })

  if (toTranslate.length === 0) return results

  const endpoint = `${deeplBase()}/translate`
  console.log('[DeepL] chiamata API:', { endpoint, testi: toTranslate.length })

  try {
    const res = await fetch(endpoint, {
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

    console.log('[DeepL] risposta HTTP:', { status: res.status, ok: res.ok })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '(no body)')
      console.error('[DeepL] ERRORE API:', { status: res.status, body: errBody })
      return results
    }

    const json = await res.json()
    const translations: Array<{ text: string }> = json.translations ?? []

    console.log('[DeepL] traduzioni ricevute:', translations.length, '/', toTranslate.length)

    let successCount = 0
    for (let j = 0; j < toTranslate.length; j++) {
      const translated = translations[j]?.text
      if (!translated) continue
      results[toTranslate[j].i] = translated
      if (memCache.size >= MEM_MAX) memCache.delete(memCache.keys().next().value!)
      memCache.set(toTranslate[j].text, translated)
      successCount++
    }

    console.log('[DeepL] OK — tradotti con successo:', successCount, '/', toTranslate.length)
  } catch (err) {
    console.error('[DeepL] ECCEZIONE durante la chiamata API:', err)
  }

  return results
}

export async function translateWithCache(
  items: Array<{ id: string; text: string }>,
  targetLang = 'IT',
  sourceLang = 'EN',
): Promise<Record<string, string>> {
  console.log('[DeepL] translateWithCache chiamata', { items: items.length, targetLang })

  const result: Record<string, string> = {}
  for (const item of items) result[item.id] = item.text

  const withText = items.filter(i => i.text)
  if (withText.length === 0) {
    console.log('[DeepL] nessun testo da tradurre')
    return result
  }

  const supabase = getSupabase()
  const dbCached = new Map<string, string>()

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('translations_cache')
        .select('id, text_it')
        .in('id', withText.map(i => i.id))

      if (error) {
        console.error('[DeepL] Supabase translations_cache errore:', error.message, '— tabella mancante? Esegui: CREATE TABLE translations_cache (id TEXT PRIMARY KEY, text_it TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())')
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
    console.warn('[DeepL] Supabase non disponibile — salto DB cache')
  }

  const misses = withText.filter(i => !dbCached.has(i.id))
  console.log('[DeepL] miss da tradurre via DeepL:', misses.length)

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
    if (error) console.error('[DeepL] upsert translations_cache fallito:', error.message)
    else console.log('[DeepL] persistite', rows.length, 'traduzioni in translations_cache')
  }

  return result
}
