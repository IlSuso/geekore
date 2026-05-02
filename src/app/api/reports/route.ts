import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'

const TARGET_TYPES = new Set(['post', 'comment', 'profile', 'profile_comment'])
const REASONS = new Set(['spam', 'harassment', 'inappropriate', 'misinformation', 'other'])

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 10, windowMs: 60_000, prefix: 'reports' })
  if (!rl.ok) return NextResponse.json({ error: 'Troppe segnalazioni. Rallenta.' }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body non valido' }, { status: 400, headers: rl.headers }) }

  const targetType = typeof body?.target_type === 'string' ? body.target_type.trim() : ''
  const targetId = typeof body?.target_id === 'string' ? body.target_id.trim().slice(0, 200) : ''
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  const notes = typeof body?.notes === 'string' ? body.notes.trim().slice(0, 300) : ''

  if (!TARGET_TYPES.has(targetType)) return NextResponse.json({ error: 'target_type non valido' }, { status: 400, headers: rl.headers })
  if (!targetId) return NextResponse.json({ error: 'target_id mancante' }, { status: 400, headers: rl.headers })
  if (!REASONS.has(reason)) return NextResponse.json({ error: 'reason non valida' }, { status: 400, headers: rl.headers })

  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id,
    target_type: targetType,
    target_id: targetId,
    reason,
    notes: notes || null,
  })

  if (error) return NextResponse.json({ error: 'Segnalazione non salvata' }, { status: 500, headers: rl.headers })
  return NextResponse.json({ success: true }, { headers: rl.headers })
}
