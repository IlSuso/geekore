import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/service'

export const maxDuration = 60

const INTERNAL_REGEN_FETCH_TIMEOUT_MS = 55_000

type RegenJob = {
  id: string
  user_id: string
  media_types: string[] | null
  force_refresh: boolean | null
}

function summarizeRegenPayload(payload: any) {
  const diagnostics = payload?.recommendationDiagnostics || {}
  const recruitment = diagnostics.recruitment || {}
  const poolHealth = diagnostics.poolHealth || {}
  const byType: Record<string, any> = {}

  for (const [type, diag] of Object.entries(recruitment) as Array<[string, any]>) {
    byType[type] = {
      rawCandidates: diag?.rawCandidates ?? null,
      rawUnseenCandidates: diag?.rawUnseenCandidates ?? null,
      tierUnseenCandidates: diag?.tierUnseenCandidates ?? null,
      finalUnseenCandidates: diag?.finalUnseenCandidates ?? null,
      finalCount: diag?.finalCount ?? null,
      continuityCount: diag?.continuityCount ?? 0,
      hardBlocked: diag?.exposure?.hardBlocked ?? 0,
      historicalShown: diag?.exposure?.historicalShown ?? 0,
      tierCounts: diag?.tier?.tierCounts || null,
      protectedFromShrink: !!diag?.merge?.protectedFromShrink,
      reusedPreviousCount: diag?.merge?.reusedPreviousCount ?? 0,
      poolSize: poolHealth?.[type]?.size ?? null,
      unseenCount: poolHealth?.[type]?.unseenCount ?? null,
      shownRatio: poolHealth?.[type]?.shownRatio ?? null,
    }
  }

  return {
    syncRegenTypes: diagnostics.syncRegenTypes || [],
    backgroundRegenQueued: diagnostics.backgroundRegenQueued || [],
    depletedTypes: diagnostics.depletedTypes || [],
    byType,
  }
}

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false

  const bearer = request.headers.get('authorization')
  const cronHeader = request.headers.get('x-cron-secret')
  return bearer === `Bearer ${cronSecret}` || cronHeader === cronSecret
}

function getAppUrl(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return request.nextUrl.origin
}

async function markJobFailed(supabase: any, jobId: string, error: string) {
  await supabase
    .from('regen_jobs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_msg: error.slice(0, 2000),
    })
    .eq('id', jobId)
}

async function processJob(request: NextRequest, job: RegenJob) {
  const supabase = createServiceClient('cron:process-regen-job')
  const now = new Date().toISOString()

  const { data: claimed, error: claimError } = await supabase
    .from('regen_jobs')
    .update({ status: 'running', started_at: now, error_msg: null })
    .eq('id', job.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (claimError) throw claimError
  if (!claimed) return { job_id: job.id, status: 'skipped' as const }

  const typeParam = 'all'
  const typesParam = job.media_types?.length ? `&types=${encodeURIComponent(job.media_types.join(','))}` : ''
  const refreshParam = job.force_refresh === false ? '' : '&refresh=1'
  const url = `${getAppUrl(request)}/api/recommendations?type=${typeParam}${typesParam}${refreshParam}&onboarding=1`

  try {
    const res = await fetch(url, {
      headers: {
        'X-Service-User-Id': job.user_id,
        'X-Service-Secret': process.env.CRON_SECRET || '',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(INTERNAL_REGEN_FETCH_TIMEOUT_MS),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`recommendations returned ${res.status}: ${body.slice(0, 1200)}`)
    }

    const payload = await res.json().catch(() => null)
    const summary = summarizeRegenPayload(payload)

    await supabase
      .from('regen_jobs')
      .update({ status: 'done', completed_at: new Date().toISOString(), error_msg: null })
      .eq('id', job.id)

    await supabase
      .from('profiles')
      .update({ master_pool_ready: true })
      .eq('id', job.user_id)

    return { job_id: job.id, user_id: job.user_id, status: 'done' as const, summary }
  } catch (err: any) {
    const message = err?.message || 'Unknown regen error'
    await markJobFailed(supabase, job.id, message)
    logger.error('cron.process-regen-jobs', `Job ${job.id} failed: ${message}`)
    return { job_id: job.id, user_id: job.user_id, status: 'failed' as const, error: message }
  }
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient('cron:process-regen-jobs')
  const batchSize = Math.min(Number(request.nextUrl.searchParams.get('batch') || 1) || 1, 3)

  const { data: jobs, error } = await supabase
    .from('regen_jobs')
    .select('id, user_id, media_types, force_refresh')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (error) {
    logger.error('cron.process-regen-jobs', 'Failed to load jobs', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results = []
  for (const job of (jobs || []) as RegenJob[]) {
    results.push(await processJob(request, job))
  }

  return NextResponse.json({ processed: results.length, results })
}

export async function POST(request: NextRequest) {
  return GET(request)
}
