import { TMDB_META_KW_BLOCKLIST } from './constants'
import type { SimilarContext, SimilarItem } from './types'

const TARGET_TOTAL = 30

export function scoreAndBalanceSimilarResults(results: SimilarItem[], ctx: SimilarContext): SimilarItem[] {
  const sourceTagsNorm = ctx.effectiveKeywords
    .map(s => s.toLowerCase())
    .filter(s => !TMDB_META_KW_BLOCKLIST.has(s))
  const sourceTagsSet = new Set(sourceTagsNorm)
  const sourceGenresSet = new Set([...ctx.rawGenres, ...ctx.crossGenres].map(s => s.toLowerCase()))

  const scored = results.map(item => {
    const itemTags = ((item.tags || []) as string[]).map((s: string) => s.toLowerCase())
    const itemKeywords = ((item.keywords || []) as string[]).map((s: string) => s.toLowerCase())
    const itemGenres = ((item.genres || []) as string[]).map((s: string) => s.toLowerCase())
    const itemTagsAll = [...new Set([...itemTags, ...itemKeywords])]

    const exactMatched = itemTagsAll.filter(t => sourceTagsSet.has(t))
    const partialMatched = itemTagsAll.filter(t =>
      !sourceTagsSet.has(t) &&
      sourceTagsNorm.some(s => s.length >= 4 && (t.includes(s) || s.includes(t)))
    )
    const genreMatched = itemGenres.filter(g => sourceGenresSet.has(g))

    const scoreBonus = item.score ? item.score / 5 : 0
    const kwQueryBoost = item._foundByKeyword ? 6 : 0
    const similarity = exactMatched.length * 5 + partialMatched.length * 1 + genreMatched.length * 1 + scoreBonus + kwQueryBoost

    const kwPts = Math.min(35, exactMatched.length * 10 + partialMatched.length * 2)
    const genrePts = Math.min(15, genreMatched.length * 4)
    const profPts = Math.min(10, Math.round(ctx.profileBoost(item.genres || []) / 2.5))
    const scorePts = Math.round(scoreBonus * 5)
    const computedMatch = Math.min(97, Math.max(30, 30 + kwPts + genrePts + profPts + scorePts + kwQueryBoost * 2))

    const matchedKwDisplay = exactMatched.slice(0, 2).map(t =>
      ctx.effectiveKeywords.find(k => k.toLowerCase() === t) || t
    )
    const updatedWhy = matchedKwDisplay.length > 0
      ? `Temi simili: ${matchedKwDisplay.join(', ')}`
      : item.why

    return { ...item, matchScore: computedMatch, why: updatedWhy, _similarity: similarity }
  })

  scored.sort((a, b) => {
    if ((b._similarity || 0) !== (a._similarity || 0)) return (b._similarity || 0) - (a._similarity || 0)
    return (b._pop || 0) - (a._pop || 0)
  })

  const diverse = buildDiverseList(scored)
  diverse.sort((a, b) => {
    if ((b._similarity || 0) !== (a._similarity || 0)) return (b._similarity || 0) - (a._similarity || 0)
    return (b._pop || 0) - (a._pop || 0)
  })

  return diverse.slice(0, TARGET_TOTAL).map(({ _pop, _similarity, _foundByKeyword, ...r }) => r)
}

function buildDiverseList(scored: SimilarItem[]): SimilarItem[] {
  const byType: Record<string, SimilarItem[]> = {}
  for (const item of scored) {
    if (!byType[item.type]) byType[item.type] = []
    byType[item.type].push(item)
  }
  const availableTypes = Object.keys(byType).filter(t => byType[t].length > 0)
  const numTypes = availableTypes.length

  const diverse: SimilarItem[] = []
  const diverseIds = new Set<string>()

  if (numTypes > 0) {
    const basePerType = Math.round(TARGET_TOTAL / numTypes)
    const maxPerType = basePerType + 2

    const typeQuota: Record<string, number> = {}
    const typeQueues: Record<string, SimilarItem[]> = {}
    for (const t of availableTypes) {
      typeQuota[t] = 0
      typeQueues[t] = [...byType[t]]
    }

    let anyAdded = true
    while (diverse.length < TARGET_TOTAL && anyAdded) {
      anyAdded = false
      for (const type of availableTypes) {
        if (diverse.length >= TARGET_TOTAL) break
        if (typeQuota[type] >= maxPerType) continue
        const queue = typeQueues[type]
        while (queue.length > 0) {
          const item = queue.shift()!
          if (!diverseIds.has(item.id)) {
            diverse.push(item)
            diverseIds.add(item.id)
            typeQuota[type]++
            anyAdded = true
            break
          }
        }
      }
    }

    if (diverse.length < TARGET_TOTAL) {
      for (const item of scored) {
        if (diverse.length >= TARGET_TOTAL) break
        if (!diverseIds.has(item.id)) {
          diverse.push(item)
          diverseIds.add(item.id)
        }
      }
    }
  }

  return diverse
}
