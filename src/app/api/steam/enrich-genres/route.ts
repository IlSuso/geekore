import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// ── IGDB token cache ──────────────────────────────────────────────────────────
let igdbTokenCache: { token: string; expiresAt: number } | null = null

async function getIgdbToken(): Promise<string | null> {
  const clientId = process.env.IGDB_CLIENT_ID
  const clientSecret = process.env.IGDB_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const now = Date.now()
  if (igdbTokenCache && igdbTokenCache.expiresAt > now + 60_000) return igdbTokenCache.token

  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    })
    const data = await res.json()
    if (!data.access_token) return null
    igdbTokenCache = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) * 1000 }
    return igdbTokenCache.token
  } catch {
    return null
  }
}

async function fetchGenresForNames(gameNames: string[], clientId: string, token: string): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>()
  if (gameNames.length === 0) return result

  const CHUNK = 10
  for (let i = 0; i < gameNames.length; i += CHUNK) {
    const chunk = gameNames.slice(i, i + CHUNK)
    const searchNames = chunk.map(n => `"${n.replace(/"/g, '').replace(/'/g, '')}"`).join(',')

    try {
      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: {
          'Client-ID': clientId,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'text/plain',
        },
        body: `
          fields name, genres.name;
          where name = (${searchNames});
          limit ${CHUNK * 2};
        `,
        signal: AbortSignal.timeout(8000),
      })

      if (!res.ok) continue
      const games = await res.json()
      if (!Array.isArray(games)) continue

      for (const game of games) {
        if (!game.genres?.length) continue
        const genres: string[] = game.genres.map((g: any) => g.name).filter(Boolean)
        result.set(game.name.toLowerCase(), genres)
      }

      if (i + CHUNK < gameNames.length) {
        await new Promise(r => setTimeout(r, 400))
      }
    } catch {
      // Continua col prossimo chunk
    }
  }

  return result
}

// POST /api/steam/enrich-genres
// Arricchisce con generi IGDB tutti i giochi Steam dell'utente che hanno genres = [] o null
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  const clientId = process.env.IGDB_CLIENT_ID
  const token = await getIgdbToken()

  if (!clientId || !token) {
    return NextResponse.json({ error: 'IGDB non configurato' }, { status: 500 })
  }

  const supabaseService = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Recupera tutti i giochi Steam senza generi (o con array vuoto)
  const { data: steamGames, error } = await supabaseService
    .from('user_media_entries')
    .select('id, title, genres')
    .eq('user_id', user.id)
    .eq('type', 'game')
    .eq('is_steam', true)

  if (error || !steamGames?.length) {
    return NextResponse.json({ enriched: 0, message: 'Nessun gioco Steam trovato' })
  }

  // Filtra solo quelli senza generi
  const withoutGenres = steamGames.filter(g => !g.genres || g.genres.length === 0)

  if (withoutGenres.length === 0) {
    return NextResponse.json({ enriched: 0, message: 'Tutti i giochi hanno già i generi' })
  }

  console.log(`[Enrich] Processing ${withoutGenres.length} games without genres`)

  const gameNames = withoutGenres.map(g => g.title)
  const genreMap = await fetchGenresForNames(gameNames, clientId, token)

  console.log(`[Enrich] Got genres for ${genreMap.size} / ${withoutGenres.length} games`)

  // Aggiorna solo i giochi per cui abbiamo trovato generi
  let enrichedCount = 0
  const updates: Promise<any>[] = []

  for (const game of withoutGenres) {
    const genres = genreMap.get(game.title.toLowerCase())
    if (!genres || genres.length === 0) continue

    enrichedCount++
    updates.push(
      supabaseService
        .from('user_media_entries')
        .update({ genres, updated_at: new Date().toISOString() })
        .eq('id', game.id)
    )
  }

  // Esegui in batch di 10 per non saturare il DB
  const BATCH = 10
  for (let i = 0; i < updates.length; i += BATCH) {
    await Promise.allSettled(updates.slice(i, i + BATCH))
  }

  return NextResponse.json({
    enriched: enrichedCount,
    total: withoutGenres.length,
    message: `Arricchiti ${enrichedCount} giochi su ${withoutGenres.length}`,
  })
}

// GET — stesso comportamento, utile per chiamata dal browser
export async function GET(request: NextRequest) {
  return POST(request)
}