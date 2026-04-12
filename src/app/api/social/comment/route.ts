// DESTINAZIONE: src/app/api/social/comment/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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
  const { post_id, content } = body
  if (!post_id || typeof post_id !== 'string') return NextResponse.json({ error: 'post_id mancante' }, { status: 400 })
  if (!content || typeof content !== 'string' || content.trim().length < 1) return NextResponse.json({ error: 'Contenuto vuoto' }, { status: 400 })
  if (content.trim().length > 1000) return NextResponse.json({ error: 'Commento troppo lungo (max 1000)' }, { status: 400 })
  const { data, error } = await supabase.from('comments').insert({ post_id, user_id: user.id, content: content.trim() }).select('*, profiles(username, display_name)').single()
  if (error) return NextResponse.json({ error: 'Errore nel salvataggio' }, { status: 500 })
  const { data: post } = await supabase.from('posts').select('user_id').eq('id', post_id).single()
  if (post && post.user_id !== user.id) {
    await supabase.from('notifications').insert({ type: 'comment', sender_id: user.id, receiver_id: post.user_id, post_id })
    // F: notifica push al proprietario del post
    const { data: sender } = await supabase.from('profiles').select('username').eq('id', user.id).single()
    if (sender?.username) {
      await sendPushToUser(post.user_id, commentPayload(sender.username, post_id))
    }
  }
  return NextResponse.json({ success: true, comment: data }, { headers: rl.headers })
}