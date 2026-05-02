export type Comment = {
  id: string
  content: string
  created_at: string
  user_id: string
  username?: string
  display_name?: string
}

export type FeedMediaPreview = {
  external_id?: string | null
  title: string
  type?: string | null
  cover_image?: string | null
  rating?: number | null
  status?: string | null
  current_episode?: number | null
  episodes?: number | null
}

export type Post = {
  id: string
  user_id: string
  content: string
  image_url?: string | null
  created_at: string
  is_edited?: boolean
  category?: string | null
  media_preview?: FeedMediaPreview | null
  profiles: {
    username: string
    display_name?: string
    avatar_url?: string
    badge?: string | null
  }
  likes_count: number
  comments_count: number
  liked_by_user: boolean
  comments: Comment[]
  pinned?: boolean
  isDiscovery?: boolean
}
