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
// Poster (TMDB):
//   Chiamate dirette in batch paralleli da MAX_PARALLEL con pausa BATCH_DELAY_MS.
//   I film non trovati vengono importati comunque con cover_image: null.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'
import { upsertWithMerge } from '@/lib/importMerge'

// ── Costanti TMDB ─────────────────────────────────────────────────────────────

const TMDB_BASE       = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'
const MAX_PARALLEL    = 20   // chiamate TMDB simultanee per batch
const BATCH_DELAY_MS  = 100  // pausa tra un batch e il successivo (evita rate limit TMDB)

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
  // Se abbiamo lo slug URI lo usiamo da solo — è già univoco su Letterboxd.
  // watched.csv e ratings.csv hanno lo stesso slug per lo stesso film,
  // quindi non generiamo più external_id diversi per lo stesso film.
  // L'anno si aggiunge solo nel fallback (nessun URI disponibile).
  if (slug) return `letterboxd-${slug}`
  return `letterboxd-${nameslug}${year ? `-${year}` : ''}`
}

function parseRating(val: string): number | null {
  if (!val || !val.trim()) return null
  const n = parseFloat(val)
  if (isNaN(n) || n <= 0) return null
  return Math.round(n * 2) / 2
}

// ── TMDB Poster fetch ─────────────────────────────────────────────────────────

async function fetchTmdbPoster(
  title: string,
  year: string,
  apiKey: string
): Promise<string | null> {
  try {
    const params = new URLSearchParams({ query: title, language: 'it-IT', page: '1' })
    if (year) params.set('primary_release_year', year)

    const res = await fetch(
      `${TMDB_BASE}/search/movie?${params.toString()}`,
      {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(6000),
      }
    )
    if (!res.ok) return null

    const json = await res.json()
    const results: any[] = json.results || []

    // Priorità: risultato con poster e anno corrispondente
    let best = results.find((m: any) => m.poster_path && year && m.release_date?.startsWith(year))
    // Fallback: primo risultato con poster
    if (!best) best = results.find((m: any) => m.poster_path)

    return best ? `${TMDB_IMAGE_BASE}${best.poster_path}` : null
  } catch (err) {
    logger.error('[Letterboxd] TMDB fetch error:', err)
    return null
  }
}

/**
 * Chiama TMDB in batch paralleli per tutti gli entry, senza cache.
 * Restituisce una Map<external_id, poster_url | null>.
 */
async function fetchAllPosters(
  entries: Array<{ external_id: string; title: string; year: string }>,
  apiKey: string
): Promise<{ posterMap: Map<string, string | null>; found: number; notFound: number }> {
  const posterMap = new Map<string, string | null>()
  let found = 0
  let notFound = 0

  for (let i = 0; i < entries.length; i += MAX_PARALLEL) {
    const batch = entries.slice(i, i + MAX_PARALLEL)

    const results = await Promise.all(
      batch.map(e => fetchTmdbPoster(e.title, e.year, apiKey))
    )

    for (let j = 0; j < batch.length; j++) {
      posterMap.set(batch[j].external_id, results[j])
      if (results[j]) found++
      else notFound++
    }

    // Pausa tra batch per rispettare rate limit TMDB (40 req/s)
    if (i + MAX_PARALLEL < entries.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  return { posterMap, found, notFound }
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
    import_source: 'letterboxd',
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
    import_source: 'letterboxd',
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
    import_source: 'letterboxd',
    display_order: Date.now(),
    updated_at: new Date().toISOString(),
  }
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
    const mergedRows = mergeWatchedAndRatings(watchedRows, ratingsRows)
    const mainEntries = Array.from(mergedRows.values())

    // Watchlist (solo quelli non già presenti in watched/ratings)
    const mainIds = new Set(mergedRows.keys())
    const watchlistEntries = watchlistRows.filter(r => !mainIds.has(makeExternalId(r)))

    // Lista
    const allKnownIds = new Set([...mainIds, ...watchlistEntries.map(r => makeExternalId(r))])
    const listEntries = listRows.filter(r => !allKnownIds.has(makeExternalId(r)))

    // ── Raccolta di tutti i film da cercare su TMDB ─────────────────────────
    const allToEnrich: Array<{ external_id: string; title: string; year: string }> = []
    const seenIds = new Set<string>()

    for (const e of mainEntries) {
      if (!seenIds.has(e.external_id)) {
        allToEnrich.push({ external_id: e.external_id, title: e.title, year: e.year })
        seenIds.add(e.external_id)
      }
    }
    for (const r of watchlistEntries) {
      const id = makeExternalId(r)
      if (!seenIds.has(id)) {
        allToEnrich.push({ external_id: id, title: r['name'], year: r['year'] || '' })
        seenIds.add(id)
      }
    }
    for (const r of listEntries) {
      const id = makeExternalId(r)
      if (!seenIds.has(id)) {
        allToEnrich.push({ external_id: id, title: r['name'], year: r['year'] || '' })
        seenIds.add(id)
      }
    }

    // ── Fetch poster da TMDB ────────────────────────────────────────────────
    const tmdbApiKey = process.env.TMDB_API_KEY || ''
    let posterMap = new Map<string, string | null>()
    let found = 0, notFound = 0

    if (tmdbApiKey && allToEnrich.length > 0) {
      const result = await fetchAllPosters(allToEnrich, tmdbApiKey)
      posterMap = result.posterMap
      found     = result.found
      notFound  = result.notFound
    }

    // ── Build entries finali con poster ─────────────────────────────────────
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

    const { imported, merged, skipped } = await upsertWithMerge(supabase, allEntries, user.id, '[Letterboxd Import]')

    return NextResponse.json({
      success: true,
      imported,
      merged,
      skipped,
      total: allEntries.length,
      watched:   watchedRows.length,
      ratings:   ratingsRows.length,
      watchlist: watchlistRows.length,
      list:      listRows.length,
      posters: { found, notFound, total: found },
      message: `Importati ${imported} film da Letterboxd${merged > 0 ? `, ${merged} uniti con duplicati` : ''} (${found} poster trovati${notFound > 0 ? `, ${notFound} senza immagine` : ''})`,
    }, { headers: rl.headers })

  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Errore imprevisto.' }, { status: 400 })
  }
}
