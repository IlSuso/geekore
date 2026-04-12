// DESTINAZIONE: src/app/api/taste/update/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// V3: Real-time Profile Delta Update
// Aggiornamento incrementale del profilo gusti ad ogni azione dell'utente.
// NON ricalcola tutto — applica solo il delta.
//
// POST /api/taste/update
// Body: { action: 'rating' | 'status' | 'wishlist' | 'rewatch', mediaId, genres, rating?, status?, type }
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

type DeltaAction = 'rating' | 'status_change' | 'wishlist_add' | 'rewatch' | 'progress'

interface ProfileDelta {
  action: DeltaAction
  mediaId: string
  mediaType: string
  genres: string[]
  rating?: number
  prevRating?: number
  status?: string
  prevStatus?: string
  rewatchCount?: number
}

function sentimentDelta(newRating: number, prevRating?: number): number {
  const sentimentOf = (r: number) => {
    if (r >= 4.5) return 2.8
    if (r >= 4.0) return 2.0
    if (r >= 3.5) return 1.5
    if (r >= 3.0) return 1.0
    if (r >= 2.0) return 0.25
    if (r >= 1.0) return 0.0
    return 1.0
  }
  const newSentiment = sentimentOf(newRating)
  const prevSentiment = prevRating ? sentimentOf(prevRating) : 1.0
  return newSentiment - prevSentiment
}

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 120, windowMs: 60_000, prefix: 'taste-delta' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  let body: ProfileDelta
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const { action, genres, mediaType, rating, prevRating, status, prevStatus, rewatchCount } = body
  if (!action || !genres || !Array.isArray(genres)) {
    return NextResponse.json({ ok: false })
  }

  // Leggi profilo corrente
  const { data: existing } = await supabase
    .from('user_taste_profile')
    .select('genre_scores, creator_scores, deep_signals, negative_genres, entry_count')
    .eq('user_id', user.id)
    .single()

  const genreScores: Record<string, number> = (existing?.genre_scores as any) || {}
  const negativeGenres: Record<string, number> = (existing?.negative_genres as any) || {}
  const entryCount = (existing?.entry_count || 0)

  // Calcola delta in base all'azione
  let delta = 0
  let isNegativeDelta = false

  switch (action) {
    case 'rating': {
      if (rating !== undefined) {
        const diff = sentimentDelta(rating, prevRating)
        delta = diff * 5 // peso fisso per aggiornamento incrementale
        if (rating <= 2) isNegativeDelta = true
      }
      break
    }
    case 'status_change': {
      if (status === 'completed') delta = 8
      else if (status === 'dropped') { delta = -5; isNegativeDelta = true }
      else if (status === 'watching') delta = 3
      else if (prevStatus === 'watching' && status === 'paused') delta = -1
      break
    }
    case 'wishlist_add': {
      // Wishlist: peso fisso 12, no decay
      delta = 12
      break
    }
    case 'rewatch': {
      // Rewatch è un segnale fortissimo
      const rc = rewatchCount || 1
      delta = rc >= 2 ? 25 : 15
      break
    }
    case 'progress': {
      // Piccolo boost per aggiornamento progresso
      delta = 1
      break
    }
  }

  if (Math.abs(delta) < 0.5) return NextResponse.json({ ok: true, noChange: true })

  // Applica il delta ai generi
  for (const genre of genres) {
    if (isNegativeDelta) {
      negativeGenres[genre] = (negativeGenres[genre] || 0) + Math.abs(delta)
      genreScores[genre] = Math.max(0, (genreScores[genre] || 0) - Math.abs(delta) * 0.6)
    } else {
      genreScores[genre] = (genreScores[genre] || 0) + delta
    }
  }

  // Scrivi profilo aggiornato
  await supabase.from('user_taste_profile').upsert({
    user_id: user.id,
    genre_scores: genreScores,
    negative_genres: negativeGenres,
    computed_at: new Date().toISOString(),
    entry_count: action === 'status_change' && status === 'completed' ? entryCount + 1 : entryCount,
  }, { onConflict: 'user_id' })

  // Invalida cache del tipo coinvolto (non tutta)
  if (mediaType) {
    await supabase
      .from('recommendations_cache')
      .delete()
      .eq('user_id', user.id)
      .eq('media_type', mediaType)
  }

  return NextResponse.json({ ok: true, delta }, { headers: rl.headers })
}