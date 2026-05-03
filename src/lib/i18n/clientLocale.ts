import type { AppLocale } from './serverLocale'

export function appendLocale(url: string, locale: AppLocale): string {
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    parsed.searchParams.set('lang', locale)
    if (url.startsWith('/')) return `${parsed.pathname}${parsed.search}${parsed.hash}`
    return parsed.toString()
  } catch {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}lang=${locale}`
  }
}

export async function persistLocale(locale: AppLocale) {
  if (typeof document !== 'undefined') {
    document.cookie = `geekore_locale=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('geekore_locale', locale)
  }

  await fetch('/api/user/locale', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  }).catch(() => null)
}
