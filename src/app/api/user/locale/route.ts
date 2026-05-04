import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeLocale } from '@/lib/i18n/serverLocale'

export async function POST(request: NextRequest) {
  let body: any = {}
  try { body = await request.json() } catch {}

  const locale = normalizeLocale(body?.locale || request.nextUrl.searchParams.get('lang') || request.headers.get('x-lang'))
  if (!locale) return NextResponse.json({ ok: false, error: 'Locale non valido' }, { status: 400 })

  const response = NextResponse.json({ ok: true, locale })
  response.cookies.set('geekore_locale', locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('profiles').update({ preferred_locale: locale }).eq('id', user.id)
  } catch {}

  return response
}
