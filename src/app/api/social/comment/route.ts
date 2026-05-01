import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/lib/rateLimit'
import { sendPushToUser, commentPayload } from '@/lib/push'

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'comment' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppi commenti. Rallenta.' }, { status: 429, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const { post_id, content, action = 'comment' } = body
  if (!post_id || typeof post_id !== 'string') return NextResponse.json({ error: 'post_id mancante' }, { status: 400 })
  if (action !== 'comment' && action !== 'push_only') return NextResponse.json({ error: 'action non valida' }, { status: 400 })

  const service = createServiceClient('social:comment')
  const { data: post } = await service.from('posts').select('user_id').eq('id', post_id).single()
  if (!post) return NextResponse.json({ error: 'post non trovato' }, { status: 404 })

  let comment: any = null
  if (action !== 'push_only') {
    if (typeof content !== 'string' || !content.trim()) return NextResponse.json({ error: 'content mancante' }, { status: 400 })
    const cleanContent = content.trim().replace(/\n{3,}/g, '\n\n').slice(0, 500)
    const { data: inserted, error: insertError } = await service
      .from('comments')
      .insert({ post_id, user_id: user.id, content: cleanContent })
      .select('id, content, created_at, user_id, profiles(username, display_name, avatar_url, badge)')
      .single()

    if (insertError) return NextResponse.json({ error: 'commento non salvato' }, { status: 500 })
    comment = inserted
  }

  if (post.user_id !== user.id) {
    if (comment?.id) {
      await service.from('notifications').insert({
        receiver_id: post.user_id,
        sender_id: user.id,
        type: 'comment',
        post_id,
        comment_id: comment.id,
      })
    }
    const { data: sender } = await service.from('profiles').select('username').eq('id', user.id).single()
    if (sender?.username) {
      await sendPushToUser(post.user_id, commentPayload(sender.username, post_id), 'comment', post_id)
    }
  }

  return NextResponse.json({ success: true, comment }, { headers: rl.headers })
}
