// src/middleware.ts
// Protegge le route autenticate lato server PRIMA del rendering.
// Elimina i flash di contenuto non autenticato e le redirect client-side ridondanti.

import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// Route che richiedono autenticazione
const PROTECTED_PATHS = [
  '/feed',
  '/discover',
  '/for-you',
  '/news',
  '/notifications',
  '/profile/edit',
  '/profile/me',
  '/settings',
  '/wishlist',
  '/lists',
  '/stats',
  '/trending',
  '/leaderboard',
  '/explore',
  '/onboarding',
]

// Route accessibili solo ai non autenticati (redirect a feed se loggato)
const AUTH_ONLY_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
]

// Route sempre pubbliche (bypass completo)
const PUBLIC_PATHS = [
  '/privacy',
  '/terms',
  '/cookies',
  '/auth/confirm',
  '/auth/email-change',
  '/auth/reset-password',
  '/api/',
]

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function isAuthOnly(pathname: string): boolean {
  return AUTH_ONLY_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Bypass per assets statici, API routes e path pubblici
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/images/') ||
    pathname === '/sw.js' ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico' ||
    isPublic(pathname)
  ) {
    return NextResponse.next()
  }

  // Crea client Supabase SSR
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

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
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verifica sessione (non usa getUser() per non fare richiesta al DB in ogni request)
  const { data: { session } } = await supabase.auth.getSession()
  const isLoggedIn = !!session?.user

  // Route protetta + non autenticato → login
  if (isProtected(pathname) && !isLoggedIn) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Route auth-only + già autenticato → feed
  if (isAuthOnly(pathname) && isLoggedIn) {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  // Landing page / + autenticato → feed
  if (pathname === '/' && isLoggedIn) {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Esegui su tutte le route TRANNE:
     * - _next/static (asset statici)
     * - _next/image (ottimizzazione immagini)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}