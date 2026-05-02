// DESTINAZIONE: src/app/api/recommendations/onboarding/route.ts
// Fast path dedicato all'onboarding.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const ANILIST_GQL = 'https://graphql.anilist.co'
const IGDB_GAMES = 'https://api.igdb.com/v4/games'
const IGDB_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const TARGET_PER_TYPE = 50
const VALID_TYPES = ['anime', 'manga', 'movie', 'tv', 'game'] as const

let _igdbToken: { token: string; expiresAt: number } | null = null

async function getIgdbToken(clientId: string, secret: string): Promise<string | null> {
  if (_igdbToken && _igdbToken.expiresAt > Date.now() + 60_000) return _igdbToken.token
  try {
    const res = await fetch(IGDB_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'client_credentials' }),
      signal: AbortSignal.timeout(6000),
    })
    const data = await res.json()
    if (!data.access_token) return null
    _igdbToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 }
    return _igdbToken.token
  } catch { return null }
}

async function fetchAnimeQuick(token: string): Promise<any[]> {
  if (!token) return []
  const results: any[] = []
  const seen = new Set<string>()
  const pages = [1, 2, 3]

  await Promise.all(pages.map(async (page) => {
    try {
      const params = new URLSearchParams({
        with_original_language: 'ja',
        with_genres: '16',
        sort_by: 'popularity.desc',
        'vote_count.gte': '100',
        'vote_average.gte': '6',
        language: 'it-IT',
        page: String(page),
      })
      const res = await fetch(`${TMDB_BASE}/discover/tv?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return
      const json = await res.json()
      for (const m of (json.results || [])) {
        if (!m.poster_path) continue
        const id = `tmdb-anime-${m.id}`
        if (seen.has(id)) continue
        seen.add(id)
        const year = m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined
        results.push({
          id, title: m.name || 'Senza titolo', type: 'anime',
          coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
          year, genres: [], score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
          description: m.overview || undefined,
          why: 'Popolare tra gli appassionati di anime',
          matchScore: Math.round((m.popularity || 0) / 10),
        })
      }
    } catch {}
  }))

  return results.slice(0, TARGET_PER_TYPE)
}

async function fetchMangaQuick(): Promise<any[]> {
  const results: any[] = []
  const query = `
    query ($page: Int) {
      Page(page: $page, perPage: 25) {
        media(type: MANGA, sort: POPULARITY_DESC, status_not: NOT_YET_RELEASED, isAdult: false) {
          id title { romaji english native } coverImage { extraLarge large }
          genres averageScore popularity startDate { year }
          description(asHtml: false)
        }
      }
    }
  `

  await Promise.all([1, 2].map(async (page) => {
    try {
      const res = await fetch(ANILIST_GQL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { page } }),
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return
      const json = await res.json()
      const media = json.data?.Page?.media || []
      for (const m of media) {
        const title = m.title?.italian || m.title?.english || m.title?.romaji || 'Senza titolo'
        results.push({
          id: `anilist-manga-${m.id}`,
          title,
          type: 'manga',
          coverImage: m.coverImage?.extraLarge || m.coverImage?.large,
          year: m.startDate?.year,
          genres: m.genres || [],
          score: m.averageScore ? m.averageScore / 20 : undefined,
          description: m.description ? m.description.replace(/<[^>]*>/g, '').slice(0, 300) : undefined,
          why: 'Tra i manga più amati della community',
          matchScore: Math.round((m.popularity || 0) / 100),
        })
      }
    } catch {}
  }))

  return results.slice(0, TARGET_PER_TYPE)
}

async function fetchMovieQuick(token: string): Promise<any[]> {
  if (!token) return []
  const results: any[] = []
  const seen = new Set<string>()

  await Promise.all([
    { sort: 'popularity.desc', page: 1 },
    { sort: 'popularity.desc', page: 2 },
    { sort: 'vote_average.desc', page: 1 },
  ].map(async ({ sort, page }) => {
    try {
      const params = new URLSearchParams({ sort_by: sort, 'vote_count.gte': '200', 'vote_average.gte': '6.5', language: 'it-IT', page: String(page) })
      const res = await fetch(`${TMDB_BASE}/discover/movie?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) })
      if (!res.ok) return
      const json = await res.json()
      for (const m of (json.results || [])) {
        if (!m.poster_path) continue
        const id = `tmdb-movie-${m.id}`
        if (seen.has(id)) continue
        seen.add(id)
        const year = m.release_date ? parseInt(m.release_date.slice(0, 4)) : undefined
        results.push({ id, title: m.title || 'Senza titolo', type: 'movie', coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`, year, genres: [], score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined, description: m.overview || undefined, why: 'Film apprezzato dalla critica e dal pubblico', matchScore: Math.round((m.popularity || 0) / 10) })
      }
    } catch {}
  }))

  return results.slice(0, TARGET_PER_TYPE)
}

async function fetchTvQuick(token: string): Promise<any[]> {
  if (!token) return []
  const results: any[] = []
  const seen = new Set<string>()

  await Promise.all([
    { sort: 'popularity.desc', page: 1 },
    { sort: 'popularity.desc', page: 2 },
    { sort: 'vote_average.desc', page: 1 },
  ].map(async ({ sort, page }) => {
    try {
      const params = new URLSearchParams({ sort_by: sort, without_genres: '16', without_keywords: '210024', 'vote_count.gte': '100', 'vote_average.gte': '6.5', language: 'it-IT', page: String(page) })
      const res = await fetch(`${TMDB_BASE}/discover/tv?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) })
      if (!res.ok) return
      const json = await res.json()
      for (const m of (json.results || [])) {
        if (!m.poster_path) continue
        const id = `tmdb-tv-${m.id}`
        if (seen.has(id)) continue
        seen.add(id)
        const year = m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined
        results.push({ id, title: m.name || 'Senza titolo', type: 'tv', coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`, year, genres: [], score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined, description: m.overview || undefined, why: 'Serie TV molto seguita', matchScore: Math.round((m.popularity || 0) / 10) })
      }
    } catch {}
  }))

  return results.slice(0, TARGET_PER_TYPE)
}

async function fetchGameQuick(clientId: string, secret: string): Promise<any[]> {
  if (!clientId || !secret) return []
  const token = await getIgdbToken(clientId, secret)
  if (!token) return []
  const results: any[] = []

  await Promise.all([
    `fields id,name,cover.url,genres.name,rating,rating_count,summary,first_release_date,involved_companies.company.name,involved_companies.developer; where rating >= 75 & rating_count >= 200 & cover != null & themes != (42); sort rating_count desc; limit 25;`,
    `fields id,name,cover.url,genres.name,rating,rating_count,summary,first_release_date,involved_companies.company.name,involved_companies.developer; where rating >= 70 & rating_count >= 100 & cover != null & themes != (42); sort rating desc; limit 25;`,
  ].map(async (body) => {
    try {
      const res = await fetch(IGDB_GAMES, {
        method: 'POST',
        headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
        body,
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return
      const games = await res.json()
      for (const g of games) {
        if (!g.cover?.url) continue
        const coverUrl = g.cover.url.replace('t_thumb', 't_cover_big_2x')
        const year = g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined
        results.push({ id: `igdb-${g.id}`, title: g.name || 'Senza titolo', type: 'game', coverImage: coverUrl.startsWith('//') ? `https:${coverUrl}` : coverUrl, year, genres: (g.genres || []).map((gn: any) => gn.name).filter(Boolean), score: g.rating ? Math.min(g.rating / 20, 5) : undefined, description: g.summary ? g.summary.slice(0, 300) : undefined, why: 'Titolo acclamato dai giocatori', matchScore: Math.round((g.rating || 0)) })
      }
    } catch {}
  }))

  const seen = new Set<string>()
  return results.filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true }).slice(0, TARGET_PER_TYPE)
}

export async function GET(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 20, windowMs: 60_000, prefix: 'recommendations:onboarding' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers })

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

    const { searchParams } = new URL(request.url)
    const typesParam = searchParams.get('types')
    const requestedTypes = typesParam
      ? [...new Set(typesParam.split(',').filter(t => VALID_TYPES.includes(t as any)))].slice(0, VALID_TYPES.length)
      : [...VALID_TYPES]

    const tmdbToken = process.env.TMDB_API_KEY || ''
    const igdbClientId = process.env.IGDB_CLIENT_ID || ''
    const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || ''

    const fetchMap: Record<string, () => Promise<any[]>> = {
      anime: () => fetchAnimeQuick(tmdbToken),
      manga: () => fetchMangaQuick(),
      movie: () => fetchMovieQuick(tmdbToken),
      tv: () => fetchTvQuick(tmdbToken),
      game: () => fetchGameQuick(igdbClientId, igdbClientSecret),
    }

    const fetchers = requestedTypes.map(type => fetchMap[type]().then(items => ({ type, items })))
    const fetchResults = await Promise.allSettled(fetchers)

    const recommendations: Record<string, any[]> = {}
    for (const result of fetchResults) {
      if (result.status === 'fulfilled') {
        const { type, items } = result.value
        if (items.length > 0) recommendations[type] = items
      }
    }

    return NextResponse.json({ recommendations, source: 'onboarding_quick', cached: false }, {
      headers: { ...rl.headers, 'Cache-Control': 'no-store', 'X-Source': 'onboarding-quick' }
    })
  } catch (err) {
    logger.error('OnboardingQuick', 'error', err)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500, headers: rl.headers })
  }
}
