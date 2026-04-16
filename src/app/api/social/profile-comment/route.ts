// src/app/api/social/profile-comment/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/lib/rateLimit'
import { sendPushToUser } from '@/lib/push'

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'profile-comment' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppi commenti. Rallenta.' }, { status: 429, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const { profile_id } = body
  if (!profile_id || typeof profile_id !== 'string') return NextResponse.json({ error: 'profile_id mancante' }, { status: 400 })
  if (profile_id === user.id) return NextResponse.json({ success: true })

  const service = createServiceClient()
  const { data: sender } = await service.from('profiles').select('username').eq('id', user.id).single()
  if (sender?.username) {
    // type='profile-comment', contextId=sender_id → max 1 push ogni 10 minuti per mittente
    await sendPushToUser(profile_id, {
      title: 'Geekore',
      body: `@${sender.username} ha scritto sulla tua bacheca`,
      url: `/profile/${sender.username}`,
      tag: `profile-comment-${user.id}`,
    }, 'profile-comment', user.id)
  }

  return NextResponse.json({ success: true }, { headers: rl.headers })
}