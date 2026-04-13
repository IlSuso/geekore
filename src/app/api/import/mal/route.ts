import { logger } from '@/lib/logger'
// src/app/api/import/mal/route.ts
// FIX: strategia manual upsert per evitare il problema con constraint mancante su Supabase

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

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

function parseMALXML(xml: string): { animeList: any[]; mangaList: any[]; type: 'anime' | 'manga' | 'mixed' } {
  const clean = xml.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')

  const parseBlock = (block: string): Record<string, string> => {
    const result: Record<string, string> = {}
    const tagRe = /<([a-zA-Z_]+)[^>]*>([\s\S]*?)<\/\1>/g
    let m: RegExpExecArray | null
    while ((m = tagRe.exec(block)) !== null) {
      result[m[1]] = m[2].trim()
    }
    return result
  }

  const animeBlocks: string[] = []
  const animeRe = /<anime>([\s\S]*?)<\/anime>/gi
  let am: RegExpExecArray | null
  while ((am = animeRe.exec(clean)) !== null) {
    animeBlocks.push(am[1])
  }

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
  const rawScore = parseFloat(entry['my_score'] || '0')
  const rating = rawScore > 0 ? Math.round((rawScore / 10) * 5 * 2) / 2 : null

  return {
    user_id: userId,
    external_id: `mal-anime-${malId}`,
    title,
    type: 'anime',
    cover_image: null,
    current_episode: progress,
    episodes: totalEps,
    status,
    rating: rating && rating > 0 ? rating : null,
    genres: [],
    tags: [],
    notes: entry['my_comments'] || null,
    import_source: 'mal',
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
    import_source: 'mal',
    display_order: Date.now(),
    updated_at: new Date().toISOString(),
  }
}

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

  let xmlContent: string

  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'File non trovato' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File troppo grande (max 5MB)' }, { status: 400 })
    }
    xmlContent = await file.text()
  } else {
    let body: any
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
    }
    xmlContent = body?.xml || ''
  }

  if (!xmlContent || !xmlContent.includes('<myanimelist>')) {
    return NextResponse.json(
      { error: "File non valido. Carica l'export XML di MyAnimeList." },
      { status: 400 }
    )
  }

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

  const toInsert = [
    ...parsed.animeList.map(e => transformAnime(e, user.id)),
    ...parsed.mangaList.map(e => transformManga(e, user.id)),
  ].filter(Boolean) as any[]

  if (toInsert.length === 0) {
    return NextResponse.json(
      { error: 'Nessun titolo valido trovato nel file.' },
      { status: 422 }
    )
  }

  // Manual upsert: controlla quali external_id esistono già
  const externalIds = toInsert.map(i => i.external_id)
  const { data: existing } = await supabase
    .from('user_media_entries')
    .select('id, external_id')
    .eq('user_id', user.id)
    .in('external_id', externalIds)

  const existingMap = new Map((existing || []).map((e: any) => [e.external_id, e.id]))
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
      logger.error('[MAL Import] insert error:', error)
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
        logger.error('[MAL Import] update error:', error)
        skipped++
      }
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