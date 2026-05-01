// DESTINAZIONE: src/app/api/recommendations/feedback/route.ts
// Registra il feedback dell'utente sui consigli (aggiunto / non interessa / già visto)
// e aggiorna le soft-preferences in user_preferences per il feedback loop.
// V5: feedback granulare con reason (not_genre, not_format, bad_quality, already_seen)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { checkOrigin } from '@/lib/csrf'

const VALID_ACTIONS = ['added', 'dismissed', 'not_interested', 'already_seen'] as const
const VALID_REASONS = ['not_genre', 'not_format', 'bad_quality', 'already_seen', 'not_my_genre', 'too_similar', 'already_know', 'bad_rec', null] as const
type FeedbackAction = typeof VALID_ACTIONS[number]
type FeedbackReason = typeof VALID_REASONS[number]

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000, prefix: 'rec-feedback' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const { rec_id, rec_type, rec_genres, action, reason } = body
  if (!rec_id || !action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Parametri non validi' }, { status: 400 })
  }

  const genres: string[] = Array.isArray(rec_genres) ? rec_genres : []
  const feedbackReason: FeedbackReason = VALID_REASONS.includes(reason) ? reason : null

  // Salva feedback con reason granulare
  await supabase.from('recommendation_feedback').insert({
    user_id: user.id,
    rec_id,
    rec_type: rec_type || 'unknown',
    rec_genres: genres,
    action,
    reason: feedbackReason,
  })

  // V5: aggiorna recommendations_shown con l'azione (per anti-ripetizione)
  await supabase.from('recommendations_shown').upsert({
    user_id: user.id,
    rec_id,
    rec_type: rec_type || 'unknown',
    shown_at: new Date().toISOString(),
    action,
  }, { onConflict: 'user_id,rec_id' })

  // Aggiorna soft-preferences in base alla reason
  if (action === 'not_interested' || action === 'dismissed') {
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('genre_feedback_counts, soft_disliked_genres, format_feedback_counts')
      .eq('user_id', user.id)
      .single()

    const counts: Record<string, number> = (existing?.genre_feedback_counts as any) || {}
    const softDisliked: string[] = existing?.soft_disliked_genres || []
    const formatCounts: Record<string, number> = (existing?.format_feedback_counts as any) || {}

    // "Non mi piace il genere" → penalizza i generi del titolo
    if (feedbackReason === 'not_genre' || feedbackReason === 'not_my_genre' || feedbackReason === null) {
      for (const genre of genres) {
        counts[genre] = (counts[genre] || 0) + (action === 'not_interested' ? 2 : 1)
      }
    }

    // "Non mi interessa il formato" → penalizza il tipo (movie, anime, ecc.)
    if (feedbackReason === 'not_format' && rec_type) {
      formatCounts[rec_type] = (formatCounts[rec_type] || 0) + 2
    }

    // "Brutto/mi aspettavo di meglio" → penalizza il genere ma meno
    if (feedbackReason === 'bad_quality' || feedbackReason === 'bad_rec' || feedbackReason === 'too_similar') {
      for (const genre of genres) {
        counts[genre] = (counts[genre] || 0) + 1
      }
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
      format_feedback_counts: formatCounts,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  // "L'ho già visto" → aggiunge solo a seen senza penalizzare il genere
  if (action === 'already_seen' || feedbackReason === 'already_seen') {
    // Non tocca genre_feedback_counts — solo marca come visto
    // Il rec_id è già in recommendations_shown con action=already_seen
  }

  // Invalida cache raccomandazioni
  await supabase
    .from('recommendations_cache')
    .delete()
    .eq('user_id', user.id)
    .eq('media_type', rec_type || 'anime')

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
