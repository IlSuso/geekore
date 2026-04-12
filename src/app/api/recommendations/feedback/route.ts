// DESTINAZIONE: src/app/api/recommendations/feedback/route.ts
// Registra il feedback dell'utente sui consigli (aggiunto / non interessa / già visto)
// e aggiorna le soft-preferences in user_preferences per il feedback loop.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

const VALID_ACTIONS = ['added', 'dismissed', 'not_interested', 'already_seen'] as const
type FeedbackAction = typeof VALID_ACTIONS[number]

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000, prefix: 'rec-feedback' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const { rec_id, rec_type, rec_genres, action } = body
  if (!rec_id || !action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 })
  }

  const genres: string[] = Array.isArray(rec_genres) ? rec_genres : []

  // Salva feedback
  await supabase.from('recommendation_feedback').insert({
    user_id: user.id,
    rec_id,
    rec_type: rec_type || 'unknown',
    rec_genres: genres,
    action,
  })

  // Aggiorna soft-preferences solo per azioni significative
  if (action === 'not_interested' || action === 'dismissed') {
    // Conta quante volte ha detto not_interested su questo genere
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('genre_feedback_counts, soft_disliked_genres')
      .eq('user_id', user.id)
      .single()

    const counts: Record<string, number> = (existing?.genre_feedback_counts as any) || {}
    const softDisliked: string[] = existing?.soft_disliked_genres || []

    for (const genre of genres) {
      counts[genre] = (counts[genre] || 0) + (action === 'not_interested' ? 2 : 1)
    }

    // Dopo 5 segnali negativi su un genere → soft dislike
    const newSoftDisliked = [...new Set([
      ...softDisliked,
      ...Object.entries(counts)
        .filter(([, v]) => v >= 5)
        .map(([k]) => k),
    ])]

    await supabase.from('user_preferences').upsert({
      user_id: user.id,
      genre_feedback_counts: counts,
      soft_disliked_genres: newSoftDisliked,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  // Invalida cache raccomandazioni
  await supabase
    .from('recommendations_cache')
    .delete()
    .eq('user_id', user.id)
    .eq('media_type', rec_type || 'anime')

  return NextResponse.json({ success: true }, { headers: rl.headers })
}