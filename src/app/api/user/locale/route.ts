import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'
import { normalizeLocale } from '@/lib/i18n/serverLocale'

export async function PATCH(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 30, windowMs: 60_000, prefix: 'user-locale' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { body = {} }

  const locale = normalizeLocale(body?.locale)
  if (!locale) return NextResponse.json({ error: 'Lingua non valida' }, { status: 400, headers: rl.headers })

  const response = NextResponse.json({ success: true, locale }, { headers: rl.headers })
  response.cookies.set('geekore_locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,
  })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    await supabase
      .from('profiles')
      .update({ preferred_locale: locale })
      .eq('id', user.id)
  }

  return response
}
