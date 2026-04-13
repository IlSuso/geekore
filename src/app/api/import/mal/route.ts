// DESTINAZIONE: src/app/api/import/mal/route.ts
//
// Importa anime e manga da MyAnimeList (export XML).
// - Fix CDATA: i titoli venivano salvati come "<![CDATA[Titolo]]>" invece di "Titolo"
// - Poster via MAL API ufficiale (api.myanimelist.net/v2) — stesso DB, stesso ID
//   → fallback a Jikan (api.jikan.moe/v4) se MAL_CLIENT_ID non configurato
// - Cache globale in mal_poster_cache per evitare chiamate ripetute
// - Titolo italiano se disponibile nei titoli alternativi MAL
// - Upsert pattern identico ad AniList: check esistenti → INSERT nuovi → UPDATE esistenti

import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { upsertWithMerge } from '@/lib/importMerge'

// ── Costanti ──────────────────────────────────────────────────────────────────

const MAL_API_BASE   = 'https://api.myanimelist.net/v2'
const JIKAN_BASE     = 'https://api.jikan.moe/v4'
const MAX_PARALLEL   = 5
const BATCH_DELAY_MS = 350
const RETRY_DAYS     = 30

// ── Mappe status ──────────────────────────────────────────────────────────────

const STATUS_MAP_ANIME: Record<string, string> = {
  'Watching':      'watching',
  'Completed':     'completed',
  'On-Hold':       'paused',
  'Dropped':       'dropped',
  'Plan to Watch': 'watching',
}

const STATUS_MAP_MANGA: Record<string, string> = {
  'Reading':      'watching',
  'Completed':    'completed',
  'On-Hold':      'paused',
  'Dropped':      'dropped',
  'Plan to Read': 'watching',
}

// ── Parser XML ────────────────────────────────────────────────────────────────

function stripCDATA(value: string): string {
  const m = value.match(/^<!\[CDATA\[([\s\S]*?)]]>$/)
  return m ? m[1].trim() : value.trim()
}

function parseBlock(block: string): Record<string, string> {
  const result: Record<string, string> = {}
  const tagRe = /<([a-zA-Z_]+)[^>]*>([\s\S]*?)<\/\1>/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(block)) !== null) {
    result[m[1]] = stripCDATA(m[2])
  }
  return result
}

function parseMALXML(xml: string): {
  animeList: Record<string, string>[]
  mangaList: Record<string, string>[]
} {
  const clean = xml.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')

  const animeList: Record<string, string>[] = []
  const animeRe = /<anime>([\s\S]*?)<\/anime>/gi
  let am: RegExpExecArray | null
  while ((am = animeRe.exec(clean)) !== null) animeList.push(parseBlock(am[1]))

  const mangaList: Record<string, string>[] = []
  const mangaRe = /<manga>([\s\S]*?)<\/manga>/gi
  let mm: RegExpExecArray | null
  while ((mm = mangaRe.exec(clean)) !== null) mangaList.push(parseBlock(mm[1]))

  return { animeList, mangaList }
}

// ── Cache (mal_poster_cache) ──────────────────────────────────────────────────

interface CacheRow {
  mal_id: number
  media_type: 'anime' | 'manga'
  poster_url: string | null
  title_it: string | null
  found: boolean
  last_checked: string
}

async function loadFromCache(
  supabase: any,
  entries: Array<{ mal_id: number; media_type: 'anime' | 'manga' }>
): Promise<Map<string, CacheRow>> {
  const result = new Map<string, CacheRow>()
  if (entries.length === 0) return result

  const retryThreshold = new Date(Date.now() - RETRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  for (const type of ['anime', 'manga'] as const) {
    const ids = entries.filter(e => e.media_type === type).map(e => e.mal_id)
    if (ids.length === 0) continue

    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await supabase
        .from('mal_poster_cache')
        .select('mal_id, media_type, poster_url, title_it, found, last_checked')
        .eq('media_type', type)
        .in('mal_id', ids.slice(i, i + 500))

      if (error) { logger.error('[MAL Import] cache read error:', error); continue }

      for (const row of (data as CacheRow[] || [])) {
        if (!row.found && row.last_checked < retryThreshold) continue
        result.set(`${row.media_type}-${row.mal_id}`, row)
      }
    }
  }

  return result
}

async function saveToCache(
  supabase: any,
  entries: Array<{
    mal_id: number
    media_type: 'anime' | 'manga'
    poster_url: string | null
    title_it: string | null
    found: boolean
  }>
): Promise<void> {
  if (entries.length === 0) return
  const now = new Date().toISOString()
  const rows = entries.map(e => ({ ...e, last_checked: now }))
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase
      .from('mal_poster_cache')
      .upsert(rows.slice(i, i + 100), { onConflict: 'mal_id,media_type' })
    if (error) logger.error('[MAL Import] cache write error:', error)
  }
}

// ── Fetch da MAL API ufficiale ────────────────────────────────────────────────

async function fetchFromMALApi(
  malId: number,
  type: 'anime' | 'manga',
  clientId: string
): Promise<{ posterUrl: string | null; titleIt: string | null }> {
  try {
    const res = await fetch(
      `${MAL_API_BASE}/${type}/${malId}?fields=main_picture,alternative_titles`,
      {
        headers: { 'X-MAL-CLIENT-ID': clientId },
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return { posterUrl: null, titleIt: null }
    const data = await res.json()

    const posterUrl: string | null =
      data.main_picture?.large || data.main_picture?.medium || null

    // alternative_titles.it contiene il titolo italiano se MAL ce l'ha
    const titleIt: string | null = data.alternative_titles?.it || null

    return { posterUrl, titleIt }
  } catch (err) {
    logger.error('[MAL Import] MAL API error:', err)
    return { posterUrl: null, titleIt: null }
  }
}

// ── Fetch da Jikan (fallback senza MAL_CLIENT_ID) ─────────────────────────────

async function fetchFromJikan(
  malId: number,
  type: 'anime' | 'manga'
): Promise<{ posterUrl: string | null; titleIt: string | null }> {
  try {
    const res = await fetch(
      `${JIKAN_BASE}/${type}/${malId}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return { posterUrl: null, titleIt: null }
    const json = await res.json()
    const data = json?.data
    if (!data) return { posterUrl: null, titleIt: null }

    const posterUrl: string | null =
      data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || null

    const titles: Array<{ type: string; title: string }> = data.titles || []
    const itTitle = titles.find(t => t.type?.toLowerCase() === 'italian')
    const titleIt: string | null = itTitle?.title || null

    return { posterUrl, titleIt }
  } catch (err) {
    logger.error('[MAL Import] Jikan error:', err)
    return { posterUrl: null, titleIt: null }
  }
}

// ── Enrichment (cache → API) ──────────────────────────────────────────────────

async function enrichWithPosters(
  supabase: any,
  entries: Array<{ mal_id: number; media_type: 'anime' | 'manga' }>,
  malClientId: string | null
): Promise<{
  dataMap: Map<string, { posterUrl: string | null; titleIt: string | null }>
  fromCache: number
  fromApi: number
  notFound: number
}> {
  const cached = await loadFromCache(supabase, entries)
  const dataMap = new Map<string, { posterUrl: string | null; titleIt: string | null }>()

  for (const [key, row] of cached.entries()) {
    dataMap.set(key, { posterUrl: row.poster_url, titleIt: row.title_it })
  }

  const missing = entries.filter(e => !cached.has(`${e.media_type}-${e.mal_id}`))

  let fromApi = 0
  let notFound = 0
  const toSave: Parameters<typeof saveToCache>[1] = []

  for (let i = 0; i < missing.length; i += MAX_PARALLEL) {
    const batch = missing.slice(i, i + MAX_PARALLEL)
    const results = await Promise.all(
      batch.map(e =>
        malClientId
          ? fetchFromMALApi(e.mal_id, e.media_type, malClientId)
          : fetchFromJikan(e.mal_id, e.media_type)
      )
    )

    for (let j = 0; j < batch.length; j++) {
      const entry = batch[j]
      const { posterUrl, titleIt } = results[j]
      const key = `${entry.media_type}-${entry.mal_id}`

      dataMap.set(key, { posterUrl, titleIt })
      toSave.push({
        mal_id: entry.mal_id,
        media_type: entry.media_type,
        poster_url: posterUrl,
        title_it: titleIt,
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

  return { dataMap, fromCache: cached.size, fromApi, notFound }
}

// ── Transform ─────────────────────────────────────────────────────────────────

function transformAnime(
  entry: Record<string, string>,
  userId: string,
  dataMap: Map<string, { posterUrl: string | null; titleIt: string | null }>
) {
  const malId = parseInt(entry['series_animedb_id'] || entry['anime_id'] || '0', 10)
  if (!malId) return null

  const enriched = dataMap.get(`anime-${malId}`)
  const rawTitle = entry['series_title'] || entry['anime_title'] || 'Senza titolo'
  const rawScore = parseFloat(entry['my_score'] || '0')
  const rating = rawScore > 0 ? Math.round((rawScore / 10) * 5 * 2) / 2 : null

  return {
    user_id: userId,
    external_id: `mal-anime-${malId}`,
    title: enriched?.titleIt || rawTitle,
    type: 'anime',
    cover_image: enriched?.posterUrl ?? null,
    current_episode: parseInt(entry['my_watched_episodes'] || '0', 10) || 0,
    episodes: parseInt(entry['series_episodes'] || '0', 10) || null,
    status: STATUS_MAP_ANIME[entry['my_status']] || 'watching',
    rating: rating && rating > 0 ? rating : null,
    genres: [],
    tags: [],
    notes: entry['my_comments'] || null,
    import_source: 'mal',
    display_order: Date.now(),
    updated_at: new Date().toISOString(),
  }
}

function transformManga(
  entry: Record<string, string>,
  userId: string,
  dataMap: Map<string, { posterUrl: string | null; titleIt: string | null }>
) {
  const malId = parseInt(entry['manga_mangadb_id'] || entry['manga_id'] || '0', 10)
  if (!malId) return null

  const enriched = dataMap.get(`manga-${malId}`)
  const rawTitle = entry['manga_title'] || 'Senza titolo'
  const rawScore = parseFloat(entry['my_score'] || '0')
  const rating = rawScore > 0 ? Math.round((rawScore / 10) * 5 * 2) / 2 : null

  return {
    user_id: userId,
    external_id: `mal-manga-${malId}`,
    title: enriched?.titleIt || rawTitle,
    type: 'manga',
    cover_image: enriched?.posterUrl ?? null,
    current_episode: parseInt(entry['my_read_chapters'] || '0', 10) || 0,
    episodes: parseInt(entry['manga_chapters'] || '0', 10) || null,
    status: STATUS_MAP_MANGA[entry['my_status']] || 'watching',
    rating: rating && rating > 0 ? rating : null,
    genres: [],
    tags: [],
    notes: entry['my_comments'] || null,
    import_source: 'mal',
    display_order: Date.now(),
    updated_at: new Date().toISOString(),
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 3, windowMs: 60 * 60 * 1000, prefix: 'mal-import' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Troppe importazioni. Attendi un'ora prima di riprovare." },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  // ── Lettura file ─────────────────────────────────────────────────────────
  let xmlContent: string
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'File non trovato' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'File troppo grande (max 5MB)' }, { status: 400 })
    xmlContent = await file.text()
  } else {
    let body: any
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
    }
    xmlContent = body?.xml || ''
  }

  if (!xmlContent || !xmlContent.includes('<myanimelist>')) {
    return NextResponse.json({ error: "File non valido. Carica l'export XML di MyAnimeList." }, { status: 400 })
  }

  // ── Parsing ──────────────────────────────────────────────────────────────
  let parsed: ReturnType<typeof parseMALXML>
  try { parsed = parseMALXML(xmlContent) } catch (e: any) {
    return NextResponse.json({ error: `Errore nel parsing XML: ${e.message}` }, { status: 422 })
  }

  if (parsed.animeList.length === 0 && parsed.mangaList.length === 0) {
    return NextResponse.json({ error: 'Nessun titolo trovato nel file.' }, { status: 422 })
  }

  // ── Enrichment poster ────────────────────────────────────────────────────
  const malClientId = process.env.MAL_CLIENT_ID || null

  const toEnrich: Array<{ mal_id: number; media_type: 'anime' | 'manga' }> = []
  for (const e of parsed.animeList) {
    const id = parseInt(e['series_animedb_id'] || e['anime_id'] || '0', 10)
    if (id) toEnrich.push({ mal_id: id, media_type: 'anime' })
  }
  for (const e of parsed.mangaList) {
    const id = parseInt(e['manga_mangadb_id'] || e['manga_id'] || '0', 10)
    if (id) toEnrich.push({ mal_id: id, media_type: 'manga' })
  }

  const { dataMap, fromCache, fromApi, notFound } = await enrichWithPosters(supabase, toEnrich, malClientId)

  // ── Build entries ────────────────────────────────────────────────────────
  const toInsert = [
    ...parsed.animeList.map(e => transformAnime(e, user.id, dataMap)),
    ...parsed.mangaList.map(e => transformManga(e, user.id, dataMap)),
  ].filter(Boolean) as any[]

  if (toInsert.length === 0) {
    return NextResponse.json({ error: 'Nessun titolo valido trovato nel file.' }, { status: 422 })
  }

  // ── Upsert con merge cross-source ───────────────────────────────────────
  const { imported, merged, skipped } = await upsertWithMerge(supabase, toInsert, user.id, '[MAL Import]')

  const source = malClientId ? 'MAL API' : 'Jikan'
  return NextResponse.json({
    success: true,
    imported,
    merged,
    skipped,
    total: toInsert.length,
    anime: parsed.animeList.length,
    manga: parsed.mangaList.length,
    posters: { fromCache, fromApi, notFound, total: fromCache + fromApi },
    message: `Importati ${imported} titoli da MyAnimeList${merged > 0 ? `, ${merged} uniti con duplicati` : ''} (${fromCache + fromApi} poster trovati via ${source}${notFound > 0 ? `, ${notFound} senza immagine` : ''})`,
  }, { headers: rl.headers })
}