import type { BingeProfile, CreatorScores } from './types'
import type { MediaType, UserEntry } from './engine-types'
import { isNegativeSignal, rewatchMult, sentimentMult, temporalMultV2 } from './scoring'

export function determineActiveWindowForType(entries: UserEntry[], type: MediaType): number {
  const typeEntries = entries.filter(entry => entry.type === type)
  const now = Date.now()
  const countInDays = (days: number) => typeEntries.filter(entry => {
    if (!entry.updated_at) return false
    return (now - new Date(entry.updated_at).getTime()) / 86400000 <= days
  }).length

  const minCount = type === 'game' ? 2 : 3
  const windows = type === 'game' ? [90, 180, 365, 24 * 30] : [60, 120, 180, 365]

  for (const windowDays of windows) {
    if (countInDays(windowDays) >= minCount) return Math.round(windowDays / 30)
  }
  return 12
}

export function detectBingeProfile(entries: UserEntry[]): BingeProfile {
  const completed = entries.filter(entry => entry.status === 'completed' && entry.started_at && entry.updated_at)
  if (completed.length === 0) return { isBinger: false, avgCompletionDays: 30, bingeGenres: [], slowGenres: [] }

  const completionTimes = completed.map(entry => {
    const days = Math.max(1, (new Date(entry.updated_at!).getTime() - new Date(entry.started_at!).getTime()) / 86400000)
    return { days, genres: entry.genres || [] }
  })

  const avgDays = completionTimes.reduce((sum, item) => sum + item.days, 0) / completionTimes.length
  const isBinger = completionTimes.some(item => item.days <= 7) || avgDays < 15
  const bingeGenreCounts: Record<string, number> = {}
  const slowGenreCounts: Record<string, number> = {}

  for (const { days, genres } of completionTimes) {
    for (const genre of genres) {
      if (days <= 7) bingeGenreCounts[genre] = (bingeGenreCounts[genre] || 0) + 1
      else if (days >= 30) slowGenreCounts[genre] = (slowGenreCounts[genre] || 0) + 1
    }
  }

  return {
    isBinger,
    avgCompletionDays: avgDays,
    bingeGenres: Object.entries(bingeGenreCounts).sort(([, a], [, b]) => b - a).slice(0, 5).map(([genre]) => genre),
    slowGenres: Object.entries(slowGenreCounts).sort(([, a], [, b]) => b - a).slice(0, 5).map(([genre]) => genre),
  }
}

export function computeCreatorScores(entries: UserEntry[], _preferences?: Record<string, string[]>): CreatorScores {
  const studios: Record<string, number> = {}
  const directors: Record<string, number> = {}
  const authors: Record<string, number> = {}
  const developers: Record<string, number> = {}

  for (const entry of entries) {
    if (isNegativeSignal(entry)) continue

    const weight = temporalMultV2(entry.updated_at) * sentimentMult(entry.rating || 0) * rewatchMult(entry)

    if (entry.studio) studios[entry.studio] = (studios[entry.studio] || 0) + weight
    if (entry.director) directors[entry.director] = (directors[entry.director] || 0) + weight
    if (entry.author) authors[entry.author] = (authors[entry.author] || 0) + weight
    if (entry.authors && Array.isArray(entry.authors)) {
      for (const author of entry.authors) {
        if (author) authors[author] = (authors[author] || 0) + weight
      }
    }
    if (entry.developer) developers[entry.developer] = (developers[entry.developer] || 0) + weight
  }

  return { studios, directors, authors, developers }
}

export function computeClusterVelocity(
  entries: UserEntry[],
  targetGenres: string[],
  currentUpdatedAt: string | null | undefined
): number {
  if (!currentUpdatedAt) return 1.0
  const windowMs = 7 * 86400000
  const targetTime = new Date(currentUpdatedAt).getTime()
  const windowStart = targetTime - windowMs

  let sameGenreInWindow = 0
  for (const entry of entries) {
    if (!entry.updated_at || entry.updated_at === currentUpdatedAt) continue
    const timestamp = new Date(entry.updated_at).getTime()
    if (timestamp < windowStart || timestamp > targetTime + windowMs) continue
    const genres = entry.genres || []
    if (targetGenres.some(genre => genres.includes(genre))) sameGenreInWindow++
  }

  return sameGenreInWindow >= 3 ? 1.8 : sameGenreInWindow >= 2 ? 1.3 : 1.0
}

export function computeVelocity(entry: UserEntry): number {
  if (entry.type === 'movie') return 1.0
  if (!entry.started_at || !entry.current_episode) return 1.0

  const days = Math.max(
    1,
    (new Date(entry.updated_at || Date.now()).getTime() - new Date(entry.started_at).getTime()) / 86400000
  )
  const velocity = entry.current_episode / days

  if (velocity >= 3.0) return 3.5
  if (velocity >= 1.5) return 2.5
  if (velocity >= 0.5) return 1.5
  if (velocity >= 0.1) return 1.0
  return 0.4
}
