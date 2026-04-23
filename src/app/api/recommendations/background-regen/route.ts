// src/app/api/recommendations/background-regen/route.ts
// Chiamata dalla Edge Function Supabase per rigenerare il master pool
// di un utente specifico, senza bisogno della sua sessione.
// Usa X-Service-User-Id + X-Service-Secret per bypassare l'auth.

export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

const CRON_SECRET = process.env.CRON_SECRET || ''

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Cron-Secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Missing service key' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const { user_id, force_refresh } = body

  if (!user_id) {
    return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, entry_count')
    .eq('id', user_id)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const refreshParam = force_refresh !== false ? '&refresh=1' : ''
  const url = `${appUrl}/api/recommendations?type=all${refreshParam}&onboarding=1`

  try {
    const res = await fetch(url, {
      headers: {
        'X-Service-User-Id': user_id,
        'X-Service-Secret': CRON_SECRET,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      logger.error('background-regen', `Regen failed for ${user_id}: ${res.status} ${text}`)
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: 500 })
    }

    logger.info('background-regen', `Master pool regenerated for user ${user_id}`)
    return NextResponse.json({ status: 'done', user_id })
  } catch (err: any) {
    logger.error('background-regen', `Fetch error for ${user_id}: ${err?.message}`)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}