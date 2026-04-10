// src/app/api/import/mal/route.ts
// Importa la lista anime/manga da MyAnimeList tramite export XML.
// L'utente scarica il file XML da MAL (Profilo → Export) e lo carica qui.
// Non richiede OAuth — parsing lato server del file XML.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

// Mappa status MAL → status Geekore
const STATUS_MAP_ANIME: Record<string, string> = {
  'Watching': 'watching',
  'Completed': 'completed',
  'On-Hold': 'paused',
  'Dropped': 'dropped',
  'Plan to Watch': 'watching',
}

const STATUS_MAP_MANGA: Record<string, string> = {
  'Reading': 'watching',
  'Completed': 'completed',
  'On-Hold': 'paused',
  'Dropped': 'dropped',
  'Plan to Read': 'watching',
}

// Parser XML semplice — estrae tag <anime> e <manga> senza dipendenze esterne
function parseMALXML(xml: string): { animeList: any[]; mangaList: any[]; type: 'anime' | 'manga' | 'mixed' } {
  // Rimuovi BOM e normalizza newline
  const clean = xml.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')

  const getTagContent = (str: string, tag: string): string => {
    const match = str.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
    return match ? match[1].trim() : ''
  }

  const parseBlock = (block: string): Record<string, string> => {
    const result: Record<string, string> = {}
    const tagRe = /<([a-zA-Z_]+)[^>]*>([\s\S]*?)<\/\1>/g
    let m: RegExpExecArray | null
    while ((m = tagRe.exec(block)) !== null) {
      result[m[1]] = m[2].trim()
    }
    return result
  }

  // Estrai blocchi <anime>
  const animeBlocks: string[] = []
  const animeRe = /<anime>([\s\S]*?)<\/anime>/gi
  let am: RegExpExecArray | null
  while ((am = animeRe.exec(clean)) !== null) {
    animeBlocks.push(am[1])
  }

  // Estrai blocchi <manga>
  const mangaBlocks: string[] = []
  const mangaRe = /<manga>([\s\S]*?)<\/manga>/gi
  let mm: RegExpExecArray | null
  while ((mm = mangaRe.exec(clean)) !== null) {
    mangaBlocks.push(mm[1])
  }

  const animeList = animeBlocks.map(parseBlock)
  const mangaList = mangaBlocks.map(parseBlock)

  const type = animeList.length > 0 && mangaList.length === 0 ? 'anime'
    : mangaList.length > 0 && animeList.length === 0 ? 'manga'
    : 'mixed'

  return { animeList, mangaList, type }
}

function transformAnime(entry: Record<string, string>, userId: string) {
  const malId = entry['series_animedb_id'] || entry['anime_id'] || ''
  if (!malId) return null

  const title = entry['series_title'] || entry['anime_title'] || 'Senza titolo'
  const status = STATUS_MAP_ANIME[entry['my_status']] || 'watching'
  const progress = parseInt(entry['my_watched_episodes'] || '0', 10) || 0
  const totalEps = parseInt(entry['series_episodes'] || '0', 10) || null

  // MAL score: 0-10 → Geekore: 0-5 (mezzo punto)
  const rawScore = parseFloat(entry['my_score'] || '0')
  const rating = rawScore > 0 ? Math.round((rawScore / 10) * 5 * 2) / 2 : null

  return {
    user_id: userId,
    external_id: `mal-anime-${malId}`,
    title,
    type: 'anime',
    cover_image: null, // MAL XML non include cover; si può arricchire in futuro
    current_episode: progress,
    episodes: totalEps,
    status,
    rating: rating && rating > 0 ? rating : null,
    genres: [],
    tags: [],
    notes: entry['my_comments'] || null,
    display_order: Date.now(),
    updated_at: new Date().toISOString(),
  }
}

function transformManga(entry: Record<string, string>, userId: string) {
  const malId = entry['manga_mangadb_id'] || entry['manga_id'] || ''
  if (!malId) return null

  const title = entry['manga_title'] || 'Senza titolo'
  const status = STATUS_MAP_MANGA[entry['my_status']] || 'watching'
  const progress = parseInt(entry['my_read_chapters'] || '0', 10) || 0
  const totalChaps = parseInt(entry['manga_chapters'] || '0', 10) || null

  const rawScore = parseFloat(entry['my_score'] || '0')
  const rating = rawScore > 0 ? Math.round((rawScore / 10) * 5 * 2) / 2 : null

  return {
    user_id: userId,
    external_id: `mal-manga-${malId}`,
    title,
    type: 'manga',
    cover_image: null,
    current_episode: progress,
    episodes: totalChaps,
    status,
    rating: rating && rating > 0 ? rating : null,
    genres: [],
    tags: [],
    notes: entry['my_comments'] || null,
    display_order: Date.now(),
    updated_at: new Date().toISOString(),
  }
}

export async function POST(request: NextRequest) {
  // Rate limit: 3 import/ora per IP
  const rl = rateLimit(request, { limit: 3, windowMs: 60 * 60 * 1000, prefix: 'mal-import' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Troppe importazioni. Attendi un\'ora prima di riprovare.' },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let xmlContent: string

  // Accetta sia form-data (file upload) sia JSON (xml come stringa)
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'File non trovato' }, { status: 400 })

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File troppo grande (max 5MB)' }, { status: 400 })
    }

    xmlContent = await file.text()
  } else {
    // JSON con campo "xml"
    let body: any
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
    }
    xmlContent = body?.xml || ''
  }

  if (!xmlContent || !xmlContent.includes('<myanimelist>')) {
    return NextResponse.json(
      { error: 'File non valido. Carica l\'export XML di MyAnimeList.' },
      { status: 400 }
    )
  }

  // Parse
  let parsed: ReturnType<typeof parseMALXML>
  try {
    parsed = parseMALXML(xmlContent)
  } catch (e: any) {
    return NextResponse.json({ error: `Errore nel parsing XML: ${e.message}` }, { status: 422 })
  }

  if (parsed.animeList.length === 0 && parsed.mangaList.length === 0) {
    return NextResponse.json(
      { error: 'Nessun titolo trovato nel file. Il file è corretto?' },
      { status: 422 }
    )
  }

  // Trasforma
  const toInsert = [
    ...parsed.animeList.map(e => transformAnime(e, user.id)),
    ...parsed.mangaList.map(e => transformManga(e, user.id)),
  ].filter(Boolean) as any[]

  // Upsert in batch da 50
  let imported = 0
  let skipped = 0

  for (let i = 0; i < toInsert.length; i += 50) {
    const batch = toInsert.slice(i, i + 50)
    const { error } = await supabase
      .from('user_media_entries')
      .upsert(batch, { onConflict: 'user_id,external_id', ignoreDuplicates: false })

    if (!error) {
      imported += batch.length
    } else {
      console.error('[MAL Import] batch error:', error)
      skipped += batch.length
    }
  }

  return NextResponse.json({
    success: true,
    imported,
    skipped,
    total: toInsert.length,
    anime: parsed.animeList.length,
    manga: parsed.mangaList.length,
    message: `Importati ${imported} titoli da MyAnimeList`,
  }, { headers: rl.headers })
}