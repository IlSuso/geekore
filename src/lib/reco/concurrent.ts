// src/lib/reco/concurrent.ts
// Utility per limitare le chiamate parallele — evita di saturare rate limit API
// AniList: 90 req/min → max 10 parallele con pause tra batch

export async function batchedParallel<T>(
  items: (() => Promise<T>)[],
  concurrency: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(batch.map(fn => fn()))
    results.push(...batchResults)
  }
  return results
}
