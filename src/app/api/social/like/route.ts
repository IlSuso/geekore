import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/lib/rateLimit'
import { sendPushToUser, likePayload } from '@/lib/push'

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000, prefix: 'like' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppi like. Rallenta.' }, { status: 429, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const { post_id, action = 'like' } = body
  if (!post_id || typeof post_id !== 'string') return NextResponse.json({ error: 'post_id mancante' }, { status: 400 })
  if (action !== 'like' && action !== 'unlike' && action !== 'push_only') {
    return NextResponse.json({ error: 'action non valida' }, { status: 400 })
  }

  const service = createServiceClient('social:like')
  const { data: post } = await service.from('posts').select('user_id').eq('id', post_id).single()
  if (!post) return NextResponse.json({ error: 'post non trovato' }, { status: 404 })

  if (action === 'unlike') {
    await service.from('likes').delete().eq('post_id', post_id).eq('user_id', user.id)
    return NextResponse.json({ success: true, liked: false }, { headers: rl.headers })
  }

  let likeId: string | null = null
  if (action !== 'push_only') {
    const { data: existing } = await service
      .from('likes')
      .select('id')
      .eq('post_id', post_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing?.id) {
      likeId = existing.id
    } else {
      const { data: inserted, error: insertError } = await service
        .from('likes')
        .insert({ post_id, user_id: user.id })
        .select('id')
        .single()
      if (insertError) return NextResponse.json({ error: 'like non salvato' }, { status: 500 })
      likeId = inserted?.id || null
    }
  }

  if (post.user_id !== user.id) {
    if (likeId) {
      await service.from('notifications').insert({
        receiver_id: post.user_id,
        sender_id: user.id,
        type: 'like',
        post_id,
        like_id: likeId,
      })
    }

    const { data: sender } = await service.from('profiles').select('username').eq('id', user.id).single()
    if (sender?.username) {
      await sendPushToUser(post.user_id, likePayload(sender.username, post_id), 'like', post_id)
    }
  }

  return NextResponse.json({ success: true, liked: true, like_id: likeId }, { headers: rl.headers })
}
