import type { Recommendation } from './types'

export interface RecommendationExposure {
  rec_id: string
  rec_type?: string
  shown_at?: string
  action?: string | null
}

interface SampleOptions {
  exposures?: RecommendationExposure[]
  size?: number
  now?: Date
  explorationRate?: number
}

type ScoredCandidate = Recommendation & {
  _weight: number
  _lastShownMs: number | null
  _action: string | null
}

type TierQuota = {
  high: number
  mid: number
  low: number
}

const DEFAULT_SIZE = 20
const HARD_COOLDOWN_HOURS = 48   // titoli visti nelle ultime 48h non riappaiono
const SOFT_MEMORY_DAYS = 7       // dopo 7gg il peso torna pieno (era 14 — troppo lento)
const MAX_PRIMARY_GENRE_PER_BATCH = 4
const RECENT_GENRE_MEMORY_DAYS = 2

function exposureKey(type: string | undefined, id: string) {
  return `${type || ''}:${id}`
}

function buildExposureMap(exposures: RecommendationExposure[] = []) {
  const map = new Map<string, RecommendationExposure>()
  for (const exposure of exposures) {
    if (!exposure.rec_id) continue
    const key = exposureKey(exposure.rec_type, exposure.rec_id)
    const current = map.get(key) || map.get(exposureKey(undefined, exposure.rec_id))
    if (!current || new Date(exposure.shown_at || 0) > new Date(current.shown_at || 0)) {
      map.set(key, exposure)
      map.set(exposureKey(undefined, exposure.rec_id), exposure)
    }
  }
  return map
}

function scoreCandidate(item: Recommendation, exposure: RecommendationExposure | undefined, nowMs: number): ScoredCandidate {
  const action = exposure?.action || null
  const shownAtMs = exposure?.shown_at ? new Date(exposure.shown_at).getTime() : NaN
  const lastShownMs = Number.isFinite(shownAtMs) ? shownAtMs : null
  const ageDays = lastShownMs ? Math.max(0, (nowMs - lastShownMs) / 86400000) : null

  const match = Math.max(40, Math.min(100, item.matchScore || 40))
  const matchWeight = Math.pow(match / 100, 2.2)
  const qualityWeight = item.score ? 0.9 + Math.min(0.25, item.score / 25) : 1
  const discoveryWeight = item.isDiscovery || item.isSerendipity ? 1.1 : 1
  const continuityWeight = item.isContinuity ? 1.25 : 1
  const freshnessWeight = item.isSeasonal || item.isAwardWinner ? 1.08 : 1

  let exposureWeight = 1
  if (ageDays !== null) {
    if (ageDays < HARD_COOLDOWN_HOURS / 24) exposureWeight = 0
    else exposureWeight = 0.22 + Math.min(0.78, ageDays / SOFT_MEMORY_DAYS)
  }

  if (action === 'already_seen' || action === 'not_interested') exposureWeight = 0
  if (action === 'dismissed') exposureWeight *= 0.25

  return {
    ...item,
    _weight: Math.max(0, matchWeight * qualityWeight * discoveryWeight * continuityWeight * freshnessWeight * exposureWeight),
    _lastShownMs: lastShownMs,
    _action: action,
  }
}

function diversityWeight(candidate: ScoredCandidate, selected: Recommendation[]) {
  const primaryGenre = candidate.genres?.[0]
  if (!primaryGenre) return 1

  const samePrimary = selected.filter(item => item.genres?.[0] === primaryGenre).length
  if (samePrimary >= MAX_PRIMARY_GENRE_PER_BATCH) return 0.08
  if (samePrimary >= 2) return 0.45

  const selectedGenres = new Set(selected.flatMap(item => item.genres || []))
  const overlap = (candidate.genres || []).filter(genre => selectedGenres.has(genre)).length
  if (overlap >= 3) return 0.55
  if (overlap >= 2) return 0.75
  return 1
}

function buildRecentGenreCounts(scored: ScoredCandidate[], nowMs: number) {
  const counts = new Map<string, number>()
  for (const item of scored) {
    if (!item._lastShownMs || nowMs - item._lastShownMs >= RECENT_GENRE_MEMORY_DAYS * 86400000) continue
    for (const genre of (item.genres || []).slice(0, 3)) {
      counts.set(genre, (counts.get(genre) || 0) + 1)
    }
  }
  return counts
}

function recentGenrePenalty(candidate: ScoredCandidate, recentGenreCounts: Map<string, number>) {
  const genres = candidate.genres || []
  if (genres.length === 0) return 1
  let penalty = 1
  for (const genre of genres.slice(0, 3)) {
    const recentCount = recentGenreCounts.get(genre) || 0
    if (recentCount >= 8) penalty *= 0.72
    else if (recentCount >= 4) penalty *= 0.84
  }
  return penalty
}

function weightedPick(candidates: ScoredCandidate[], selected: Recommendation[], recentGenreCounts: Map<string, number>, explorationRate: number) {
  const exploratory = Math.random() < explorationRate
  const weighted = candidates.map(candidate => ({
    candidate,
    weight: (
      exploratory
        ? Math.sqrt(Math.max(candidate._weight, 0.0001))
        : candidate._weight
    ) * diversityWeight(candidate, selected) * recentGenrePenalty(candidate, recentGenreCounts) * (0.85 + Math.random() * 0.3),
  })).filter(item => item.weight > 0)

  if (weighted.length === 0) return null
  const total = weighted.reduce((sum, item) => sum + item.weight, 0)
  let ticket = Math.random() * total
  for (const item of weighted) {
    ticket -= item.weight
    if (ticket <= 0) return item.candidate
  }
  return weighted[weighted.length - 1]?.candidate || null
}

function pickMany(candidates: ScoredCandidate[], quota: number, selected: Recommendation[], recentGenreCounts: Map<string, number>, explorationRate: number) {
  const picked: Recommendation[] = []
  const remaining = [...candidates]

  while (picked.length < quota && remaining.length > 0) {
    const choice = weightedPick(remaining, [...selected, ...picked], recentGenreCounts, explorationRate)
    if (!choice) break
    picked.push(stripInternalFields(choice))
    const idx = remaining.findIndex(item => item.id === choice.id && item.type === choice.type)
    if (idx >= 0) remaining.splice(idx, 1)
  }

  return picked
}

function stripInternalFields(item: ScoredCandidate): Recommendation {
  const { _weight, _lastShownMs, _action, ...clean } = item
  return clean
}

function byFreshestFallback(a: ScoredCandidate, b: ScoredCandidate) {
  if (a._weight !== b._weight) return b._weight - a._weight
  if (a._lastShownMs === null && b._lastShownMs !== null) return -1
  if (a._lastShownMs !== null && b._lastShownMs === null) return 1
  return (a._lastShownMs || 0) - (b._lastShownMs || 0)
}

function buildTierQuotas(targetSize: number): TierQuota {
  if (targetSize <= 0) return { high: 0, mid: 0, low: 0 }
  const high = Math.max(1, Math.round(targetSize * 0.5))
  const mid = targetSize >= 3 ? Math.max(1, Math.round(targetSize * 0.3)) : 0
  const low = Math.max(0, targetSize - high - mid)
  return { high, mid, low }
}

export function sampleMasterPool(items: Recommendation[], options: SampleOptions = {}): Recommendation[] {
  const now = options.now || new Date()
  const targetSize = options.size || DEFAULT_SIZE
  const explorationRate = options.explorationRate ?? 0.25  // era 0.12 — troppo basso, poca varietà
  const exposureMap = buildExposureMap(options.exposures)
  const ids = new Set<string>()

  const scored = items
    .filter(item => item && item.id && item.matchScore >= 40)
    .filter(item => {
      const key = `${item.type}:${item.id}`
      if (ids.has(key)) return false
      ids.add(key)
      return true
    })
    .map(item => scoreCandidate(item, exposureMap.get(exposureKey(item.type, item.id)) || exposureMap.get(exposureKey(undefined, item.id)), now.getTime()))

  const nowMs = now.getTime()
  const recentGenreCounts = buildRecentGenreCounts(scored, nowMs)
  const tierQuotas = buildTierQuotas(targetSize)
  const tiers = [
    { quota: tierQuotas.high, items: scored.filter(item => item.matchScore >= 80) },
    { quota: tierQuotas.mid, items: scored.filter(item => item.matchScore >= 60 && item.matchScore < 80) },
    { quota: tierQuotas.low, items: scored.filter(item => item.matchScore >= 40 && item.matchScore < 60) },
  ]

  const selected: Recommendation[] = []
  for (const tier of tiers) {
    const picked = pickMany(tier.items, tier.quota, selected, recentGenreCounts, explorationRate)
    selected.push(...picked)
  }

  if (selected.length < targetSize) {
    const selectedKeys = new Set(selected.map(item => `${item.type}:${item.id}`))
    const fallback = scored
      .filter(item => !selectedKeys.has(`${item.type}:${item.id}`))
      .filter(item => item._action !== 'already_seen' && item._action !== 'not_interested')
      .sort(byFreshestFallback)

    selected.push(...fallback.slice(0, targetSize - selected.length).map(stripInternalFields))
  }

  return selected.slice(0, targetSize)
}
