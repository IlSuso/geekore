import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimit } from '@/lib/rateLimit'

const ACTIVITY_TYPES = new Set(['media_completed', 'rating_given', 'progress_update'])
const MEDIA_TYPES = new Set(['anime', 'manga', 'game', 'movie', 'tv', 'boardgame'])

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().slice(0, max)
  return clean || null
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function GET(request: NextRequest) {
  try {
    const rl = rateLimit(request, { limit: 120, windowMs: 60_000, prefix: 'activity:get' })
    if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

    const { searchParams } = new URL(request.url)
    const requestedLimit = parseInt(searchParams.get('limit') || '20', 10)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 50)
      : 20

    const { data, error } = await supabase
      .from('activity_log')
      .select('id, user_id, type, media_id, media_title, media_type, media_cover, progress_value, rating_value, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return NextResponse.json(data || [], { headers: rl.headers })
  } catch (err) {
    logger.error('[Activity GET]', err)
    return NextResponse.json([], { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const rl = rateLimit(request, { limit: 120, windowMs: 60_000, prefix: 'activity:post' })
    if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste' }, { status: 429, headers: rl.headers })
    if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers })
    }
    const { type, media_id, media_title, media_type, media_cover, progress_value, rating_value, metadata } = body
    const cleanType = cleanString(type, 80)
    const cleanMediaType = cleanString(media_type, 40)
    if (!cleanType || !ACTIVITY_TYPES.has(cleanType)) {
      return NextResponse.json({ error: 'Tipo attivita non valido' }, { status: 400, headers: rl.headers })
    }
    if (cleanMediaType && !MEDIA_TYPES.has(cleanMediaType)) {
      return NextResponse.json({ error: 'Tipo media non valido' }, { status: 400, headers: rl.headers })
    }

    const { error } = await supabase.from('activity_log').insert({
      user_id: user.id,
      type: cleanType,
      media_id: cleanString(media_id, 200),
      media_title: cleanString(media_title, 300),
      media_type: cleanMediaType,
      media_cover: cleanString(media_cover, 1000),
      progress_value: numberOrNull(progress_value),
      rating_value: numberOrNull(rating_value),
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
    })

    if (error) throw error
    return NextResponse.json({ success: true }, { headers: rl.headers })
  } catch (err) {
    logger.error('[Activity POST]', err)
    return NextResponse.json({ error: 'Errore' }, { status: 500 })
  }
}
