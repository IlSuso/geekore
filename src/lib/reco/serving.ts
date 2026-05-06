import type { MediaType } from './engine-types'
import { recordRecommendationExposures, loadAllRecommendationExposureKeys, loadRecommendationExposures } from './exposure'
import { MASTER_POOL_DEPLETED_SHOWN_RATIO, MASTER_POOL_MIN_UNSEEN_ITEMS, SERVE_SIZE_PER_TYPE } from './pool'
import { composeRecommendationRails } from './rails'
import { sampleMasterPool } from './sampler'
import type { Recommendation } from './types'
import { logger } from '@/lib/logger'

type SupabaseLike = {
  from: (table: string) => any
}

type PoolMeta = {
  taste_profile?: any
  total_entries?: number
  collection_hash?: string
}

export type RecommendationDiagnostics = {
  source: string
  exposureCount?: number
  masterPoolTypes?: string[]
  masterPoolSizes?: Record<string, number>
  servedCounts?: Record<string, number>
  emptyTypes?: string[]
  depletedTypes?: string[]
  depletionStats?: Record<string, { unseenCount: number; shownRatio: number }>
  backgroundRegenQueued?: string[]
  syncRegenTypes?: string[]
  collectionHash?: string
  poolHealth?: Record<string, {
    size: number
    ageHours: number | null
    missing: boolean
    tooSmall: boolean
    expired: boolean
    invalidated: boolean
    usable: boolean
  }>
}

export type RecommendationPayload = {
  recommendations: Record<string, Recommendation[]>
  rails?: ReturnType<typeof composeRecommendationRails>
  tasteProfile: any
  cached?: boolean
  source?: string
  recommendationDiagnostics?: RecommendationDiagnostics
}

export function countRecommendations(recommendations: Record<string, Recommendation[]>) {
  return Object.fromEntries(
    Object.entries(recommendations).map(([type, items]) => [type, items.length])
  )
}

export function buildMasterPoolSizes(masterByType: Map<string, Recommendation[]>) {
  return Object.fromEntries(
    [...masterByType.entries()].map(([type, items]) => [type, items.length])
  )
}

export async function serveFromSavedPool(
  supabase: SupabaseLike,
  userId: string,
): Promise<{ payload: RecommendationPayload; cacheHeader?: string } | null> {
  // IMPORTANTE: source=pool deve leggere il pool salvato e basta.
  // Non deve ricampionare dal master_recommendations_pool, non deve registrare exposures,
  // non deve aggiornare generated_at. Altrimenti F5 cambia i titoli.
  const { data: poolRows } = await supabase
    .from('recommendations_pool')
    .select('media_type, data, taste_profile, total_entries, collection_hash, generated_at')
    .eq('user_id', userId)

  if (!poolRows || poolRows.length === 0) return null

  const recommendations: Record<string, Recommendation[]> = {}
  let tasteProfile: any = null
  let totalEntries = 0

  for (const row of poolRows) {
    const items = Array.isArray(row.data) ? row.data as Recommendation[] : []
    if (items.length > 0) recommendations[row.media_type] = items
    if (!tasteProfile && row.taste_profile) tasteProfile = row.taste_profile
    if (row.total_entries) totalEntries = Math.max(totalEntries, row.total_entries)
  }

  const hasData = Object.values(recommendations).some(items => items.length > 0)
  if (!hasData) return null

  const tasteProfileResponse = tasteProfile ? { ...tasteProfile, totalEntries } : null

  return {
    cacheHeader: 'POOL_SAVED_HIT',
    payload: {
      recommendations,
      rails: composeRecommendationRails(recommendations, tasteProfileResponse),
      tasteProfile: tasteProfileResponse,
      cached: true,
      source: 'pool',
      recommendationDiagnostics: {
        source: 'pool',
        servedCounts: countRecommendations(recommendations),
      },
    },
  }
}

export async function refreshFromMasterPool(
  supabase: SupabaseLike,
  userId: string
): Promise<RecommendationPayload> {
  const [{ data: masterRows }, { data: currentPool }] = await Promise.all([
    supabase.from('master_recommendations_pool').select('media_type, data').eq('user_id', userId),
    supabase
      .from('recommendations_pool')
      .select('media_type, taste_profile, total_entries, collection_hash')
      .eq('user_id', userId),
  ])

  if (!masterRows || masterRows.length === 0) {
    return {
      recommendations: {},
      tasteProfile: null,
      source: 'pool_empty',
      recommendationDiagnostics: { source: 'pool_empty' },
    }
  }

  const exposures = await loadRecommendationExposures(supabase, userId)
  const allShownKeys = await loadAllRecommendationExposureKeys(supabase, userId)
  const firstPoolRow = currentPool?.[0]
  const savedTasteProfile = firstPoolRow?.taste_profile || null
  const savedTotalEntries = firstPoolRow?.total_entries || 0
  const metaByType = new Map<string, PoolMeta>(
    (currentPool || []).map((row: any) => [row.media_type, row])
  )
  const recommendations: Record<string, Recommendation[]> = {}
  const poolUpserts: any[] = []
  const masterByType = new Map<string, Recommendation[]>()
  const depletedTypes: string[] = []
  const depletionStats: Record<string, { unseenCount: number; shownRatio: number }> = {}

  for (const row of masterRows) {
    if (!Array.isArray(row.data) || row.data.length === 0) continue
    const sourceItems = row.data as Recommendation[]
    masterByType.set(row.media_type, sourceItems)
    const shownCount = sourceItems.filter(item =>
      allShownKeys.has(`${row.media_type}:${item.id}`) ||
      allShownKeys.has(`${item.type || row.media_type}:${item.id}`) ||
      allShownKeys.has(`:${item.id}`)
    ).length
    const unseenCount = Math.max(0, sourceItems.length - shownCount)
    const shownRatio = sourceItems.length > 0 ? shownCount / sourceItems.length : 0
    depletionStats[row.media_type] = {
      unseenCount,
      shownRatio: Math.round(shownRatio * 1000) / 1000,
    }
    if (unseenCount < MASTER_POOL_MIN_UNSEEN_ITEMS || shownRatio >= MASTER_POOL_DEPLETED_SHOWN_RATIO) {
      depletedTypes.push(row.media_type)
    }
    const sampled = sampleMasterPool(sourceItems, { exposures, size: SERVE_SIZE_PER_TYPE })
    if (sampled.length === 0) continue
    recommendations[row.media_type] = sampled
    poolUpserts.push({
      user_id: userId,
      media_type: row.media_type,
      data: sampled,
      taste_profile: metaByType.get(row.media_type)?.taste_profile || savedTasteProfile || null,
      total_entries: metaByType.get(row.media_type)?.total_entries || savedTotalEntries,
      collection_hash: metaByType.get(row.media_type)?.collection_hash,
      generated_at: new Date().toISOString(),
    })
  }

  if (poolUpserts.length > 0) {
    await supabase.from('recommendations_pool').upsert(poolUpserts, { onConflict: 'user_id,media_type' })
  }
  await recordRecommendationExposures(supabase, userId, recommendations)

  const tasteProfileResponse = savedTasteProfile ? { ...savedTasteProfile, totalEntries: savedTotalEntries } : null
  return {
    recommendations,
    rails: composeRecommendationRails(recommendations, tasteProfileResponse),
    tasteProfile: tasteProfileResponse,
    source: 'refresh_pool',
    recommendationDiagnostics: {
      source: 'refresh_pool',
      exposureCount: exposures.length,
      masterPoolTypes: [...masterByType.keys()],
      masterPoolSizes: buildMasterPoolSizes(masterByType),
      servedCounts: countRecommendations(recommendations),
      depletedTypes,
      depletionStats,
    },
  }
}

export async function sampleAndPersistFromMasterPool(params: {
  supabase: SupabaseLike
  userId: string
  typesToFetch: MediaType[]
  masterByType: Map<string, Recommendation[]>
  exposures: Awaited<ReturnType<typeof loadRecommendationExposures>>
  collectionHash: string
  totalEntries: number
  isAlreadyOwned: (type: string, id: string, title: string) => boolean
  explorationRate?: number
}): Promise<{
  recommendations: Record<string, Recommendation[]>
  poolByType: Map<string, Recommendation[]>
  diagnostics: RecommendationDiagnostics
}> {
  const {
    supabase,
    userId,
    typesToFetch,
    masterByType,
    exposures,
    collectionHash,
    totalEntries,
    isAlreadyOwned,
    explorationRate,
  } = params

  const poolByType = new Map<string, Recommendation[]>()
  const poolUpserts: any[] = []

  for (const type of typesToFetch) {
    const masterItems = masterByType.get(type) || []
    if (masterItems.length === 0) {
      poolByType.set(type, [])
      continue
    }

    const available = masterItems.filter(item => !isAlreadyOwned(item.type, item.id, item.title))
    const poolItems = sampleMasterPool(available, {
      exposures,
      size: SERVE_SIZE_PER_TYPE,
      explorationRate,
    })

    poolByType.set(type, poolItems)
    poolUpserts.push({
      user_id: userId,
      media_type: type,
      data: poolItems,
      generated_at: new Date().toISOString(),
      collection_hash: collectionHash,
      total_entries: totalEntries,
    })
  }

  if (poolUpserts.length > 0) {
    const { error } = await supabase
      .from('recommendations_pool')
      .upsert(poolUpserts, { onConflict: 'user_id,media_type' })
    if (error) logger.error('RECO', 'recommendations_pool upsert failed', error)
  }

  const recommendations: Record<string, Recommendation[]> = {}
  for (const type of typesToFetch) {
    recommendations[type] = poolByType.get(type) || []
  }

  await recordRecommendationExposures(supabase, userId, recommendations)

  return {
    recommendations,
    poolByType,
    diagnostics: {
      source: 'full_master_sample',
      exposureCount: exposures.length,
      masterPoolTypes: [...masterByType.keys()],
      masterPoolSizes: buildMasterPoolSizes(masterByType),
      servedCounts: countRecommendations(recommendations),
      emptyTypes: typesToFetch.filter(type => (recommendations[type] || []).length === 0),
      collectionHash,
    },
  }
}
