import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000, prefix: 'like' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppi like. Rallenta.' }, { status: 429, headers: rl.headers })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }
  const { post_id, action } = body
  if (!post_id || typeof post_id !== 'string') return NextResponse.json({ error: 'post_id mancante' }, { status: 400 })
  if (action !== 'like' && action !== 'unlike') return NextResponse.json({ error: 'action non valida' }, { status: 400 })
  if (action === 'like') {
    await supabase.from('likes').insert({ post_id, user_id: user.id })
    const { data: post } = await supabase.from('posts').select('user_id').eq('id', post_id).single()
    if (post && post.user_id !== user.id) {
      await supabase.from('notifications').insert({ type: 'like', sender_id: user.id, receiver_id: post.user_id, post_id })
    }
  } else {
    await supabase.from('likes').delete().eq('post_id', post_id).eq('user_id', user.id)
  }
  return NextResponse.json({ success: true }, { headers: rl.headers })
}