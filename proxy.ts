import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const isDev = process.env.NODE_ENV === 'development'

const CSP = isDev
  ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' *; img-src * data: blob:;"
  : [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src * data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.steampowered.com https://graphql.anilist.co https://api.themoviedb.org https://api.igdb.com https://cdn.cloudflare.steamstatic.com https://s4.anilist.co https://image.tmdb.org https://images.igdb.com https://cf.geekdo-images.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // ─── Geo-detection locale ──────────────────────────────────────────────────
  const existingLocaleCookie = request.cookies.get('geekore_locale')
  if (!existingLocaleCookie) {
    const country = request.headers.get('x-vercel-ip-country') || ''
    const detectedLocale = country.toUpperCase() === 'IT' ? 'it' : 'en'
    supabaseResponse.cookies.set('geekore_locale', detectedLocale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    })
  }
  // ──────────────────────────────────────────────────────────────────────────

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.getUser()

  supabaseResponse.headers.set('Content-Security-Policy', CSP)

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}