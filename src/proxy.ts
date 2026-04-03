import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * In Next.js 16.2+, se il file si chiama proxy.ts, 
 * la funzione esportata deve chiamarsi "proxy".
 */
export async function proxy(request: NextRequest) {
  // 1. Prepariamo la risposta base
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // 2. Inizializziamo il client Supabase con gestione Cookie SSR
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Aggiorna i cookie nella richiesta
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          
          // Crea una nuova risposta per riflettere i cambiamenti dei cookie
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          
          // Imposta i cookie nella risposta finale per il browser
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // 3. Recuperiamo l'utente attuale dalla sessione
  const { data: { user } } = await supabase.auth.getUser()

  // 4. Definiamo i percorsi
  const isAuthPage = request.nextUrl.pathname.startsWith('/auth')
  const isProtectedRoute = 
    request.nextUrl.pathname === '/' || 
    request.nextUrl.pathname.startsWith('/dashboard') ||
    request.nextUrl.pathname.startsWith('/explore') ||
    request.nextUrl.pathname.startsWith('/profile')

  // LOGICA DEI REINDIRIZZAMENTI:
  
  // A. Se l'utente NON è loggato e cerca di entrare in zone private -> Vai al Login
  if (!user && isProtectedRoute) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // B. Se l'utente È loggato e prova ad andare alle pagine di Auth (Login/Signup) -> Vai alla Home
  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Se tutto è in regola, prosegui normalmente
  return response
}

// Configurazione del Matcher: esclude file statici, immagini e icone
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
