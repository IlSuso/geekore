// src/app/api/import/letterboxd/route.ts
//
// Gestisce tutti i formati di export Letterboxd:
//
//   watched.csv   → Date,Name,Year,Letterboxd URI          (film visti, senza voto)
//   ratings.csv   → Date,Name,Year,Letterboxd URI,Rating   (film votati, sottoinsieme di watched)
//   watchlist.csv → Date,Name,Year,Letterboxd URI          (da vedere)
//   lists/*.csv   → Letterboxd list export v7              (liste personalizzate)
//
// Streaming: risponde con NDJSON (una riga JSON per evento).
// Il client legge il ReadableStream e aggiorna la barra di avanzamento in tempo reale.
//
// Titoli italiani: TMDB con language=it-IT restituisce il titolo localizzato
// nel campo `title`; viene usato al posto del titolo originale Letterboxd quando disponibile.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { checkOrigin } from '@/lib/csrf'
import { logger } from '@/lib/logger'
import { upsertWithMerge } from '@/lib/importMerge'

// ── Costanti TMDB ─────────────────────────────────────────────────────────────

const TMDB_BASE       = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w780'
const MAX_PARALLEL    = 20
const BATCH_DELAY_MS  = 100

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
  // Per i file lista Letterboxd (list export v7) esistono due sezioni di header:
  // la prima (Date,Name,Tags,...) descrive la lista stessa, la seconda (Position,Name,Year,...)
  // descrive i film. Diamo priorità all'header con 'position' che identifica i film reali.
  for (let i = 0; i < Math.min(allLines.length, 10); i++) {
    const lower = allLines[i].toLowerCase()
    if (lower.includes('position') && lower.includes('name')) {
      headerIdx = i
      break
    }
  }
  // Fallback per watched.csv, ratings.csv, watchlist.csv che non hanno 'position'
  if (headerIdx === -1) {
    for (let i = 0; i < Math.min(allLines.length, 10); i++) {
      const lower = allLines[i].toLowerCase()
      if (lower.includes('name') && (lower.includes('year') || lower.includes('date'))) {
        headerIdx = i
        break
      }
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

// ── TMDB fetch (poster + titolo italiano) ─────────────────────────────────────

async function fetchTmdbData(
  title: string,
  year: string,
  apiKey: string
): Promise<{ posterUrl: string | null; titleIt: string | null }> {
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
    if (!res.ok) return { posterUrl: null, titleIt: null }

    const json = await res.json()
    const results: any[] = json.results || []

    let best = results.find((m: any) => m.poster_path && year && m.release_date?.startsWith(year))
    if (!best) best = results.find((m: any) => m.poster_path)

    return {
      posterUrl: best ? `${TMDB_IMAGE_BASE}${best.poster_path}` : null,
      // TMDB con language=it-IT restituisce `title` localizzato in italiano
      titleIt: best?.title || null,
    }
  } catch (err) {
    logger.error('[Letterboxd] TMDB fetch error:', err)
    return { posterUrl: null, titleIt: null }
  }
}

/**
 * Chiama TMDB in batch paralleli.
 * Invoca onProgress(current, total) dopo ogni batch.
 */
async function fetchAllData(
  entries: Array<{ external_id: string; title: string; year: string }>,
  apiKey: string,
  onProgress: (current: number, total: number) => void
): Promise<{
  posterMap:  Map<string, string | null>
  titleItMap: Map<string, string | null>
  found:      number
  notFound:   number
}> {
  const posterMap  = new Map<string, string | null>()
  const titleItMap = new Map<string, string | null>()
  let found    = 0
  let notFound = 0

  for (let i = 0; i < entries.length; i += MAX_PARALLEL) {
    const batch = entries.slice(i, i + MAX_PARALLEL)

    const results = await Promise.all(
      batch.map(e => fetchTmdbData(e.title, e.year, apiKey))
    )

    for (let j = 0; j < batch.length; j++) {
      const { posterUrl, titleIt } = results[j]
      posterMap.set(batch[j].external_id, posterUrl)
      titleItMap.set(batch[j].external_id, titleIt)
      if (posterUrl) found++
      else notFound++
    }

    const processed = Math.min(i + MAX_PARALLEL, entries.length)
    onProgress(processed, entries.length)

    if (i + MAX_PARALLEL < entries.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  return { posterMap, titleItMap, found, notFound }
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
    map.set(id, { external_id: id, title: row['name'], year: row['year'] || '', rating: null, status: 'completed', tags: [] })
  }

  for (const row of ratingsRows) {
    const id = makeExternalId(row)
    const existing = map.get(id)
    const rating = parseRating(row['rating'] || '')
    if (existing) {
      existing.rating = rating
    } else {
      map.set(id, { external_id: id, title: row['name'], year: row['year'] || '', rating, status: 'completed', tags: [] })
    }
  }

  return map
}

// ── Builder entries ───────────────────────────────────────────────────────────

function buildEntry(
  merged: MergedEntry,
  userId: string,
  posterMap: Map<string, string | null>,
  titleItMap: Map<string, string | null>
) {
  return {
    user_id:         userId,
    external_id:     merged.external_id,
    // Usa il titolo italiano da TMDB se disponibile, altrimenti il titolo originale
    title:           titleItMap.get(merged.external_id) || merged.title,
    type:            'movie',
    cover_image:     posterMap.get(merged.external_id) ?? null,
    current_episode: 1,
    episodes:        1,
    status:          merged.status,
    rating:          merged.rating,
    genres:          [],
    tags:            merged.tags,
    notes:           null,
    import_source:   'letterboxd',
    display_order:   Date.now() + Math.round((merged.rating && merged.rating > 0 ? merged.rating : 0) * 1_000_000),
    updated_at:      new Date().toISOString(),
  }
}

function buildWatchlistEntry(
  row: Record<string, string>,
  userId: string,
  posterMap: Map<string, string | null>,
  titleItMap: Map<string, string | null>
) {
  const id = makeExternalId(row)
  return {
    user_id:         userId,
    external_id:     id,
    title:           titleItMap.get(id) || row['name'],
    type:            'movie',
    cover_image:     posterMap.get(id) ?? null,
    current_episode: 0,
    episodes:        1,
    status:          'wishlist',
    rating:          null,
    genres:          [],
    tags:            [],
    notes:           null,
    import_source:   'letterboxd',
    display_order:   Date.now(),
    updated_at:      new Date().toISOString(),
  }
}

function buildListEntry(
  row: Record<string, string>,
  listName: string,
  userId: string,
  posterMap: Map<string, string | null>,
  titleItMap: Map<string, string | null>
) {
  const id = makeExternalId(row)
  return {
    user_id:         userId,
    external_id:     id,
    title:           titleItMap.get(id) || row['name'],
    type:            'movie',
    cover_image:     posterMap.get(id) ?? null,
    current_episode: 1,
    episodes:        1,
    status:          'completed',
    rating:          null,
    genres:          [],
    tags:            listName ? [listName] : [],
    notes:           null,
    import_source:   'letterboxd',
    display_order:   Date.now(),
    updated_at:      new Date().toISOString(),
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 3, windowMs: 60 * 60 * 1000, prefix: 'letterboxd-import' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Troppe importazioni. Attendi un'ora prima di riprovare." },
      { status: 429, headers: rl.headers }
    )
  }
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Invia i file CSV via form-data.' }, { status: 400, headers: rl.headers })
  }

  const formData = await request.formData()
  const watchedFile   = formData.get('watched')   as File | null
  const ratingsFile   = formData.get('ratings')   as File | null
  const watchlistFile = formData.get('watchlist') as File | null
  const listFile      = formData.get('list')      as File | null
  const listName      = (formData.get('list_name') as string | null)?.trim() || ''

  if (!watchedFile && !ratingsFile && !watchlistFile && !listFile) {
    return NextResponse.json({ error: 'Carica almeno un file CSV.' }, { status: 400, headers: rl.headers })
  }

  const MAX = 10 * 1024 * 1024
  const readFile = async (f: File): Promise<string> => {
    if (f.size > MAX) throw new Error(`File "${f.name}" troppo grande (max 10MB)`)
    return f.text()
  }

  // ── Parse tutti i file prima di aprire lo stream ──────────────────────────
  let watchedRows:   Record<string, string>[] = []
  let ratingsRows:   Record<string, string>[] = []
  let watchlistRows: Record<string, string>[] = []
  let listRows:      Record<string, string>[] = []

  try {
    if (watchedFile)   watchedRows   = parseCSV(await readFile(watchedFile))
    if (ratingsFile)   ratingsRows   = parseCSV(await readFile(ratingsFile))
    if (watchlistFile) watchlistRows = parseCSV(await readFile(watchlistFile))
    if (listFile)      listRows      = parseCSV(await readFile(listFile))
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Errore lettura file.' }, { status: 400, headers: rl.headers })
  }

  // Auto-detect list name from the CSV metadata row (first row where the URI is a /list/ URL,
  // not a /film/ URL). Letterboxd list exports include this row to describe the list itself.
  const listMetaRow = listRows.find(r => (r['letterboxd uri'] || '').includes('/list/'))
  const effectiveListName = listName || listMetaRow?.['name'] || ''
  if (listMetaRow) listRows = listRows.filter(r => !(r['letterboxd uri'] || '').includes('/list/'))

  if (!watchedRows.length && !ratingsRows.length && !watchlistRows.length && !listRows.length) {
    return NextResponse.json({ error: 'Nessun film trovato nei file caricati.' }, { status: 422, headers: rl.headers })
  }

  // ── Streaming response ────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')) } catch {}
      }

      try {
        // ── Merge watched + ratings ─────────────────────────────────────
        const mergedRows     = mergeWatchedAndRatings(watchedRows, ratingsRows)
        const mainEntries    = Array.from(mergedRows.values())
        const mainIds        = new Set(mergedRows.keys())
        const watchlistEntries = watchlistRows.filter(r => !mainIds.has(makeExternalId(r)))
        const allKnownIds    = new Set([...mainIds, ...watchlistEntries.map(r => makeExternalId(r))])
        const listEntries    = listRows.filter(r => !allKnownIds.has(makeExternalId(r)))

        // ── Raccolta film unici da cercare su TMDB ──────────────────────
        const allToEnrich: Array<{ external_id: string; title: string; year: string }> = []
        const seenIds = new Set<string>()

        for (const e of mainEntries) {
          if (!seenIds.has(e.external_id)) { allToEnrich.push({ external_id: e.external_id, title: e.title, year: e.year }); seenIds.add(e.external_id) }
        }
        for (const r of watchlistEntries) {
          const id = makeExternalId(r)
          if (!seenIds.has(id)) { allToEnrich.push({ external_id: id, title: r['name'], year: r['year'] || '' }); seenIds.add(id) }
        }
        for (const r of listEntries) {
          const id = makeExternalId(r)
          if (!seenIds.has(id)) { allToEnrich.push({ external_id: id, title: r['name'], year: r['year'] || '' }); seenIds.add(id) }
        }

        // ── Fetch poster + titoli italiani da TMDB ──────────────────────
        const tmdbApiKey = process.env.TMDB_API_KEY || ''
        let posterMap  = new Map<string, string | null>()
        let titleItMap = new Map<string, string | null>()
        let found = 0, notFound = 0

        if (tmdbApiKey && allToEnrich.length > 0) {
          send({ type: 'progress', step: 'poster', current: 0, total: allToEnrich.length,
            message: `Recupero poster TMDB... 0/${allToEnrich.length}` })

          const result = await fetchAllData(allToEnrich, tmdbApiKey, (current, total) => {
            send({ type: 'progress', step: 'poster', current, total,
              message: `Recupero poster TMDB... ${current}/${total}` })
          })

          posterMap  = result.posterMap
          titleItMap = result.titleItMap
          found      = result.found
          notFound   = result.notFound
        }

        // ── Build entries ───────────────────────────────────────────────
        send({ type: 'progress', step: 'save', current: 0, total: 0, message: 'Salvataggio...' })

        const mainBuilt = mainEntries.map(e => buildEntry(e, user.id, posterMap, titleItMap))

        if (effectiveListName) {
          for (const e of mainBuilt) {
            const matchInList = listRows.find(r => makeExternalId(r) === e.external_id)
            if (matchInList && !e.tags.includes(effectiveListName)) e.tags.push(effectiveListName)
          }
        }

        const watchlistBuilt = watchlistEntries.map(r => buildWatchlistEntry(r, user.id, posterMap, titleItMap))
        const listBuilt      = listEntries.map(r => buildListEntry(r, effectiveListName, user.id, posterMap, titleItMap))
        const allEntries     = [...mainBuilt, ...watchlistBuilt, ...listBuilt]

        if (allEntries.length === 0) {
          send({ type: 'error', message: 'Nessun film valido trovato.' }); return
        }

        const { imported, merged, skipped } = await upsertWithMerge(supabase, allEntries, user.id, '[Letterboxd Import]')

        // ── Crea lista in "Le mie liste" se è stato importato un file lista ──
        let listCreated = false
        if (listFile && effectiveListName && listRows.length > 0) {
          try {
            // Cerca lista esistente con lo stesso titolo
            const { data: existingList } = await supabase
              .from('user_lists')
              .select('id')
              .eq('user_id', user.id)
              .eq('title', effectiveListName.slice(0, 100))
              .maybeSingle()

            let listId: string | null = existingList?.id ?? null

            if (!listId) {
              const { data: newList } = await supabase
                .from('user_lists')
                .insert({ user_id: user.id, title: effectiveListName.slice(0, 100), is_public: false })
                .select('id')
                .single()
              listId = newList?.id ?? null
            }

            if (listId) {
              // Svuota e ripopola gli item della lista
              await supabase.from('user_list_items').delete().eq('list_id', listId)

              const listItems = listRows.map((row, idx) => {
                const id = makeExternalId(row)
                return {
                  list_id:     listId,
                  user_id:     user.id,
                  media_id:    id,
                  media_title: titleItMap.get(id) || row['name'],
                  media_type:  'movie',
                  media_cover: posterMap.get(id) ?? null,
                  position:    idx,
                }
              })

              const BATCH = 50
              for (let i = 0; i < listItems.length; i += BATCH) {
                await supabase.from('user_list_items').insert(listItems.slice(i, i + BATCH))
              }
              listCreated = true
            }
          } catch (e: any) {
            logger.error('[Letterboxd Import] Errore creazione lista:', e)
          }
        }

        const listMsg = listCreated ? ` Lista "${effectiveListName}" creata in "Le mie liste".` : ''

        send({
          type:      'done',
          imported,
          merged,
          skipped,
          total:     allEntries.length,
          watched:   watchedRows.length,
          ratings:   ratingsRows.length,
          watchlist: watchlistRows.length,
          list:      listRows.length,
          posters:   { found, notFound, total: found },
          message:   `Importati ${imported} film da Letterboxd${merged > 0 ? `, ${merged} uniti con duplicati` : ''} (${found} poster trovati${notFound > 0 ? `, ${notFound} senza immagine` : ''}).${listMsg}`,
        })
      } catch (e: any) {
        send({ type: 'error', message: e.message || 'Errore imprevisto.' })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
      ...rl.headers,
    },
  })
}
