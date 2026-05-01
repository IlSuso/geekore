import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimit } from '@/lib/rateLimit'

const ARRAY_FIELDS = new Set([
  'fav_game_genres',
  'fav_anime_genres',
  'fav_movie_genres',
  'fav_tv_genres',
  'fav_manga_genres',
  'fav_book_genres',
  'disliked_genres',
  'soft_disliked_genres',
  'preferred_platforms',
  'discovery_unlocked',
])

const JSON_FIELDS = new Set([
  'genre_feedback_counts',
  'format_feedback_counts',
  'streaming_platforms',
])

const BOOLEAN_FIELDS = new Set(['digest_enabled'])

function cleanStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  return value
    .filter((v): v is string => typeof v === 'string')
    .map(v => v.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 80)
}

function cleanJsonValue(key: string, value: unknown): unknown {
  if (key === 'streaming_platforms') {
    if (!Array.isArray(value)) return []
    return value
      .map(v => Number(v))
      .filter(v => Number.isInteger(v) && v > 0)
      .slice(0, 50)
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  return {}
}

export async function PATCH(request: NextRequest) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000, prefix: 'preferences' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers })
  }

  const update: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  }

  for (const [key, value] of Object.entries(body)) {
    if (ARRAY_FIELDS.has(key)) {
      const cleaned = cleanStringArray(value)
      if (cleaned) update[key] = cleaned
    } else if (JSON_FIELDS.has(key)) {
      update[key] = cleanJsonValue(key, value)
    } else if (BOOLEAN_FIELDS.has(key) && typeof value === 'boolean') {
      update[key] = value
    }
  }

  if (Object.keys(update).length <= 2) {
    return NextResponse.json({ error: 'Nessuna preferenza valida' }, { status: 400, headers: rl.headers })
  }

  const { error } = await supabase.from('user_preferences').upsert(update, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: 'Preferenze non salvate' }, { status: 500, headers: rl.headers })

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
