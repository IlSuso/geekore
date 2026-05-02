import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimitAsync } from '@/lib/rateLimit'
import { sendPushToUser, followPayload } from '@/lib/push'
import { checkOrigin } from '@/lib/csrf'

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 30, windowMs: 60_000, prefix: 'follow' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppi follow. Rallenta.' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const { target_id, action } = body
  if (!target_id || typeof target_id !== 'string') return NextResponse.json({ error: 'target_id mancante' }, { status: 400, headers: rl.headers })
  if (target_id === user.id) return NextResponse.json({ success: true, following: false }, { headers: rl.headers })
  if (action !== 'follow' && action !== 'unfollow') return NextResponse.json({ error: 'action non valida' }, { status: 400, headers: rl.headers })

  const service = createServiceClient('social:follow')
  const { data: target } = await service.from('profiles').select('id').eq('id', target_id).maybeSingle()
  if (!target) return NextResponse.json({ error: 'utente non trovato' }, { status: 404, headers: rl.headers })

  if (action === 'follow') {
    const { data: existing } = await service
      .from('follows')
      .select('follower_id')
      .eq('follower_id', user.id)
      .eq('following_id', target_id)
      .maybeSingle()

    if (!existing) {
      await service.from('follows').insert({ follower_id: user.id, following_id: target_id })
      await service.from('notifications').insert({ type: 'follow', sender_id: user.id, receiver_id: target_id })

      const { data: sender } = await service.from('profiles').select('username').eq('id', user.id).single()
      if (sender?.username) {
        await sendPushToUser(target_id, followPayload(sender.username), 'follow', user.id)
      }
    }
  } else {
    await service.from('follows').delete().eq('follower_id', user.id).eq('following_id', target_id)
    await service.from('notifications').delete().eq('type', 'follow').eq('sender_id', user.id).eq('receiver_id', target_id)
  }

  return NextResponse.json({ success: true, following: action === 'follow' }, { headers: rl.headers })
}
