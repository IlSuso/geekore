import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'

type DisplayOrderUpdate = { id: string; display_order: number }

function cleanUpdates(value: unknown): DisplayOrderUpdate[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item: any) => {
      const id = typeof item?.id === 'string' ? item.id.trim() : ''
      const displayOrder = Number(item?.display_order)
      if (!id || !Number.isFinite(displayOrder)) return null
      return { id, display_order: displayOrder }
    })
    .filter((item): item is DisplayOrderUpdate => Boolean(item))
    .slice(0, 500)
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'collection:reorder' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyRequests') }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: apiMessage(request, 'invalidBody') }, { status: 400, headers: rl.headers }) }

  const updates = cleanUpdates(body?.updates)
  if (updates.length === 0) return NextResponse.json({ error: 'updates mancanti' }, { status: 400, headers: rl.headers })

  const { data: ownedRows, error: ownedError } = await supabase
    .from('user_media_entries')
    .select('id')
    .eq('user_id', user.id)
    .in('id', updates.map(update => update.id))
  if (ownedError) return NextResponse.json({ error: apiMessage(request, 'titlesNotVerified') }, { status: 500, headers: rl.headers })

  const ownedIds = new Set((ownedRows || []).map(row => row.id))
  const safeUpdates = updates.filter(update => ownedIds.has(update.id))
  if (safeUpdates.length === 0) return NextResponse.json({ error: apiMessage(request, 'noEditableTitles') }, { status: 403, headers: rl.headers })

  const { error } = await supabase.rpc('update_display_orders', { updates: safeUpdates })
  if (error) return NextResponse.json({ error: apiMessage(request, 'orderNotUpdated') }, { status: 500, headers: rl.headers })

  return NextResponse.json({ success: true, updated: safeUpdates.length }, { headers: rl.headers })
}
