// src/lib/reco/types.ts
// Tipi condivisi del Taste Engine V5
// Estratto da api/recommendations/route.ts per Fix #17 (riduzione any) e #14 (refactor)


export type RuntimeRange = 'short' | 'standard' | 'long' | null

export interface CreatorScores {
  studios: Record<string, number>
  directors: Record<string, number>
  authors: Record<string, number>
  developers: Record<string, number>
}

export interface BingeProfile {
  isBinger: boolean
  avgCompletionDays: number
  bingeGenres: string[]
  slowGenres: string[]
}

export interface QualityThresholds {
  tmdbVoteAvg: number
  tmdbVoteCount: number
  anilistScore: number
  anilistPopularity: number
  igdbRating: number
  igdbRatingCount: number
}

export interface TasteProfile {
  globalGenres: Array<{ genre: string; score: number }>
  topGenres: Record<RecoMediaType, Array<{ genre: string; score: number }>>
  genreToTitles: Record<string, Array<{ title: string; type: string; recency: number; rating: number; velocity?: number }>>
  collectionSize: Record<string, number>
  recentWindow: number
  deepSignals: {
    keywords: Record<string, number>
    themes: Record<string, number>
    tones: Record<string, number>
    settings: Record<string, number>
  }
  negativeGenres: Record<string, number>
  softDisliked: Set<string>
  droppedTitles: Set<string>
  discoveryGenres: string[]
  creatorScores: CreatorScores
  bingeProfile: BingeProfile
  wishlistGenres: string[]
  wishlistCreators: CreatorScores
  searchIntentGenres: string[]
  topTitlesForContext: Array<{ title: string; type: string; rating: number; velocity?: number; rewatchCount: number }>
  lowConfidence: boolean
  nicheUser: boolean
  runtimePreference: RuntimeRange
  languagePreference: { preferNonEnglish: boolean; onlyAnime: boolean }
  qualityThresholds: QualityThresholds
}

export interface Recommendation {
  id: string
  title: string
  type: RecoMediaType
  coverImage?: string
  year?: number
  genres: string[]
  tags?: string[]
  keywords?: string[]
  recStudios?: string[]
  score?: number
  description?: string
  why: string
  matchScore: number
  isDiscovery?: boolean
  isContinuity?: boolean
  continuityFrom?: string
  creatorBoost?: string
  isSerendipity?: boolean
  isAwardWinner?: boolean
  isSeasonal?: boolean
  socialBoost?: string
  // Extra metadata per il drawer
  episodes?: number
  authors?: string[]
  developers?: string[]
  platforms?: string[]
  min_players?: number
  max_players?: number
  playing_time?: number
  complexity?: number
}

export interface MemCacheEntry {
  data: Record<string, Recommendation[]>
  tasteProfile: TasteProfile
  expiresAt: number
}