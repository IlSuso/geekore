// DESTINAZIONE: src/app/api/recommendations/route.ts
// TASTE ENGINE V5 — route orchestrator.
// Heavy route logic is extracted under src/lib/reco/route/*.

export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkOrigin } from '@/lib/csrf'
import { memCacheGet, memCacheSet, memCacheInvalidate } from '@/lib/reco/cache'
import type { MediaType } from '@/lib/reco/engine-types'
import { composeRecommendationRails } from '@/lib/reco/rails'
import { sampleAndPersistFromMasterPool } from '@/lib/reco/serving'
import type { MasterGeneratorContext } from '@/lib/reco/recruitment/master-generator'
import { resolveRecommendationContext } from '@/lib/reco/route/context'
import { handlePoolOnlyFastPath, handleRefreshPoolFastPath } from '@/lib/reco/route/fastPaths'
import { loadRecommendationInputs } from '@/lib/reco/route/inputs'
import { buildOwnedContext, selectTypesToFetch } from '@/lib/reco/route/owned'
import { loadExposurePolicies } from '@/lib/reco/route/exposure'
import { loadSocialFavorites } from '@/lib/reco/route/social'
import { loadMasterPoolState } from '@/lib/reco/route/masterState'
import { regenerateMasterPoolSync, queueBackgroundMasterRegen } from '@/lib/reco/route/masterRegen'
import {
  buildPoolHealthDiagnostics,
  buildTasteProfileResponse,
  persistCreatorProfile,
  updateRecommendationPoolProfile,
} from '@/lib/reco/route/response'

export async function GET(request: NextRequest) {
  try {
    const context = await resolveRecommendationContext(request)
    if (context.response) return context.response

    const { searchParams, supabase, userId, isServiceCall } = context

    const requestedType = searchParams.get('type') || 'all'
    const forceRefresh = searchParams.get('refresh') === '1'
    const similarToId = searchParams.get('similar_to_id') || null
    const isOnboardingCall = searchParams.get('onboarding') === '1'
    const onboardingTypes = searchParams.get('types')?.split(',').filter(Boolean) as MediaType[] | undefined

    const poolOnlyResponse = await handlePoolOnlyFastPath({ searchParams, forceRefresh, supabase, userId })
    if (poolOnlyResponse) return poolOnlyResponse

    const refreshPoolResponse = await handleRefreshPoolFastPath({ request, searchParams, supabase, userId })
    if (refreshPoolResponse) return refreshPoolResponse

    if (!forceRefresh && !similarToId && !isServiceCall) {
      const memHit = memCacheGet(userId)
      if (memHit) {
        const recs = requestedType === 'all'
          ? memHit.data
          : { [requestedType]: memHit.data[requestedType] || [] }

        if (requestedType !== 'all') {
          return NextResponse.json({
            recommendations: recs,
            rails: composeRecommendationRails(recs, memHit.tasteProfile),
            tasteProfile: memHit.tasteProfile,
            cached: true,
          }, { headers: { 'X-Cache': 'MEM_HIT' } })
        }

        const types = Object.keys(recs).filter(k => Array.isArray(recs[k]) && recs[k].length > 0)
        if (types.length >= 1) {
          return NextResponse.json({
            recommendations: recs,
            rails: composeRecommendationRails(recs, memHit.tasteProfile),
            tasteProfile: memHit.tasteProfile,
            cached: true,
          }, { headers: { 'X-Cache': 'MEM_HIT' } })
        }
      }
    }

    const inputs = await loadRecommendationInputs(supabase, userId)
    const {
      allEntries,
      lastCollectionUpdate,
      wishlistRaw,
      wishlistItems,
      userPlatformIds,
      tasteProfile,
    } = inputs

    const { ownedIds, isAlreadyOwned } = buildOwnedContext(allEntries, wishlistRaw, wishlistItems)

    const typesToFetch = selectTypesToFetch({
      requestedType,
      isOnboardingCall,
      onboardingTypes,
      allEntries,
      wishlistItems,
    })

    const {
      recommendationExposures,
      allShownKeys,
      exposurePolicyByType,
      recruitmentDiagnostics,
    } = await loadExposurePolicies(supabase, userId, typesToFetch)

    const socialFavorites = await loadSocialFavorites(supabase, userId, ownedIds)

    const masterState = await loadMasterPoolState({
      supabase,
      userId,
      typesToFetch,
      allEntries,
      lastCollectionUpdate,
      allShownKeys,
      forceRefresh,
      isServiceCall,
      searchParams,
    })

    const {
      masterByType,
      rowByType,
      masterHealthByType,
      typesNeedingMasterRegen,
      typesToRegenBackground,
      collectionHash,
      totalCollectionSize,
      entriesByType,
    } = masterState

    const masterGeneratorContext: MasterGeneratorContext = {
      supabase,
      ownedIds,
      tasteProfile,
      tmdbToken: process.env.TMDB_API_KEY || '',
      igdbClientId: process.env.IGDB_CLIENT_ID || '',
      igdbClientSecret: process.env.IGDB_CLIENT_SECRET || '',
      isAlreadyOwned,
      socialFavorites,
      userPlatformIds,
    }

    await regenerateMasterPoolSync({
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
    })

    const backgroundRegenTypes = await queueBackgroundMasterRegen({
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
      recruitmentDiagnostics,
      collectionHash,
      totalCollectionSize,
    })

    const {
      recommendations,
      poolByType,
      diagnostics: servingDiagnostics,
    } = await sampleAndPersistFromMasterPool({
      supabase,
      userId,
      typesToFetch,
      masterByType,
      exposures: recommendationExposures,
      collectionHash,
      totalEntries: allEntries.length,
      isAlreadyOwned,
    })

    persistCreatorProfile(supabase, userId, tasteProfile)

    const tasteProfileResponse = buildTasteProfileResponse(tasteProfile)
    memCacheSet(userId, recommendations, tasteProfile)

    updateRecommendationPoolProfile({
      supabase,
      userId,
      recommendations,
      poolByType,
      collectionHash,
      tasteProfileResponse,
      totalEntries: allEntries.length,
    })

    return NextResponse.json({
      recommendations,
      rails: composeRecommendationRails(recommendations, tasteProfile),
      tasteProfile: {
        ...tasteProfileResponse,
        lowConfidence: tasteProfile.lowConfidence,
        totalEntries: allEntries.length,
      },
      cached: false,
      recommendationDiagnostics: {
        ...servingDiagnostics,
        backgroundRegenQueued: backgroundRegenTypes,
        syncRegenTypes: typesNeedingMasterRegen,
        recruitment: recruitmentDiagnostics,
        poolHealth: buildPoolHealthDiagnostics({ masterHealthByType, rowByType, masterByType, allShownKeys }),
        entriesByType: Object.fromEntries(entriesByType),
      },
    }, { headers: { 'X-Cache': 'MISS' } })
  } catch (err) {
    console.error('[Recommendations] error:', err)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!checkOrigin(request)) return NextResponse.json({ ok: false }, { status: 403 })

    const invalidateCache = request.nextUrl.searchParams.get('invalidateCache')
    if (invalidateCache !== 'true') return NextResponse.json({ ok: false }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    memCacheInvalidate(user.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
