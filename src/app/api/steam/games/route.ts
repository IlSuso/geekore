import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const STEAM_API_KEY = process.env.STEAM_API_KEY
const CACHE_HOURS = 24

// Validazione Steam ID64: numero di 17 cifre che inizia con 7656119
const STEAM_ID64_REGEX = /^7656119\d{10}$/

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
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    })
    const data = await res.json()
    if (!data.access_token) return null
    igdbTokenCache = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) * 1000 }
    return igdbTokenCache.token
  } catch { return null }
}

interface IgdbMeta {
  genres: string[]
  themes: string[]
  keywords: string[]
  player_perspectives: string[]
  game_modes: string[]
}

async function fetchIgdbMetaBatch(
  gameNames: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Map<string, IgdbMeta>> {
  const result = new Map<string, IgdbMeta>()
  if (gameNames.length === 0) return result

  const clientId = process.env.IGDB_CLIENT_ID
  const token = await getIgdbToken()
  if (!clientId || !token) return result

  const CHUNK = 10
  const totalChunks = Math.ceil(gameNames.length / CHUNK)
  let processedChunks = 0

  for (let i = 0; i < gameNames.length; i += CHUNK) {
    const chunk = gameNames.slice(i, i + CHUNK)
    // Normalizza i nomi: prova versione originale e lowercase per match più ampio
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
          fields name, genres.name, themes.name, keywords.name,
                 player_perspectives.name, game_modes.name;
          where name = (${searchNames});
          limit ${CHUNK * 2};
        `,
        signal: AbortSignal.timeout(6000),
      })

      if (!res.ok) { processedChunks++; onProgress?.(processedChunks, totalChunks); continue }
      const games = await res.json()
      if (!Array.isArray(games)) { processedChunks++; onProgress?.(processedChunks, totalChunks); continue }

      for (const game of games) {
        result.set(game.name.toLowerCase(), {
          genres: game.genres?.map((g: any) => g.name).filter(Boolean) || [],
          themes: game.themes?.map((t: any) => t.name).filter(Boolean) || [],
          keywords: game.keywords?.map((k: any) => k.name).filter(Boolean) || [],
          player_perspectives: game.player_perspectives?.map((p: any) => p.name).filter(Boolean) || [],
          game_modes: game.game_modes?.map((m: any) => m.name).filter(Boolean) || [],
        })
      }

      processedChunks++
      onProgress?.(processedChunks, totalChunks)

      if (i + CHUNK < gameNames.length) {
        await new Promise(r => setTimeout(r, 300))
      }
    } catch {
      processedChunks++
      onProgress?.(processedChunks, totalChunks)
    }
  }

  return result
}

export async function GET(request: NextRequest) {
  const steamid = request.nextUrl.searchParams.get('steamid')

  if (!steamid) {
    return NextResponse.json({ success: false, error: 'Missing steamid' }, { status: 400 })
  }

  // ── Validazione Steam ID64 ──────────────────────────────────────────────────
  if (!STEAM_ID64_REGEX.test(steamid)) {
    return NextResponse.json({ success: false, error: 'Steam ID non valido' }, { status: 400 })
  }

  if (!STEAM_API_KEY) {
    return NextResponse.json({ success: false, error: 'STEAM_API_KEY not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 })
  }

  const supabaseService = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Cache 24h
  const { data: importLog } = await supabaseService
    .from('steam_import_log')
    .select('imported_at, games_count')
    .eq('user_id', user.id)
    .maybeSingle()

  if (importLog?.imported_at) {
    const hoursSinceImport = (Date.now() - new Date(importLog.imported_at).getTime()) / (1000 * 60 * 60)
    if (hoursSinceImport < CACHE_HOURS) {
      const remainingHours = Math.ceil(CACHE_HOURS - hoursSinceImport)
      return NextResponse.json({
        success: false, cached: true,
        error: `Hai già importato i giochi di recente. Riprova tra ${remainingHours} ore.`,
        last_import: importLog.imported_at,
        games_count: importLog.games_count,
      }, { status: 429 })
    }
  }

  // ── Streaming response ──────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(data) + '\n')) } catch {}
      }

      try {
        send({ type: 'progress', step: 'steam', current: 0, total: 0, message: 'Recupero giochi Steam...' })

        const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${encodeURIComponent(steamid)}&format=json&include_appinfo=true&include_played_free_games=true`
        const res = await fetch(url)
        const data = await res.json()

        if (!data.response?.games) {
          send({ type: 'error', message: 'Nessun gioco trovato o profilo Steam privato' }); return
        }

        const rawGames: any[] = data.response.games

        // Fetch metadati IGDB solo per giochi con >30 min giocati
        const playedGames = rawGames.filter(g => (g.playtime_forever || 0) >= 30)
        const gameNames = playedGames.map(g => g.name)
        const totalChunks = Math.ceil(gameNames.length / 10) || 1

        send({ type: 'progress', step: 'igdb', current: 0, total: totalChunks,
          message: `Recupero metadati IGDB... 0/${totalChunks}` })

        const metaMap = await fetchIgdbMetaBatch(gameNames, (current, total) => {
          send({ type: 'progress', step: 'igdb', current, total,
            message: `Recupero metadati IGDB... ${current}/${total}` })
        })

        send({ type: 'progress', step: 'save', current: 0, total: 0, message: 'Salvataggio...' })

        const games = rawGames.map((game: any) => {
          const meta = metaMap.get(game.name.toLowerCase())
          return {
            appid: game.appid,
            name: game.name,
            playtime_forever: game.playtime_forever,
            cover_image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`,
            genres: meta?.genres || [],
            themes: meta?.themes || [],
            keywords: meta?.keywords || [],
            player_perspectives: meta?.player_perspectives || [],
            game_modes: meta?.game_modes || [],
          }
        })

        const steamMedia = games.map((game: any) => ({
          user_id: user.id,
          title: game.name,
          type: 'game',
          appid: String(game.appid),
          cover_image: game.cover_image ?? null,
          current_episode: Math.floor(game.playtime_forever / 60),
          is_steam: true,
          genres: game.genres,
          themes: game.themes,
          keywords: game.keywords,
          player_perspectives: game.player_perspectives,
          game_modes: game.game_modes,
          display_order: Date.now(),
          updated_at: new Date().toISOString(),
          rating: 0,
        }))

        await supabaseService.from('user_media_entries').upsert(steamMedia, { onConflict: 'user_id,appid' })

        await supabaseService.from('steam_import_log').upsert({
          user_id: user.id,
          imported_at: new Date().toISOString(),
          games_count: games.length,
        }, { onConflict: 'user_id' })

        const totalHours = rawGames.reduce((sum: number, g: any) => sum + Math.floor((g.playtime_forever || 0) / 60), 0)
        const corePower = Math.min(Math.round(totalHours / 10), 9999)

        const { data: profileData } = await supabaseService
          .from('profiles').select('username, avatar_url').eq('id', user.id).single()

        await supabaseService.from('leaderboard').upsert({
          user_id: user.id,
          username: profileData?.username || 'Unknown',
          avatar_url: profileData?.avatar_url || null,
          steam_id: steamid,
          core_power: corePower,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })

        const enrichedCount = games.filter((g: any) => g.genres.length > 0).length

        send({
          type: 'done',
          success: true,
          count: games.length,
          enriched_count: enrichedCount,
          core_power: corePower,
          games,
          message: `${games.length} giochi Steam importati`,
        })
      } catch (error: any) {
        logger.error('Steam API error:', error)
        send({ type: 'error', message: 'Errore chiamata Steam API' })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    },
  })
}