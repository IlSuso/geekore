import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { checkOrigin } from '@/lib/csrf'
import { rateLimitAsync } from '@/lib/rateLimit'
import { createClient } from '@/lib/supabase/server'
import { ensureSwipeQueueRefill, SWIPE_QUEUE_TYPES, type SwipeQueueType } from '@/lib/swipeRefill'
import { getRequestLocale } from '@/lib/i18n/serverLocale'

function normalizeQueue(value: unknown): SwipeQueueType {
  return typeof value === 'string' && (SWIPE_QUEUE_TYPES as readonly string[]).includes(value)
    ? value as SwipeQueueType
    : 'all'
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 60, windowMs: 60_000, prefix: 'swipe:refill' })
  if (!rl.ok) return NextResponse.json({ error: apiMessage(request, 'tooManyRequests') }, { status: 429, headers: rl.headers })
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })

  const body = await request.json().catch(() => ({}))
  const queue = normalizeQueue(body?.queue)
  const locale = await getRequestLocale(request, supabase, user.id)

  const result = await ensureSwipeQueueRefill({
    supabase,
    userId: user.id,
    queue,
    origin: request.nextUrl.origin,
    locale,
    threshold: 20,
    target: 50,
  })

  return NextResponse.json({ success: true, result }, { headers: rl.headers })
}
