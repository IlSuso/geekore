import type { FeedMediaPreview, Post } from './feedTypes'
import { buildSmartFeed, PAGE_SIZE, PINNED_LIKE_THRESHOLD, type FeedFilter } from './feedUtils'

type SupabaseClient = any

type TopAffinity = { category: string; subcategory: string } | null

function normalizeTitle(value: string | null | undefined): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCategoryTitle(category: string | null | undefined): string {
  if (!category) return ''
  const idx = category.indexOf(':')
  if (idx === -1) return ''
  return category.slice(idx + 1).trim()
}

function buildPreviewKey(userId: string, title: string) {
  return `${userId}::${normalizeTitle(title)}`
}

function formatPost(
  post: any,
  userId: string,
  options: { pinned?: boolean; isDiscovery?: boolean; commentsCount?: number; mediaPreview?: FeedMediaPreview | null } = {}
): Post {
  const likes = post.likes || []
  const profile = post.profiles

  return {
    id: post.id,
    user_id: post.user_id,
    content: post.content,
    image_url: post.image_url,
    created_at: post.created_at,
    category: post.category,
    media_preview: options.mediaPreview || null,
    is_edited: post.is_edited,
    profiles: {
      username: profile?.username || '',
      display_name: profile?.display_name,
      avatar_url: profile?.avatar_url,
      badge: profile?.badge,
    },
    likes_count: likes.length,
    liked_by_user: likes.some((l: any) => l.user_id === userId),
    comments_count: options.commentsCount ?? (post.comments || []).length,
    comments: options.isDiscovery
      ? []
      : (post.comments || []).map((c: any) => ({
          id: c.id,
          content: c.content,
          created_at: c.created_at,
          user_id: c.user_id,
          username: c.profiles?.username || 'utente',
          display_name: c.profiles?.display_name,
        })).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    pinned: options.pinned,
    isDiscovery: options.isDiscovery,
  }
}

async function attachMediaPreviews(supabase: SupabaseClient, posts: any[]): Promise<Map<string, FeedMediaPreview>> {
  const wanted = posts
    .map(post => ({ post, title: parseCategoryTitle(post.category) }))
    .filter(item => item.title.length > 0)

  if (wanted.length === 0) return new Map()

  const userIds = Array.from(new Set(wanted.map(item => item.post.user_id).filter(Boolean)))
  if (userIds.length === 0) return new Map()

  const { data } = await supabase
    .from('user_media_entries')
    .select('user_id, external_id, title, title_en, type, cover_image, rating, status, current_episode, episodes')
    .in('user_id', userIds)
    .limit(1000)

  const byKey = new Map<string, FeedMediaPreview>()
  for (const row of data || []) {
    const preview: FeedMediaPreview = {
      external_id: row.external_id,
      title: row.title,
      type: row.type,
      cover_image: row.cover_image,
      rating: row.rating,
      status: row.status,
      current_episode: row.current_episode,
      episodes: row.episodes,
    }
    byKey.set(buildPreviewKey(row.user_id, row.title), preview)
    if (row.title_en) byKey.set(buildPreviewKey(row.user_id, row.title_en), preview)
  }

  const result = new Map<string, FeedMediaPreview>()
  for (const { post, title } of wanted) {
    const preview = byKey.get(buildPreviewKey(post.user_id, title))
    if (preview) result.set(post.id, preview)
  }
  return result
}

export async function fetchPinnedPosts(supabase: SupabaseClient, userId: string): Promise<Post[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase.from('posts')
    .select(`
      id, user_id, content, image_url, created_at, category, is_edited,
      profiles (id, username, display_name, avatar_url, badge),
      likes (id, user_id),
      comments (
        id, content, created_at, user_id,
        profiles (id, username, display_name)
      )
    `)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error || !data) return []

  const topPosts = data
    .map((p: any) => ({ ...p, _likeCount: (p.likes || []).length }))
    .filter((p: any) => p._likeCount >= PINNED_LIKE_THRESHOLD)
    .sort((a: any, b: any) => b._likeCount - a._likeCount)
    .slice(0, 2)

  const previews = await attachMediaPreviews(supabase, topPosts)
  return topPosts.map((post: any) => formatPost(post, userId, { pinned: true, mediaPreview: previews.get(post.id) || null }))
}

async function getUserTopCategory(supabase: SupabaseClient, userId: string): Promise<TopAffinity> {
  const { data } = await supabase.from('user_category_affinity')
    .select('category, subcategory, score')
    .eq('user_id', userId)
    .order('score', { ascending: false })
    .limit(1)

  if (!data || data.length === 0) return null
  return { category: data[0].category, subcategory: data[0].subcategory }
}

async function fetchDiscoveryPosts(
  supabase: SupabaseClient,
  userId: string,
  followingIds: string[],
  topAffinity: TopAffinity
): Promise<Post[]> {
  if (!topAffinity) return []

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase.from('posts')
    .select(`
      id, user_id, content, image_url, created_at, category, is_edited,
      profiles (id, username, display_name, avatar_url, badge),
      likes (id, user_id)
    `)
    .ilike('category', `${topAffinity.category}:%`)
    .gte('created_at', since)
    .limit(50)

  if (!data) return []

  const candidates = data
    .filter((p: any) => p.user_id !== userId && !followingIds.includes(p.user_id))
    .map((p: any) => ({ ...p, _likeCount: (p.likes || []).length }))
    .sort((a: any, b: any) => b._likeCount - a._likeCount)
    .slice(0, 5)

  const previews = await attachMediaPreviews(supabase, candidates)
  return candidates.map((post: any) => formatPost(post, userId, {
    isDiscovery: true,
    commentsCount: 0,
    mediaPreview: previews.get(post.id) || null,
  }))
}

export async function fetchFeedPostsPage({
  supabase,
  userId,
  pageIndex = 0,
  filter = 'all',
  pinnedPosts = [],
}: {
  supabase: SupabaseClient
  userId: string
  pageIndex?: number
  filter?: FeedFilter
  pinnedPosts?: Post[]
}): Promise<{ posts: Post[]; hasMore: boolean }> {
  const from = pageIndex * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data: followsData } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)

  const followingIds = (followsData || []).map((f: any) => f.following_id)

  if (filter === 'following' && followingIds.length === 0) {
    return { posts: [], hasMore: false }
  }

  let query = supabase.from('posts')
    .select(`
      id, user_id, content, image_url, created_at, category, is_edited,
      profiles (id, username, display_name, avatar_url, badge),
      likes (id, user_id),
      comments (
        id, content, created_at, user_id,
        profiles (id, username, display_name)
      )
    `)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filter === 'following' && followingIds.length > 0) {
    query = query.in('user_id', followingIds)
  }

  const { data: rawPosts } = await query

  const postsData = (rawPosts || []).map((p: any) => ({
    ...p,
    comments: (p.comments || [])
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
  }))

  const previews = await attachMediaPreviews(supabase, postsData)
  const formatted = postsData.map((post: any) => formatPost(post, userId, { mediaPreview: previews.get(post.id) || null }))
  const hasMore = postsData.length === PAGE_SIZE
  const pinnedIds = new Set(pinnedPosts.map(p => p.id))
  const filteredFormatted = formatted.filter((p: Post) => !pinnedIds.has(p.id))

  if (filter === 'following' && pageIndex === 0) {
    const topAffinity = await getUserTopCategory(supabase, userId)
    const discoveryPosts = await fetchDiscoveryPosts(supabase, userId, followingIds, topAffinity)
    return { posts: buildSmartFeed(filteredFormatted, discoveryPosts), hasMore }
  }

  return { posts: filteredFormatted, hasMore }
}
