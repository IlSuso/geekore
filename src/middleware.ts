// src/middleware.ts

import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const PROTECTED_PATHS = [
  '/feed', '/discover', '/for-you', '/news', '/notifications',
  '/profile/edit', '/profile/me', '/settings', '/wishlist',
  '/lists', '/stats', '/trending', '/leaderboard', '/explore',
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

  console.log(`[MW] ${pathname} | loggedIn=${isLoggedIn} | user=${user?.id ?? 'none'} | cookieDone=${cookieDone}`)

  // 2. Non autenticato su route protetta → /login
  if (!isLoggedIn && isProtected(pathname)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 3. Autenticato su route auth-only → /feed
  if (isLoggedIn && isAuthOnly(pathname)) {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  // 4. Autenticato su / → /feed
  if (isLoggedIn && pathname === '/') {
    return NextResponse.redirect(new URL('/feed', request.url))
  }

  // 5. Controllo onboarding
  if (isLoggedIn) {

    // 5a. Cookie presente → onboarding già fatto
    if (cookieDone) {
      console.log('[MW] 5a: cookie presente → onboarding fatto')
      // Blocca accesso a /onboarding
      if (pathname === '/onboarding') {
        console.log('[MW] 5a: redirect /feed (onboarding già fatto)')
        return NextResponse.redirect(new URL('/feed', request.url))
      }
      // Lascia passare tutto il resto
      return NextResponse.next()
    }

    // 5b. Cookie assente → query DB
    console.log(`[MW] 5b: cookie assente, query DB per user=${user!.id}`)
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('onboarding_done')
        .eq('id', user!.id)
        .single()

      console.log(`[MW] 5b: DB → onboarding_done=${profile?.onboarding_done} error=${error?.message ?? 'null'}`)

      const onboardingDone = profile?.onboarding_done === true

      if (onboardingDone) {
        // Onboarding completato — imposta cookie e gestisci routing
        console.log('[MW] 5b: onboarding completato')
        if (pathname === '/onboarding') {
          console.log('[MW] 5b: redirect /feed + set cookie')
          const res = NextResponse.redirect(new URL('/feed', request.url))
          res.cookies.set('geekore_onboarding_done', '1', {
            path: '/', maxAge: 60 * 60 * 24 * 365,
            sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: false,
          })
          return res
        }
        // Qualsiasi altra pagina: lascia passare e imposta cookie
        const res = NextResponse.next()
        res.cookies.set('geekore_onboarding_done', '1', {
          path: '/', maxAge: 60 * 60 * 24 * 365,
          sameSite: 'lax', secure: process.env.NODE_ENV === 'production', httpOnly: false,
        })
        return res
      } else {
        // Onboarding NON completato
        if (matchesAny(pathname, ONBOARDING_EXEMPT)) {
          console.log('[MW] 5b: onboarding non fatto ma path esente, lascio passare')
          return NextResponse.next()
        }
        console.log('[MW] 5b: redirect /onboarding')
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }
    } catch (err) {
      console.error('[MW] 5b: errore DB:', err)
      // Errore DB → se non è una path esente, blocca per sicurezza
      if (!matchesAny(pathname, ONBOARDING_EXEMPT)) {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }
      return NextResponse.next()
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}