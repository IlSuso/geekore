// src/middleware.ts
// #24: Aggiunto check onboarding_done lato server.
//      Se l'utente è loggato ma non ha completato l'onboarding,
//      viene redirectato a /onboarding (tranne che per le route pubbliche
//      e l'onboarding stesso). Previene bypass via navigazione diretta.

import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

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
]

const AUTH_ONLY_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
]

const PUBLIC_PATHS = [
  '/privacy',
  '/terms',
  '/cookies',
  '/auth/confirm',
  '/auth/email-change',
  '/auth/reset-password',
  '/api/',
]

// #24: queste route sono accessibili anche senza onboarding completato
const ONBOARDING_EXEMPT = [
  '/onboarding',
  '/profile',   // il profilo pubblico deve restare accessibile
  '/auth/',
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

function isOnboardingExempt(pathname: string): boolean {
  return ONBOARDING_EXEMPT.some(p => pathname === p || pathname.startsWith(p))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Bypass per assets statici e path pubblici
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

  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  // Route protetta + non autenticato → login
  if (isProtected(pathname) && !isLoggedIn) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Route auth-only + già autenticato → controlla onboarding prima
  if (isAuthOnly(pathname) && isLoggedIn) {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  // Landing page / + autenticato → feed
  if (pathname === '/' && isLoggedIn) {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  // #24: Check onboarding per utenti autenticati su route protette
  // Usa getUser() (autenticato server-side) per non fare query DB aggiuntive su ogni request —
  // il profilo viene letto solo quando strettamente necessario (route protetta).
  if (isLoggedIn && isProtected(pathname) && !isOnboardingExempt(pathname)) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_done')
        .eq('id', user!.id)
        .single()

      // Se onboarding non completato → redirect a /onboarding
      if (profile && profile.onboarding_done === false) {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }
    } catch {
      // In caso di errore DB non blocchiamo la navigazione
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}