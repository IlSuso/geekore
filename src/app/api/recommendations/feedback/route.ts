// DESTINAZIONE: src/app/api/recommendations/feedback/route.ts
// Registra il feedback dell'utente sui consigli (aggiunto / non interessa / già visto)
// e aggiorna le soft-preferences in user_preferences per il feedback loop.
// V5: feedback granulare con reason (not_genre, not_format, bad_quality, already_seen)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { checkOrigin } from '@/lib/csrf'

const VALID_ACTIONS = ['added', 'dismissed', 'not_interested', 'already_seen'] as const
const VALID_REASONS = ['not_genre', 'not_format', 'bad_quality', 'already_seen', 'not_my_genre', 'too_similar', 'already_know', 'bad_rec', null] as const
const MEDIA_TYPES = new Set(['anime', 'manga', 'game', 'movie', 'tv', 'book', 'boardgame', 'board_game', 'all'])
type FeedbackReason = typeof VALID_REASONS[number]

function cleanString(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function cleanGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 30)
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'rec-feedback' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const rec_id = cleanString(body?.rec_id, 200)
  const rec_type = cleanString(body?.rec_type || 'unknown', 50) || 'unknown'
  const action = body?.action
  const reason = body?.reason

  if (!rec_id || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Parametri non validi' }, { status: 400, headers: rl.headers })
  }
  if (!MEDIA_TYPES.has(rec_type)) {
    return NextResponse.json({ error: 'rec_type non valido' }, { status: 400, headers: rl.headers })
  }

  const genres = cleanGenres(body?.rec_genres)
  const feedbackReason: FeedbackReason = VALID_REASONS.includes(reason) ? reason : null

  // Salva feedback con reason granulare
  const { error: feedbackError } = await supabase.from('recommendation_feedback').insert({
    user_id: user.id,
    rec_id,
    rec_type,
    rec_genres: genres,
    action,
    reason: feedbackReason,
  })
  if (feedbackError) {
    return NextResponse.json({ error: 'Feedback non salvato' }, { status: 500, headers: rl.headers })
  }

  // V5: aggiorna recommendations_shown con l'azione (per anti-ripetizione)
  const { error: shownError } = await supabase.from('recommendations_shown').upsert({
    user_id: user.id,
    rec_id,
    rec_type,
    shown_at: new Date().toISOString(),
    action,
  }, { onConflict: 'user_id,rec_id' })
  if (shownError) {
    return NextResponse.json({ error: 'Feedback non aggiornato' }, { status: 500, headers: rl.headers })
  }

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

    const { error: preferencesError } = await supabase.from('user_preferences').upsert({
      user_id: user.id,
      genre_feedback_counts: counts,
      soft_disliked_genres: newSoftDisliked,
      format_feedback_counts: formatCounts,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (preferencesError) {
      return NextResponse.json({ error: 'Preferenze non aggiornate' }, { status: 500, headers: rl.headers })
    }
  }

  // Invalida cache raccomandazioni
  const cacheQuery = supabase
    .from('recommendations_cache')
    .delete()
    .eq('user_id', user.id)

  const { error: cacheError } = rec_type === 'all'
    ? await cacheQuery
    : await cacheQuery.eq('media_type', rec_type)

  if (cacheError) {
    return NextResponse.json({ error: 'Cache non invalidata' }, { status: 500, headers: rl.headers })
  }

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
