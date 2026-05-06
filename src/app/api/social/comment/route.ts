import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimitAsync } from '@/lib/rateLimit'
import { sendPushToUser, commentPayload } from '@/lib/push'
import { checkOrigin } from '@/lib/csrf'

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 20, windowMs: 60_000, prefix: 'comment' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyComments') }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: apiMessage(request, 'invalidBody') }, { status: 400, headers: rl.headers }) }

  const { post_id, content } = body
  if (!post_id || typeof post_id !== 'string') return NextResponse.json({ error: apiMessage(request, 'missingPostId') }, { status: 400, headers: rl.headers })
  if (typeof content !== 'string' || !content.trim()) return NextResponse.json({ error: apiMessage(request, 'missingContent') }, { status: 400, headers: rl.headers })

  const service = createServiceClient('social:comment')
  const { data: post } = await service.from('posts').select('user_id').eq('id', post_id).single()
  if (!post) return NextResponse.json({ error: apiMessage(request, 'postNotFound') }, { status: 404, headers: rl.headers })

  const cleanContent = content.trim().replace(/\n{3,}/g, '\n\n').slice(0, 500)
  const { data: comment, error: insertError } = await service
    .from('comments')
    .insert({ post_id, user_id: user.id, content: cleanContent })
    .select('id, content, created_at, user_id, profiles(username, display_name, avatar_url, badge)')
    .single()

  if (insertError) return NextResponse.json({ error: apiMessage(request, 'commentNotSaved') }, { status: 500, headers: rl.headers })

  if (post.user_id !== user.id) {
    await service.from('notifications').insert({
      receiver_id: post.user_id,
      sender_id: user.id,
      type: 'comment',
      post_id,
      comment_id: comment.id,
    })

    const { data: sender } = await service.from('profiles').select('username').eq('id', user.id).single()
    if (sender?.username) {
      await sendPushToUser(post.user_id, commentPayload(sender.username, post_id), 'comment', post_id)
    }
  }

  return NextResponse.json({ success: true, comment }, { headers: rl.headers })
}

export async function DELETE(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 40, windowMs: 60_000, prefix: 'comment-delete' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyDeletes') }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: apiMessage(request, 'invalidBody') }, { status: 400, headers: rl.headers }) }

  const { comment_id } = body
  if (!comment_id || typeof comment_id !== 'string') return NextResponse.json({ error: apiMessage(request, 'missingCommentId') }, { status: 400, headers: rl.headers })

  const service = createServiceClient('social:comment:delete')
  const { data: comment } = await service
    .from('comments')
    .select('id, user_id, post_id, posts(user_id)')
    .eq('id', comment_id)
    .maybeSingle()

  if (!comment) return NextResponse.json({ error: apiMessage(request, 'commentNotFound') }, { status: 404, headers: rl.headers })
  const postOwnerId = Array.isArray(comment.posts)
    ? comment.posts[0]?.user_id
    : (comment.posts as any)?.user_id
  if (comment.user_id !== user.id && postOwnerId !== user.id) {
    return NextResponse.json({ error: apiMessage(request, 'notAuthorized') }, { status: 403, headers: rl.headers })
  }

  await service.from('notifications').delete().eq('comment_id', comment_id)
  const { error } = await service.from('comments').delete().eq('id', comment_id)
  if (error) return NextResponse.json({ error: apiMessage(request, 'commentNotDeleted') }, { status: 500, headers: rl.headers })

  return NextResponse.json({ success: true, post_id: comment.post_id }, { headers: rl.headers })
}
