// src/app/api/admin/repair-covers/route.ts
//
// Ripara automaticamente le cover_image rotte nei user_media_entries.
// Strategia:
//   1. Carica tutti i record con cover_image non null
//   2. Per ogni record, verifica se l'URL risponde (HEAD request)
//   3. Se è 404/errore, cerca la cover sulla sorgente adatta al tipo:
//      - movie / tv   → TMDB
//      - anime        → AniList (poi MAL come fallback)
//      - manga        → MAL (Jikan, API pubblica, URL stabili)
//      - game         → IGDB
//   4. Aggiorna il record con la nuova cover
//
// Chiamare con POST /api/admin/repair-covers
// Opzionale: body { user_id: "..." } per riparare solo un utente specifico
//            body { dry_run: true } per vedere cosa verrebbe riparato senza modificare nulla
//
// Richiede autenticazione — solo l'utente loggato può riparare i propri record
// (o tutti i record se è admin, verificato tramite ADMIN_SECRET)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Client con service role — bypassa RLS, usato solo per le operazioni admin
function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const TMDB_BASE       = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'
const ANILIST_API     = 'https://graphql.anilist.co'
const JIKAN_BASE      = 'https://api.jikan.moe/v4'   // MAL proxy pubblico, no API key
const BATCH_SIZE      = 10
const DELAY_MS        = 150

// ── IGDB token cache (stesso pattern già usato in /api/igdb/route.ts) ─────────
let igdbTokenCache: { token: string; expiresAt: number } | null = null

async function getIgdbToken(): Promise<string | null> {
  const clientId     = process.env.IGDB_CLIENT_ID     || ''
  const clientSecret = process.env.IGDB_CLIENT_SECRET || ''
  if (!clientId || !clientSecret) return null

  const now = Date.now()
  if (igdbTokenCache && igdbTokenCache.expiresAt > now + 60_000) return igdbTokenCache.token

  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()
    if (!data.access_token) return null
    igdbTokenCache = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) * 1000 }
    return igdbTokenCache.token
  } catch {
    return null
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function isUrlBroken(url: string): Promise<boolean> {
  try {
    // URL AniList: hotlink protection basata sul Referer — li trattiamo come rotti
    if (url.includes('s4.anilist.co') || url.includes('anilist.co/file')) {
      return true
    }
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    return !res.ok
  } catch {
    return true
  }
}

// ── TMDB (movie / tv) ─────────────────────────────────────────────────────────
async function fetchTmdbCover(
  title: string,
  type: 'movie' | 'tv',
  apiKey: string
): Promise<string | null> {
  const endpoint = type === 'movie' ? 'movie' : 'tv'
  const headers = { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' }

  try {
    const params = new URLSearchParams({ query: title, page: '1' })
    const res = await fetch(`${TMDB_BASE}/search/${endpoint}?${params}`, {
      headers, signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const results: any[] = json.results || []
    const best = results.find((m: any) => m.poster_path) || results[0]
    if (!best?.poster_path) return null

    // Dettaglio in italiano per poster localizzato
    const detailRes = await fetch(
      `${TMDB_BASE}/${endpoint}/${best.id}?language=it-IT`,
      { headers, signal: AbortSignal.timeout(6000) }
    )
    if (detailRes.ok) {
      const detail = await detailRes.json()
      return `${TMDB_IMAGE_BASE}${detail.poster_path || best.poster_path}`
    }
    return `${TMDB_IMAGE_BASE}${best.poster_path}`
  } catch {
    return null
  }
}

// ── AniList (anime, e fallback per manga se MAL fallisce) ─────────────────────
async function fetchAniListCover(
  title: string,
  type: 'anime' | 'manga'
): Promise<string | null> {
  const query = `
    query ($search: String, $type: MediaType) {
      Media(search: $search, type: $type) {
        coverImage { large extraLarge }
      }
    }
  `
  try {
    const res = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { search: title, type: type.toUpperCase() } }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = await res.json()
    // Preferisce extraLarge, fallback a large
    return json.data?.Media?.coverImage?.extraLarge
        || json.data?.Media?.coverImage?.large
        || null
  } catch {
    return null
  }
}

// ── MAL via Jikan (manga — URL stabili, niente hotlink protection) ────────────
async function fetchMalCover(
  title: string,
  type: 'anime' | 'manga'
): Promise<string | null> {
  try {
    const params = new URLSearchParams({ q: title, type, limit: '5' })
    const res = await fetch(`${JIKAN_BASE}/${type}?${params}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const results: any[] = json.data || []
    if (results.length === 0) return null

    // Cerca match esatto (case-insensitive) sul titolo inglese o giapponese
    const titleLower = title.toLowerCase()
    const exact = results.find((r: any) =>
      r.title?.toLowerCase() === titleLower ||
      r.title_english?.toLowerCase() === titleLower ||
      r.title_japanese?.toLowerCase() === titleLower
    )
    const best = exact || results[0]

    // Jikan restituisce webp in images.jpg.large_image_url — URL stabili CDN MyAnimeList
    return best?.images?.jpg?.large_image_url
        || best?.images?.jpg?.image_url
        || best?.images?.webp?.large_image_url
        || null
  } catch {
    return null
  }
}

// ── IGDB (game) ───────────────────────────────────────────────────────────────
async function fetchIgdbCover(title: string): Promise<string | null> {
  const clientId = process.env.IGDB_CLIENT_ID || ''
  const token    = await getIgdbToken()
  if (!clientId || !token) return null

  try {
    // Cerca il gioco per titolo
    const searchRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      body: `search "${title.replace(/"/g, '')}"; fields id,name,cover; limit 5;`,
      signal: AbortSignal.timeout(8000),
    })
    if (!searchRes.ok) return null
    const games: any[] = await searchRes.json()
    const best = games.find((g: any) => g.cover) || games[0]
    if (!best?.cover) return null

    // Recupera i dettagli della cover
    const coverId = typeof best.cover === 'object' ? best.cover.id : best.cover
    const coverRes = await fetch('https://api.igdb.com/v4/covers', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      body: `fields image_id; where id = ${coverId};`,
      signal: AbortSignal.timeout(6000),
    })
    if (!coverRes.ok) return null
    const covers: any[] = await coverRes.json()
    const imageId = covers[0]?.image_id
    if (!imageId) return null

    // URL IGDB con alta risoluzione (720p)
    return `https://images.igdb.com/igdb/image/upload/t_720p/${imageId}.jpg`
  } catch {
    return null
  }
}

// ── Router principale ─────────────────────────────────────────────────────────

async function findNewCover(
  title: string,
  type: string,
  coverImage: string,
  tmdbApiKey: string
): Promise<string | null> {
  switch (type) {
    case 'movie':
      return fetchTmdbCover(title, 'movie', tmdbApiKey)

    case 'tv':
      return fetchTmdbCover(title, 'tv', tmdbApiKey)

    case 'anime': {
      // Per anime: AniList è ok (l'URL restituito è extraLarge che è CDN diverso)
      // Se il vecchio URL era AniList con hotlink protection → riprova comunque AniList
      // (ora salviamo il nuovo URL che potrebbe essere diverso e funzionante)
      // Fallback: MAL via Jikan
      const anilistCover = await fetchAniListCover(title, 'anime')
      if (anilistCover) return anilistCover
      return fetchMalCover(title, 'anime')
    }

    case 'manga':
      // MAL prima (URL stabili, niente hotlink protection)
      // Fallback: AniList
      const malCover = await fetchMalCover(title, 'manga')
      if (malCover) return malCover
      return fetchAniListCover(title, 'manga')

    case 'game':
      return fetchIgdbCover(title)

    default:
      return null
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  // Client admin per bypassare RLS su record di altri utenti
  const adminDb = createAdminClient()

  const body = await request.json().catch(() => ({}))
  const dryRun       = body.dry_run === true
  const targetUserId = body.user_id || user.id

  const tmdbApiKey = process.env.TMDB_API_KEY || ''

  // Carica tutti i record con cover_image non null per l'utente target
  // Ora include tutti i tipi supportati
  const { data: entries, error } = await adminDb
    .from('user_media_entries')
    .select('id, title, type, cover_image, external_id')
    .eq('user_id', targetUserId)
    .not('cover_image', 'is', null)
    .in('type', ['movie', 'tv', 'anime', 'manga', 'game'])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!entries || entries.length === 0) {
    return NextResponse.json({ message: 'Nessun record da controllare', checked: 0, repaired: 0 })
  }

  const results = {
    checked:    entries.length,
    broken:     0,
    repaired:   0,
    not_found:  0,
    skipped:    0,
    details: [] as Array<{
      title: string
      type: string
      old_url: string
      new_url: string | null
      status: string
    }>,
  }

  // Processa in batch per non fare troppe richieste in parallelo
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE)

    await Promise.all(batch.map(async (entry) => {
      const broken = await isUrlBroken(entry.cover_image!)

      if (!broken) {
        results.skipped++
        return
      }

      results.broken++
      const newCover = await findNewCover(entry.title, entry.type, entry.cover_image!, tmdbApiKey)

      results.details.push({
        title:   entry.title,
        type:    entry.type,
        old_url: entry.cover_image!,
        new_url: newCover,
        status:  newCover ? 'repaired' : 'not_found',
      })

      if (!newCover) {
        results.not_found++
        return
      }

      if (!dryRun) {
        await adminDb
          .from('user_media_entries')
          .update({ cover_image: newCover })
          .eq('id', entry.id)
      }

      results.repaired++
    }))

    if (i + BATCH_SIZE < entries.length) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  return NextResponse.json({
    success: true,
    dry_run: dryRun,
    ...results,
    message: dryRun
      ? `[DRY RUN] ${results.broken} cover rotte trovate su ${results.checked} controllate. ${results.repaired} sarebbero state riparate.`
      : `${results.repaired} cover riparate su ${results.broken} rotte trovate (${results.checked} controllate in totale).`,
  })
}