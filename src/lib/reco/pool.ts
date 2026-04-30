export const MASTER_POOL_SIZE_PER_TYPE = 200
export const MASTER_POOL_MIN_HEALTHY_SIZE = 80
export const MASTER_POOL_MAX_AGE_DAYS = 7
export const SERVE_SIZE_PER_TYPE = 20
export const FORCE_REGEN_COOLDOWN_MINUTES = 30
export const MASTER_POOL_MIN_UNSEEN_ITEMS = 50
export const MASTER_POOL_DEPLETED_SHOWN_RATIO = 0.75

export function computeRegenDelta(totalEntries: number): number {
  if (totalEntries <= 50) return 5
  if (totalEntries <= 100) return 10
  if (totalEntries <= 150) return 15
  return 20
}

export function computePoolTTL(entries: Array<{ created_at?: string | null }>): number {
  const twelveHoursAgo = Date.now() - 12 * 3600000
  const recentAdds = entries.filter(entry =>
    entry.created_at && new Date(entry.created_at).getTime() > twelveHoursAgo
  ).length

  return Math.max(4, Math.min(48, 24 - recentAdds * 2))
}
