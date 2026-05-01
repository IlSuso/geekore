import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const requestedLimit = parseInt(searchParams.get('limit') || '20', 10)
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 50)
      : 20

    if (!userId) {
      return NextResponse.json({ error: 'userId mancante' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('activity_log')
      .select('id, user_id, type, media_id, media_title, media_type, media_cover, progress_value, rating_value, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (err) {
    logger.error('[Activity GET]', err)
    return NextResponse.json([], { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const body = await request.json()
    const { type, media_id, media_title, media_type, media_cover, progress_value, rating_value, metadata } = body

    const { error } = await supabase.from('activity_log').insert({
      user_id: user.id,
      type,
      media_id,
      media_title,
      media_type,
      media_cover,
      progress_value,
      rating_value,
      metadata: metadata || {},
    })

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    logger.error('[Activity POST]', err)
    return NextResponse.json({ error: 'Errore' }, { status: 500 })
  }
}
