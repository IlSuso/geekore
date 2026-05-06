// DESTINAZIONE: src/app/api/search/track/route.ts
// V3: Search Intent Tracking

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { checkOrigin } from '@/lib/csrf'

const MEDIA_TYPES = new Set(['anime', 'manga', 'game', 'movie', 'tv', 'boardgame'])

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().slice(0, max)
  return clean || null
}

function cleanMediaType(value: unknown): string | null {
  const clean = cleanString(value, 40)
  return clean && MEDIA_TYPES.has(clean) ? clean : null
}

function cleanGenres(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => cleanString(item, 80))
    .filter((item): item is string => Boolean(item))
    .slice(0, 20)
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'search-track' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const query = cleanString(body?.query, 200)
  if (!query || query.length < 2) {
    return NextResponse.json({ ok: false, error: 'Query non valida' }, { status: 400, headers: rl.headers })
  }

  const { error } = await supabase.from('search_history').insert({
    user_id: user.id,
    query,
    media_type: cleanMediaType(body?.media_type),
    result_clicked_id: cleanString(body?.result_clicked_id, 200),
    result_clicked_type: cleanMediaType(body?.result_clicked_type),
    result_clicked_genres: cleanGenres(body?.result_clicked_genres),
  })
  if (error) {
    return NextResponse.json({ ok: false, error: 'Ricerca non salvata' }, { status: 500, headers: rl.headers })
  }

  Promise.resolve(
    supabase.rpc('cleanup_old_search_history', {
      p_user_id: user.id,
      p_keep: 500,
    })
  ).then(() => {}).catch(() => {})

  return NextResponse.json({ ok: true }, { headers: rl.headers })
}
