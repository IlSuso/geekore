import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

export type Locale = 'it' | 'en'
export type AppLocale = Locale

export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  if (v === 'it' || v === 'it-it' || v === 'ita' || v === 'italian' || v === 'italiano') return 'it'
  if (v === 'en' || v === 'en-us' || v === 'en-gb' || v === 'eng' || v === 'english') return 'en'
  return null
}

export function localeToTmdbLanguage(locale: AppLocale): 'it-IT' | 'en-US' {
  return locale === 'it' ? 'it-IT' : 'en-US'
}

export function localeToDeepLTarget(locale: AppLocale): 'IT' | 'EN-US' {
  return locale === 'it' ? 'IT' : 'EN-US'
}

export function localeToGoogleTarget(locale: AppLocale): 'it' | 'en' {
  return locale
}

export async function getServerLocale(): Promise<Locale> {
  const store = await cookies()
  return normalizeLocale(store.get('geekore_locale')?.value) ?? 'it'
}

export async function getRequestLocale(
  request?: NextRequest,
  supabase?: { from: (table: string) => any } | null,
  userId?: string | null,
): Promise<AppLocale> {
  const queryLocale = request ? normalizeLocale(request.nextUrl.searchParams.get('lang')) : null
  if (queryLocale) return queryLocale

  const explicitHeader = request
    ? normalizeLocale(request.headers.get('x-lang') || request.headers.get('x-geekore-locale'))
    : null
  if (explicitHeader) return explicitHeader

  const cookieLocale = request
    ? normalizeLocale(request.cookies.get('geekore_locale')?.value)
    : normalizeLocale((await cookies()).get('geekore_locale')?.value)
  if (cookieLocale) return cookieLocale

  const acceptLocale = request
    ? normalizeLocale(request.headers.get('accept-language')?.split(',')[0])
    : null
  if (acceptLocale) return acceptLocale

  if (supabase && userId) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('preferred_locale')
        .eq('id', userId)
        .maybeSingle()
      const profileLocale = normalizeLocale(data?.preferred_locale)
      if (profileLocale) return profileLocale
    } catch {
      // Non bloccare mai una route solo perché il profilo non è leggibile.
    }
  }

  return 'it'
}
