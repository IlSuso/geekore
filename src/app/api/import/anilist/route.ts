import { logger } from '@/lib/logger'
// src/app/api/import/anilist/route.ts
//
// Importa anime e manga da AniList tramite GraphQL (username pubblico).
//
// Logica cache (anilist_cache globale, condivisa tra utenti):
//   1. Dopo aver scaricato la lista dall'API AniList, controlla anilist_cache per ogni media ID
//   2. Se un item ha già title_it in cache → lo usa direttamente (zero lookup extra)
//   3. Per item senza title_it: cerca in mal_poster_cache tramite idMal (cross-reference)
//      → se un altro utente ha già importato lo stesso anime da MAL, il titolo italiano
//        è già disponibile senza ulteriori chiamate API
//   4. Salva tutto in anilist_cache (upsert) per i prossimi utenti
//
// Il titolo finale segue la priorità: title_it → romaji → english
//
// La logica duplicati (upsertWithMerge) è invariata: external_id anilist-{type}-{id}
// garantisce deduplicazione cross-source con MAL e Letterboxd.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { upsertWithMerge } from '@/lib/importMerge'

// ── Costanti ──────────────────────────────────────────────────────────────────

const ANILIST_API = 'https://graphql.anilist.co'

// ── Mappa status ──────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, string> = {
  CURRENT:   'watching',
  COMPLETED: 'completed',
  PAUSED:    'paused',
  DROPPED:   'dropped',
  PLANNING:  'watching',
  REPEATING: 'watching',
}

// ── GraphQL query ─────────────────────────────────────────────────────────────
// idMal ci permette di cercare il titolo italiano in mal_poster_cache

const QUERY = `
  query ($username: String, $type: MediaType, $page: Int) {
    Page(page: $page, perPage: 50) {
      pageInfo { hasNextPage currentPage }
      mediaList(userName: $username, type: $type, sort: UPDATED_TIME_DESC) {
        status
        score(format: POINT_10)
        progress
        notes
        media {
          id
          idMal
          type
          title { romaji english }
          coverImage { large extraLarge }
          episodes
          chapters
          genres
          seasonYear
          tags { name rank }
        }
      }
    }
  }
`

// ── Fetch AniList paginato ────────────────────────────────────────────────────

async function fetchAniListPage(
  username: string,
  type: 'ANIME' | 'MANGA',
  page: number
): Promise<{ items: any[]; hasNextPage: boolean }> {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { username, type, page } }),
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`)
  const json = await res.json()

  if (json.errors) {
    const msg = json.errors[0]?.message || 'Errore AniList'
    throw new Error(msg)
  }

  const page_data = json.data?.Page
  return {
    items: page_data?.mediaList || [],
    hasNextPage: page_data?.pageInfo?.hasNextPage || false,
  }
}

// ── Cache AniList (anilist_cache) ─────────────────────────────────────────────

interface AniListCacheRow {
  anilist_id:    number
  media_type:    'anime' | 'manga'
  poster_url:    string | null
  title_romaji:  string | null
  title_english: string | null
  title_it:      string | null
  found:         boolean
  last_checked:  string
}

/**
 * Carica da anilist_cache i record per tutti gli ID richiesti.
 * Restituisce una Map<"tipo-id", AniListCacheRow>.
 */
async function loadFromAniListCache(
  supabase: any,
  entries: Array<{ anilist_id: number; media_type: 'anime' | 'manga' }>
): Promise<Map<string, AniListCacheRow>> {
  const result = new Map<string, AniListCacheRow>()
  if (entries.length === 0) return result

  for (const type of ['anime', 'manga'] as const) {
    const ids = entries.filter(e => e.media_type === type).map(e => e.anilist_id)
    if (ids.length === 0) continue

    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await supabase
        .from('anilist_cache')
        .select('anilist_id, media_type, poster_url, title_romaji, title_english, title_it, found, last_checked')
        .eq('media_type', type)
        .in('anilist_id', ids.slice(i, i + 500))

      if (error) { logger.error('[AniList Import] anilist_cache read error:', error); continue }

      for (const row of (data as AniListCacheRow[] || [])) {
        result.set(`${row.media_type}-${row.anilist_id}`, row)
      }
    }
  }

  return result
}

/**
 * Salva (upsert) in bulk nella cache globale anilist_cache.
 */
async function saveToAniListCache(
  supabase: any,
  entries: Array<{
    anilist_id:    number
    media_type:    'anime' | 'manga'
    poster_url:    string | null
    title_romaji:  string | null
    title_english: string | null
    title_it:      string | null
  }>
): Promise<void> {
  if (entries.length === 0) return
  const now = new Date().toISOString()
  const rows = entries.map(e => ({ ...e, found: true, last_checked: now }))

  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase
      .from('anilist_cache')
      .upsert(rows.slice(i, i + 100), { onConflict: 'anilist_id,media_type' })
    if (error) logger.error('[AniList Import] anilist_cache write error:', error)
  }
}

/**
 * Cerca titoli italiani in mal_poster_cache usando gli ID MAL cross-referenziati da AniList.
 * Restituisce una Map<"tipo-anilist_id", title_it>.
 *
 * Funziona se l'utente (o qualsiasi altro utente) ha già importato da MAL:
 * la cache MAL è globale, quindi un cross-import da una fonte arricchisce l'altra.
 */
async function lookupMalTitleIt(
  supabase: any,
  entries: Array<{ mal_id: number; media_type: 'anime' | 'manga'; key: string }>
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (entries.length === 0) return result

  for (const type of ['anime', 'manga'] as const) {
    const forType = entries.filter(e => e.media_type === type)
    if (forType.length === 0) continue
    const ids = forType.map(e => e.mal_id)

    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await supabase
        .from('mal_poster_cache')
        .select('mal_id, title_it')
        .eq('media_type', type)
        .not('title_it', 'is', null)
        .in('mal_id', ids.slice(i, i + 500))

      if (error) { logger.error('[AniList Import] mal_poster_cache lookup error:', error); continue }

      for (const row of (data || [])) {
        if (!row.title_it) continue
        const match = forType.find(e => e.mal_id === row.mal_id)
        if (match) result.set(match.key, row.title_it)
      }
    }
  }

  return result
}

/**
 * Arricchisce gli item AniList con dati dalla cache:
 *   1. Controlla anilist_cache per title_it già noti
 *   2. Per item senza title_it ma con idMal: cerca in mal_poster_cache
 *   3. Salva tutto in anilist_cache (upsert) per i prossimi utenti
 *
 * Restituisce titleItMap e statistiche cache.
 */
async function enrichFromCache(
  supabase: any,
  items: Array<{
    anilist_id:    number
    media_type:    'anime' | 'manga'
    mal_id:        number | null
    poster_url:    string | null
    title_romaji:  string | null
    title_english: string | null
  }>
): Promise<{
  titleItMap:    Map<string, string>
  fromCache:     number   // item con title_it già in anilist_cache
  fromMalCache:  number   // item con title_it trovato in mal_poster_cache via idMal
}> {
  const titleItMap = new Map<string, string>()
  let fromCache    = 0
  let fromMalCache = 0

  // 1. Lookup anilist_cache per tutti gli item
  const cached = await loadFromAniListCache(
    supabase,
    items.map(i => ({ anilist_id: i.anilist_id, media_type: i.media_type }))
  )

  // 2. Raccoglie title_it già presenti in anilist_cache
  for (const [key, row] of cached.entries()) {
    if (row.title_it) {
      titleItMap.set(key, row.title_it)
      fromCache++
    }
  }

  // 3. Per item senza title_it in anilist_cache, prova mal_poster_cache tramite idMal
  const needsMalLookup = items.filter(i => {
    const key = `${i.media_type}-${i.anilist_id}`
    return i.mal_id !== null && !titleItMap.has(key)
  })

  if (needsMalLookup.length > 0) {
    const malEntries = needsMalLookup.map(i => ({
      mal_id:     i.mal_id!,
      media_type: i.media_type,
      key:        `${i.media_type}-${i.anilist_id}`,
    }))

    const malTitles = await lookupMalTitleIt(supabase, malEntries)
    for (const [key, titleIt] of malTitles.entries()) {
      titleItMap.set(key, titleIt)
      fromMalCache++
    }
  }

  // 4. Salva tutto in anilist_cache (upsert):
  //    - aggiorna poster_url e titoli con i dati freschi dall'API
  //    - preserva title_it dal cache precedente se non ne abbiamo uno nuovo
  const toSave = items.map(i => {
    const key      = `${i.media_type}-${i.anilist_id}`
    const title_it = titleItMap.get(key) || cached.get(key)?.title_it || null
    return {
      anilist_id:    i.anilist_id,
      media_type:    i.media_type,
      poster_url:    i.poster_url,
      title_romaji:  i.title_romaji,
      title_english: i.title_english,
      title_it,
    }
  })

  await saveToAniListCache(supabase, toSave)

  return { titleItMap, fromCache, fromMalCache }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 3, windowMs: 60 * 60 * 1000, prefix: 'anilist-import' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Troppe importazioni. Attendi un'ora prima di riprovare." },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
  }

  const { anilist_username, types = ['ANIME', 'MANGA'] } = body

  if (!anilist_username || typeof anilist_username !== 'string') {
    return NextResponse.json({ error: 'Username AniList mancante' }, { status: 400 })
  }

  const username = anilist_username.trim()
  if (username.length < 2 || username.length > 50 || !/^[a-zA-Z0-9_-]+$/.test(username)) {
    return NextResponse.json({ error: 'Username AniList non valido' }, { status: 400 })
  }

  const validTypes = (['ANIME', 'MANGA'] as const).filter(t => types.includes(t))
  if (!validTypes.length) {
    return NextResponse.json({ error: 'Tipo non valido' }, { status: 400 })
  }

  // ── Fetch lista AniList ──────────────────────────────────────────────────
  const allItems: any[] = []
  const errors: string[] = []

  for (const type of validTypes) {
    let page    = 1
    let hasNext = true
    while (hasNext && page <= 10) {
      try {
        const { items, hasNextPage } = await fetchAniListPage(username, type, page)
        allItems.push(...items.map(i => ({ ...i, _type: type })))
        hasNext = hasNextPage
        page++
        if (hasNext) await new Promise(r => setTimeout(r, 500))
      } catch (e: any) {
        errors.push(`${type}: ${e.message}`)
        hasNext = false
      }
    }
  }

  if (allItems.length === 0 && errors.length > 0) {
    return NextResponse.json(
      { error: 'Impossibile recuperare i dati. Il profilo AniList è pubblico?', details: errors },
      { status: 422 }
    )
  }

  // ── Raccoglie item unici per arricchimento cache ──────────────────────────
  // Deduplica per (anilist_id, media_type): uno stesso media può apparire
  // in più pagine o tipi (raro, ma sicuro).
  const seenKeys  = new Set<string>()
  const toEnrich: Array<{
    anilist_id:    number
    media_type:    'anime' | 'manga'
    mal_id:        number | null
    poster_url:    string | null
    title_romaji:  string | null
    title_english: string | null
  }> = []

  for (const item of allItems) {
    const media = item.media
    if (!media?.id) continue
    const isAnime    = item._type === 'ANIME'
    const media_type = isAnime ? 'anime' : 'manga'
    const key        = `${media_type}-${media.id}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    toEnrich.push({
      anilist_id:    media.id,
      media_type,
      mal_id:        media.idMal || null,
      poster_url:    media.coverImage?.extraLarge || media.coverImage?.large || null,
      title_romaji:  media.title?.romaji  || null,
      title_english: media.title?.english || null,
    })
  }

  // ── Arricchimento cache (anilist_cache + mal_poster_cache cross-ref) ─────
  const { titleItMap, fromCache, fromMalCache } = await enrichFromCache(supabase, toEnrich)

  // ── Build entries finali ─────────────────────────────────────────────────
  const toInsert = allItems
    .filter(item => item.media?.id)
    .map(item => {
      const media    = item.media
      const isAnime  = item._type === 'ANIME'
      const type     = isAnime ? 'anime' : 'manga'
      const key      = `${type}-${media.id}`
      const externalId = `anilist-${key}`

      // Priorità titolo: italiano da cache → romaji → english
      const titleIt = titleItMap.get(key) || null
      const title   = titleIt || media.title?.romaji || media.title?.english || 'Senza titolo'

      const topTags = (media.tags || [])
        .filter((t: any) => t.rank >= 60)
        .sort((a: any, b: any) => b.rank - a.rank)
        .slice(0, 15)
        .map((t: any) => t.name)

      const rating = item.score ? Math.round((item.score / 10) * 5 * 2) / 2 : null

      return {
        user_id:          user.id,
        external_id:      externalId,
        title,
        type,
        cover_image:      media.coverImage?.extraLarge || media.coverImage?.large || null,
        current_episode:  item.progress || 0,
        episodes:         isAnime ? (media.episodes || null) : (media.chapters || null),
        status:           STATUS_MAP[item.status] || 'watching',
        rating:           rating && rating > 0 ? rating : null,
        genres:           media.genres || [],
        tags:             topTags,
        notes:            item.notes || null,
        import_source:    'anilist',
        display_order:    Date.now(),
        updated_at:       new Date().toISOString(),
      }
    })

  if (toInsert.length === 0) {
    return NextResponse.json({
      success: true, imported: 0, merged: 0, skipped: 0, total: 0,
      message: 'Nessun titolo valido trovato nel profilo AniList',
    }, { headers: rl.headers })
  }

  // ── Upsert con merge cross-source ─────────────────────────────────────────
  const { imported, merged, skipped } = await upsertWithMerge(supabase, toInsert, user.id, '[AniList Import]')

  const totalFromCache = fromCache + fromMalCache
  const cacheMsg = totalFromCache > 0
    ? ` (${fromCache} titoli da anilist_cache, ${fromMalCache} titoli italiani da MAL)`
    : ''

  return NextResponse.json({
    success: true,
    imported,
    merged,
    skipped,
    total:  toInsert.length,
    errors: errors.length > 0 ? errors : undefined,
    cache:  { fromCache, fromMalCache, total: totalFromCache },
    message: `Importati ${imported} titoli da AniList (@${username})${merged > 0 ? `, ${merged} uniti con duplicati` : ''}${cacheMsg}`,
  }, { headers: rl.headers })
}
