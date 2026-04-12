import { logger } from '@/lib/logger'
// src/app/api/import/letterboxd/route.ts
// Importa la lista film da Letterboxd tramite export CSV.
// L'utente scarica il CSV da Letterboxd (Settings → Import & Export → Export Your Data)
// e ottiene un .zip con: diary.csv, films.csv, reviews.csv, watchlist.csv
// Noi gestiamo: watched.csv (o films.csv) e watchlist.csv
// Non richiede OAuth — parsing lato server del file CSV.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

// Formato CSV Letterboxd watched (films.csv / diary.csv):
// Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
// Formato watchlist.csv:
// Date,Name,Year,Letterboxd URI

function parseCSV(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map(h => h.trim())

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === 0) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || '').trim()
    })
    rows.push(row)
  }
  return rows
}

// Parser CSV che gestisce campi quotati con virgole interne
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// Converte rating Letterboxd (0.5-5 stelle, con mezze stelle) → Geekore (0-5)
// Letterboxd usa già scala 0-5 con mezze stelle — mappatura diretta
function parseRating(ratingStr: string): number | null {
  if (!ratingStr || ratingStr.trim() === '') return null
  const val = parseFloat(ratingStr)
  if (isNaN(val) || val <= 0) return null
  // Già in scala 0-5, arrotondiamo a mezzo punto
  return Math.round(val * 2) / 2
}

function transformWatched(row: Record<string, string>, userId: string, isWatchlist = false) {
  const name = row['Name'] || row['name'] || ''
  if (!name) return null

  const year = row['Year'] || row['year'] || ''
  const letterboxdUri = row['Letterboxd URI'] || row['letterboxd_uri'] || ''

  // Estrai l'ID dal URI Letterboxd es: https://letterboxd.com/film/inception/
  const uriSlug = letterboxdUri
    ? letterboxdUri.replace(/\/$/, '').split('/').pop() || ''
    : ''

  // Fallback: usa nome+anno come identificatore
  const slugified = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const externalId = `letterboxd-${uriSlug || slugified}${year ? `-${year}` : ''}`

  const rating = isWatchlist ? null : parseRating(row['Rating'] || row['rating'] || '')
  const isRewatch = (row['Rewatch'] || '').toLowerCase() === 'yes'
  const tags = (row['Tags'] || '').split(',').map(t => t.trim()).filter(Boolean)

  let status: string
  if (isWatchlist) {
    status = 'want'
  } else {
    status = 'completed'
  }

  return {
    user_id: userId,
    external_id: externalId,
    title: name,
    type: 'movie',
    cover_image: null,
    current_episode: isWatchlist ? 0 : 1,
    episodes: 1,
    status,
    rating,
    genres: [],
    tags,
    notes: null,
    display_order: Date.now(),
    updated_at: new Date().toISOString(),
    // Metadati aggiuntivi utili
    ...(year ? { season_year: parseInt(year, 10) || null } : {}),
    ...(isRewatch ? { rewatch_count: 1 } : {}),
  }
}

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
    return NextResponse.json({ error: 'Richiesta non valida. Invia i file CSV via form-data.' }, { status: 400 })
  }

  const formData = await request.formData()

  // Accetta: "watched" (films.csv o diary.csv) e opzionalmente "watchlist" (watchlist.csv)
  const watchedFile = formData.get('watched') as File | null
  const watchlistFile = formData.get('watchlist') as File | null

  if (!watchedFile && !watchlistFile) {
    return NextResponse.json({ error: 'Carica almeno un file CSV (watched o watchlist).' }, { status: 400 })
  }

  const MAX_SIZE = 10 * 1024 * 1024 // 10MB

  let watchedRows: Record<string, string>[] = []
  let watchlistRows: Record<string, string>[] = []

  if (watchedFile) {
    if (watchedFile.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File watched troppo grande (max 10MB).' }, { status: 400 })
    }
    const text = await watchedFile.text()
    if (!text.includes('Name') && !text.includes('name')) {
      return NextResponse.json({ error: 'Il file watched non sembra un CSV Letterboxd valido.' }, { status: 400 })
    }
    watchedRows = parseCSV(text)
  }

  if (watchlistFile) {
    if (watchlistFile.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File watchlist troppo grande (max 10MB).' }, { status: 400 })
    }
    const text = await watchlistFile.text()
    watchlistRows = parseCSV(text)
  }

  if (watchedRows.length === 0 && watchlistRows.length === 0) {
    return NextResponse.json({ error: 'Nessun film trovato nei file CSV.' }, { status: 422 })
  }

  const toInsert = [
    ...watchedRows.map(r => transformWatched(r, user.id, false)),
    ...watchlistRows.map(r => transformWatched(r, user.id, true)),
  ].filter(Boolean) as any[]

  if (toInsert.length === 0) {
    return NextResponse.json({ error: 'Nessun film valido trovato nei file.' }, { status: 422 })
  }

  // Manual upsert: controlla external_id già presenti
  const externalIds = toInsert.map(i => i.external_id)

  // Supabase .in() ha limite ~1000 elementi — eseguiamo in chunk se necessario
  let existingEntries: any[] = []
  for (let i = 0; i < externalIds.length; i += 500) {
    const chunk = externalIds.slice(i, i + 500)
    const { data } = await supabase
      .from('user_media_entries')
      .select('id, external_id')
      .eq('user_id', user.id)
      .in('external_id', chunk)
    if (data) existingEntries = existingEntries.concat(data)
  }

  const existingMap = new Map(existingEntries.map((e: any) => [e.external_id, e.id]))
  const toCreate = toInsert.filter(i => !existingMap.has(i.external_id))
  const toUpdate = toInsert.filter(i => existingMap.has(i.external_id))

  let imported = 0
  let skipped = 0

  // INSERT nuovi in batch da 50
  for (let i = 0; i < toCreate.length; i += 50) {
    const batch = toCreate.slice(i, i + 50)
    const { error } = await supabase.from('user_media_entries').insert(batch)
    if (!error) {
      imported += batch.length
    } else {
      logger.error('[Letterboxd Import] insert error:', error)
      skipped += batch.length
    }
  }

  // UPDATE esistenti per id
  for (let i = 0; i < toUpdate.length; i += 50) {
    const batch = toUpdate.slice(i, i + 50)
    for (const item of batch) {
      const rowId = existingMap.get(item.external_id)
      const { error } = await supabase
        .from('user_media_entries')
        .update({ ...item })
        .eq('id', rowId)
      if (!error) {
        imported++
      } else {
        logger.error('[Letterboxd Import] update error:', error)
        skipped++
      }
    }
  }

  return NextResponse.json({
    success: true,
    imported,
    skipped,
    total: toInsert.length,
    watched: watchedRows.length,
    watchlist: watchlistRows.length,
    message: `Importati ${imported} film da Letterboxd`,
  }, { headers: rl.headers })
}
