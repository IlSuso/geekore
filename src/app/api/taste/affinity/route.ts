import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value.trim().slice(0, max)
  return clean || null
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 180, windowMs: 60_000, prefix: 'taste:affinity' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyRequests') }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: apiMessage(request, 'invalidBody') }, { status: 400, headers: rl.headers }) }

  const category = cleanString(body?.category, 120)
  const subcategory = cleanString(body?.subcategory, 120) || 'Generico'
  if (!category) return NextResponse.json({ error: apiMessage(request, 'missingCategory') }, { status: 400, headers: rl.headers })

  const { error } = await supabase
    .from('user_category_affinity')
    .upsert(
      { user_id: user.id, category, subcategory, score: 1, last_interacted_at: new Date().toISOString() },
      { onConflict: 'user_id,category,subcategory' }
    )
  if (error) return NextResponse.json({ error: apiMessage(request, 'affinityNotSaved') }, { status: 500, headers: rl.headers })

  try {
    await supabase.rpc('increment_category_score', { p_user_id: user.id, p_category: category, p_subcategory: subcategory })
  } catch {}

  return NextResponse.json({ success: true }, { headers: rl.headers })
}
