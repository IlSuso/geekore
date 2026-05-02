import { parseCategoryString } from '@/components/feed/CategoryBasics'
import type { Post } from '@/components/feed/feedTypes'

export type FeedFilter = 'all' | 'following'

export const cache: {
  posts: Post[] | null
  page: number
  hasMore: boolean
  filter: FeedFilter
  ts: number
} = { posts: null, page: 0, hasMore: true, filter: 'all', ts: 0 }

const CACHE_TTL = 2 * 60 * 1000

export function invalidateCache(_filter: FeedFilter) {
  cache.ts = 0
}

export function isCacheValid(filter: FeedFilter) {
  return (
    cache.posts !== null &&
    cache.filter === filter &&
    Date.now() - cache.ts < CACHE_TTL
  )
}

export function haptic(pattern: number | number[] = 30) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern)
}

export const PAGE_SIZE = 20
export const PINNED_LIKE_THRESHOLD = 3
export const DISCOVERY_INTERVAL = 5

export function buildSmartFeed(followingPosts: Post[], discoveryPosts: Post[]): Post[] {
  if (discoveryPosts.length === 0) return followingPosts
  const result: Post[] = []
  let discIdx = 0
  for (let i = 0; i < followingPosts.length; i++) {
    result.push(followingPosts[i])
    if ((i + 1) % DISCOVERY_INTERVAL === 0 && discIdx < discoveryPosts.length) {
      result.push({ ...discoveryPosts[discIdx], isDiscovery: true })
      discIdx++
    }
  }
  return result
}

export async function trackAffinity(_supabase: any, _userId: string, category: string | null | undefined) {
  if (!category) return
  const parsed = parseCategoryString(category)
  if (!parsed) return
  const { category: cat, subcategory: sub } = parsed
  try {
    await fetch('/api/taste/affinity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: cat, subcategory: sub || 'Generico' }),
    }).catch(() => {})
  } catch {}
}
