import { after, NextRequest, NextResponse } from 'next/server'
import { FORCE_REGEN_COOLDOWN_MINUTES } from '@/lib/reco/pool'
import { finishRegen, tryStartRegen } from '@/lib/reco/regen-lock'
import { refreshFromMasterPool, serveFromSavedPool } from '@/lib/reco/serving'
import type { SupabaseClient } from './context'

export async function handlePoolOnlyFastPath({
  searchParams,
  forceRefresh,
  supabase,
  userId,
}: {
  searchParams: URLSearchParams
  forceRefresh: boolean
  supabase: SupabaseClient
  userId: string
}): Promise<NextResponse | null> {
  const poolOnly = searchParams.get('source') === 'pool'
  if (!poolOnly || forceRefresh) return null

  const served = await serveFromSavedPool(supabase, userId)
  if (served) {
    return NextResponse.json(served.payload, {
      headers: { 'X-Cache': served.cacheHeader || 'POOL_HIT' },
    })
  }

  return NextResponse.json({
    recommendations: {},
    tasteProfile: null,
    cached: false,
    source: 'pool_empty',
  })
}

export async function handleRefreshPoolFastPath({
  request,
  searchParams,
  supabase,
  userId,
}: {
  request: NextRequest
  searchParams: URLSearchParams
  supabase: SupabaseClient
  userId: string
}): Promise<NextResponse | null> {
  const refreshPoolOnly = searchParams.get('source') === 'refresh_pool'
  if (!refreshPoolOnly) return null

  const payload = await refreshFromMasterPool(supabase, userId)
  const depletedTypes = payload.recommendationDiagnostics?.depletedTypes || []
  const regenKey = `${userId}:depleted-refresh:${depletedTypes.sort().join(',')}`

  if (depletedTypes.length > 0 && await tryStartRegen(regenKey, FORCE_REGEN_COOLDOWN_MINUTES * 60000)) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin)

    after(async () => {
      try {
        await fetch(`${appUrl}/api/recommendations?type=all&types=${encodeURIComponent(depletedTypes.join(','))}&onboarding=1`, {
          headers: {
            'X-Service-User-Id': userId,
            'X-Service-Secret': process.env.CRON_SECRET || '',
          },
        })
      } finally {
        await finishRegen(regenKey, FORCE_REGEN_COOLDOWN_MINUTES * 60000)
      }
    })

    payload.recommendationDiagnostics = {
      ...payload.recommendationDiagnostics,
      source: payload.recommendationDiagnostics?.source || 'refresh_pool',
      backgroundRegenQueued: depletedTypes,
    }
  }

  return NextResponse.json(payload)
}
