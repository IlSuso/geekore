import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/lib/rateLimit'
import { sendPushToUser } from '@/lib/push'
import { checkOrigin } from '@/lib/csrf'

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'profile-comment' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppi commenti. Rallenta.' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const { profile_id, content, action = 'comment' } = body
  if (!profile_id || typeof profile_id !== 'string') return NextResponse.json({ error: 'profile_id mancante' }, { status: 400 })
  if (action !== 'comment' && action !== 'push_only') return NextResponse.json({ error: 'action non valida' }, { status: 400 })

  const service = createServiceClient('social:profile-comment')
  let comment: any = null
  if (action !== 'push_only') {
    if (typeof content !== 'string' || !content.trim()) return NextResponse.json({ error: 'content mancante' }, { status: 400 })
    const cleanContent = content.trim().replace(/\n{3,}/g, '\n\n').slice(0, 500)
    const { data: inserted, error: insertError } = await service
      .from('profile_comments')
      .insert({ profile_id, author_id: user.id, content: cleanContent })
      .select('id, content, created_at, author_id')
      .single()

    if (insertError) return NextResponse.json({ error: 'commento non salvato' }, { status: 500 })
    comment = inserted
  }

  if (profile_id === user.id) {
    return NextResponse.json({ success: true, comment }, { headers: rl.headers })
  }

  const { data: sender } = await service.from('profiles').select('username').eq('id', user.id).single()
  if (comment?.id) {
    await service.from('notifications').insert({
      receiver_id: profile_id,
      sender_id: user.id,
      type: 'comment',
    })
  }
  if (sender?.username) {
    await sendPushToUser(profile_id, {
      title: 'Geekore',
      body: `@${sender.username} ha scritto sulla tua bacheca`,
      url: `/profile/${sender.username}`,
      tag: `profile-comment-${user.id}`,
    }, 'profile-comment', user.id)
  }

  return NextResponse.json({ success: true, comment }, { headers: rl.headers })
}

export async function DELETE(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'profile-comment:delete' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe richieste. Rallenta.' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const { comment_id } = body
  if (!comment_id || typeof comment_id !== 'string') {
    return NextResponse.json({ error: 'comment_id mancante' }, { status: 400, headers: rl.headers })
  }

  const service = createServiceClient('social:profile-comment:delete')
  const { data: comment } = await service
    .from('profile_comments')
    .select('id, author_id, profile_id')
    .eq('id', comment_id)
    .single()

  if (!comment) return NextResponse.json({ error: 'commento non trovato' }, { status: 404, headers: rl.headers })
  if (comment.author_id !== user.id && comment.profile_id !== user.id) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 403, headers: rl.headers })
  }

  const { error } = await service.from('profile_comments').delete().eq('id', comment_id)
  if (error) return NextResponse.json({ error: 'commento non eliminato' }, { status: 500, headers: rl.headers })

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
