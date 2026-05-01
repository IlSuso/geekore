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
import { checkOrigin } from '@/lib/csrf'

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

const DELTA_ACTIONS = new Set<DeltaAction>(['rating', 'status_change', 'wishlist_add', 'rewatch', 'progress'])
const MEDIA_TYPES = new Set(['anime', 'manga', 'game', 'movie', 'tv', 'book', 'boardgame'])
const STATUSES = new Set(['completed', 'dropped', 'watching', 'paused', 'planned'])

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().slice(0, max)
  return clean || null
}

function cleanNumber(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) return undefined
  return n
}

function cleanGenres(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const genres = value
    .map(item => cleanString(item, 80))
    .filter((item): item is string => Boolean(item))
    .slice(0, 25)
  return genres.length > 0 ? genres : null
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
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401, headers: rl.headers })

  let rawBody: any
  try { rawBody = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const cleanAction = cleanString(rawBody?.action, 40) as DeltaAction | null
  const genres = cleanGenres(rawBody?.genres)
  const mediaType = cleanString(rawBody?.mediaType, 40)
  if (!cleanAction || !DELTA_ACTIONS.has(cleanAction) || !genres || !mediaType || !MEDIA_TYPES.has(mediaType)) {
    return NextResponse.json({ ok: false, error: 'Payload non valido' }, { status: 400, headers: rl.headers })
  }

  const body: ProfileDelta = {
    action: cleanAction,
    mediaId: cleanString(rawBody?.mediaId, 200) || '',
    mediaType,
    genres,
    rating: cleanNumber(rawBody?.rating, 0, 5),
    prevRating: cleanNumber(rawBody?.prevRating, 0, 5),
    status: cleanString(rawBody?.status, 40) || undefined,
    prevStatus: cleanString(rawBody?.prevStatus, 40) || undefined,
    rewatchCount: cleanNumber(rawBody?.rewatchCount, 1, 100),
  }

  const { action, rating, prevRating, status, prevStatus, rewatchCount } = body
  if (status && !STATUSES.has(status)) return NextResponse.json({ ok: false, error: 'Status non valido' }, { status: 400, headers: rl.headers })
  if (prevStatus && !STATUSES.has(prevStatus)) return NextResponse.json({ ok: false, error: 'Status precedente non valido' }, { status: 400, headers: rl.headers })

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

  if (Math.abs(delta) < 0.5) return NextResponse.json({ ok: true, noChange: true }, { headers: rl.headers })

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

  // Invalida recommendations_cache per il tipo coinvolto (sempre)
  // recommendations_pool viene invalidato solo per azioni di consumo forte (non wishlist)
  if (mediaType) {
    const poolInvalidatingActions: DeltaAction[] = ['status_change', 'rewatch']
    const invalidations: any[] = [
      supabase
        .from('recommendations_cache')
        .delete()
        .eq('user_id', user.id)
        .eq('media_type', mediaType),
    ]
    if (poolInvalidatingActions.includes(action)) {
      invalidations.push(
        supabase
          .from('recommendations_pool')
          .delete()
          .eq('user_id', user.id)
          .eq('media_type', mediaType),
      )
    }
    await Promise.all(invalidations)
  }

  // Invalida anche per azioni che toccano il profilo in modo cross-type
  // (rating alto o dropped → possono cambiare i generi dominanti globali)
  if (action === 'rating' && delta && Math.abs(delta) >= 8) {
    // Rating molto impattante → svuota tutto il pool per forzare rigenerazione completa
    await supabase
      .from('recommendations_pool')
      .delete()
      .eq('user_id', user.id)
  }

  // Fix 3.1: snapshot settimanale del profilo in user_taste_history
  // Solo se il delta è significativo (non per ogni piccola modifica)
  if (Math.abs(delta) >= 5) {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: lastSnapshot } = await supabase
      .from('user_taste_history')
      .select('created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const shouldSnapshot = !lastSnapshot || lastSnapshot.created_at < weekAgo
    if (shouldSnapshot) {
      // Leggi il profilo completo appena aggiornato
      const { data: fullProfile } = await supabase
        .from('user_taste_profile')
        .select('genre_scores, negative_genres, entry_count')
        .eq('user_id', user.id)
        .maybeSingle()

      if (fullProfile) {
        await supabase.from('user_taste_history').insert({
          user_id: user.id,
          genre_scores: fullProfile.genre_scores,
          negative_genres: fullProfile.negative_genres,
          entry_count: fullProfile.entry_count,
          snapshot_at: new Date().toISOString(),
        })
      }
    }
  }

  return NextResponse.json({ ok: true, delta }, { headers: rl.headers })
}
