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

const ONBOARDING_EXEMPT = [
  '/onboarding', '/auth/', '/api/', '/profile/setup',
]

function isPublicProfile(pathname: string): boolean {
  if (!pathname.startsWith('/profile/')) return false
  const parts = pathname.split('/')
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

  if (matchesAny(pathname, ALWAYS_ALLOW)) {
    return NextResponse.next()
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const isLoggedIn = !!user
  const cookieDone = request.cookies.get('geekore_onboarding_done')?.value === '1'

  if (!isLoggedIn && isProtected(pathname)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isLoggedIn && isAuthOnly(pathname)) {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  if (isLoggedIn && pathname === '/') {
    return NextResponse.redirect(new URL('/home', request.url))
  }

  if (isLoggedIn) {

    if (cookieDone) {
      if (pathname === '/onboarding') {
        return NextResponse.redirect(new URL('/home', request.url))
      }
      return NextResponse.next()
    }

    if (isPublicProfile(pathname)) {
      return NextResponse.next()
    }

    if (matchesAny(pathname, ONBOARDING_EXEMPT)) {
      return NextResponse.next()
    }

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
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  return noCacheResponse(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}