// src/app/api/social/like/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/lib/rateLimit'
import { sendPushToUser, likePayload } from '@/lib/push'

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 60, windowMs: 60_000, prefix: 'like' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppi like. Rallenta.' }, { status: 429, headers: rl.headers })

  // Client autenticato — solo per verificare chi è l'utente loggato
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const { post_id, action } = body
  if (!post_id || typeof post_id !== 'string') return NextResponse.json({ error: 'post_id mancante' }, { status: 400 })
  if (action !== 'like' && action !== 'unlike') return NextResponse.json({ error: 'action non valida' }, { status: 400 })

  // Service client — bypassa RLS per leggere post altrui e scrivere notifiche
  const service = createServiceClient()

  if (action === 'like') {
    await service.from('likes').insert({ post_id, user_id: user.id })

    // Legge il proprietario del post (bypassa RLS)
    const { data: post } = await service.from('posts').select('user_id').eq('id', post_id).single()

    if (post && post.user_id !== user.id) {
      // Inserisce notifica in-app
      await service.from('notifications').insert({
        type: 'like',
        sender_id: user.id,
        receiver_id: post.user_id,
        post_id,
      })

      // Notifica push
      const { data: sender } = await service.from('profiles').select('username').eq('id', user.id).single()
      if (sender?.username) {
        await sendPushToUser(post.user_id, likePayload(sender.username, post_id))
      }
    }
  } else {
    await service.from('likes').delete().eq('post_id', post_id).eq('user_id', user.id)
  }

  return NextResponse.json({ success: true }, { headers: rl.headers })
}