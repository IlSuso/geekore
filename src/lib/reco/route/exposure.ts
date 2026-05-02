import type { MediaType } from '@/lib/reco/engine-types'
import { loadAllRecommendationExposureKeys, loadRecommendationExposures } from '@/lib/reco/exposure'
import { buildExposurePolicyForType } from '@/lib/reco/recruitment/exposure-policy'
import type { SupabaseClient } from './context'

export async function loadExposurePolicies(
  supabase: SupabaseClient,
  userId: string,
  typesToFetch: MediaType[],
) {
  const [recommendationExposures, allShownKeys] = await Promise.all([
    loadRecommendationExposures(supabase, userId, 45),
    loadAllRecommendationExposureKeys(supabase, userId),
  ])

  const exposurePolicyByType = new Map(
    typesToFetch.map(type => [
      type,
      buildExposurePolicyForType(type, recommendationExposures, allShownKeys),
    ])
  )

  const recruitmentDiagnostics: Record<string, any> = {}

  return {
    recommendationExposures,
    allShownKeys,
    exposurePolicyByType,
    recruitmentDiagnostics,
  }
}
