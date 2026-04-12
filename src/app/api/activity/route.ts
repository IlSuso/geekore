import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const limit = parseInt(searchParams.get('limit') || '20')

    if (!userId) {
      return NextResponse.json({ error: 'userId mancante' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('activity_log')
      .select('*')
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