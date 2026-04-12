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
// Strategia upsert anti-duplicati:
//   1. Prima dell'inserimento, si caricano dal DB tutti i record esistenti dell'utente
//      con external_id o title corrispondenti
//   2. Si fa merge in memoria: i nuovi dati arricchiscono i record esistenti
//      (rating, cover_image, tags) senza mai creare duplicati
//   3. Si usa upsert solo per aggiornare record già esistenti (per id DB)
//      e insert solo per i record genuinamente nuovi
//   Questo approccio è indipendente dai constraint del DB.
//
// Logica immagini (TMDB poster cache globale):
//   1. Per ogni film da importare si controlla la tabella `tmdb_poster_cache`
//   2. I film già in cache vengono arricchiti istantaneamente (zero chiamate API)
//   3. I film mancanti vengono cercati su TMDB in batch paralleli da MAX_PARALLEL chiamate
//   4. Ogni risultato (trovato o non trovato) viene salvato in cache per i prossimi utenti
//   5. I film non trovati su TMDB vengono importati comunque con cover_image: null
//      e ricontrollati automaticamente dopo RETRY_DAYS giorni

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'

// ── Costanti TMDB ─────────────────────────────────────────────────────────────

const TMDB_BASE        = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE  = 'https://image.tmdb.org/t/p/w500'
const MAX_PARALLEL     = 20   // chiamate TMDB simultanee per batch
const BATCH_DELAY_MS   = 100  // pausa tra un batch e il successivo (evita rate limit TMDB)
const RETRY_DAYS       = 30   // dopo quanti giorni riprovare i "not found"

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

function parseCSV(rawText: string): Record<string, string>[] {
  const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const allLines = text.split('\n')

  let headerIdx = -1
  for (let i = 0; i < Math.min(allLines.length, 10); i++) {
    const lower = allLines[i].toLowerCase()
    if (lower.includes('name') && (lower.includes('year') || lower.includes('date') || lower.includes('position'))) {
      headerIdx = i
      break
    }
  }
  if (headerIdx === -1) return []

  const headers = parseCSVLine(allLines[headerIdx]).map(h => h.trim().toLowerCase())
  const rows: Record<string, string>[] = []

  for (let i = headerIdx + 1; i < allLines.length; i++) {
    const line = allLines[i].trim()
    if (!line) continue
    const values = parseCSVLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = (values[idx] || '').trim() })
    if (row['name']) rows.push(row)
  }
  return rows
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

// ── TMDB Poster Cache ─────────────────────────────────────────────────────────

interface CacheRow {
  external_id: string
  poster_url: string | null
  found: boolean
  last_checked: string
}

async function loadFromCache(
  supabase: any,
  externalIds: string[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>()
  if (externalIds.length === 0) return result

  const retryThreshold = new Date(Date.now() - RETRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  for (let i = 0; i < externalIds.length; i += 500) {
    const chunk = externalIds.slice(i, i + 500)
    const { data, error } = await supabase
      .from('tmdb_poster_cache')
      .select('external_id, poster_url, found, last_checked')
      .in('external_id', chunk)

    if (error) {
      logger.error('[Letterboxd] loadFromCache error:', error)
      continue
    }

    for (const row of (data as CacheRow[] || [])) {
      if (!row.found && row.last_checked < retryThreshold) continue
      result.set(row.external_id, row.poster_url)
    }
  }

  return result
}

async function fetchTmdbPoster(
  title: string,
  year: string,
  apiKey: string
): Promise<{ tmdbId: number | null; posterUrl: string | null }> {
  try {
    const params = new URLSearchParams({
      query: title,
      language: 'it-IT',
      page: '1',
    })
    if (year) params.set('primary_release_year', year)

    const res = await fetch(
      `${TMDB_BASE}/search/movie?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(6000),
      }
    )

    if (!res.ok) return { tmdbId: null, posterUrl: null }

    const json = await res.json()
    const results: any[] = json.results || []

    let best = results.find((m: any) =>
      m.poster_path &&
      year &&
      m.release_date?.startsWith(year)
    )

    if (!best) best = results.find((m: any) => m.poster_path)

    if (!best) return { tmdbId: null, posterUrl: null }

    return {
      tmdbId: best.id,
      posterUrl: `${TMDB_IMAGE_BASE}${best.poster_path}`,
    }
  } catch (err) {
    logger.error('[Letterboxd] TMDB fetch error:', err)
    return { tmdbId: null, posterUrl: null }
  }
}

async function saveToCache(
  supabase: any,
  entries: Array<{
    external_id: string
    title: string
    year: string
    tmdb_id: number | null
    poster_url: string | null
    found: boolean
  }>
): Promise<void> {
  if (entries.length === 0) return

  const now = new Date().toISOString()
  const rows = entries.map(e => ({
    external_id: e.external_id,
    tmdb_id: e.tmdb_id,
    poster_url: e.poster_url,
    title: e.title,
    year: e.year,
    found: e.found,
    last_checked: now,
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
): Promise<{ posterMap: Map<string, string | null>; fromCache: number; fromApi: number; notFound: number }> {
  const allIds = entries.map(e => e.external_id)

  const cached = await loadFromCache(supabase, allIds)
  const posterMap = new Map<string, string | null>(cached)

  const missing = entries.filter(e => !cached.has(e.external_id))

  let fromApi = 0
  let notFound = 0
  const toSave: Parameters<typeof saveToCache>[1] = []

  for (let i = 0; i < missing.length; i += MAX_PARALLEL) {
    const batch = missing.slice(i, i + MAX_PARALLEL)

    const results = await Promise.all(
      batch.map(e => fetchTmdbPoster(e.title, e.year, apiKey))
    )

    for (let j = 0; j < batch.length; j++) {
      const entry = batch[j]
      const { tmdbId, posterUrl } = results[j]

      posterMap.set(entry.external_id, posterUrl)
      toSave.push({
        external_id: entry.external_id,
        title: entry.title,
        year: entry.year,
        tmdb_id: tmdbId,
        poster_url: posterUrl,
        found: posterUrl !== null,
      })

      if (posterUrl) fromApi++
      else notFound++
    }

    if (i + MAX_PARALLEL < missing.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  await saveToCache(supabase, toSave)

  return {
    posterMap,
    fromCache: cached.size,
    fromApi,
    notFound,
  }
}

// ── Merge watched + ratings ───────────────────────────────────────────────────

type MergedEntry = {
  external_id: string
  title: string
  year: string
  rating: number | null
  status: string
  tags: string[]
}

function mergeWatchedAndRatings(
  watchedRows: Record<string, string>[],
  ratingsRows: Record<string, string>[]
): Map<string, MergedEntry> {
  const map = new Map<string, MergedEntry>()

  for (const row of watchedRows) {
    const id = makeExternalId(row)
    map.set(id, {
      external_id: id,
      title: row['name'],
      year: row['year'] || '',
      rating: null,
      status: 'completed',
      tags: [],
    })
  }

  for (const row of ratingsRows) {
    const id = makeExternalId(row)
    const existing = map.get(id)
    const rating = parseRating(row['rating'] || '')
    if (existing) {
      existing.rating = rating
    } else {
      map.set(id, {
        external_id: id,
        title: row['name'],
        year: row['year'] || '',
        rating,
        status: 'completed',
        tags: [],
      })
    }
  }

  return map
}

// ── Builder entries ───────────────────────────────────────────────────────────

function buildEntry(merged: MergedEntry, userId: string, posterMap: Map<string, string | null>) {
  return {
    user_id: userId,
    external_id: merged.external_id,
    title: merged.title,
    type: 'movie',
    cover_image: posterMap.get(merged.external_id) ?? null,
    current_episode: 1,
    episodes: 1,
    status: merged.status,
    rating: merged.rating,
    genres: [],
    tags: merged.tags,
    notes: null,
    display_order: Date.now(),
    updated_at: new Date().toISOString(),
  }
}

function buildWatchlistEntry(row: Record<string, string>, userId: string, posterMap: Map<string, string | null>) {
  const id = makeExternalId(row)
  return {
    user_id: userId,
    external_id: id,
    title: row['name'],
    type: 'movie',
    cover_image: posterMap.get(id) ?? null,
    current_episode: 0,
    episodes: 1,
    status: 'wishlist',
    rating: null,
    genres: [],
    tags: [],
    notes: null,
    display_order: Date.now(),
    updated_at: new Date().toISOString(),
  }
}

function buildListEntry(row: Record<string, string>, listName: string, userId: string, posterMap: Map<string, string | null>) {
  const id = makeExternalId(row)
  return {
    user_id: userId,
    external_id: id,
    title: row['name'],
    type: 'movie',
    cover_image: posterMap.get(id) ?? null,
    current_episode: 1,
    episodes: 1,
    status: 'completed',
    rating: null,
    genres: [],
    tags: listName ? [listName] : [],
    notes: null,
    display_order: Date.now(),
    updated_at: new Date().toISOString(),
  }
}

// ── Upsert robusto anti-duplicati ─────────────────────────────────────────────
//
// Strategia:
//   1. Carica dal DB tutti i record esistenti dell'utente che matchano
//      per external_id O per title (normalizzato)
//   2. Costruisce una mappa: external_id → row DB esistente
//                            title_norm  → row DB esistente
//   3. Per ogni entry da importare:
//      a. Se esiste già per external_id → UPDATE (arricchisce rating, cover, tags)
//      b. Se esiste già per title (ma external_id diverso) → UPDATE solo cover/rating/tags
//      c. Se non esiste → INSERT
//   Questo garantisce zero duplicati indipendentemente dai constraint del DB.

function normTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function robustUpsert(
  supabase: any,
  toImport: any[],
  userId: string
): Promise<{ imported: number; updated: number; skipped: number }> {
  if (toImport.length === 0) return { imported: 0, updated: 0, skipped: 0 }

  // 1. Carica tutti i record esistenti dell'utente di tipo 'movie'
  //    (lo facciamo in chunks per non superare limiti Supabase)
  const existingByExtId = new Map<string, any>()   // external_id → row
  const existingByTitle = new Map<string, any>()   // normTitle   → row

  for (let i = 0; i < toImport.length; i += 500) {
    const chunk = toImport.slice(i, i + 500)
    const extIds = chunk.map((e: any) => e.external_id).filter(Boolean)
    const titles = chunk.map((e: any) => e.title).filter(Boolean)

    // Query per external_id
    if (extIds.length > 0) {
      const { data } = await supabase
        .from('user_media_entries')
        .select('id, external_id, title, rating, cover_image, tags, status')
        .eq('user_id', userId)
        .eq('type', 'movie')
        .in('external_id', extIds)

      for (const row of (data || [])) {
        existingByExtId.set(row.external_id, row)
        existingByTitle.set(normTitle(row.title), row)
      }
    }

    // Query per title (cattura film importati senza external_id o con id diverso)
    if (titles.length > 0) {
      const { data } = await supabase
        .from('user_media_entries')
        .select('id, external_id, title, rating, cover_image, tags, status')
        .eq('user_id', userId)
        .eq('type', 'movie')
        .in('title', titles)

      for (const row of (data || [])) {
        if (!existingByExtId.has(row.external_id)) {
          existingByExtId.set(row.external_id, row)
        }
        existingByTitle.set(normTitle(row.title), row)
      }
    }
  }

  // 2. Classifica ogni entry
  const toInsert: any[] = []
  const toUpdate: Array<{ id: string; patch: any }> = []
  const seenIds = new Set<string>() // evita doppi update sullo stesso record DB

  for (const entry of toImport) {
    const existByExt = entry.external_id ? existingByExtId.get(entry.external_id) : null
    const existByTit = existingByTitle.get(normTitle(entry.title))
    const existing = existByExt || existByTit

    if (existing) {
      if (seenIds.has(existing.id)) continue
      seenIds.add(existing.id)

      // Costruisci patch: arricchisci senza sovrascrivere dati buoni già presenti
      const patch: any = {
        updated_at: new Date().toISOString(),
      }

      // Aggiorna external_id se prima era null/diverso
      if (entry.external_id && existing.external_id !== entry.external_id) {
        patch.external_id = entry.external_id
      }

      // Aggiorna cover_image solo se mancante
      if (!existing.cover_image && entry.cover_image) {
        patch.cover_image = entry.cover_image
      }

      // Aggiorna rating solo se il nuovo è presente e quello vecchio è null
      if (entry.rating !== null && existing.rating === null) {
        patch.rating = entry.rating
      }

      // Merge tags senza duplicati
      if (entry.tags && entry.tags.length > 0) {
        const mergedTags = Array.from(new Set([...(existing.tags || []), ...entry.tags]))
        if (mergedTags.length !== (existing.tags || []).length) {
          patch.tags = mergedTags
        }
      }

      // Aggiorna status solo se il nuovo è più "completo"
      // (completed > wishlist > planning)
      const statusRank: Record<string, number> = { completed: 3, watching: 2, wishlist: 1, planning: 0 }
      const newRank = statusRank[entry.status] ?? 0
      const oldRank = statusRank[existing.status] ?? 0
      if (newRank > oldRank) {
        patch.status = entry.status
        if (entry.status === 'completed') patch.current_episode = 1
      }

      toUpdate.push({ id: existing.id, patch })
    } else {
      toInsert.push(entry)
    }
  }

  let imported = 0
  let updated = 0
  let skipped = 0

  // 3. INSERT nuovi record
  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50)
    const { error } = await supabase
      .from('user_media_entries')
      .insert(batch)

    if (!error) {
      imported += batch.length
    } else {
      // Ultimo fallback: conflict su title unico → skippa
      logger.error('[Letterboxd] insert error:', JSON.stringify(error))
      skipped += batch.length
    }
  }

  // 4. UPDATE record esistenti (solo campi da arricchire)
  for (const { id, patch } of toUpdate) {
    // Salta se il patch non ha nulla di utile da aggiornare
    const patchKeys = Object.keys(patch).filter(k => k !== 'updated_at')
    if (patchKeys.length === 0) {
      updated++ // conta comunque come "gestito"
      continue
    }

    const { error } = await supabase
      .from('user_media_entries')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)

    if (!error) updated++
    else {
      logger.error('[Letterboxd] update error:', JSON.stringify(error))
      skipped++
    }
  }

  return { imported, updated, skipped }
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
  const listName      = (formData.get('list_name') as string | null)?.trim() || ''

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

    if (watchedFile)   watchedRows   = parseCSV(await readFile(watchedFile))
    if (ratingsFile)   ratingsRows   = parseCSV(await readFile(ratingsFile))
    if (watchlistFile) watchlistRows = parseCSV(await readFile(watchlistFile))
    if (listFile)      listRows      = parseCSV(await readFile(listFile))

    if (!watchedRows.length && !ratingsRows.length && !watchlistRows.length && !listRows.length) {
      return NextResponse.json({ error: 'Nessun film trovato nei file caricati. Verifica che siano CSV Letterboxd validi.' }, { status: 422 })
    }

    // ── Merge watched + ratings ─────────────────────────────────────────────
    const merged = mergeWatchedAndRatings(watchedRows, ratingsRows)
    const mainEntries = Array.from(merged.values())

    // Watchlist (solo quelli non già presenti in watched/ratings)
    const mainIds = new Set(merged.keys())
    const watchlistEntries = watchlistRows.filter(r => !mainIds.has(makeExternalId(r)))

    // Lista
    const allKnownIds = new Set([...mainIds, ...watchlistEntries.map(r => makeExternalId(r))])
    const listEntries = listRows.filter(r => !allKnownIds.has(makeExternalId(r)))

    // ── Raccolta di tutti i film da cercare su TMDB ─────────────────────────
    const allToEnrich: Array<{ external_id: string; title: string; year: string }> = []
    const seenEnrichIds = new Set<string>()

    for (const e of mainEntries) {
      if (!seenEnrichIds.has(e.external_id)) {
        allToEnrich.push({ external_id: e.external_id, title: e.title, year: e.year })
        seenEnrichIds.add(e.external_id)
      }
    }
    for (const r of watchlistEntries) {
      const id = makeExternalId(r)
      if (!seenEnrichIds.has(id)) {
        allToEnrich.push({ external_id: id, title: r['name'], year: r['year'] || '' })
        seenEnrichIds.add(id)
      }
    }
    for (const r of listEntries) {
      const id = makeExternalId(r)
      if (!seenEnrichIds.has(id)) {
        allToEnrich.push({ external_id: id, title: r['name'], year: r['year'] || '' })
        seenEnrichIds.add(id)
      }
    }

    // ── Enrichment poster (cache + TMDB) ────────────────────────────────────
    const tmdbApiKey = process.env.TMDB_API_KEY || ''
    let posterMap = new Map<string, string | null>()
    let fromCache = 0, fromApi = 0, notFound = 0

    if (tmdbApiKey && allToEnrich.length > 0) {
      const result = await enrichWithPosters(supabase, allToEnrich, tmdbApiKey)
      posterMap = result.posterMap
      fromCache = result.fromCache
      fromApi   = result.fromApi
      notFound  = result.notFound
    }

    // ── Build entries finali con poster ────────────────────────────────────
    const mainBuilt = mainEntries.map(e => buildEntry(e, user.id, posterMap))

    // Tag lista per film già in watched
    if (listName) {
      for (const e of mainBuilt) {
        const matchInList = listRows.find(r => makeExternalId(r) === e.external_id)
        if (matchInList && !e.tags.includes(listName)) e.tags.push(listName)
      }
    }

    const watchlistBuilt = watchlistEntries.map(r => buildWatchlistEntry(r, user.id, posterMap))
    const listBuilt      = listEntries.map(r => buildListEntry(r, listName, user.id, posterMap))

    const allEntries = [...mainBuilt, ...watchlistBuilt, ...listBuilt]

    if (allEntries.length === 0) {
      return NextResponse.json({ error: 'Nessun film valido trovato.' }, { status: 422 })
    }

    const { imported, updated, skipped } = await robustUpsert(supabase, allEntries, user.id)

    const posterMsg = fromCache + fromApi > 0
      ? ` (${fromCache + fromApi} poster trovati${notFound > 0 ? `, ${notFound} senza immagine` : ''})`
      : ''

    const actionMsg = [
      imported > 0 ? `${imported} nuovi` : '',
      updated  > 0 ? `${updated} aggiornati` : '',
    ].filter(Boolean).join(', ')

    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      total: allEntries.length,
      watched: watchedRows.length,
      ratings: ratingsRows.length,
      watchlist: watchlistRows.length,
      list: listRows.length,
      posters: {
        fromCache,
        fromApi,
        notFound,
        total: fromCache + fromApi,
      },
      message: `Importazione completata: ${actionMsg || 'nessuna modifica'}${posterMsg}`,
    }, { headers: rl.headers })

  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Errore imprevisto.' }, { status: 400 })
  }
}