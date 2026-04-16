// src/app/api/social/comment/route.ts
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

  const { post_id, action } = body
  if (!post_id || typeof post_id !== 'string') return NextResponse.json({ error: 'post_id mancante' }, { status: 400 })

  const service = createServiceClient()
  const { data: post } = await service.from('posts').select('user_id').eq('id', post_id).single()
  if (!post) return NextResponse.json({ success: true }, { headers: rl.headers })

  if (action === 'delete') {
    // Controlla se l'utente ha ancora altri commenti su questo post
    const { count } = await service
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', post_id)
      .eq('user_id', user.id)
    // Rimuove la notifica solo se non ci sono più commenti di questo utente su questo post
    if (count === 0) {
      await service.from('notifications')
        .delete()
        .eq('type', 'comment')
        .eq('sender_id', user.id)
        .eq('receiver_id', post.user_id)
        .eq('post_id', post_id)
    }
  } else {
    // Invia push per il commento
    if (post.user_id !== user.id) {
      const { data: sender } = await service.from('profiles').select('username').eq('id', user.id).single()
      if (sender?.username) await sendPushToUser(post.user_id, commentPayload(sender.username, post_id))
    }
  }

  return NextResponse.json({ success: true }, { headers: rl.headers })
}