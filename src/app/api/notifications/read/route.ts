import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimit } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  const rl = rateLimit(request, { limit: 80, windowMs: 60_000, prefix: 'notifications:read' })
  if (!rl.ok) {
    return NextResponse.json({ error: 'Troppe richieste. Rallenta.' }, { status: 429, headers: rl.headers })
  }
  if (!checkOrigin(request)) {
    return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const payload = body && typeof body === 'object' ? body as { ids?: unknown; all?: unknown } : {}
  const ids = Array.isArray(payload.ids)
    ? payload.ids.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 100)
    : []
  const markAll = payload.all === true

  if (!markAll && ids.length === 0) {
    return NextResponse.json({ error: 'ids mancanti' }, { status: 400, headers: rl.headers })
  }

  let query = supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('receiver_id', user.id)
    .eq('is_read', false)

  if (!markAll) {
    query = query.in('id', ids)
  }

  const { error } = await query
  if (error) {
    return NextResponse.json({ error: 'Notifiche non aggiornate' }, { status: 500, headers: rl.headers })
  }

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
