// DESTINAZIONE: src/app/api/taste/stats/route.ts
// V3: Statistiche avanzate del profilo gusti

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'

interface SeasonalPattern {
  isSeasonalWatcher: boolean
  activeMonths: number[]
  currentSeasonBoost: boolean
  pattern: 'cour' | 'summer' | 'irregular' | 'constant'
}

function detectSeasonalPattern(entries: any[]): SeasonalPattern {
  const monthCounts: Record<number, number> = {}

  for (const entry of entries) {
    const date = entry.started_at || entry.updated_at
    if (!date) continue
    const month = new Date(date).getMonth() + 1
    monthCounts[month] = (monthCounts[month] || 0) + 1
  }

  if (Object.keys(monthCounts).length === 0) {
    return { isSeasonalWatcher: false, activeMonths: [], currentSeasonBoost: false, pattern: 'irregular' }
  }

  const totalEntries = Object.values(monthCounts).reduce((s, v) => s + v, 0)
  const avgPerMonth = totalEntries / 12
  const activeMonths = Object.entries(monthCounts)
    .filter(([, count]) => count > avgPerMonth * 1.5)
    .map(([month]) => parseInt(month))
    .sort((a, b) => a - b)

  const courMonths = new Set([1, 4, 7, 10])
  const courMatches = activeMonths.filter(m => courMonths.has(m)).length
  const isCour = courMatches >= 2
  const summerCount = (monthCounts[7] || 0) + (monthCounts[8] || 0)
  const isSummer = summerCount > avgPerMonth * 3 && !isCour
  const maxMonth = Math.max(...Object.values(monthCounts))
  const minMonth = Math.min(...Object.values(monthCounts))
  const isConstant = (maxMonth - minMonth) < avgPerMonth * 0.8
  const pattern = isCour ? 'cour' : isSummer ? 'summer' : isConstant ? 'constant' : 'irregular'
  const isSeasonalWatcher = isCour || (isSummer && !isConstant)
  const currentMonth = new Date().getMonth() + 1
  const currentSeasonBoost = activeMonths.includes(currentMonth) || (isCour && courMonths.has(currentMonth))

  return { isSeasonalWatcher, activeMonths, currentSeasonBoost, pattern }
}

function computeVelocityStats(entries: any[]): {
  fastestTitle: { title: string; days: number; type: string } | null
  avgVelocity: number
  velocityByGenre: Array<{ genre: string; avgDays: number }>
} {
  const completed = entries.filter(e => e.status === 'completed' && e.started_at && e.updated_at && e.current_episode > 0)
  if (!completed.length) return { fastestTitle: null, avgVelocity: 0, velocityByGenre: [] }

  const withVelocity = completed.map(e => {
    const days = Math.max(1, (new Date(e.updated_at).getTime() - new Date(e.started_at).getTime()) / 86400000)
    return { ...e, days }
  })
  const sorted = [...withVelocity].sort((a, b) => a.days - b.days)
  const fastest = sorted[0]
  const avgVelocity = withVelocity.reduce((s, e) => s + e.days, 0) / withVelocity.length
  const genreDays: Record<string, number[]> = {}

  for (const e of withVelocity) {
    for (const genre of (e.genres || [])) {
      if (!genreDays[genre]) genreDays[genre] = []
      genreDays[genre].push(e.days)
    }
  }

  const velocityByGenre = Object.entries(genreDays)
    .filter(([, days]) => days.length >= 2)
    .map(([genre, days]) => ({ genre, avgDays: Math.round(days.reduce((s, d) => s + d, 0) / days.length) }))
    .sort((a, b) => a.avgDays - b.avgDays)
    .slice(0, 8)

  return {
    fastestTitle: fastest ? { title: fastest.title, days: Math.round(fastest.days), type: fastest.type } : null,
    avgVelocity: Math.round(avgVelocity),
    velocityByGenre,
  }
}

function computeRewatchStats(entries: any[]): {
  mostRewatched: Array<{ title: string; count: number; type: string }>
  totalRewatches: number
} {
  const rewatched = entries
    .filter(e => (e.rewatch_count || 0) >= 1)
    .sort((a, b) => (b.rewatch_count || 0) - (a.rewatch_count || 0))
    .slice(0, 5)
    .map(e => ({ title: e.title, count: e.rewatch_count || 0, type: e.type }))
  const totalRewatches = entries.reduce((s, e) => s + (e.rewatch_count || 0), 0)
  return { mostRewatched: rewatched, totalRewatches }
}

export async function GET(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 20, windowMs: 60_000, prefix: 'taste-stats' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  const { searchParams } = new URL(request.url)
  const targetUserId = searchParams.get('userId') || user.id

  const { data: entries } = await supabase
    .from('user_media_entries')
    .select('title, type, genres, rating, status, started_at, updated_at, rewatch_count, current_episode, episodes, studios, directors, authors, developer')
    .eq('user_id', targetUserId)

  if (!entries || entries.length === 0) {
    return NextResponse.json({ empty: true }, { headers: rl.headers })
  }

  const { data: creatorProfile } = await supabase
    .from('user_creator_profile')
    .select('studios, directors, authors, developers')
    .eq('user_id', targetUserId)
    .maybeSingle()

  const seasonalPattern = detectSeasonalPattern(entries)
  const velocityStats = computeVelocityStats(entries)
  const rewatchStats = computeRewatchStats(entries)

  const topStudios = creatorProfile?.studios
    ? Object.entries(creatorProfile.studios as Record<string, number>)
        .sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, score]) => ({ name, score: Math.round(score) }))
    : []

  const topDirectors = creatorProfile?.directors
    ? Object.entries(creatorProfile.directors as Record<string, number>)
        .sort(([, a], [, b]) => b - a).slice(0, 5).map(([name, score]) => ({ name, score: Math.round(score) }))
    : []

  const negativeCounts: Record<string, number> = {}
  for (const entry of entries) {
    if (entry.status === 'dropped' || (entry.rating && entry.rating <= 2)) {
      for (const genre of (entry.genres || [])) {
        negativeCounts[genre] = (negativeCounts[genre] || 0) + 1
      }
    }
  }
  const negativeGenres = Object.entries(negativeCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([genre, count]) => ({ genre, count }))

  const byType: Record<string, { total: number; completed: number; dropped: number; avgRating: number }> = {}
  for (const entry of entries) {
    const t = entry.type || 'unknown'
    if (!byType[t]) byType[t] = { total: 0, completed: 0, dropped: 0, avgRating: 0 }
    byType[t].total++
    if (entry.status === 'completed') byType[t].completed++
    if (entry.status === 'dropped') byType[t].dropped++
  }
  for (const type of Object.keys(byType)) {
    const rated = entries.filter(e => e.type === type && e.rating > 0)
    byType[type].avgRating = rated.length
      ? Math.round((rated.reduce((s, e) => s + e.rating, 0) / rated.length) * 10) / 10
      : 0
  }

  return NextResponse.json({
    seasonal: seasonalPattern,
    velocity: velocityStats,
    rewatch: rewatchStats,
    creators: { studios: topStudios, directors: topDirectors },
    negativeGenres,
    byType,
    totalEntries: entries.length,
  }, { headers: rl.headers })
}
