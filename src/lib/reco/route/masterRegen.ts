import { logger } from '@/lib/logger'
import { after } from 'next/server'
import type { MediaType, UserEntry } from '@/lib/reco/engine-types'
import type { Recommendation, TasteProfile } from '@/lib/reco/types'
import { fetchContinuityRecs } from '@/lib/reco/continuity'
import { FORCE_REGEN_COOLDOWN_MINUTES, MASTER_POOL_SIZE_PER_TYPE } from '@/lib/reco/pool'
import { finishRegen, tryStartRegen } from '@/lib/reco/regen-lock'
import { mergeStableMasterPool } from '@/lib/reco/recruitment/merge'
import { generateMasterPoolForType, type MasterGeneratorContext } from '@/lib/reco/recruitment/master-generator'
import type { SupabaseClient } from './context'

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

async function translateMasterUpsertsInBackground({
  supabase,
  userId,
  masterUpserts,
}: {
  supabase: SupabaseClient
  userId: string
  masterUpserts: any[]
}) {
  after(async () => {
    try {
      const { translateWithCache } = await import('@/lib/deepl')
      for (const upsert of masterUpserts) {
        const items = (upsert.data as Recommendation[])
          .filter((r: Recommendation) => r.description)
          .map((r: Recommendation) => ({ id: r.id, text: r.description! }))
        if (items.length === 0) continue

        const translated = await translateWithCache(items, 'IT')
        let changed = false
        for (const r of upsert.data as Recommendation[]) {
          if (r.description && translated[r.id]) {
            r.description = translated[r.id]
            changed = true
          }
        }

        if (changed) {
          await supabase.from('master_recommendations_pool').update({
            data: upsert.data,
            generated_at: upsert.generated_at,
          }).eq('user_id', userId).eq('media_type', upsert.media_type)
        }
      }
    } catch {
      // traduzione fallita — descrizioni restano in inglese
    }
  })
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

  await translateMasterUpsertsInBackground({ supabase, userId, masterUpserts })
}

export async function queueBackgroundMasterRegen({
  supabase,
  userId,
  allEntries,
  ownedIds,
  tasteProfile,
  masterGeneratorContext,
  exposurePolicyByType,
  typesToRegenBackground,
  masterByType,
  rowByType,
  collectionHash,
  totalCollectionSize,
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

  after(async () => {
    const continuityRecsForBg = (backgroundRegenTypes.includes('anime') || backgroundRegenTypes.includes('manga'))
      ? await fetchContinuityRecs(allEntries, ownedIds, tasteProfile, supabase).catch(() => [])
      : []
    const continuityByTypeBg = groupContinuityByType(continuityRecsForBg)

    for (const type of backgroundRegenTypes) {
      const regenKey = `${userId}:${type}:${collectionHash}`
      try {
        const bgMinScore = (type === 'manga' || type === 'boardgame') ? 30 : 40
        const generated = await generateMasterPoolForType({
          type,
          context: masterGeneratorContext,
          exposurePolicy: exposurePolicyByType.get(type),
          continuityRecs: continuityByTypeBg.get(type) || [],
          previousItems: masterByType.get(type) || [],
          wasInvalidated: rowByType.get(type)?.collection_size === -1,
          minScore: bgMinScore,
        })

        if (!generated.items.length) continue

        await supabase.from('master_recommendations_pool').upsert({
          user_id: userId,
          media_type: type,
          data: generated.items,
          collection_hash: collectionHash,
          collection_size: totalCollectionSize,
          generated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,media_type' })
      } catch {
        // ignora errori singoli tipi: non blocca gli altri
      } finally {
        await finishRegen(regenKey, FORCE_REGEN_COOLDOWN_MINUTES * 60000)
      }
    }
  })

  return backgroundRegenTypes
}
