import type { MediaType } from '../engine-types'
import type { RecommendationExposure } from '../sampler'

const NEGATIVE_ACTIONS = new Set(['not_interested', 'already_seen'])

function idFromExposureKey(key: string, type: MediaType): string | null {
  const [keyType, ...rest] = key.split(':')
  const id = rest.join(':')
  if (!id) return null
  if (keyType && keyType !== type) return null
  return id
}

export interface ExposurePolicy {
  hardBlockedIds: Set<string>
  historicalShownIds: Set<string>
  negativeIds: Set<string>
  recentShownIds: Set<string>
  diagnostics: {
    hardBlocked: number
    historicalShown: number
    negative: number
    recentShown: number
  }
}

export function buildExposurePolicyForType(
  type: MediaType,
  recentExposures: RecommendationExposure[],
  allShownKeys: Set<string>,
  options: { recentWindowDays?: number } = {}
): ExposurePolicy {
  const recentWindowDays = options.recentWindowDays ?? 21
  const recentCutoff = Date.now() - recentWindowDays * 86400000
  const historicalShownIds = new Set<string>()
  const negativeIds = new Set<string>()
  const recentShownIds = new Set<string>()

  for (const key of allShownKeys) {
    const id = idFromExposureKey(key, type)
    if (id) historicalShownIds.add(id)
  }

  for (const exposure of recentExposures) {
    if (!exposure.rec_id) continue
    if (exposure.rec_type && exposure.rec_type !== type) continue
    const shownAt = exposure.shown_at ? new Date(exposure.shown_at).getTime() : 0
    if (exposure.action && NEGATIVE_ACTIONS.has(exposure.action)) {
      negativeIds.add(exposure.rec_id)
    }
    if (shownAt >= recentCutoff) {
      recentShownIds.add(exposure.rec_id)
    }
  }

  const hardBlockedIds = new Set<string>([...negativeIds, ...recentShownIds])

  return {
    hardBlockedIds,
    historicalShownIds,
    negativeIds,
    recentShownIds,
    diagnostics: {
      hardBlocked: hardBlockedIds.size,
      historicalShown: historicalShownIds.size,
      negative: negativeIds.size,
      recentShown: recentShownIds.size,
    },
  }
}
