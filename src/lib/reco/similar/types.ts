export type SimilarItem = {
  id: string
  title: string
  type: string
  coverImage?: string
  year?: number
  genres?: string[]
  tags?: string[]
  keywords?: string[]
  score?: number
  description?: string
  matchScore?: number
  why?: string
  creatorBoost?: string
  episodes?: number
  _pop?: number
  _foundByKeyword?: boolean
  _similarity?: number
}

export type SimilarAdd = (item: SimilarItem) => void

export type SimilarContext = {
  sourceTitle: string
  rawGenres: string[]
  rawKeywords: string[]
  rawTags: string[]
  excludeId: string
  sourceType: string
  excludeIdNum: number
  tmdbToken: string
  igdbClientId: string
  igdbClientSecret: string
  genreScores: Record<string, number>
  maxGenreScore: number
  igdbGenres: string[]
  crossGenres: string[]
  anilistGenres: string[]
  tmdbMovieIds: number[]
  tmdbTvIds: number[]
  effectiveKeywords: string[]
  tmdbKeywordIdsPromise: Promise<number[]>
  profileBoost: (recGenres: string[]) => number
  whyText: (recGenres: string[], matchedKeywords?: string[]) => string
}
