// src/middleware.ts
// #25: Logica onboarding invertita — "blocca tutto tranne le eccezioni".
//      Un utente loggato con onboarding_done=false viene SEMPRE redirectato
//      a /onboarding indipendentemente dalla route che tenta di raggiungere.
//      Non è più possibile bypassare l'onboarding cambiando URL manualmente.
//
//      Logica completa:
//        1. Assets statici / API → sempre pass-through (no auth check)
//        2. Route pubbliche (privacy, terms, auth/*) → pass-through
//        3. Utente NON loggato su route protetta → redirect /login?next=...
//        4. Utente loggato su route auth-only (login/register) → redirect /feed
//        5. Utente loggato su / → redirect /feed
//        6. Utente loggato + onboarding NON completato + route non esente → /onboarding
//        7. Tutto il resto → pass-through

import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// Route che richiedono autenticazione (non loggato → /login)
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
  '/search',
  '/profile',    // tutti i profili (anche /profile/[username]) richiedono login
]

// Route accessibili solo da NON autenticati
const AUTH_ONLY_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
]

// Route sempre accessibili senza alcun check (assets, API, pagine legali, flusso auth)
const ALWAYS_ALLOW = [
  '/_next/',
  '/icons/',
  '/images/',
  '/sw.js',
  '/manifest.json',
  '/favicon.ico',
  '/privacy',
  '/terms',
  '/cookies',
  '/api/',
  '/auth/',
]

// Route accessibili da un utente loggato ANCHE se onboarding non completato.
// Tutto il resto viene bloccato e redirectato a /onboarding.
const ONBOARDING_EXEMPT = [
  '/onboarding',  // la pagina di onboarding stessa
  '/auth/',       // flussi auth (confirm, reset-password, ecc.)
  '/api/',        // le API devono sempre rispondere
]

function matchesAny(pathname: string, list: string[]): boolean {
  return list.some(p => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/') || pathname.startsWith(p))
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function isAuthOnly(pathname: string): boolean {
  return AUTH_ONLY_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Pass-through immediato per assets e route sempre-permesse
  if (matchesAny(pathname, ALWAYS_ALLOW)) {
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
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user

  // 2. Non autenticato su route protetta → /login?next=...
  if (!isLoggedIn && isProtected(pathname)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 3. Già autenticato su route auth-only → /feed
  if (isLoggedIn && isAuthOnly(pathname)) {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  // 4. Già autenticato sulla landing / → /feed
  if (isLoggedIn && pathname === '/') {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  // 5. Utente loggato: controlla onboarding su QUALSIASI route non esente.
  //    Questo blocca qualunque tentativo di navigazione manuale finché
  //    onboarding_done non è true — non solo le PROTECTED_PATHS.
  if (isLoggedIn && !matchesAny(pathname, ONBOARDING_EXEMPT)) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_done')
        .eq('id', user!.id)
        .single()

      if (profile && profile.onboarding_done === false) {
        // Già su /onboarding → lascia passare (evita redirect loop)
        if (pathname === '/onboarding') return response
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }
    } catch {
      // Errore DB → non blocchiamo la navigazione per non rendere l'app inutilizzabile
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}