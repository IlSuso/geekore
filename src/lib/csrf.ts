// src/lib/csrf.ts
// S1: CSRF protection per le API route che modificano dati sensibili.
//
// Strategia: "Double Submit Cookie" semplificata + Origin/Referer check.
// Next.js con Supabase Auth usa già httpOnly cookies per la sessione,
// quindi il vettore principale da coprire sono le mutation critiche:
//   - DELETE account
//   - PUT profilo
//   - POST avatar upload
//
// Come funziona:
//   1. Il client legge il CSRF token dal meta tag (generato lato server).
//   2. Lo invia nell'header `X-CSRF-Token` su ogni mutation critica.
//   3. Il server verifica che il token corrisponda E che l'Origin sia valido.
//
// Per le API route standard (like, comment, follow) è sufficiente il
// rate limit + auth check — il CSRF è critico solo per operazioni distruttive.

import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'

const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean) as string[]

function getCsrfSecret(): string | null {
  const secret = process.env.CSRF_SECRET
  if (!secret && process.env.NODE_ENV === 'production') return null
  return secret || 'geekore-csrf-secret-change-in-dev'
}

/**
 * Genera un CSRF token deterministico per la sessione utente.
 * Usa user ID + secret per rendere il token non falsificabile.
 */
export function generateCsrfToken(userId: string): string {
  const secret = getCsrfSecret()
  if (!secret) throw new Error('CSRF_SECRET non configurato')
  const data = `${userId}:${secret}:${new Date().toDateString()}`
  return createHash('sha256').update(data).digest('hex').slice(0, 32)
}

/**
 * Verifica Origin/Referer header per bloccare cross-origin requests.
 * Sufficiente per la maggior parte dei casi CSRF in un'app SPA/Next.js.
 */
export function checkOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const host = request.headers.get('host')

  // Se non c'è né origin né referer (richiesta diretta) — permetti in sviluppo
  if (!origin && !referer) {
    return process.env.NODE_ENV === 'development'
  }

  // Controlla che l'origin sia nella whitelist
  if (origin) {
    if (ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o))) {
      return true
    }
    // Controlla same-origin tramite host
    if (host && (origin === `https://${host}` || origin === `http://${host}`)) {
      return true
    }
    return false
  }

  // Fallback: controlla il referer
  if (referer) {
    return ALLOWED_ORIGINS.some(o => referer.startsWith(o)) ||
      (host ? referer.includes(host) : false)
  }

  return false
}

export function rejectBadOrigin() {
  return NextResponse.json({ error: 'Origin non consentito' }, { status: 403 })
}

/**
 * Verifica completa CSRF: origin + token header.
 * Usare su DELETE e PUT critici.
 *
 * @returns { ok: boolean, reason?: string }
 */
export function verifyCsrf(
  request: NextRequest,
  userId: string
): { ok: boolean; reason?: string } {
  // Step 1: Origin check
  if (!checkOrigin(request)) {
    return { ok: false, reason: 'Origin non consentito' }
  }

  // Step 2: Token check (opzionale in dev per non bloccare il workflow)
  if (process.env.NODE_ENV === 'production') {
    if (!getCsrfSecret()) {
      return { ok: false, reason: 'CSRF non configurato' }
    }
    const token = request.headers.get('x-csrf-token')
    if (!token) {
      return { ok: false, reason: 'CSRF token mancante' }
    }
    const expected = generateCsrfToken(userId)
    if (token !== expected) {
      return { ok: false, reason: 'CSRF token non valido' }
    }
  }

  return { ok: true }
}
