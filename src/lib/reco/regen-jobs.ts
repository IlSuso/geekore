import type { MediaType } from '@/lib/reco/engine-types'
import { logger } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/service'
import { after } from 'next/server'

const workerKickCooldown = new Map<string, number>()

function getAppUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return null
}

function kickRegenWorker(reason: string) {
  const cronSecret = process.env.CRON_SECRET
  const appUrl = getAppUrl()
  if (!cronSecret || !appUrl) return

  const key = 'process-regen-jobs'
  const now = Date.now()
  if ((workerKickCooldown.get(key) || 0) > now) return
  workerKickCooldown.set(key, now + 60_000)

  after(async () => {
    const res = await fetch(`${appUrl}/api/cron/process-regen-jobs?batch=1`, {
      headers: {
        authorization: `Bearer ${cronSecret}`,
        'x-cron-secret': cronSecret,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(55_000),
    }).catch(error => {
      logger.warn('reco.regen-jobs', 'Worker kick failed', { reason, error: String(error) })
      return null
    })

    if (res && !res.ok) {
      const body = await res.text().catch(() => '')
      logger.warn('reco.regen-jobs', 'Worker kick returned non-ok', {
        reason,
        status: res.status,
        body: body.slice(0, 500),
      })
    }
  })
}

export async function enqueueRegenJob({
  userId,
  mediaTypes,
  forceRefresh = true,
  reason,
}: {
  userId: string
  mediaTypes: MediaType[]
  forceRefresh?: boolean
  reason: string
}) {
  if (mediaTypes.length === 0) return false

  const supabase = createServiceClient(`reco:enqueue:${reason}`)
  let typesToQueue = [...new Set(mediaTypes)]
  const { data: existing, error: existingError } = await supabase
    .from('regen_jobs')
    .select('id, media_types')
    .eq('user_id', userId)
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: false })
    .limit(20)

  if (!existingError && Array.isArray(existing)) {
    const activeTypes = new Set<MediaType>()
    for (const job of existing) {
      if (!Array.isArray(job.media_types)) continue
      for (const type of job.media_types) activeTypes.add(type as MediaType)
    }
    typesToQueue = typesToQueue.filter(type => !activeTypes.has(type))
    if (typesToQueue.length === 0) {
      kickRegenWorker(reason)
      return true
    }
  }

  const { error } = await supabase
    .from('regen_jobs')
    .insert({
      user_id: userId,
      media_types: typesToQueue,
      force_refresh: forceRefresh,
      status: 'pending',
    })

  if (error) {
    logger.error('reco.regen-jobs', 'Failed to enqueue regen job', {
      reason,
      userId,
      mediaTypes: typesToQueue,
      error,
    })
    return false
  }

  kickRegenWorker(reason)
  return true
}
