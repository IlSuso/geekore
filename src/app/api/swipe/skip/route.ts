import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'

const QUEUE_TYPES = new Set(['anime', 'manga', 'movie', 'tv', 'game', 'boardgame'])

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().slice(0, max)
  return clean || null
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 120, windowMs: 60_000, prefix: 'swipe:skip' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyRequests') }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: apiMessage(request, 'invalidBody') }, { status: 400, headers: rl.headers }) }

  const externalId = cleanString(body?.external_id, 200)
  const title = cleanString(body?.title, 300)
  const type = cleanString(body?.type, 40)

  if (!externalId) return NextResponse.json({ error: apiMessage(request, 'missingExternalId') }, { status: 400, headers: rl.headers })
  if (!title) return NextResponse.json({ error: apiMessage(request, 'missingTitle') }, { status: 400, headers: rl.headers })
  if (!type || !QUEUE_TYPES.has(type)) return NextResponse.json({ error: apiMessage(request, 'invalidType') }, { status: 400, headers: rl.headers })

  const { error } = await supabase.from('swipe_skipped').upsert(
    { user_id: user.id, external_id: externalId, title, type },
    { onConflict: 'user_id,external_id' }
  )
  if (error) return NextResponse.json({ error: apiMessage(request, 'skipNotSaved') }, { status: 500, headers: rl.headers })

  await Promise.all([
    supabase.from('swipe_queue_all').delete().eq('user_id', user.id).eq('external_id', externalId),
    supabase.from(`swipe_queue_${type}`).delete().eq('user_id', user.id).eq('external_id', externalId),
  ])

  return NextResponse.json({ success: true }, { headers: rl.headers })
}

export async function DELETE(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 120, windowMs: 60_000, prefix: 'swipe:skip:delete' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyRequests') }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: apiMessage(request, 'invalidBody') }, { status: 400, headers: rl.headers }) }

  const externalId = cleanString(body?.external_id, 200)
  if (!externalId) return NextResponse.json({ error: apiMessage(request, 'missingExternalId') }, { status: 400, headers: rl.headers })

  const { error } = await supabase
    .from('swipe_skipped')
    .delete()
    .eq('user_id', user.id)
    .eq('external_id', externalId)

  if (error) return NextResponse.json({ error: apiMessage(request, 'skipNotRemoved') }, { status: 500, headers: rl.headers })
  return NextResponse.json({ success: true }, { headers: rl.headers })
}
