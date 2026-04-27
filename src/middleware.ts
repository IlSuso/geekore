// src/middleware.ts

import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const PROTECTED_PATHS = [
  '/home', '/discover', '/for-you', '/news', '/notifications',
  '/profile/me', '/settings', '/wishlist',
  '/lists', '/stats', '/trending', '/leaderboard', '/explore', '/community',
  '/search', '/profile',
]

const AUTH_ONLY_PATHS = ['/login', '/register', '/forgot-password']

const ALWAYS_ALLOW = [
  '/_next/', '/icons/', '/images/', '/sw.js', '/manifest.json',
  '/favicon.ico', '/privacy', '/terms', '/cookies', '/api/', '/auth/',
]

// Route esentate dal check onboarding:
// - /profile/:username (profili pubblici — non richiedono onboarding)
// - route tecniche e di setup
const ONBOARDING_EXEMPT = [
  '/onboarding', '/auth/', '/api/', '/profile/setup',
]

// Controlla se è una route profilo pubblico (/profile/qualcosa ma NON /profile/me)
function isPublicProfile(pathname: string): boolean {
  if (!pathname.startsWith('/profile/')) return false
  const parts = pathname.split('/')
  // /profile/username → 3 parti; /profile/me è protetto
  return parts.length >= 3 && parts[2] !== 'me' && parts[2] !== 'edit'
}

function matchesAny(pathname: string, list: string[]): boolean {
  return list.some(p => pathname === p || pathname.startsWith(p.endsWith('/') ? p : p + '/') || pathname.startsWith(p))
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function isAuthOnly(pathname: string): boolean {
  return AUTH_ONLY_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
}

function noCacheResponse(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')
  return res
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Assets e route sempre-permesse → pass-through immediato
  if (matchesAny(pathname, ALWAYS_ALLOW)) {
    return NextResponse.next()
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() { /* intentionally empty in middleware */ },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user
  const cookieDone = request.cookies.get('geekore_onboarding_done')?.value === '1'

  // 2. Non autenticato su route protetta → /login
  if (!isLoggedIn && isProtected(pathname)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 3. Autenticato su route auth-only → /home
  if (isLoggedIn && isAuthOnly(pathname)) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  // 4. Autenticato su / → /home
  if (isLoggedIn && pathname === '/') {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  // 5. Controllo onboarding
  if (isLoggedIn) {

    // 5a. Cookie presente → onboarding già fatto, nessuna query DB
    if (cookieDone) {
      if (pathname === '/onboarding') {
        return NextResponse.redirect(new URL('/home', request.url))
      }
      return NextResponse.next()
    }

    // 5b. Profilo pubblico (/profile/:username non-me) — esenzione rapida:
    //     non serve controllare l'onboarding per visitare il profilo di un altro.
    if (isPublicProfile(pathname)) {
      return NextResponse.next()
    }

    // 5c. Route esentate → pass-through senza query DB
    if (matchesAny(pathname, ONBOARDING_EXEMPT)) {
      return NextResponse.next()
    }

    // 5d. Cookie assente → query DB (solo per route che lo richiedono davvero)
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_done')
        .eq('id', user!.id)
        .single()

      const onboardingDone = profile?.onboarding_done === true

      if (onboardingDone) {
        if (pathname === '/onboarding') {
          const res = NextResponse.redirect(new URL('/home', request.url))
          res.cookies.set('geekore_onboarding_done', '1', {
            path: '/', maxAge: 60 * 60 * 24 * 365,
            sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: false,
          })
          return res
        }
        // Imposta cookie e lascia passare
        const res = noCacheResponse(NextResponse.next())
        res.cookies.set('geekore_onboarding_done', '1', {
          path: '/', maxAge: 60 * 60 * 24 * 365,
          sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: false,
        })
        return res
      } else {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }
    } catch {
      // Errore DB — fallback sicuro: rimanda all'onboarding
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  return noCacheResponse(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

const PROTECTED_PATHS = [
  '/home', '/discover', '/for-you', '/news', '/notifications',
  '/profile/me', '/settings', '/wishlist',
  '/lists', '/stats', '/trending', '/leaderboard', '/explore', '/community',
  '/search', '/profile',
]

const AUTH_ONLY_PATHS = ['/login', '/register', '/forgot-password']

const ALWAYS_ALLOW = [
  '/_next/', '/icons/', '/images/', '/sw.js', '/manifest.json',
  '/favicon.ico', '/privacy', '/terms', '/cookies', '/api/', '/auth/',
]

const ONBOARDING_EXEMPT = [
  '/onboarding', '/auth/', '/api/', '/profile/setup',
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

function noCacheResponse(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')
  return res
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Assets e route sempre-permesse → pass-through immediato
  if (matchesAny(pathname, ALWAYS_ALLOW)) {
    return NextResponse.next()
  }

  // Costruiamo i cookie per Supabase separatamente — NON usiamo setAll
  // per evitare che sovrascriva la response dopo che abbiamo già deciso il redirect
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() { /* intentionally empty in middleware — gestiamo i cookie nella response finale */ },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user
  const cookieDone = request.cookies.get('geekore_onboarding_done')?.value === '1'

  // 2. Non autenticato su route protetta → /login
  if (!isLoggedIn && isProtected(pathname)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 3. Autenticato su route auth-only → /feed
  if (isLoggedIn && isAuthOnly(pathname)) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  // 4. Autenticato su / → /feed
  if (isLoggedIn && pathname === '/') {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  // 5. Controllo onboarding
  if (isLoggedIn) {

    // 5a. Cookie presente → onboarding già fatto
    if (cookieDone) {
      // Blocca accesso a /onboarding
      if (pathname === '/onboarding') {
        return NextResponse.redirect(new URL('/home', request.url))
      }
      // Lascia passare tutto il resto
      return NextResponse.next()
    }

    // 5b. Cookie assente → query DB
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('onboarding_done')
        .eq('id', user!.id)
        .single()

      const onboardingDone = profile?.onboarding_done === true

      if (onboardingDone) {
        // Onboarding completato — imposta cookie e gestisci routing
        if (pathname === '/onboarding') {
          const res = NextResponse.redirect(new URL('/home', request.url))
          res.cookies.set('geekore_onboarding_done', '1', {
            path: '/', maxAge: 60 * 60 * 24 * 365,
            sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: false,
          })
          return res
        }
        // Qualsiasi altra pagina: lascia passare e imposta cookie
        const res = noCacheResponse(NextResponse.next())
        res.cookies.set('geekore_onboarding_done', '1', {
          path: '/', maxAge: 60 * 60 * 24 * 365,
          sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: false,
        })
        return res
      } else {
        // Onboarding NON completato
        if (matchesAny(pathname, ONBOARDING_EXEMPT)) {
          return NextResponse.next()
        }
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }
    } catch (err) {
      // Errore DB → se non è una path esente, blocca per sicurezza
      if (!matchesAny(pathname, ONBOARDING_EXEMPT)) {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }
      return NextResponse.next()
    }
  }

  return noCacheResponse(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}