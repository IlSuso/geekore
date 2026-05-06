// /api/recommendations/similar
// Cerca titoli simili per GENERI + KEYWORDS/TAGS — mai per titolo.

import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { translateWithCache } from '@/lib/deepl'
import { logger } from '@/lib/logger'
import { TMDB_META_KW_BLOCKLIST } from '@/lib/reco/similar/constants'
import { resolveGenres } from '@/lib/reco/similar/genreResolution'
import { fetchAnilistManga } from '@/lib/reco/similar/anilist'
import { fetchIgdbGames } from '@/lib/reco/similar/igdb'
import { resolveProxyKeywords, resolveTmdbKeywordIds, fetchTmdbAnime, fetchTmdbMovies, fetchTmdbTv } from '@/lib/reco/similar/tmdb'
import { scoreAndBalanceSimilarResults } from '@/lib/reco/similar/scoring'
import type { SimilarContext, SimilarItem } from '@/lib/reco/similar/types'

const TRANSLATE_TYPES = new Set(['game', 'manga'])
const VALID_SOURCE_TYPES = new Set(['anime', 'manga', 'movie', 'tv', 'game', 'boardgame'])

function cleanParam(value: string | null, maxLength: number): string {
  return (value || '').trim().slice(0, maxLength)
}

function cleanListParam(value: string | null, maxItems: number, maxItemLength: number): string[] {
  return [...new Set((value || '')
    .split(',')
    .map(item => item.trim().slice(0, maxItemLength))
    .filter(Boolean)
  )].slice(0, maxItems)
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'similar' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sourceTitle = cleanParam(searchParams.get('title'), 300)
  const rawGenres = cleanListParam(searchParams.get('genres'), 20, 80)
  const rawKeywords = cleanListParam(searchParams.get('keywords'), 30, 80)
  const rawTags = cleanListParam(searchParams.get('tags'), 30, 80)
  const excludeId = cleanParam(searchParams.get('excludeId'), 120)
  const rawSourceType = cleanParam(searchParams.get('type'), 40)
  const sourceType = VALID_SOURCE_TYPES.has(rawSourceType) ? rawSourceType : ''
  const excludeIdNum = /^\d+$/.test(excludeId) ? parseInt(excludeId, 10) : NaN

  if (rawGenres.length === 0) return NextResponse.json({ error: 'genres richiesti' }, { status: 400 })

  const tmdbToken = process.env.TMDB_API_KEY || ''
  const igdbClientId = process.env.IGDB_CLIENT_ID || ''
  const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || ''

  const { data: tasteData } = await supabase
    .from('user_taste_profile').select('genre_scores').eq('user_id', user.id).maybeSingle()
  const genreScores: Record<string, number> = (tasteData?.genre_scores as any) || {}
  const maxGenreScore = Math.max(...Object.values(genreScores), 1)

  const { igdbGenres, crossGenres, anilistGenres, tmdbMovieIds, tmdbTvIds } = resolveGenres(rawGenres)

  const allSourceKeywords = [...new Set([...rawKeywords, ...rawTags])]
  const thematicKeywords = allSourceKeywords.filter(kw => !TMDB_META_KW_BLOCKLIST.has(kw.toLowerCase()))

  let effectiveKeywords = thematicKeywords
  if (effectiveKeywords.length === 0 && tmdbToken) {
    effectiveKeywords = await resolveProxyKeywords(sourceType, excludeIdNum, excludeId, tmdbToken)
    if (effectiveKeywords.length > 0) {
      logger.info('SIMILAR', 'Proxy keywords active', { count: effectiveKeywords.length })
    }
  }

  const tmdbKeywordIdsPromise = (tmdbToken && effectiveKeywords.length > 0)
    ? resolveTmdbKeywordIds(effectiveKeywords, tmdbToken)
    : Promise.resolve([] as number[])

  const results: SimilarItem[] = []
  const seenIds = new Set<string>()

  const profileBoost = (recGenres: string[]) =>
    Math.min(25, Math.round(recGenres.reduce((s, g) => s + (genreScores[g] || 0), 0) / maxGenreScore * 25))

  const whyText = (recGenres: string[], matchedKeywords?: string[]) => {
    const shared = recGenres.filter(g => rawGenres.includes(g) || crossGenres.includes(g)).slice(0, 2)
    if (matchedKeywords?.length) return `Temi simili: ${matchedKeywords.slice(0,2).join(', ')}`
    return shared.length > 0 ? `Condivide ${shared.join(', ')} con "${sourceTitle}"` : `Simile a "${sourceTitle}"`
  }

  const add = (item: SimilarItem) => {
    if (!item.id) return
    if (seenIds.has(item.id)) return
    if (excludeId && item.id === excludeId) return
    seenIds.add(item.id)
    results.push(item)
  }

  const ctx: SimilarContext = {
    sourceTitle,
    rawGenres,
    rawKeywords,
    rawTags,
    excludeId,
    sourceType,
    excludeIdNum,
    tmdbToken,
    igdbClientId,
    igdbClientSecret,
    genreScores,
    maxGenreScore,
    igdbGenres,
    crossGenres,
    anilistGenres,
    tmdbMovieIds,
    tmdbTvIds,
    effectiveKeywords,
    tmdbKeywordIdsPromise,
    profileBoost,
    whyText,
  }

  await Promise.allSettled([
    fetchIgdbGames(ctx, add),
    fetchTmdbAnime(ctx, add),
    fetchTmdbMovies(ctx, add),
    fetchTmdbTv(ctx, add),
    fetchAnilistManga(ctx, add),
  ])

  const clean = scoreAndBalanceSimilarResults(results, ctx)
  await translateDescriptions(clean)

  return NextResponse.json({ items: clean, total: clean.length }, { headers: rl.headers })
}

async function translateDescriptions(items: SimilarItem[]) {
  const descItems = items
    .filter(r => r.description && TRANSLATE_TYPES.has(r.type))
    .map(r => ({ id: r.type === 'game' ? `igdb:${r.id}` : r.id, text: r.description! }))
  if (descItems.length === 0) return

  const translations = await translateWithCache(descItems)
  items.forEach(r => {
    if (!r.description || !TRANSLATE_TYPES.has(r.type)) return
    const key = r.type === 'game' ? `igdb:${r.id}` : r.id
    r.description = translations[key] || r.description
  })
}
