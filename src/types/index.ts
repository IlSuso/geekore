// ─── Media Types ───────────────────────────────────────────────────────────────

export type MediaType = 'anime' | 'manga' | 'game' | 'board'

export type MediaStatus =
  | 'watching'   // anime
  | 'reading'    // manga
  | 'playing'    // game / board
  | 'completed'
  | 'paused'
  | 'dropped'
  | 'wishlist'

export interface MediaItem {
  id: string
  type: MediaType
  title: string
  cover_url: string
  external_id?: string        // AniList ID, Steam AppID, IGDB ID, BGG ID
  year?: number
  genres?: string[]
  total_episodes?: number     // anime
  total_chapters?: number     // manga
  total_volumes?: number      // manga
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
  progress: number            // episodio / capitolo / ore / sessioni
  score?: number              // 1-10
  started_at?: string
  completed_at?: string
  updated_at: string
  notes?: string
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
  why_relevant?: string       // "Perché stai guardando Attack on Titan S4"
}
