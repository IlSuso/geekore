// src/app/api/profile/update/route.ts
// Route server-side per aggiornare il profilo con validazione robusta.
// Il frontend attuale usa Supabase direttamente dal client — questa route
// aggiunge un layer di validazione e sanitizzazione server-side.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

const USERNAME_MIN = 3
const USERNAME_MAX = 30
const BIO_MAX = 500
const DISPLAY_NAME_MAX = 50
const USERNAME_REGEX = /^[a-z0-9_]+$/

function validateUsername(value: unknown): string | null {
  if (typeof value !== 'string') return 'Username non valido'
  const v = value.trim()
  if (v.length < USERNAME_MIN) return `Username troppo corto (minimo ${USERNAME_MIN} caratteri)`
  if (v.length > USERNAME_MAX) return `Username troppo lungo (massimo ${USERNAME_MAX} caratteri)`
  if (!USERNAME_REGEX.test(v)) return 'Solo lettere minuscole, numeri e underscore'
  // Blocca username riservati
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
  // Rate limiting: 5 aggiornamenti/min per IP
  const rl = rateLimit(request, { limit: 5, windowMs: 60_000, prefix: 'profile-update' })
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
      return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
    }

    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Body non valido' }, { status: 400 })
    }

    const { username, display_name, bio } = body

    // Validazione
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
      return NextResponse.json({ error: 'Dati non validi', errors }, { status: 422 })
    }

    // Sanitizzazione
    const updateData: Record<string, string> = {
      updated_at: new Date().toISOString(),
    }

    if (username !== undefined) {
      updateData.username = (username as string).trim().toLowerCase()
    }
    if (display_name !== undefined) {
      // Rimuove tag HTML e tronca
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

    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)

    if (error) {
      // Constraint violation username duplicato
      if (error.code === '23505' || error.message?.includes('profiles_username')) {
        return NextResponse.json(
          { error: 'Username già in uso', errors: { username: 'Username già in uso' } },
          { status: 409 }
        )
      }
      // Constraint check (lunghezza, regex)
      if (error.code === '23514') {
        return NextResponse.json(
          { error: 'Dati non validi per il database', errors: {} },
          { status: 422 }
        )
      }
      throw error
    }

    return NextResponse.json(
      { success: true, updated: Object.keys(updateData).filter(k => k !== 'updated_at') },
      { headers: rl.headers }
    )
  } catch (err) {
    console.error('[Profile Update]', err)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}