// src/app/api/import/letterboxd/route.ts
//
// Gestisce tutti i formati di export Letterboxd:
//
//   watched.csv   → Date,Name,Year,Letterboxd URI          (film visti, senza voto)
//   ratings.csv   → Date,Name,Year,Letterboxd URI,Rating   (film votati, sottoinsieme di watched)
//   watchlist.csv → Date,Name,Year,Letterboxd URI          (da vedere)
//   lists/*.csv   → Letterboxd list export v7              (liste personalizzate)
//
// Logica di merge watched + ratings:
//   - watched fornisce la lista completa dei film visti (status: completed)
//   - ratings aggiunge/sovrascrive il voto per quei film
//   - un film presente in ratings ma non in watched viene comunque importato come completed
//   - nessun duplicato: la chiave è l'URI Letterboxd (o name+year come fallback)
//
// Logica liste:
//   - Il CSV di lista Letterboxd ha righe di metadati iniziali (es. "Name of list: Film Visti")
//     che vengono estratte e usate come nome lista (se l'utente non ne ha specificato uno)
//   - I film della lista vanno in user_lists + user_list_items, NON in user_media_entries
//   - Se la lista con lo stesso nome esiste già, viene aggiornata senza duplicati
//
// Logica TMDB:
//   - Cerca titolo originale + anno con risposta in it-IT
//   - Se non trova poster con anno, riprova senza anno
//   - Salva in cache titolo italiano + poster
//   - I record vengono salvati con il titolo italiano se disponibile
//
// Strategia upsert anti-duplicati:
//   1. Prima dell'inserimento si caricano i record esistenti per external_id e title
//   2. Merge in memoria: i nuovi dati arricchiscono quelli esistenti
//   3. INSERT solo per record genuinamente nuovi, UPDATE per quelli già presenti

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'

// ── Costanti TMDB ─────────────────────────────────────────────────────────────

const TMDB_BASE       = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'
const MAX_PARALLEL    = 20
const BATCH_DELAY_MS  = 100
const RETRY_DAYS      = 30

// ── Parser CSV ────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

/**
 * Parsa un CSV Letterboxd.
 *
 * Il CSV di lista Letterboxd ha questa struttura reale (export v7):
 *   ,,,,
 *   Name,Year,Letterboxd URI,Description
 *   Film Visti,,https://letterboxd.com/...,
 *   ,,,,
 *   Position,Name,Year,Letterboxd URI,Description
 *   1,The Godfather,1972,...,...
 *
 * Oppure può iniziare direttamente con l'header (watched.csv, ratings.csv, watchlist.csv).
 *
 * La strategia è:
 * 1. Cerca la riga header "corretta" — quella che ha "position" O ("name" + "year" + "letterboxd")
 * 2. Tutto ciò che precede l'header viene scansionato per estrarre il nome lista
 * 3. Le righe dati con valori che sembrano metadati (nessun anno, nessun URI) vengono filtrate
 */
function parseCSV(rawText: string): { rows: Record<string, string>[]; extractedListName: string | null } {
  const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const allLines = text.split('\n')

  let extractedListName: string | null = null
  let headerIdx = -1

  // Prima passata: cerca l'header più specifico possibile
  // Un header di lista ha "position" come prima colonna
  // Un header di watched/ratings ha "date" come prima colonna
  for (let i = 0; i < Math.min(allLines.length, 20); i++) {
    const lower = allLines[i].toLowerCase().trim()
    const cols = lower.split(',').map(c => c.trim())

    // Header lista Letterboxd: inizia con "position"
    if (cols[0] === 'position' && cols.includes('name')) {
      headerIdx = i
      break
    }
    // Header watched/ratings/watchlist: inizia con "date" e ha "name"
    if (cols[0] === 'date' && cols.includes('name') && cols.includes('year')) {
      headerIdx = i
      break
    }
    // Fallback generico: ha sia "name" che "year" e "letterboxd" da qualche parte
    if (
      cols.includes('name') &&
      cols.includes('year') &&
      lower.includes('letterboxd')
    ) {
      headerIdx = i
      break
    }
  }

  // Estrae il nome lista dalle righe prima dell'header
  const metaLines = allLines.slice(0, headerIdx === -1 ? 10 : headerIdx)
  for (const line of metaLines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.replace(/,/g, '').trim() === '') continue // riga vuota o solo virgole

    // Formato "Name of list: Film Visti" o "Name,Film Visti,..."
    const m1 = trimmed.match(/^name\s+of\s+list[:\s]+(.+)/i)
    if (m1) { extractedListName = m1[1].trim(); continue }

    // Formato CSV con prima cella "Name" e seconda cella il nome
    const cells = parseCSVLine(trimmed)
    if (cells[0]?.toLowerCase() === 'name' && cells[1] && cells[1].trim()) {
      // Potrebbe essere il nome della lista (non l'header, che avrebbe "Year" in cells[2])
      if (!cells[2] || !['year', 'letterboxd uri', 'date', 'position'].includes(cells[2].toLowerCase().trim())) {
        extractedListName = cells[1].trim()
      }
    }
  }

  if (headerIdx === -1) return { rows: [], extractedListName }

  const headers = parseCSVLine(allLines[headerIdx]).map(h => h.trim().toLowerCase())
  const rows: Record<string, string>[] = []

  for (let i = headerIdx + 1; i < allLines.length; i++) {
    const line = allLines[i].trim()
    if (!line) continue
    if (line.replace(/,/g, '').trim() === '') continue // riga solo virgole

    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim() })

    const name = row['name'] || row['title'] || ''
    if (!name) continue

    // Nei CSV lista (header con "position"), scarta le righe di metadati:
    // sono quelle dove "position" esiste come colonna ma non è un numero intero positivo
    // (es. la riga "Name,Film Visti,https://letterboxd.com/..." che descrive la lista stessa)
    if (headers.includes('position')) {
      const pos = row['position'] || ''
      if (!pos.match(/^\d+$/)) continue
    }

    // Scarta righe che sembrano metadati: hanno un name ma nessun anno E nessun URI
    // (tipico delle righe descrittive nei CSV lista)
    const hasYear = !!(row['year'] && row['year'].match(/^\d{4}$/))
    const hasURI  = !!(row['letterboxd uri'] || row['url'] || row['letterboxd_uri'])
    if (!hasYear && !hasURI) continue

    rows.push(row)
  }

  return { rows, extractedListName }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getURI(row: Record<string, string>): string {
  return row['letterboxd uri'] || row['url'] || row['letterboxd_uri'] || ''
}

function makeExternalId(row: Record<string, string>): string {
  const uri = getURI(row)
  const slug = uri ? uri.replace(/\/$/, '').split('/').pop() || '' : ''
  const nameslug = row['name'].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const year = row['year'] || ''
  if (slug) return `letterboxd-${slug}`
  return `letterboxd-${nameslug}${year ? `-${year}` : ''}`
}

function parseRating(val: string): number | null {
  if (!val || !val.trim()) return null
  const n = parseFloat(val)
  if (isNaN(n) || n <= 0) return null
  return Math.round(n * 2) / 2
}

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// ── TMDB Poster Cache ─────────────────────────────────────────────────────────

interface CacheRow {
  external_id: string
  poster_url: string | null
  title_it: string | null
  found: boolean
  last_checked: string
}

interface EnrichResult {
  posterUrl: string | null
  titleIt: string | null
}

async function loadFromCache(
  supabase: any,
  externalIds: string[]
): Promise<Map<string, EnrichResult>> {
  const result = new Map<string, EnrichResult>()
  if (externalIds.length === 0) return result

  const retryThreshold = new Date(Date.now() - RETRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  for (let i = 0; i < externalIds.length; i += 500) {
    const chunk = externalIds.slice(i, i + 500)
    const { data, error } = await supabase
      .from('tmdb_poster_cache')
      .select('external_id, poster_url, title_it, found, last_checked')
      .in('external_id', chunk)

    if (error) { logger.error('[Letterboxd] loadFromCache error:', error); continue }

    for (const row of (data as CacheRow[] || [])) {
      if (!row.found && row.last_checked < retryThreshold) continue
      result.set(row.external_id, { posterUrl: row.poster_url, titleIt: row.title_it ?? null })
    }
  }

  return result
}

/**
 * Cerca un film su TMDB.
 * Strategia:
 *   1. Cerca per titolo originale + anno, risposta in it-IT (ottiene titolo localizzato)
 *   2. Se nessun risultato con poster, riprova senza anno
 *   3. Una volta trovato il tmdb_id, fa una seconda chiamata /movie/{id} in it-IT
 *      per ottenere il titolo localizzato e il poster in alta qualità
 *   Restituisce titolo italiano, poster e tmdb_id.
 */
async function fetchTmdbData(
  title: string,
  year: string,
  apiKey: string
): Promise<{ tmdbId: number | null; posterUrl: string | null; titleIt: string | null }> {
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }

  // Step 1: cerca per titolo (in inglese, senza bias lingua) per trovare il film
  const search = async (withYear: boolean): Promise<any | null> => {
    const params = new URLSearchParams({ query: title, page: '1' })
    if (withYear && year) params.set('primary_release_year', year)

    try {
      const res = await fetch(`${TMDB_BASE}/search/movie?${params.toString()}`, {
        headers,
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return null
      const json = await res.json()
      const results: any[] = json.results || []
      // Priorità: anno + poster, poi poster qualsiasi
      let best = withYear && year
        ? results.find((m: any) => m.poster_path && m.release_date?.startsWith(year))
        : null
      if (!best) best = results.find((m: any) => m.poster_path)
      // Ultimo fallback: qualsiasi risultato anche senza poster (prendiamo l'id per fare la chiamata dettaglio)
      if (!best) best = withYear && year
        ? results.find((m: any) => m.release_date?.startsWith(year))
        : results[0] ?? null
      return best ?? null
    } catch {
      return null
    }
  }

  try {
    let best = await search(true)
    if (!best) best = await search(false)
    if (!best) return { tmdbId: null, posterUrl: null, titleIt: null }

    const tmdbId: number = best.id

    // Step 2: chiama /movie/{id}?language=it-IT per ottenere titolo italiano e poster localizzato
    try {
      const detailRes = await fetch(
        `${TMDB_BASE}/movie/${tmdbId}?language=it-IT&append_to_response=images&include_image_language=it,en,null`,
        { headers, signal: AbortSignal.timeout(6000) }
      )
      if (detailRes.ok) {
        const detail = await detailRes.json()

        // Poster: preferisce il poster italiano se disponibile, altrimenti quello di default
        const itPoster = detail.images?.posters?.find((p: any) => p.iso_639_1 === 'it')
        const posterPath = itPoster?.file_path || detail.poster_path || best.poster_path

        // Titolo italiano: usa detail.title se diverso dal titolo cercato (inglese).
        // Confronta con title (argomento della funzione, titolo originale del CSV) e non con
        // original_title di TMDB, che potrebbe essere in qualsiasi lingua.
        // Scarta anche titoli che sono una sottostringa del titolo originale (es. TMDB restituisce
        // "Name" invece di "Your Name." — dato errato/troncato sul database TMDB italiano).
        const candidateTitleIt = detail.title && detail.title.toLowerCase() !== title.toLowerCase()
          ? detail.title
          : null
        const isTruncated = candidateTitleIt !== null &&
          title.toLowerCase().includes(candidateTitleIt.toLowerCase()) &&
          candidateTitleIt.length < title.length

        return {
          tmdbId,
          posterUrl: posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null,
          titleIt: isTruncated ? null : candidateTitleIt,
        }
      }
    } catch {
      // fallback al risultato della search
    }

    // Fallback se la chiamata dettaglio fallisce
    return {
      tmdbId,
      posterUrl: best.poster_path ? `${TMDB_IMAGE_BASE}${best.poster_path}` : null,
      titleIt: best.title && best.title !== title ? best.title : null,
    }
  } catch (err) {
    logger.error('[Letterboxd] TMDB fetch error:', err)
    return { tmdbId: null, posterUrl: null, titleIt: null }
  }
}

async function saveToCache(
  supabase: any,
  entries: Array<{
    external_id: string; title: string; year: string
    tmdb_id: number | null; poster_url: string | null
    title_it: string | null; found: boolean
  }>
): Promise<void> {
  if (entries.length === 0) return
  const now = new Date().toISOString()
  const rows = entries.map(e => ({
    external_id: e.external_id, tmdb_id: e.tmdb_id,
    poster_url: e.poster_url, title: e.title, title_it: e.title_it,
    year: e.year, found: e.found, last_checked: now,
  }))
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase
      .from('tmdb_poster_cache')
      .upsert(rows.slice(i, i + 100), { onConflict: 'external_id' })
    if (error) logger.error('[Letterboxd] saveToCache error:', error)
  }
}

async function enrichWithPosters(
  supabase: any,
  entries: Array<{ external_id: string; title: string; year: string }>,
  apiKey: string
): Promise<{ enrichMap: Map<string, EnrichResult>; fromCache: number; fromApi: number; notFound: number }> {
  const allIds = entries.map(e => e.external_id)
  const cached = await loadFromCache(supabase, allIds)
  const enrichMap = new Map<string, EnrichResult>(cached)
  const missing = entries.filter(e => !cached.has(e.external_id))
  let fromApi = 0, notFound = 0
  const toSave: Parameters<typeof saveToCache>[1] = []

  for (let i = 0; i < missing.length; i += MAX_PARALLEL) {
    const batch = missing.slice(i, i + MAX_PARALLEL)
    const results = await Promise.all(batch.map(e => fetchTmdbData(e.title, e.year, apiKey)))

    for (let j = 0; j < batch.length; j++) {
      const entry = batch[j]
      const { tmdbId, posterUrl, titleIt } = results[j]
      enrichMap.set(entry.external_id, { posterUrl, titleIt })
      toSave.push({ external_id: entry.external_id, title: entry.title, year: entry.year, tmdb_id: tmdbId, poster_url: posterUrl, title_it: titleIt, found: posterUrl !== null })
      if (posterUrl) fromApi++; else notFound++
    }

    if (i + MAX_PARALLEL < missing.length) await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
  }

  await saveToCache(supabase, toSave)
  return { enrichMap, fromCache: cached.size, fromApi, notFound }
}

// ── Merge watched + ratings ───────────────────────────────────────────────────

type MergedEntry = {
  external_id: string; title: string; year: string
  rating: number | null; status: string; tags: string[]
}

function mergeWatchedAndRatings(
  watchedRows: Record<string, string>[],
  ratingsRows: Record<string, string>[]
): Map<string, MergedEntry> {
  const map = new Map<string, MergedEntry>()

  for (const row of watchedRows) {
    const id = makeExternalId(row)
    map.set(id, { external_id: id, title: row['name'], year: row['year'] || '', rating: null, status: 'completed', tags: [] })
  }
  for (const row of ratingsRows) {
    const id = makeExternalId(row)
    const existing = map.get(id)
    const rating = parseRating(row['rating'] || '')
    if (existing) { existing.rating = rating }
    else { map.set(id, { external_id: id, title: row['name'], year: row['year'] || '', rating, status: 'completed', tags: [] }) }
  }

  return map
}

// ── Builder entries ───────────────────────────────────────────────────────────

function buildEntry(merged: MergedEntry, userId: string, enrichMap: Map<string, EnrichResult>) {
  const enrich = enrichMap.get(merged.external_id)
  return {
    user_id: userId, external_id: merged.external_id,
    title: enrich?.titleIt || merged.title,
    type: 'movie', cover_image: enrich?.posterUrl ?? null,
    current_episode: 1, episodes: 1, status: merged.status,
    rating: merged.rating, genres: [], tags: merged.tags,
    notes: null, display_order: Date.now(), updated_at: new Date().toISOString(),
  }
}

function buildWatchlistEntry(row: Record<string, string>, userId: string, enrichMap: Map<string, EnrichResult>) {
  const id = makeExternalId(row)
  const enrich = enrichMap.get(id)
  return {
    user_id: userId, external_id: id,
    title: enrich?.titleIt || row['name'],
    type: 'movie', cover_image: enrich?.posterUrl ?? null,
    current_episode: 0, episodes: 1, status: 'wishlist',
    rating: null, genres: [], tags: [],
    notes: null, display_order: Date.now(), updated_at: new Date().toISOString(),
  }
}

// ── Upsert robusto anti-duplicati (user_media_entries) ────────────────────────

async function robustUpsert(
  supabase: any,
  toImport: any[],
  userId: string
): Promise<{ imported: number; updated: number; skipped: number }> {
  if (toImport.length === 0) return { imported: 0, updated: 0, skipped: 0 }

  const existingByExtId = new Map<string, any>()
  const existingByTitle = new Map<string, any>()

  for (let i = 0; i < toImport.length; i += 500) {
    const chunk = toImport.slice(i, i + 500)
    const extIds = chunk.map((e: any) => e.external_id).filter(Boolean)
    const titles = chunk.map((e: any) => e.title).filter(Boolean)

    if (extIds.length > 0) {
      const { data } = await supabase
        .from('user_media_entries')
        .select('id, external_id, title, rating, cover_image, tags, status')
        .eq('user_id', userId).eq('type', 'movie').in('external_id', extIds)
      for (const row of (data || [])) {
        existingByExtId.set(row.external_id, row)
        existingByTitle.set(normTitle(row.title), row)
      }
    }
    if (titles.length > 0) {
      const { data } = await supabase
        .from('user_media_entries')
        .select('id, external_id, title, rating, cover_image, tags, status')
        .eq('user_id', userId).eq('type', 'movie').in('title', titles)
      for (const row of (data || [])) {
        if (!existingByExtId.has(row.external_id)) existingByExtId.set(row.external_id, row)
        existingByTitle.set(normTitle(row.title), row)
      }
    }
  }

  const toInsert: any[] = []
  const toUpdate: Array<{ id: string; patch: any }> = []
  const seenIds = new Set<string>()
  const statusRank: Record<string, number> = { completed: 3, watching: 2, wishlist: 1, planning: 0 }

  for (const entry of toImport) {
    const existing = (entry.external_id ? existingByExtId.get(entry.external_id) : null) || existingByTitle.get(normTitle(entry.title))

    if (existing) {
      if (seenIds.has(existing.id)) continue
      seenIds.add(existing.id)

      const patch: any = { updated_at: new Date().toISOString() }
      if (entry.external_id && existing.external_id !== entry.external_id) patch.external_id = entry.external_id
      if (!existing.cover_image && entry.cover_image) patch.cover_image = entry.cover_image
      // Aggiorna il titolo se il nuovo è localizzato (italiano) e diverso dall'attuale
      if (entry.title && entry.title !== existing.title) patch.title = entry.title
      if (entry.rating !== null && existing.rating === null) patch.rating = entry.rating
      if (entry.tags?.length > 0) {
        const mergedTags = Array.from(new Set([...(existing.tags || []), ...entry.tags]))
        if (mergedTags.length !== (existing.tags || []).length) patch.tags = mergedTags
      }
      if ((statusRank[entry.status] ?? 0) > (statusRank[existing.status] ?? 0)) {
        patch.status = entry.status
        if (entry.status === 'completed') patch.current_episode = 1
      }
      toUpdate.push({ id: existing.id, patch })
    } else {
      toInsert.push(entry)
    }
  }

  let imported = 0, updated = 0, skipped = 0

  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50)
    const { error } = await supabase.from('user_media_entries').insert(batch)
    if (!error) imported += batch.length
    else { logger.error('[Letterboxd] insert error:', JSON.stringify(error)); skipped += batch.length }
  }

  for (const { id, patch } of toUpdate) {
    if (Object.keys(patch).filter(k => k !== 'updated_at').length === 0) { updated++; continue }
    const { error } = await supabase.from('user_media_entries').update(patch).eq('id', id).eq('user_id', userId)
    if (!error) updated++
    else { logger.error('[Letterboxd] update error:', JSON.stringify(error)); skipped++ }
  }

  return { imported, updated, skipped }
}

// ── Import lista in user_lists + user_list_items ──────────────────────────────

async function importList(
  supabase: any,
  listName: string,
  listRows: Record<string, string>[],
  userId: string,
  enrichMap: Map<string, EnrichResult>
): Promise<{ listId: string; inserted: number; skipped: number }> {
  // Trova o crea la lista
  let listId: string
  const { data: existing } = await supabase
    .from('user_lists')
    .select('id')
    .eq('user_id', userId)
    .eq('title', listName)
    .maybeSingle()

  if (existing) {
    listId = existing.id
  } else {
    const { data: created, error } = await supabase
      .from('user_lists')
      .insert({ user_id: userId, title: listName, is_public: false })
      .select('id').single()
    if (error || !created) throw new Error(`Impossibile creare la lista "${listName}": ${error?.message}`)
    listId = created.id
  }

  // Carica item già presenti (anti-duplicati)
  const { data: existingItems } = await supabase
    .from('user_list_items')
    .select('media_id, media_title')
    .eq('list_id', listId)

  const existingMediaIds  = new Set((existingItems || []).map((i: any) => i.media_id))
  const existingTitlesNorm = new Set((existingItems || []).map((i: any) => normTitle(i.media_title)))

  const toInsert: any[] = []
  let position = (existingItems || []).length

  for (const row of listRows) {
    const extId = makeExternalId(row)
    const enrich = enrichMap.get(extId)
    const title = enrich?.titleIt || row['name']
    if (existingMediaIds.has(extId) || existingTitlesNorm.has(normTitle(title))) continue

    toInsert.push({
      list_id: listId, user_id: userId, media_id: extId,
      media_title: title, media_type: 'movie',
      media_cover: enrich?.posterUrl ?? null,
      notes: row['description'] || null, position: position++,
    })
  }

  let inserted = 0, skipped = 0
  for (let i = 0; i < toInsert.length; i += 50) {
    const { error } = await supabase.from('user_list_items').insert(toInsert.slice(i, i + 50))
    if (!error) inserted += toInsert.slice(i, i + 50).length
    else { logger.error('[Letterboxd] list insert error:', JSON.stringify(error)); skipped += toInsert.slice(i, i + 50).length }
  }

  return { listId, inserted, skipped }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 3, windowMs: 60 * 60 * 1000, prefix: 'letterboxd-import' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Troppe importazioni. Attendi un'ora prima di riprovare." },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Invia i file CSV via form-data.' }, { status: 400 })
  }

  const formData = await request.formData()
  const watchedFile   = formData.get('watched')   as File | null
  const ratingsFile   = formData.get('ratings')   as File | null
  const watchlistFile = formData.get('watchlist') as File | null
  const listFile      = formData.get('list')      as File | null
  const listNameOverride = (formData.get('list_name') as string | null)?.trim() || ''

  if (!watchedFile && !ratingsFile && !watchlistFile && !listFile) {
    return NextResponse.json({ error: 'Carica almeno un file CSV.' }, { status: 400 })
  }

  const MAX = 10 * 1024 * 1024
  const readFile = async (f: File): Promise<string> => {
    if (f.size > MAX) throw new Error(`File "${f.name}" troppo grande (max 10MB)`)
    return f.text()
  }

  try {
    let watchedRows:   Record<string, string>[] = []
    let ratingsRows:   Record<string, string>[] = []
    let watchlistRows: Record<string, string>[] = []
    let listRows:      Record<string, string>[] = []
    let csvListName:   string | null = null

    if (watchedFile)   { const p = parseCSV(await readFile(watchedFile));   watchedRows   = p.rows }
    if (ratingsFile)   { const p = parseCSV(await readFile(ratingsFile));   ratingsRows   = p.rows }
    if (watchlistFile) { const p = parseCSV(await readFile(watchlistFile)); watchlistRows = p.rows }
    if (listFile) {
      const p = parseCSV(await readFile(listFile))
      listRows    = p.rows
      csvListName = p.extractedListName
    }

    if (!watchedRows.length && !ratingsRows.length && !watchlistRows.length && !listRows.length) {
      return NextResponse.json({ error: 'Nessun film trovato nei file caricati. Verifica che siano CSV Letterboxd validi.' }, { status: 422 })
    }

    // Nome lista: override utente > nome estratto dal CSV > nome del file
    const finalListName = listNameOverride || csvListName || (listFile ? listFile.name.replace(/\.csv$/i, '') : '')

    // ── Merge watched + ratings ─────────────────────────────────────────────
    const merged = mergeWatchedAndRatings(watchedRows, ratingsRows)
    const mainEntries = Array.from(merged.values())
    const mainIds = new Set(merged.keys())
    const watchlistEntries = watchlistRows.filter(r => !mainIds.has(makeExternalId(r)))

    // ── Raccolta film da cercare su TMDB ────────────────────────────────────
    const allToEnrich: Array<{ external_id: string; title: string; year: string }> = []
    const seenEnrichIds = new Set<string>()

    const addToEnrich = (id: string, title: string, year: string) => {
      if (!seenEnrichIds.has(id)) { allToEnrich.push({ external_id: id, title, year }); seenEnrichIds.add(id) }
    }

    for (const e of mainEntries)      addToEnrich(e.external_id, e.title, e.year)
    for (const r of watchlistEntries) addToEnrich(makeExternalId(r), r['name'], r['year'] || '')
    for (const r of listRows)         addToEnrich(makeExternalId(r), r['name'], r['year'] || '')

    // ── Enrichment poster + titoli italiani ─────────────────────────────────
    const tmdbApiKey = process.env.TMDB_API_KEY || ''
    let enrichMap = new Map<string, EnrichResult>()
    let fromCache = 0, fromApi = 0, notFound = 0

    if (tmdbApiKey && allToEnrich.length > 0) {
      const result = await enrichWithPosters(supabase, allToEnrich, tmdbApiKey)
      enrichMap = result.enrichMap
      fromCache = result.fromCache
      fromApi   = result.fromApi
      notFound  = result.notFound
    }

    // ── Build + upsert watched/ratings/watchlist ─────────────────────────────
    const mainBuilt      = mainEntries.map(e => buildEntry(e, user.id, enrichMap))
    const watchlistBuilt = watchlistEntries.map(r => buildWatchlistEntry(r, user.id, enrichMap))

    const { imported, updated, skipped } = await robustUpsert(
      supabase, [...mainBuilt, ...watchlistBuilt], user.id
    )

    // ── Import lista in user_lists + user_list_items ─────────────────────────
    let listInserted = 0, listSkipped = 0, listId: string | null = null

    if (listRows.length > 0 && finalListName) {
      const res = await importList(supabase, finalListName, listRows, user.id, enrichMap)
      listInserted = res.inserted
      listSkipped  = res.skipped
      listId       = res.listId
    }

    // ── Risposta ────────────────────────────────────────────────────────────
    const posterMsg = fromCache + fromApi > 0
      ? ` (${fromCache + fromApi} poster trovati${notFound > 0 ? `, ${notFound} senza immagine` : ''})`
      : ''

    const actionParts = [
      imported > 0      ? `${imported} nuovi` : '',
      updated  > 0      ? `${updated} aggiornati` : '',
      listInserted > 0  ? `${listInserted} in lista "${finalListName}"` : '',
    ].filter(Boolean)

    return NextResponse.json({
      success: true,
      imported, updated, skipped,
      list_inserted: listInserted, list_skipped: listSkipped, list_id: listId,
      total: mainBuilt.length + watchlistBuilt.length,
      watched: watchedRows.length, ratings: ratingsRows.length,
      watchlist: watchlistRows.length, list: listRows.length,
      list_name: finalListName || null,
      posters: { fromCache, fromApi, notFound, total: fromCache + fromApi },
      message: `Importazione completata: ${actionParts.join(', ') || 'nessuna modifica'}${posterMsg}`,
    }, { headers: rl.headers })

  } catch (e: any) {
    logger.error('[Letterboxd] unexpected error:', e)
    return NextResponse.json({ error: e.message || 'Errore imprevisto.' }, { status: 400 })
  }
}