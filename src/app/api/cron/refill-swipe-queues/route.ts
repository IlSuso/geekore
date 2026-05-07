import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { createServiceClient } from '@/lib/supabase/service'
import { ensureAllSwipeQueuesForUser } from '@/lib/swipeRefill'
import { logger } from '@/lib/logger'

export const maxDuration = 60

const QUEUE_TABLES = [
  'swipe_queue_all',
  'swipe_queue_anime',
  'swipe_queue_manga',
  'swipe_queue_movie',
  'swipe_queue_tv',
  'swipe_queue_game',
  'swipe_queue_boardgame',
]

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const bearer = request.headers.get('authorization')
  const cronHeader = request.headers.get('x-cron-secret')
  return bearer === `Bearer ${cronSecret}` || cronHeader === cronSecret
}

async function loadUsersWithSwipeQueues(supabase: any, limit: number) {
  const ids = new Set<string>()
  for (const table of QUEUE_TABLES) {
    const { data } = await supabase
      .from(table)
      .select('user_id')
      .limit(limit)
    for (const row of data || []) {
      if (row?.user_id) ids.add(row.user_id)
      if (ids.size >= limit) return [...ids]
    }
  }
  return [...ids]
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: apiMessage(request, 'cronSecretMissing') }, { status: 503 })
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: apiMessage(request, 'unauthorized') }, { status: 401 })
  }

  const supabase = createServiceClient('cron:refill-swipe-queues')
  const limit = Math.min(Number(request.nextUrl.searchParams.get('users') || 20) || 20, 50)
  const users = await loadUsersWithSwipeQueues(supabase, limit)
  const results = []

  for (const userId of users) {
    try {
      const queues = await ensureAllSwipeQueuesForUser({
        supabase,
        userId,
        origin: request.nextUrl.origin,
        locale: 'it',
        threshold: 20,
        target: 50,
      })
      results.push({ userId, queues })
    } catch (error: any) {
      logger.warn('cron.refill-swipe-queues', 'failed user refill', { userId, error: String(error?.message || error) })
      results.push({ userId, error: String(error?.message || error) })
    }
  }

  return NextResponse.json({ success: true, users: users.length, results })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
