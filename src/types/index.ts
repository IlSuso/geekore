// DESTINAZIONE: src/types/index.ts

// ─── Media Types ───────────────────────────────────────────────────────────────

export type MediaType = 'anime' | 'manga' | 'game' | 'tv' | 'movie' | 'boardgame'

export type MediaStatus =
  | 'watching'
  | 'reading'
  | 'playing'
  | 'completed'
  | 'paused'
  | 'dropped'
  | 'wishlist'

export interface MediaItem {
  id: string
  type: MediaType
  title: string
  cover_url?: string
  cover_image?: string
  external_id?: string
  appid?: string
  year?: number
  genres?: string[]
  episodes?: number
  total_episodes?: number
  total_chapters?: number
  total_volumes?: number
  is_steam?: boolean
  current_episode?: number
  current_season?: number
  season_episodes?: Record<number, { episode_count: number }>
  display_order?: number
  rating?: number
  notes?: string
  // V3: creator fields
  studios?: string[]
  directors?: string[]
  authors?: string[]
  developer?: string
}

// ─── User & Profile ────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  username: string
  display_name: string
  avatar_url?: string
  bio?: string
  steam_id?: string
  created_at: string
  followers_count?: number
  following_count?: number
}

// ─── User Media Entry ──────────────────────────────────────────────────────────

export interface UserMediaEntry {
  id: string
  user_id: string
  media: MediaItem
  status: MediaStatus
  progress: number
  score?: number
  started_at?: string       // V3: per velocity calculation
  completed_at?: string
  updated_at: string
  notes?: string
  // V3: behavioral signals
  rewatch_count?: number    // V3: numero di rewatch
  studios?: string[]        // V3: studio (anime)
  directors?: string[]      // V3: regista (anime)
  authors?: string[]        // V3: autore (manga/book)
  developer?: string        // V3: sviluppatore (game)
}

// ─── Feed ─────────────────────────────────────────────────────────────────────

export type FeedActivityType =
  | 'progress_update'
  | 'status_change'
  | 'new_entry'
  | 'score_given'
  | 'wishlist_add'

export interface FeedActivity {
  id: string
  user: UserProfile
  type: FeedActivityType
  entry: UserMediaEntry
  created_at: string
  likes_count?: number
  comments_count?: number
}

// ─── Wishlist ─────────────────────────────────────────────────────────────────

export interface WishlistItem {
  id: string
  user_id: string
  media: MediaItem
  release_date?: string
  notified?: boolean
  added_at: string
  // V3: per amplificazione profilo
  genres?: string[]
  media_type?: string
  studios?: string[]
}

// ─── News ─────────────────────────────────────────────────────────────────────

export interface NewsItem {
  id: string
  title: string
  summary: string
  url: string
  image_url?: string
  source: string
  published_at: string
  related_media?: MediaItem[]
  why_relevant?: string
}

// ─── V3: Taste Profile ────────────────────────────────────────────────────────

export interface TasteProfile {
  globalGenres: Array<{ genre: string; score: number }>
  topGenres: Record<MediaType, Array<{ genre: string; score: number }>>
  collectionSize: Record<string, number>
  recentWindow?: number
  deepSignals?: {
    topThemes: string[]
    topTones: string[]
    topSettings: string[]
  }
  discoveryGenres?: string[]
  negativeGenres?: string[]
  // V3
  creatorScores?: {
    topStudios: Array<{ name: string; score: number }>
    topDirectors: Array<{ name: string; score: number }>
  }
  bingeProfile?: {
    isBinger: boolean
    avgCompletionDays: number
    bingeGenres: string[]
    slowGenres: string[]
  }
  wishlistGenres?: string[]
  searchIntentGenres?: string[]
}

// ─── V3: Recommendation ───────────────────────────────────────────────────────

export interface Recommendation {
  id: string
  title: string
  type: MediaType
  coverImage?: string
  year?: number
  genres: string[]
  score?: number
  description?: string
  why: string
  matchScore: number
  isDiscovery?: boolean
  isContinuity?: boolean
  continuityFrom?: string
  creatorBoost?: string
}

// ─── V3: Search History ───────────────────────────────────────────────────────

export interface SearchHistoryEntry {
  id: string
  user_id: string
  query: string
  media_type?: string
  result_clicked_id?: string
  result_clicked_type?: string
  result_clicked_genres: string[]
  created_at: string
}

// ─── V3: Creator Profile ──────────────────────────────────────────────────────

export interface CreatorProfile {
  user_id: string
  studios: Record<string, number>
  directors: Record<string, number>
  authors: Record<string, number>
  developers: Record<string, number>
  updated_at: string
}

// ─── V3: Media Continuity ─────────────────────────────────────────────────────

export interface ContinuityEdge {
  from_id: string
  from_type: string
  to_id: string
  to_type: string
  edge_type: 'sequel' | 'prequel' | 'spinoff' | 'adaptation' | 'same_universe'
  priority: number
  to_title?: string
  to_cover?: string
  to_year?: number
}

// ─── Social ───────────────────────────────────────────────────────────────────

export interface Comment {
  id: string
  post_id: string
  user_id: string
  content: string
  created_at: string
  username?: string
  display_name?: string
  avatar_url?: string | null
}

export interface Post {
  id: string
  user_id: string
  content: string
  image_url?: string | null
  category?: string | null
  created_at: string
  is_edited?: boolean
  pinned?: boolean
  isDiscovery?: boolean
  profiles: Pick<UserProfile, 'username' | 'display_name' | 'avatar_url'>
  likes_count: number
  comments_count: number
  liked_by_user: boolean
  comments: Comment[]
}

export interface NotificationItem {
  id: string
  type: 'like' | 'comment' | 'follow' | 'rating'
  created_at: string
  is_read: boolean
  post_id?: string | null
  sender_id: string
  sender: Pick<UserProfile, 'username' | 'display_name' | 'avatar_url'>
}