import type { RecoMediaType } from './types'
import type { inferRuntimePreference } from './scoring'

export type MediaType = RecoMediaType
export type RuntimeRange = ReturnType<typeof inferRuntimePreference>

export interface UserEntry {
  id?: string
  user_id?: string
  title: string
  type: MediaType
  status?: string
  rating?: number
  genres?: string[]
  tags?: string[]
  cover_image?: string
  year?: number
  episodes?: number
  current_episode?: number
  rewatch_count?: number
  updated_at?: string | null
  created_at?: string
  studio?: string
  director?: string
  author?: string
  authors?: string[]
  developer?: string
  platform?: string[]
  runtime?: number
  original_language?: string
  external_id?: string
  source?: string
  score?: number
  popularity?: number
  vote_count?: number
  is_steam?: boolean
  notes?: string
  started_at?: string | null
  community_score?: number
  keywords?: string[]
  themes?: string[]
  appid?: number
  title_en?: string
}

export interface UserSearch {
  query: string
  created_at?: string
  type?: string
  result_clicked_genres?: string[]
  result_clicked_id?: string
}
