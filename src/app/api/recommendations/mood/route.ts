// DESTINAZIONE: src/app/api/recommendations/mood/route.ts
// Salva il mood dell'utente come cookie (4 ore TTL) e aggiorna user_preferences.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimit } from '@/lib/rateLimit'

const VALID_MOODS = ['light', 'intense', 'deep', null] as const
type Mood = typeof VALID_MOODS[number]

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'recommendations:mood' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const mood: Mood = body.mood ?? null
  if (!VALID_MOODS.includes(mood)) {
    return NextResponse.json({ error: 'Mood non valido' }, { status: 400 })
  }

  const expiresAt = mood ? new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() : null

  // Salva in user_preferences (persistenza leggera)
  await supabase.from('user_preferences').upsert({
    user_id: user.id,
    last_mood: mood,
    mood_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  // Risposta con cookie per accesso rapido lato server (TTL 4 ore)
  const res = NextResponse.json({ success: true, mood, expiresAt })
  if (mood) {
    res.cookies.set('geekore_mood', mood, {
      httpOnly: false, // accessibile lato client per leggere senza API
      sameSite: 'lax',
      maxAge: 4 * 60 * 60,
      path: '/',
    })
  } else {
    res.cookies.delete('geekore_mood')
  }

  return res
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ mood: null })

  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('last_mood, mood_expires_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!prefs?.last_mood) return NextResponse.json({ mood: null })

  // Controlla scadenza
  if (prefs.mood_expires_at && new Date(prefs.mood_expires_at) < new Date()) {
    return NextResponse.json({ mood: null })
  }

  return NextResponse.json({ mood: prefs.last_mood, expiresAt: prefs.mood_expires_at })
}
