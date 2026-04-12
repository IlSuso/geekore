import { logger } from '@/lib/logger'
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
//   - i film di una lista vengono importati come completed (o want se non hanno watched date)
//   - il titolo della lista viene salvato nei tags

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

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

  // Trova la riga header: quella con "Name" e ("Year" o "Position" o "Date")
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
  return `letterboxd-${slug || nameslug}${year ? `-${year}` : ''}`
}

function parseRating(val: string): number | null {
  if (!val || !val.trim()) return null
  const n = parseFloat(val)
  if (isNaN(n) || n <= 0) return null
  return Math.round(n * 2) / 2 // scala 0-5, mezzo punto
}

// ── Merge watched + ratings ───────────────────────────────────────────────────
//
// Risultato: Map<externalId, entryData>
// watched porta status+date, ratings porta il voto.
// Se un film è solo in ratings (senza watched) viene comunque importato.

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
      // Film votato ma non in watched — lo importiamo comunque
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

function buildEntry(merged: MergedEntry, userId: string) {
  return {
    user_id: userId,
    external_id: merged.external_id,
    title: merged.title,
    type: 'movie',
    cover_image: null,
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

function buildWatchlistEntry(row: Record<string, string>, userId: string) {
  const id = makeExternalId(row)
  return {
    user_id: userId,
    external_id: id,
    title: row['name'],
    type: 'movie',
    cover_image: null,
    current_episode: 0,
    episodes: 1,
    status: 'want',
    rating: null,
    genres: [],
    tags: [],
    notes: null,
    display_order: Date.now(),
    updated_at: new Date().toISOString(),
  }
}

function buildListEntry(row: Record<string, string>, listName: string, userId: string) {
  const id = makeExternalId(row)
  return {
    user_id: userId,
    external_id: id,
    title: row['name'],
    type: 'movie',
    cover_image: null,
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

// ── Upsert helper ─────────────────────────────────────────────────────────────

async function manualUpsert(
  supabase: any,
  toInsert: any[],
  userId: string
): Promise<{ imported: number; skipped: number }> {
  if (toInsert.length === 0) return { imported: 0, skipped: 0 }

  const externalIds = toInsert.map(i => i.external_id)
  let existingEntries: any[] = []
  for (let i = 0; i < externalIds.length; i += 500) {
    const { data } = await supabase
      .from('user_media_entries')
      .select('id, external_id')
      .eq('user_id', userId)
      .in('external_id', externalIds.slice(i, i + 500))
    if (data) existingEntries = existingEntries.concat(data)
  }

  const existingMap = new Map(existingEntries.map((e: any) => [e.external_id, e.id]))
  const toCreate = toInsert.filter(i => !existingMap.has(i.external_id))
  const toUpdate = toInsert.filter(i => existingMap.has(i.external_id))

  let imported = 0, skipped = 0

  for (let i = 0; i < toCreate.length; i += 50) {
    const { error } = await supabase.from('user_media_entries').insert(toCreate.slice(i, i + 50))
    if (!error) imported += Math.min(50, toCreate.length - i)
    else { logger.error('[Letterboxd] insert error:', error); skipped += Math.min(50, toCreate.length - i) }
  }

  for (const item of toUpdate) {
    const rowId = existingMap.get(item.external_id)
    const { error } = await supabase.from('user_media_entries').update({ ...item }).eq('id', rowId)
    if (!error) imported++
    else { logger.error('[Letterboxd] update error:', error); skipped++ }
  }

  return { imported, skipped }
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

    // Merge watched + ratings (nessun duplicato)
    const merged = mergeWatchedAndRatings(watchedRows, ratingsRows)
    const mainEntries = Array.from(merged.values()).map(e => buildEntry(e, user.id))

    // Watchlist (solo quelli non già presenti in watched/ratings)
    const mainIds = new Set(merged.keys())
    const watchlistEntries = watchlistRows
      .map(r => buildWatchlistEntry(r, user.id))
      .filter(e => !mainIds.has(e.external_id))

    // Lista (merge: se il film è già in watched/ratings mantiene quel record, aggiunge solo il tag)
    const allKnownIds = new Set([...mainIds, ...watchlistEntries.map(e => e.external_id)])
    const listEntries = listRows
      .map(r => buildListEntry(r, listName, user.id))
      .filter(e => !allKnownIds.has(e.external_id)) // evita duplicati
    // Per i film della lista già in watched, aggiunge il tag listName
    if (listName) {
      for (const e of mainEntries) {
        const matchInList = listRows.find(r => makeExternalId(r) === e.external_id)
        if (matchInList && !e.tags.includes(listName)) e.tags.push(listName)
      }
    }

    const allEntries = [...mainEntries, ...watchlistEntries, ...listEntries]

    if (allEntries.length === 0) {
      return NextResponse.json({ error: 'Nessun film valido trovato.' }, { status: 422 })
    }

    const { imported, skipped } = await manualUpsert(supabase, allEntries, user.id)

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: allEntries.length,
      watched: watchedRows.length,
      ratings: ratingsRows.length,
      watchlist: watchlistRows.length,
      list: listRows.length,
      message: `Importati ${imported} film da Letterboxd`,
    }, { headers: rl.headers })

  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Errore imprevisto.' }, { status: 400 })
  }
}
