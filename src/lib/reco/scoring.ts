// src/lib/reco/scoring.ts
// Funzioni di scoring pure per il Taste Engine V5
// Estratto da api/recommendations/route.ts — Fix #14 Repair Bible
// Nessuna dipendenza da Supabase o fetch — testabili in isolamento.

import type { RuntimeRange } from './types'

// ── V4: stagione corrente anime ───────────────────────────────────────────────
export function getCurrentAnimeSeasonDates(): { from: string; to: string; label: string } {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  const [startMonth, endMonth, label] =
    month <= 3  ? [1, 3,   'Inverno'] :
    month <= 6  ? [4, 6,   'Primavera'] :
    month <= 9  ? [7, 9,   'Estate'] :
                  [10, 12, 'Autunno']
  const endDay = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][endMonth]
  return {
    from: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    to:   `${year}-${String(endMonth).padStart(2, '0')}-${endDay}`,
    label: `${label} ${year}`,
  }
}

// ── V4: Quality Gate ──────────────────────────────────────────────────────────
export function getQualityThresholds(nicheUser: boolean) {
  return {
    tmdbVoteAvg: nicheUser ? 5.5 : 6.0,
    tmdbVoteCount: 80,
    anilistScore: nicheUser ? 50 : 55,
    anilistPopularity: nicheUser ? 300 : 500,
    igdbRating: nicheUser ? 55 : 60,
    igdbRatingCount: 30,
  }
}

// ── V4: Release Freshness multiplier ─────────────────────────────────────────
export function releaseFreshnessMult(
  year: number | undefined,
  communityScore?: number,
  communityPop?: number
): number {
  if (!year) return 1.0
  const age = new Date().getFullYear() - year
  const isClassic = (communityScore && communityScore > 85) || (communityPop && communityPop > 100000)
  if (isClassic) return 1.0
  if (age <= 2) return 1.3
  if (age <= 5) return 1.1
  if (age <= 10) return 1.0
  return Math.max(0.7, 0.85 - (age - 10) * 0.01)
}

// ── V4: Award boost ───────────────────────────────────────────────────────────
export function isAwardWorthy(
  score: number | undefined,
  popularity: number | undefined,
  voteCount: number | undefined,
  scoreType: 'tmdb' | 'anilist' | 'igdb'
): boolean {
  if (scoreType === 'tmdb') return (score || 0) >= 8.0 && (voteCount || 0) >= 1000
  if (scoreType === 'anilist') return (score || 0) >= 85 && (popularity || 0) >= 50000
  if (scoreType === 'igdb') return (score || 0) >= 85 && (voteCount || 0) >= 500
  return false
}

// ── V5: Runtime preference ────────────────────────────────────────────────────
export function inferRuntimePreference(entries: Array<{
  type: string
  runtime?: number
  episode_run_time?: number
  status?: string
}>): RuntimeRange {
  const movies = entries.filter(e => e.type === 'movie' && e.runtime && e.status !== 'dropped')
  if (movies.length >= 3) {
    const avg = movies.reduce((s, e) => s + (e.runtime || 0), 0) / movies.length
    if (avg < 90) return 'short'
    if (avg <= 130) return 'standard'
    return 'long'
  }
  const tvSeries = entries.filter(e => e.type === 'tv' && e.episode_run_time && e.status !== 'dropped')
  if (tvSeries.length >= 3) {
    const avgEp = tvSeries.reduce((s, e) => s + (e.episode_run_time || 0), 0) / tvSeries.length
    if (avgEp < 30) return 'short'
    if (avgEp <= 50) return 'standard'
    return 'long'
  }
  const anime = entries.filter(e => e.type === 'anime' && e.episode_run_time && e.status !== 'dropped')
  if (anime.length >= 5) {
    const avgAnimeEp = anime.reduce((s, e) => s + (e.episode_run_time || 0), 0) / anime.length
    return avgAnimeEp < 30 ? 'short' : 'standard'
  }
  return null
}

export function runtimePenalty(runtime: number | undefined, pref: RuntimeRange): number {
  if (!runtime || !pref) return 1.0
  if (pref === 'short' && runtime > 130) return 0.80
  if (pref === 'long' && runtime < 90) return 0.80
  if (pref === 'standard' && (runtime < 80 || runtime > 150)) return 0.85
  return 1.0
}

// ── V5: Lingua/Origine preference ────────────────────────────────────────────
export function inferLanguagePreference(entries: Array<{
  type: string
  original_language?: string
}>): { preferNonEnglish: boolean; onlyAnime: boolean } {
  const withLang = entries.filter(e => e.original_language)
  const nonEnglishCount = withLang.filter(e => e.original_language !== 'en').length
  const animeCount = entries.filter(e => e.type === 'anime' || e.type === 'manga').length
  const totalMedia = entries.filter(e => e.type === 'movie' || e.type === 'tv').length
  return {
    preferNonEnglish: withLang.length > 5 && nonEnglishCount / withLang.length > 0.8,
    onlyAnime: animeCount > 5 && totalMedia < 2,
  }
}

// ── V5: Format Diversity ──────────────────────────────────────────────────────
export function applyFormatDiversity<T extends { genres?: string[] }>(
  recs: T[],
  type?: string,
  maxPerSubGenre = 4
): T[] {
  if (type === 'game') return recs
  const result: T[] = []
  const subGenreCount: Record<string, number> = {}
  for (const rec of recs) {
    const subGenre = rec.genres?.[0] || 'unknown'
    subGenreCount[subGenre] = (subGenreCount[subGenre] || 0) + 1
    if (subGenreCount[subGenre] <= maxPerSubGenre) result.push(rec)
  }
  return result
}

// ── Temporal decay ─────────────────────────────────────────────────────────────
export function temporalMultV2(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0.5
  const ageDays = (Date.now() - new Date(updatedAt).getTime()) / 86400000
  return Math.max(0.2, Math.exp(-ageDays / 90))
}

export function temporalRecency(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0
  const ageDays = (Date.now() - new Date(updatedAt).getTime()) / 86400000
  return Math.max(0, 1 - ageDays / 365)
}

// ── Sentiment multiplier ──────────────────────────────────────────────────────
export function sentimentMult(rating: number): number {
  if (rating === 0) return 1.0
  if (rating >= 4.5) return 2.0
  if (rating >= 4.0) return 1.6
  if (rating >= 3.5) return 1.3
  if (rating >= 3.0) return 1.0
  if (rating >= 2.0) return 0.5
  return 0.2
}

// ── Completion rate multiplier ────────────────────────────────────────────────
export function completionMult(entry: {
  status?: string
  current_episode?: number
  episodes?: number
}): number {
  if (entry.status === 'completed') return 1.5
  if (entry.status === 'dropped') return 0.3
  if (entry.status === 'paused') return 0.7
  if (entry.episodes && entry.current_episode) {
    const rate = entry.current_episode / entry.episodes
    if (rate >= 0.8) return 1.3
    if (rate >= 0.5) return 1.1
  }
  return 1.0
}

// ── Negative signal ───────────────────────────────────────────────────────────
export function isNegativeSignal(entry: { status?: string; rating?: number }): boolean {
  if (entry.status === 'dropped') return true
  if (entry.rating && entry.rating <= 1.5) return true
  return false
}

// ── Rewatch multiplier ────────────────────────────────────────────────────────
export function rewatchMult(entry: { rewatch_count?: number }): number {
  const r = entry.rewatch_count || 0
  if (r >= 3) return 5.0
  if (r >= 2) return 3.0
  if (r >= 1) return 2.5
  return 1.0
}