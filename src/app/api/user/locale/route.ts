import { after, NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeLocale, type Locale } from '@/lib/i18n/serverLocale'
import { persistLocaleAssetsForUserMasterPool } from '@/lib/i18n/masterPoolLocaleAssets'

const WARNING_ZONE_MS = 24 * 60 * 60 * 1000

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
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('preferred_locale')
        .eq('id', user.id)
        .maybeSingle()

      const previousLocale = normalizeLocale(profile?.preferred_locale) as Locale | null
      const changedLocale = Boolean(previousLocale && previousLocale !== locale)

      await supabase.from('profiles').update({ preferred_locale: locale }).eq('id', user.id)

      if (changedLocale) {
        const warningUntil = Date.now() + WARNING_ZONE_MS
        response.cookies.set('geekore_locale_warning_until', String(warningUntil), { path: '/', maxAge: 60 * 60 * 24, sameSite: 'lax' })
        response.cookies.set('geekore_locale_previous', previousLocale!, { path: '/', maxAge: 60 * 60 * 24, sameSite: 'lax' })

        // Warning zone: per 24h importiamo/preserviamo entrambe le lingue del master pool.
        // Questo non blocca il cambio lingua: parte subito dopo la risposta.
        after(() => persistLocaleAssetsForUserMasterPool({
          supabase,
          userId: user.id,
          locale,
          includeAlternateLocale: true,
        }).catch(() => undefined))
      } else {
        // Lingua stabile: garantiamo almeno gli asset della lingua attiva.
        after(() => persistLocaleAssetsForUserMasterPool({
          supabase,
          userId: user.id,
          locale,
          includeAlternateLocale: false,
        }).catch(() => undefined))
      }
    }
  } catch {}

  return response
}
