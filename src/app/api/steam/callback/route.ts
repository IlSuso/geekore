import { logger } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Steam ID64 deve essere un numero di 17 cifre che inizia con 7656119
const STEAM_ID64_REGEX = /^7656119\d{10}$/

function isValidSteamId64(id: string): boolean {
  return STEAM_ID64_REGEX.test(id)
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const url = new URL(request.url)
  const claimedId = url.searchParams.get('openid.claimed_id')

  if (!claimedId) {
    return NextResponse.redirect(new URL('/profile/me?error=steam_invalid', request.url))
  }

  const steamId64 = claimedId.replace('https://steamcommunity.com/openid/id/', '')

  // ── Validazione Steam ID64 ──────────────────────────────────────────────────
  if (!isValidSteamId64(steamId64)) {
    logger.error('[Steam Callback] Invalid Steam ID64:', steamId64)
    return NextResponse.redirect(new URL('/profile/me?error=steam_invalid_id', request.url))
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const steamApiKey = process.env.STEAM_API_KEY
    let steamUsername = 'Steam User'
    let steamAvatar = ''

    if (steamApiKey) {
      // Usa encodeURIComponent per il steamId per sicurezza (anche se validato sopra)
      const playerRes = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamApiKey}&steamids=${encodeURIComponent(steamId64)}`
      )
      const playerData = await playerRes.json()
      const player = playerData?.response?.players?.[0]
      if (player) {
        steamUsername = player.personaname || steamUsername
        steamAvatar = player.avatarfull || player.avatarmedium || ''
      }
    }

    const { error } = await supabase
      .from('steam_accounts')
      .upsert(
        {
          user_id: user.id,
          steam_id64: steamId64,
          steam_username: steamUsername,
          steam_avatar: steamAvatar,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      logger.error('Errore DB Steam:', error)
      return NextResponse.redirect(new URL('/profile/me?error=db_error', request.url))
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single()

    const profileUrl = profile?.username
      ? `/profile/${profile.username}?steam_success=true`
      : '/profile/me?steam_success=true'

    return NextResponse.redirect(new URL(profileUrl, request.url))
  } catch (err) {
    logger.error('Errore callback Steam:', err)
    return NextResponse.redirect(new URL('/profile/me?error=server_error', request.url))
  }
}