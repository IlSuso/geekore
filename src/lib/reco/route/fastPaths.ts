import { NextResponse } from 'next/server'
import { FORCE_REGEN_COOLDOWN_MINUTES } from '@/lib/reco/pool'
import { finishRegen, tryStartRegen } from '@/lib/reco/regen-lock'
import { enqueueRegenJob } from '@/lib/reco/regen-jobs'
import { refreshFromMasterPool, serveFromSavedPool } from '@/lib/reco/serving'
import type { SupabaseClient } from './context'
import type { Locale } from '@/lib/i18n/serverLocale'
import type { MediaType } from '@/lib/reco/engine-types'
import { localizeRecommendationPayload } from '@/lib/i18n/recommendationLocale'

export async function handlePoolOnlyFastPath({
  searchParams,
  forceRefresh,
  supabase,
  userId,
  locale,
}: {
  searchParams: URLSearchParams
  forceRefresh: boolean
  supabase: SupabaseClient
  userId: string
  locale: Locale
}): Promise<NextResponse | null> {
  const poolOnly = searchParams.get('source') === 'pool'
  if (!poolOnly || forceRefresh) return null

  const served = await serveFromSavedPool(supabase, userId)
  if (served) {
    return NextResponse.json(await localizeRecommendationPayload(served.payload, locale, {
      // source=pool deve essere un fast path puro: legge il pool già preparato
      // e NON deve riaprire TMDB/AniList/BGG per ufficializzare titoli/cover.
      maxSyncTitles: 0,
      maxSyncTranslations: 0,
    }), {
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
  searchParams,
  supabase,
  userId,
  locale,
}: {
  searchParams: URLSearchParams
  supabase: SupabaseClient
  userId: string
  locale: Locale
}): Promise<NextResponse | null> {
  const refreshPoolOnly = searchParams.get('source') === 'refresh_pool'
  if (!refreshPoolOnly) return null

  const payload = await refreshFromMasterPool(supabase, userId)
  const depletedTypes = payload.recommendationDiagnostics?.depletedTypes || []
  const regenKey = `${userId}:depleted-refresh:${depletedTypes.sort().join(',')}`

  if (depletedTypes.length > 0 && await tryStartRegen(regenKey, FORCE_REGEN_COOLDOWN_MINUTES * 60000)) {
    const enqueued = await enqueueRegenJob({
      userId,
      mediaTypes: depletedTypes as MediaType[],
      forceRefresh: true,
      reason: 'depleted-refresh',
    })
    if (!enqueued) await finishRegen(regenKey, FORCE_REGEN_COOLDOWN_MINUTES * 60000)

    payload.recommendationDiagnostics = {
      ...payload.recommendationDiagnostics,
      source: payload.recommendationDiagnostics?.source || 'refresh_pool',
      backgroundRegenQueued: enqueued ? depletedTypes : [],
    }
  }

  return NextResponse.json(await localizeRecommendationPayload(payload, locale, {
    maxSyncTitles: 0,
    maxSyncTranslations: 0,
  }))
}
