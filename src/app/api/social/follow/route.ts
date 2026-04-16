// src/app/api/social/follow/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { rateLimit } from '@/lib/rateLimit'
import { sendPushToUser, followPayload } from '@/lib/push'

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 30, windowMs: 60_000, prefix: 'follow' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppi follow. Rallenta.' }, { status: 429, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400 }) }

  const { target_id } = body
  if (!target_id || typeof target_id !== 'string') return NextResponse.json({ error: 'target_id mancante' }, { status: 400 })
  if (target_id === user.id) return NextResponse.json({ success: true })

  const service = createServiceClient()
  const { data: sender } = await service.from('profiles').select('username').eq('id', user.id).single()
  if (sender?.username) await sendPushToUser(target_id, followPayload(sender.username))

  return NextResponse.json({ success: true }, { headers: rl.headers })
}