// DESTINAZIONE: src/app/api/search/track/route.ts
// ═══════════════════════════════════════════════════════════════════════════
// V3: Search Intent Tracking
// Registra le ricerche dell'utente per amplificare il profilo gusti.
//
// POST /api/search/track
// Body: { query, media_type?, result_clicked_id?, result_clicked_type?, result_clicked_genres? }
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000, prefix: 'search-track' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const { query, media_type, result_clicked_id, result_clicked_type, result_clicked_genres } = body
  if (!query || typeof query !== 'string' || query.trim().length < 2) {
    return NextResponse.json({ ok: false })
  }

  await supabase.from('search_history').insert({
    user_id: user.id,
    query: query.trim().slice(0, 200),
    media_type: media_type || null,
    result_clicked_id: result_clicked_id || null,
    result_clicked_type: result_clicked_type || null,
    result_clicked_genres: Array.isArray(result_clicked_genres) ? result_clicked_genres : [],
  })

        // Pulizia automatica vecchi record (max 500 per utente)
      Promise.resolve(
        supabase.rpc('cleanup_old_search_history', {
          p_user_id: user.id,
          p_keep: 500 
        })
      ).then(() => {}).catch(() => {})

  return NextResponse.json({ ok: true }, { headers: rl.headers })
}
