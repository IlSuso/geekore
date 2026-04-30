import type { Recommendation } from '../types'

export interface StableMergeDiagnostics {
  nextCount: number
  previousCount: number
  mergedCount: number
  newUniqueCount: number
  reusedPreviousCount: number
  protectedFromShrink: boolean
}

export function mergeStableMasterPool(
  nextItems: Recommendation[],
  previousItems: Recommendation[],
  targetSize: number
): { items: Recommendation[]; diagnostics: StableMergeDiagnostics } {
  const seen = new Set<string>()
  const items: Recommendation[] = []
  let newUniqueCount = 0
  let reusedPreviousCount = 0

  for (const item of nextItems) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    items.push(item)
    newUniqueCount++
    if (items.length >= targetSize) break
  }

  const protectedFromShrink = previousItems.length > items.length
  if (items.length < targetSize && protectedFromShrink) {
    for (const item of previousItems) {
      if (!item?.id || seen.has(item.id)) continue
      seen.add(item.id)
      items.push(item)
      reusedPreviousCount++
      if (items.length >= targetSize) break
    }
  }

  return {
    items,
    diagnostics: {
      nextCount: nextItems.length,
      previousCount: previousItems.length,
      mergedCount: items.length,
      newUniqueCount,
      reusedPreviousCount,
      protectedFromShrink,
    },
  }
}
