// src/app/api/recommendations/background-regen/route.ts
// Chiamata interna per rigenerare il master pool di un utente.
// Risponde 202 immediatamente, poi esegue il regen asincrono via after().

export const maxDuration = 60

import { NextRequest, NextResponse, after } from 'next/server'
import { logger } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/service'

const CRON_SECRET = process.env.CRON_SECRET || ''
const INTERNAL_REGEN_FETCH_TIMEOUT_MS = 55_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Cron-Secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  const forceRefresh = body.force_refresh !== false

  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 })
  }

  const supabase = createServiceClient('recommendations:background-regen:verify-user')
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, entry_count')
    .eq('id', userId)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const refreshParam = forceRefresh ? '&refresh=1' : ''
  const url = `${appUrl}/api/recommendations?type=all${refreshParam}&onboarding=1`

  after(async () => {
    try {
      const res = await fetch(url, {
        headers: {
          'X-Service-User-Id': userId,
          'X-Service-Secret': CRON_SECRET,
        },
        signal: AbortSignal.timeout(INTERNAL_REGEN_FETCH_TIMEOUT_MS),
      })
      if (!res.ok) {
        const text = await res.text()
        logger.error('background-regen', `Regen failed for ${userId}: ${res.status} ${text}`)
      } else {
        logger.info('background-regen', `Master pool regenerated for user ${userId}`)
      }
    } catch (err: any) {
      logger.error('background-regen', `Fetch error for ${userId}: ${err?.message}`)
    }
  })

  return NextResponse.json({ status: 'accepted', user_id: userId }, { status: 202 })
}
