import { logger } from '@/lib/logger'
import type { MediaType, UserEntry } from '@/lib/reco/engine-types'
import type { Recommendation, TasteProfile } from '@/lib/reco/types'
import { fetchContinuityRecs } from '@/lib/reco/continuity'
import { FORCE_REGEN_COOLDOWN_MINUTES, MASTER_POOL_SIZE_PER_TYPE } from '@/lib/reco/pool'
import { finishRegen, tryStartRegen } from '@/lib/reco/regen-lock'
import { enqueueRegenJob } from '@/lib/reco/regen-jobs'
import { mergeStableMasterPool } from '@/lib/reco/recruitment/merge'
import { generateMasterPoolForType, type MasterGeneratorContext } from '@/lib/reco/recruitment/master-generator'
import type { SupabaseClient } from './context'
import type { Locale } from '@/lib/i18n/serverLocale'
import { persistLocaleAssetsForRecommendationItems } from '@/lib/i18n/masterPoolLocaleAssets'

type RegenBaseArgs = {
  supabase: SupabaseClient
  userId: string
  allEntries: UserEntry[]
  ownedIds: Set<string>
  tasteProfile: TasteProfile
  masterGeneratorContext: MasterGeneratorContext
  exposurePolicyByType: Map<string, any>
  masterByType: Map<string, Recommendation[]>
  rowByType: Map<any, any>
  recruitmentDiagnostics: Record<string, any>
  collectionHash: string
  totalCollectionSize: number
  locale: Locale
  includeAlternateLocaleAssets?: boolean
}

function groupContinuityByType(continuityRecs: Recommendation[]) {
  const continuityByType = new Map<string, Recommendation[]>()
  for (const contRec of continuityRecs) {
    const arr = continuityByType.get(contRec.type) || []
    arr.push(contRec)
    continuityByType.set(contRec.type, arr)
  }
  return continuityByType
}

export async function regenerateMasterPoolSync({
  supabase,
  userId,
  allEntries,
  ownedIds,
  tasteProfile,
  masterGeneratorContext,
  exposurePolicyByType,
  typesNeedingMasterRegen,
  masterByType,
  rowByType,
  recruitmentDiagnostics,
  collectionHash,
  totalCollectionSize,
  locale,
  includeAlternateLocaleAssets = false,
}: RegenBaseArgs & {
  typesNeedingMasterRegen: MediaType[]
}) {
  if (typesNeedingMasterRegen.length === 0) return

  const continuityRecs = (typesNeedingMasterRegen.includes('anime') || typesNeedingMasterRegen.includes('manga'))
    ? await fetchContinuityRecs(allEntries, ownedIds, tasteProfile, supabase)
    : []
  const continuityByType = groupContinuityByType(continuityRecs)

  const masterResults = await Promise.all(
    typesNeedingMasterRegen.map(type => generateMasterPoolForType({
      type,
      context: masterGeneratorContext,
      exposurePolicy: exposurePolicyByType.get(type),
      continuityRecs: continuityByType.get(type) || [],
      previousItems: masterByType.get(type) || [],
      wasInvalidated: rowByType.get(type)?.collection_size === -1,
    }))
  )

  const masterUpserts: any[] = []
  for (const result of masterResults) {
    if (!result?.type || !result.items.length) continue
    const type = result.type as MediaType
    recruitmentDiagnostics[type] = result.diagnostics || {}

    const tierDiag = result.diagnostics.tier
    if (tierDiag) {
      logger.info('RECO', 'tier diagnostics', {
        type,
        strength: tierDiag.profileStrength.toFixed(2),
        tierCounts: tierDiag.tierCounts,
        thresholds: tierDiag.adaptiveThresholds,
      })
    }

    let allItems = result.items
    const previousItems = masterByType.get(type) || []
    const wasInvalidated = rowByType.get(type)?.collection_size === -1

    if (!wasInvalidated && previousItems.length > allItems.length) {
      const { items: mergedItems, diagnostics: mergeDiag } = mergeStableMasterPool(allItems, previousItems, MASTER_POOL_SIZE_PER_TYPE)
      recruitmentDiagnostics[type] = { ...recruitmentDiagnostics[type], merge: mergeDiag }

      if (mergedItems.length <= previousItems.length && allItems.every(item => previousItems.some(prev => prev.id === item.id))) {
        logger.warn('RECO', 'low-yield master regen skipped', {
          type,
          newItems: allItems.length,
          previousItems: previousItems.length,
        })
        continue
      }

      logger.info('RECO', 'low-yield master regen merged', {
        type,
        newItems: allItems.length,
        previousItems: previousItems.length,
        mergedItems: mergedItems.length,
      })
      allItems = mergedItems
    }

    masterByType.set(type, allItems)
    logger.info('RECO', 'master result', {
      type,
      items: result.items.length,
      allItems: allItems.length,
    })

    masterUpserts.push({
      user_id: userId,
      media_type: type,
      data: allItems,
      collection_hash: collectionHash,
      collection_size: totalCollectionSize,
      generated_at: new Date().toISOString(),
    })
  }

  logger.info('RECO', 'master results', {
    length: masterResults.length,
    types: masterResults.map(r => `${r?.type}:${r?.items?.length ?? 'null'}`),
  })

  if (masterUpserts.length === 0) {
    logger.warn('RECO', 'masterUpserts empty')
    return
  }

  logger.info('RECO', 'upserting master pool', {
    rows: masterUpserts.map(u => `${u.media_type}:${u.data.length}items:size${u.collection_size}`),
  })

  const { error: upsertError, data: upsertData } = await supabase.from('master_recommendations_pool')
    .upsert(masterUpserts, { onConflict: 'user_id,media_type' })
    .select('media_type, collection_size, generated_at')

  if (upsertError) logger.error('RECO', 'master pool upsert failed', upsertError)
  else logger.info('RECO', 'master pool upsert succeeded', {
    rows: upsertData?.map(r => `${r.media_type}:${r.collection_size}`),
  })


  const generatedItems = masterUpserts.flatMap(upsert => Array.isArray(upsert.data) ? upsert.data : [])
  await persistLocaleAssetsForRecommendationItems(generatedItems, locale, {
    maxSyncTranslations: generatedItems.length,
    maxSyncTitles: Math.min(generatedItems.length, 240),
  }).catch(error => logger.warn('RECO', 'active locale asset import failed', { locale, error: String(error) }))

  if (includeAlternateLocaleAssets) {
    const alternate = locale === 'it' ? 'en' : 'it'
    await persistLocaleAssetsForRecommendationItems(generatedItems, alternate, {
      maxSyncTranslations: generatedItems.length,
      maxSyncTitles: Math.min(generatedItems.length, 240),
    }).catch(error => logger.warn('RECO', 'alternate locale asset import failed', { locale: alternate, error: String(error) }))
  }
}


export async function queueBackgroundMasterRegen({
  userId,
  typesToRegenBackground,
  collectionHash,
}: RegenBaseArgs & {
  typesToRegenBackground: MediaType[]
}) {
  const backgroundRegenTypes: MediaType[] = []
  for (const type of typesToRegenBackground) {
    if (await tryStartRegen(`${userId}:${type}:${collectionHash}`)) {
      backgroundRegenTypes.push(type)
    }
  }

  if (backgroundRegenTypes.length === 0) return backgroundRegenTypes

  const enqueued = await enqueueRegenJob({
    userId,
    mediaTypes: backgroundRegenTypes,
    forceRefresh: true,
    reason: 'background-master',
  })

  if (!enqueued) {
    await Promise.all(
      backgroundRegenTypes.map(type =>
        finishRegen(`${userId}:${type}:${collectionHash}`, FORCE_REGEN_COOLDOWN_MINUTES * 60000),
      ),
    )
    return []
  }

  return backgroundRegenTypes
}
