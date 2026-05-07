// src/app/api/recommendations/background-regen/route.ts
// Chiamata interna per rigenerare il master pool di un utente.
// Risponde 202 immediatamente e mette il regen nella coda processata dal cron/worker.

export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { enqueueRegenJob } from '@/lib/reco/regen-jobs'
import type { MediaType } from '@/lib/reco/engine-types'

const CRON_SECRET = process.env.CRON_SECRET || ''
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i
const ALL_MEDIA_TYPES: MediaType[] = ['anime', 'manga', 'movie', 'tv', 'game', 'boardgame']
const MEDIA_TYPES = new Set(['anime', 'manga', 'movie', 'tv', 'game', 'boardgame'])

export async function POST(request: NextRequest) {
  const secret = request.headers.get('X-Cron-Secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: apiMessage(request, 'unauthorized') }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const userId = typeof body.user_id === 'string' ? body.user_id.trim() : ''
  const forceRefresh = body.force_refresh !== false
  const mediaTypes = Array.isArray(body.media_types)
    ? body.media_types.filter((type: unknown): type is MediaType => typeof type === 'string' && MEDIA_TYPES.has(type))
    : []

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

  const queued = await enqueueRegenJob({
    userId,
    mediaTypes: mediaTypes.length > 0 ? mediaTypes : ALL_MEDIA_TYPES,
    forceRefresh,
    reason: 'background-regen-api',
  })

  return NextResponse.json({ status: queued ? 'accepted' : 'queue_failed', user_id: userId }, { status: queued ? 202 : 500 })
}
