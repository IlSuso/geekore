import { logger } from '@/lib/logger'
// src/app/api/profile/update/route.ts
// Route server-side per aggiornare il profilo con validazione robusta.
// ── Aggiornamenti ────────────────────────────────────────────────────────────
//   • S6: Blocco unicode look-alike (caratteri cirillici, greci ecc.)
//   • S1: CSRF check via Origin header

import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { createClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { verifyCsrf } from '@/lib/csrf'

const USERNAME_MIN = 3
const USERNAME_MAX = 30
const BIO_MAX = 500
const DISPLAY_NAME_MAX = 50
const USERNAME_REGEX = /^[a-z0-9_]+$/

function hasUnicodeLookalike(value: string): boolean {
  const normalized = value.normalize('NFKD')
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.codePointAt(i) ?? 0
    if (!(code >= 97 && code <= 122) && !(code >= 48 && code <= 57) && code !== 95) {
      return true
    }
  }
  return false
}

function validateUsername(value: unknown): string | null {
  if (typeof value !== 'string') return 'Username non valido'
  const v = value.trim()
  if (v.length < USERNAME_MIN) return `Username troppo corto (minimo ${USERNAME_MIN} caratteri)`
  if (v.length > USERNAME_MAX) return `Username troppo lungo (massimo ${USERNAME_MAX} caratteri)`
  if (!USERNAME_REGEX.test(v)) return 'Solo lettere minuscole, numeri e underscore'
  if (hasUnicodeLookalike(v)) return 'Username contiene caratteri non consentiti'
  const reserved = ['admin', 'geekore', 'support', 'api', 'me', 'root', 'null', 'undefined']
  if (reserved.includes(v)) return 'Username non disponibile'
  return null
}

function validateBio(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return 'Bio non valida'
  if (value.length > BIO_MAX) return `Bio troppo lunga (massimo ${BIO_MAX} caratteri)`
  return null
}

function validateDisplayName(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return 'Nome non valido'
  if (value.trim().length > DISPLAY_NAME_MAX) return `Nome troppo lungo (massimo ${DISPLAY_NAME_MAX} caratteri)`
  return null
}

export async function PATCH(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 5, windowMs: 60_000, prefix: 'profile-update' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Troppe modifiche. Attendi un momento.' },
      { status: 429, headers: rl.headers }
    )
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })
    }

    const csrf = verifyCsrf(request, user.id)
    if (!csrf.ok) {
      return NextResponse.json({ error: csrf.reason || 'Richiesta non autorizzata' }, { status: 403, headers: rl.headers })
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: apiMessage(request, 'invalidBody') }, { status: 400, headers: rl.headers })
    }

    const { username, display_name, bio, avatar_url } = body
    const errors: Record<string, string> = {}

    if (username !== undefined) {
      const err = validateUsername(username)
      if (err) errors.username = err
    }

    if (display_name !== undefined) {
      const err = validateDisplayName(display_name)
      if (err) errors.display_name = err
    }

    if (bio !== undefined) {
      const err = validateBio(bio)
      if (err) errors.bio = err
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json({ error: 'Dati non validi', errors }, { status: 422, headers: rl.headers })
    }

    const updateData: Record<string, string | null> = {
      updated_at: new Date().toISOString(),
    }

    if (username !== undefined) {
      updateData.username = (username as string).trim().toLowerCase()
    }
    if (display_name !== undefined) {
      updateData.display_name = (display_name as string)
        .trim()
        .replace(/<[^>]*>/g, '')
        .slice(0, DISPLAY_NAME_MAX)
    }
    if (bio !== undefined) {
      updateData.bio = (bio as string)
        .trim()
        .replace(/<[^>]*>/g, '')
        .slice(0, BIO_MAX)
    }
    if (avatar_url !== undefined) {
      updateData.avatar_url = typeof avatar_url === 'string' ? avatar_url.slice(0, 1000) : null
    }

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)

    if (error) {
      if (error.code === '23505' || error.message?.includes('profiles_username')) {
        return NextResponse.json(
          { error: 'Username già in uso', errors: { username: 'Username già in uso' } },
          { status: 409, headers: rl.headers }
        )
      }
      if (error.code === '23514') {
        return NextResponse.json(
          { error: 'Dati non validi per il database', errors: {} },
          { status: 422, headers: rl.headers }
        )
      }
      throw error
    }

    return NextResponse.json(
      { success: true, updated: Object.keys(updateData).filter(k => k !== 'updated_at') },
      { headers: rl.headers }
    )
  } catch (err) {
    logger.error('[Profile Update]', err)
    return NextResponse.json({ error: apiMessage(request, 'internalError') }, { status: 500, headers: rl.headers })
  }
}
