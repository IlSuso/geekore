import type { MediaType, UserEntry } from '@/lib/reco/engine-types'
import type { Recommendation } from '@/lib/reco/types'
import {
  FORCE_REGEN_COOLDOWN_MINUTES,
  MASTER_POOL_DEPLETED_SHOWN_RATIO,
  MASTER_POOL_MAX_AGE_DAYS,
  MASTER_POOL_MIN_HEALTHY_SIZE,
  MASTER_POOL_MIN_UNSEEN_ITEMS,
  computePoolTTL,
  computeRegenDelta,
} from '@/lib/reco/pool'
import type { SupabaseClient } from './context'

export type MasterHealth = {
  missing: boolean
  tooSmall: boolean
  expired: boolean
  invalidated: boolean
  depleted: boolean
  usable: boolean
  unseenCount: number
  shownRatio: number
}

export async function loadMasterPoolState({
  supabase,
  userId,
  typesToFetch,
  allEntries,
  lastCollectionUpdate,
  allShownKeys,
  forceRefresh,
  isServiceCall,
  searchParams,
}: {
  supabase: SupabaseClient
  userId: string
  typesToFetch: MediaType[]
  allEntries: UserEntry[]
  lastCollectionUpdate: Date
  allShownKeys: Set<string>
  forceRefresh: boolean
  isServiceCall: boolean
  searchParams: URLSearchParams
}) {
  // Kept for parity with the original route: this query warms/validates the saved pool context.
  const dynamicTTL = computePoolTTL(allEntries)
  void dynamicTTL
  await supabase
    .from('recommendations_pool')
    .select('media_type, data, generated_at, collection_hash')
    .eq('user_id', userId)
    .in('media_type', typesToFetch)

  const collectionHash = `${allEntries.length}_${lastCollectionUpdate.getTime()}`

  const entriesByType = new Map<string, number>()
  for (const type of typesToFetch) {
    entriesByType.set(type, allEntries.filter((e: any) => e.type === type).length)
  }

  const masterPoolCutoff = new Date(Date.now() - MASTER_POOL_MAX_AGE_DAYS * 24 * 3600 * 1000).toISOString()

  const { data: masterPoolRows } = await supabase
    .from('master_recommendations_pool')
    .select('media_type, data, collection_hash, collection_size, generated_at')
    .eq('user_id', userId)
    .in('media_type', typesToFetch)

  const masterByType = new Map<string, Recommendation[]>()
  for (const row of (masterPoolRows || [])) {
    if (Array.isArray(row.data)) masterByType.set(row.media_type, row.data as Recommendation[])
  }

  const totalCollectionSize = allEntries.length
  const regenDelta = computeRegenDelta(totalCollectionSize)
  const savedTotalSize = (masterPoolRows || [])[0]?.collection_size || 0
  const totalHasGrown = totalCollectionSize - savedTotalSize >= regenDelta
  const rowByType = new Map((masterPoolRows || []).map((row: any) => [row.media_type, row]))

  const masterHealthByType = new Map<string, MasterHealth>()
  for (const type of typesToFetch) {
    const items = masterByType.get(type) || []
    const row = rowByType.get(type)
    const generatedAt = row?.generated_at ? new Date(row.generated_at).getTime() : 0
    const ageHours = generatedAt ? (Date.now() - generatedAt) / 3600000 : Infinity
    const shownCount = items.filter(item =>
      allShownKeys.has(`${type}:${item.id}`) || allShownKeys.has(`${item.type || type}:${item.id}`) || allShownKeys.has(`:${item.id}`)
    ).length
    const unseenCount = Math.max(0, items.length - shownCount)
    const shownRatio = items.length > 0 ? shownCount / items.length : 0

    masterHealthByType.set(type, {
      missing: !row || items.length === 0,
      tooSmall: !!row && items.length > 0 && items.length < MASTER_POOL_MIN_HEALTHY_SIZE && ageHours >= 24,
      expired: !!row && (!row.generated_at || new Date(row.generated_at).getTime() < new Date(masterPoolCutoff).getTime()),
      invalidated: row?.collection_size === -1,
      depleted: !!row && items.length > 0 && (unseenCount < MASTER_POOL_MIN_UNSEEN_ITEMS || shownRatio >= MASTER_POOL_DEPLETED_SHOWN_RATIO),
      usable: !!row && items.length > 0 && row?.collection_size !== -1,
      unseenCount,
      shownRatio,
    })
  }

  const typesNeedingMasterRegen: MediaType[] = []
  const typesToRegenBackground: MediaType[] = []

  if (forceRefresh) {
    const canBypassForceCooldown = isServiceCall && searchParams.get('bypass_cooldown') === '1'
    for (const type of typesToFetch) {
      const health = masterHealthByType.get(type)
      const row = rowByType.get(type)
      const generatedAt = row?.generated_at ? new Date(row.generated_at).getTime() : 0
      const ageMinutes = generatedAt ? (Date.now() - generatedAt) / 60000 : Infinity
      if (!health || health.missing || health.invalidated || canBypassForceCooldown || ageMinutes >= FORCE_REGEN_COOLDOWN_MINUTES) {
        typesNeedingMasterRegen.push(type as MediaType)
      }
    }
  } else {
    for (const type of typesToFetch) {
      const health = masterHealthByType.get(type)
      if (!health) continue
      if (health.missing || health.invalidated) typesNeedingMasterRegen.push(type as MediaType)
      else if (health.usable && (health.tooSmall || health.expired || health.depleted || totalHasGrown)) typesToRegenBackground.push(type as MediaType)
    }
  }

  return {
    masterByType,
    rowByType,
    masterHealthByType,
    typesNeedingMasterRegen,
    typesToRegenBackground,
    collectionHash,
    totalCollectionSize,
    entriesByType,
  }
}
