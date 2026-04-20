// DESTINAZIONE: src/middleware.ts  (nella root di src/, affianco ad app/)
//
// Protezione route:
//   1. Utente NON loggato → tutte le pagine protette → redirect /login
//   2. Utente loggato, onboarding NON completato → qualsiasi pagina protetta → redirect /onboarding
//   3. Utente loggato, onboarding completato → accesso libero
//
// Le route pubbliche (login, register, auth/*, onboarding, landing) non sono protette.
//
// NOTA: Il middleware Supabase legge il JWT dai cookie per verificare la sessione
// in modo edge-compatible (senza query al DB). Il campo onboarding_done è invece
// un cookie separato che viene impostato dal client alla fine dell'onboarding.
// In alternativa si usa il custom claim nel JWT (app_metadata).
// Qui usiamo il cookie 'geekore_onboarding_done' impostato da OnboardingPage
// al momento del completamento — soluzione semplice e sicura.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Route pubbliche — non richiedono autenticazione
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/auth/',
  '/forgot-password',
  '/onboarding',
  '/privacy',
  '/terms',
  '/_next',
  '/api/auth',
  '/favicon',
  '/icons',
  '/manifest',
]

// Route che richiedono autenticazione MA non onboarding completato
// (es. /onboarding stessa — già nella lista pubblica)
const SKIP_ONBOARDING_CHECK = [
  '/onboarding',
  '/api/',
  '/auth/',
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p)) || pathname === '/'
}

function skipOnboardingCheck(pathname: string): boolean {
  return SKIP_ONBOARDING_CHECK.some(p => pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Lascia passare route pubbliche e asset statici
  if (isPublic(pathname)) {
    return NextResponse.next()
  }

  // Crea il client Supabase edge-compatible (legge solo i cookie, non fa query DB)
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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verifica sessione (dal JWT nei cookie — nessuna query DB)
  const { data: { user } } = await supabase.auth.getUser()

  // Utente non loggato → redirect al login
  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Utente loggato — controlla onboarding se necessario
  if (!skipOnboardingCheck(pathname)) {
    // Legge il cookie onboarding_done impostato dal client
    const onboardingDone = request.cookies.get('geekore_onboarding_done')?.value === '1'

    if (!onboardingDone) {
      // Fallback: se il cookie non c'è, facciamo una query leggera al DB
      // solo se siamo su una route non-API per non rallentare le API calls
      if (!pathname.startsWith('/api/')) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_done')
          .eq('id', user.id)
          .single()

        if (!profile?.onboarding_done) {
          const onboardingUrl = request.nextUrl.clone()
          onboardingUrl.pathname = '/onboarding'
          return NextResponse.redirect(onboardingUrl)
        }

        // Onboarding completato ma cookie mancante: impostalo
        response.cookies.set('geekore_onboarding_done', '1', {
          path: '/',
          maxAge: 60 * 60 * 24 * 365, // 1 anno
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        })
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Esegui il middleware su tutte le route TRANNE:
     * - _next/static (file statici)
     * - _next/image (ottimizzazione immagini)
     * - favicon.ico, png, jpg, svg, webp, woff, woff2
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|mp4|txt|xml|json)).*)',
  ],
}