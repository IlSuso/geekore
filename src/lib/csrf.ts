// src/lib/csrf.ts
// S1: CSRF protection per le API route che modificano dati sensibili.
//
// Strategia: Origin/Referer check per le mutation standard e token CSRF
// HMAC per le operazioni piu distruttive.
//
// Per produzione configurare obbligatoriamente CSRF_SECRET con un valore lungo
// e casuale. In sviluppo resta un fallback locale per non bloccare il workflow.

import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

const MIN_PROD_SECRET_LENGTH = 32

const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean).map(value => {
  try {
    return new URL(value as string).origin
  } catch {
    return value
  }
}) as string[]

function getCsrfSecret(): string | null {
  const secret = process.env.CSRF_SECRET

  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < MIN_PROD_SECRET_LENGTH) return null
    return secret
  }

  return secret || 'geekore-csrf-secret-change-in-dev'
}

/**
 * Genera un CSRF token deterministico giornaliero per la sessione utente.
 * Usa HMAC(userId + giorno, CSRF_SECRET) per evitare token falsificabili.
 */
export function generateCsrfToken(userId: string): string {
  const secret = getCsrfSecret()
  if (!secret) throw new Error('CSRF_SECRET non configurato o troppo debole')

  const day = new Date().toISOString().slice(0, 10)
  return createHmac('sha256', secret)
    .update(`${userId}:${day}`)
    .digest('hex')
    .slice(0, 32)
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
    const originValue = safeOrigin(origin)
    if (originValue && ALLOWED_ORIGINS.includes(originValue)) {
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
    const refererOrigin = safeOrigin(referer)
    return Boolean(
      refererOrigin && (
        ALLOWED_ORIGINS.includes(refererOrigin) ||
        (host && (refererOrigin === `https://${host}` || refererOrigin === `http://${host}`))
      )
    )
  }

  return false
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
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
      return { ok: false, reason: 'CSRF non configurato o troppo debole' }
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
