import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const STEAM_API_KEY = process.env.STEAM_API_KEY
const CACHE_HOURS = 24

// Service client per bypassare RLS sulla steam_import_log (scrittura server-side)
const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getBestImage(appid: number): Promise<string> {
  const base = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}`
  // Non facciamo più imageExists() con richieste HEAD per ogni gioco —
  // header.jpg esiste sempre per tutti i giochi Steam
  return `${base}/library_600x900.jpg`
}

export async function GET(request: NextRequest) {
  const steamid = request.nextUrl.searchParams.get('steamid')

  if (!steamid) {
    return NextResponse.json({ success: false, error: 'Missing steamid' }, { status: 400 })
  }

  if (!STEAM_API_KEY) {
    return NextResponse.json({ success: false, error: 'STEAM_API_KEY not configured' }, { status: 500 })
  }

  // ── Verifica utente autenticato ──────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ success: false, error: 'Non autenticato' }, { status: 401 })
  }

  // ── Controlla cache: ha già importato nelle ultime 24 ore? ───────────────
  const { data: importLog } = await supabaseService
    .from('steam_import_log')
    .select('imported_at, games_count')
    .eq('user_id', user.id)
    .maybeSingle()

  if (importLog?.imported_at) {
    const lastImport = new Date(importLog.imported_at)
    const hoursSinceImport = (Date.now() - lastImport.getTime()) / (1000 * 60 * 60)

    if (hoursSinceImport < CACHE_HOURS) {
      const remainingHours = Math.ceil(CACHE_HOURS - hoursSinceImport)
      return NextResponse.json({
        success: false,
        cached: true,
        error: `Hai già importato i giochi di recente. Riprova tra ${remainingHours} ore.`,
        last_import: importLog.imported_at,
        games_count: importLog.games_count,
      }, { status: 429 })
    }
  }

  // ── Chiamata Steam API ───────────────────────────────────────────────────
  try {
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamid}&format=json&include_appinfo=true&include_played_free_games=true`

    const res = await fetch(url)
    const data = await res.json()

    if (!data.response?.games) {
      return NextResponse.json({ success: false, error: 'Nessun gioco trovato o profilo Steam privato' })
    }

    const rawGames = data.response.games

    // Costruisce la lista giochi — immagine singola senza richieste HEAD
    const games = rawGames.map((game: any) => ({
      appid: game.appid,
      name: game.name,
      playtime_forever: game.playtime_forever,
      cover_image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/library_600x900.jpg`,
    }))

    // ── Aggiorna log importazione ──────────────────────────────────────────
    await supabaseService
      .from('steam_import_log')
      .upsert({
        user_id: user.id,
        imported_at: new Date().toISOString(),
        games_count: games.length,
      }, { onConflict: 'user_id' })

    // ── Calcola e aggiorna core_power nella leaderboard ───────────────────
    // Formula Opzione A: ore totali / 10, max 9999
    const totalHours = rawGames.reduce(
      (sum: number, g: any) => sum + Math.floor((g.playtime_forever || 0) / 60), 0
    )
    const corePower = Math.min(Math.round(totalHours / 10), 9999)

    const { data: profileData } = await supabaseService
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', user.id)
      .single()

    await supabaseService
      .from('leaderboard')
      .upsert({
        user_id: user.id,
        username: profileData?.username || 'Unknown',
        avatar_url: profileData?.avatar_url || null,
        steam_id: steamid,
        core_power: corePower,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    return NextResponse.json({
      success: true,
      games,
      count: games.length,
      core_power: corePower,
    })

  } catch (error) {
    console.error('Steam API error:', error)
    return NextResponse.json({ success: false, error: 'Errore chiamata Steam API' }, { status: 502 })
  }
}