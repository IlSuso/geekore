import type { MediaType } from '../engine-types'
import {
  fetchAnimeRecs,
  fetchBoardgameRecs,
  fetchGameRecs,
  fetchMangaRecs,
  fetchMovieRecs,
  fetchTvRecs,
} from '../fetchers'
import { MASTER_POOL_SIZE_PER_TYPE } from '../pool'
import { buildTieredPool } from '../pool-builder'
import type { Recommendation, TasteProfile } from '../types'
import type { ExposurePolicy } from './exposure-policy'
import { fetchCatalogBackfillCandidates } from './catalog-backfill'
import { mergeStableMasterPool, type StableMergeDiagnostics } from './merge'
import { buildRecruitmentSlots, type RecruitmentSlotPlan } from './planner'

export type IsAlreadyOwned = (type: string, id: string, title: string) => boolean

export interface MasterGeneratorContext {
  supabase?: { from: (table: string) => any }
  ownedIds: Set<string>
  tasteProfile: TasteProfile
  tmdbToken: string
  igdbClientId: string
  igdbClientSecret: string
  isAlreadyOwned: IsAlreadyOwned
  socialFavorites: Map<string, string>
  userPlatformIds: number[]
}

export interface GeneratedMasterPool {
  type: MediaType
  items: Recommendation[]
  diagnostics: {
    slotPlan: RecruitmentSlotPlan['diagnostics']
    exposure?: ExposurePolicy['diagnostics']
    rawCandidates: number
    catalogCandidates?: number
    rawUnseenCandidates?: number
    tierUnseenCandidates?: number
    finalUnseenCandidates?: number
    tier?: ReturnType<typeof buildTieredPool>['diagnostics']
    merge?: StableMergeDiagnostics
    continuityCount: number
    finalCount: number
    skippedBecauseNoSlots?: boolean
  }
}

async function fetchCandidatesForType(
  type: MediaType,
  slots: RecruitmentSlotPlan['slots'],
  exposurePolicy: ExposurePolicy | undefined,
  context: MasterGeneratorContext
): Promise<Recommendation[]> {
  const blockedShownIds = exposurePolicy?.hardBlockedIds || new Set<string>()
  const {
    ownedIds,
    tasteProfile,
    tmdbToken,
    igdbClientId,
    igdbClientSecret,
    isAlreadyOwned,
    socialFavorites,
    userPlatformIds,
  } = context

  switch (type) {
    case 'anime':
      return fetchAnimeRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, blockedShownIds, socialFavorites)
    case 'manga':
      return fetchMangaRecs(slots, ownedIds, tasteProfile, isAlreadyOwned, blockedShownIds, socialFavorites)
    case 'movie':
      return fetchMovieRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, blockedShownIds, socialFavorites, userPlatformIds)
    case 'tv':
      return fetchTvRecs(slots, ownedIds, tasteProfile, tmdbToken, isAlreadyOwned, blockedShownIds, socialFavorites, userPlatformIds)
    case 'game':
      return fetchGameRecs(slots, ownedIds, tasteProfile, igdbClientId, igdbClientSecret, isAlreadyOwned, blockedShownIds)
    case 'boardgame':
      return fetchBoardgameRecs(slots, ownedIds, tasteProfile, isAlreadyOwned, blockedShownIds, context.supabase)
  }
}

export async function generateMasterPoolForType(options: {
  type: MediaType
  context: MasterGeneratorContext
  exposurePolicy?: ExposurePolicy
  continuityRecs?: Recommendation[]
  previousItems?: Recommendation[]
  wasInvalidated?: boolean
  minScore?: number
  targetSize?: number
}): Promise<GeneratedMasterPool> {
  const {
    type,
    context,
    exposurePolicy,
    continuityRecs = [],
    previousItems = [],
    wasInvalidated = false,
    minScore,
    targetSize = MASTER_POOL_SIZE_PER_TYPE,
  } = options

  const slotPlan = buildRecruitmentSlots(type, context.tasteProfile, targetSize)
  if (slotPlan.slots.length === 0) {
    return {
      type,
      items: [],
      diagnostics: {
        slotPlan: slotPlan.diagnostics,
        exposure: exposurePolicy?.diagnostics,
        rawCandidates: 0,
        continuityCount: continuityRecs.length,
        finalCount: 0,
        skippedBecauseNoSlots: true,
      },
    }
  }

  const rawCandidates = await fetchCandidatesForType(type, slotPlan.slots, exposurePolicy, context)
  const catalogCandidates = await fetchCatalogBackfillCandidates({
    supabase: context.supabase,
    type,
    tasteProfile: context.tasteProfile,
    isAlreadyOwned: context.isAlreadyOwned,
    exposurePolicy,
    existingItems: rawCandidates,
    targetSize,
  }).catch(() => [])
  const historicalShownIds = exposurePolicy?.historicalShownIds || new Set<string>()
  const isHistoricallyUnseen = (rec: Recommendation) => !historicalShownIds.has(rec.id)
  const continuityIds = new Set(continuityRecs.map(rec => rec.id))
  const candidates = [...rawCandidates, ...catalogCandidates].filter(rec => !continuityIds.has(rec.id))
  const { items: tieredItems, diagnostics: tier } = buildTieredPool(
    candidates,
    type,
    context.tasteProfile,
    targetSize
  )

  let items = [
    ...continuityRecs,
    ...tieredItems.filter(rec => !continuityIds.has(rec.id)),
  ]

  if (minScore !== undefined) {
    items = items.filter(rec => rec.isContinuity || rec.matchScore >= minScore)
  }

  let merge: StableMergeDiagnostics | undefined
  if (!wasInvalidated && previousItems.length > items.length) {
    const merged = mergeStableMasterPool(items, previousItems, targetSize)
    items = merged.items
    merge = merged.diagnostics
  }

  return {
    type,
    items,
    diagnostics: {
      slotPlan: slotPlan.diagnostics,
      exposure: exposurePolicy?.diagnostics,
      rawCandidates: rawCandidates.length,
      catalogCandidates: catalogCandidates.length,
      rawUnseenCandidates: rawCandidates.filter(isHistoricallyUnseen).length,
      tierUnseenCandidates: tieredItems.filter(isHistoricallyUnseen).length,
      finalUnseenCandidates: items.filter(isHistoricallyUnseen).length,
      tier,
      merge,
      continuityCount: continuityRecs.length,
      finalCount: items.length,
    },
  }
}
