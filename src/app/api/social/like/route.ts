import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimitAsync } from '@/lib/rateLimit'
import { sendPushToUser, likePayload } from '@/lib/push'
import { checkOrigin } from '@/lib/csrf'

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'like' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyLikes') }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: apiMessage(request, 'invalidBody') }, { status: 400, headers: rl.headers }) }

  const { post_id, action = 'like' } = body
  if (!post_id || typeof post_id !== 'string') return NextResponse.json({ error: apiMessage(request, 'missingPostId') }, { status: 400, headers: rl.headers })
  if (action !== 'like' && action !== 'unlike') {
    return NextResponse.json({ error: apiMessage(request, 'invalidAction') }, { status: 400, headers: rl.headers })
  }

  const service = createServiceClient('social:like')
  const { data: post } = await service.from('posts').select('user_id').eq('id', post_id).single()
  if (!post) return NextResponse.json({ error: apiMessage(request, 'postNotFound') }, { status: 404, headers: rl.headers })

  if (action === 'unlike') {
    await service.from('likes').delete().eq('post_id', post_id).eq('user_id', user.id)
    return NextResponse.json({ success: true, liked: false }, { headers: rl.headers })
  }

  let likeId: string | null = null
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
    if (insertError) return NextResponse.json({ error: apiMessage(request, 'likeNotSaved') }, { status: 500, headers: rl.headers })
    likeId = inserted?.id || null
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
