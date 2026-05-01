import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimit } from '@/lib/rateLimit'

function getSiteOrigin(requestUrl: string): string {
  const fallback = new URL(requestUrl).origin
  const configured = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || fallback
  try {
    const url = new URL(configured)
    return url.origin
  } catch {
    return fallback
  }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Redirect al login con messaggio esplicito
    return NextResponse.redirect(new URL('/login?reason=steam_auth_required', request.url))
  }

  const siteUrl = getSiteOrigin(request.url)
  const callbackUrl = `${siteUrl}/api/steam/callback`

  const steamAuthUrl =
    `https://steamcommunity.com/openid/login?` +
    `openid.claimed_id=http://specs.openid.net/auth/2.0/identifier_select&` +
    `openid.identity=http://specs.openid.net/auth/2.0/identifier_select&` +
    `openid.mode=checkid_setup&` +
    `openid.ns=http://specs.openid.net/auth/2.0&` +
    `openid.return_to=${encodeURIComponent(callbackUrl)}&` +
    `openid.realm=${encodeURIComponent(siteUrl)}`

  return NextResponse.redirect(steamAuthUrl)
}

export async function DELETE(request: NextRequest) {
  const rl = rateLimit(request, { limit: 10, windowMs: 60_000, prefix: 'steam:disconnect' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  const { error } = await supabase.from('steam_accounts').delete().eq('user_id', user.id)
  if (error) return NextResponse.json({ error: 'Account Steam non scollegato' }, { status: 500, headers: rl.headers })

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
