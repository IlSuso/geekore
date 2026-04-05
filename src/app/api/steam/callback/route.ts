import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Validate the OpenID response by sending a check_authentication request to Steam.
// Without this, anyone could forge a callback with an arbitrary Steam ID.
async function verifyOpenIdWithSteam(params: URLSearchParams): Promise<boolean> {
  const verifyParams = new URLSearchParams(params)
  verifyParams.set('openid.mode', 'check_authentication')

  try {
    const res = await fetch('https://steamcommunity.com/openid/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams.toString(),
    })
    const body = await res.text()
    return body.includes('is_valid:true')
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const claimedId = url.searchParams.get('openid.claimed_id')

  if (!claimedId) {
    return NextResponse.redirect(new URL('/profile/me?error=steam_invalid', request.url))
  }

  // Extract Steam ID before verification so we can validate the format
  const steamIdMatch = claimedId.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/)
  if (!steamIdMatch) {
    return NextResponse.redirect(new URL('/profile/me?error=steam_invalid', request.url))
  }
  const steamId64 = steamIdMatch[1]

  // Verify the OpenID response with Steam to prevent spoofing
  const isValid = await verifyOpenIdWithSteam(url.searchParams)
  if (!isValid) {
    return NextResponse.redirect(new URL('/profile/me?error=steam_verification_failed', request.url))
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const steamApiKey = process.env.STEAM_API_KEY
    let steamUsername = 'Steam User'
    let steamAvatar = ''

    if (steamApiKey) {
      const playerRes = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${steamApiKey}&steamids=${steamId64}`
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
      console.error('Errore DB Steam:', error)
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
    console.error('Errore callback Steam:', err)
    return NextResponse.redirect(new URL('/profile/me?error=server_error', request.url))
  }
}
