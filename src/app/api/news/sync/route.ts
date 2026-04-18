import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// ── Helpers ──────────────────────────────────────────────────────────────────

function tmdbHeaders() {
  return {
    'Authorization': `Bearer ${process.env.TMDB_API_KEY}`,
    'Accept': 'application/json',
  }
}

function tmdbImageUrl(path: string | null, size = 'w500') {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchCinema(lang: string) {
  const tmdbLang = lang === 'en' ? 'en-US' : 'it-IT'
  const region   = lang === 'en' ? 'US' : 'IT'
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/upcoming?language=${tmdbLang}&page=1&region=${region}`,
      { headers: tmdbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) return []
    const json = await res.json()
    return (json.results || []).slice(0, 20)
      .filter((m: any) => m.poster_path && m.overview)
      .map((m: any) => ({
        title: m.title,
        description: m.overview?.slice(0, 300),
        coverImage: tmdbImageUrl(m.poster_path),
        date: m.release_date,
        category: 'cinema',
        source: 'TMDb',
        url: `https://www.themoviedb.org/movie/${m.id}`,
      }))
  } catch { return [] }
}

async function fetchTV(lang: string) {
  const tmdbLang = lang === 'en' ? 'en-US' : 'it-IT'
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/on_the_air?language=${tmdbLang}&page=1`,
      { headers: tmdbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) return []
    const json = await res.json()
    return (json.results || []).slice(0, 20)
      .filter((m: any) => m.poster_path && m.overview)
      .map((m: any) => ({
        title: m.name,
        description: m.overview?.slice(0, 300),
        coverImage: tmdbImageUrl(m.poster_path),
        date: m.first_air_date,
        category: 'tv',
        source: 'TMDb',
        url: `https://www.themoviedb.org/tv/${m.id}`,
      }))
  } catch { return [] }
}

async function fetchAnime(lang: string) {
  const tmdbLang = lang === 'en' ? 'en-US' : 'it-IT'
  const region   = lang === 'en' ? 'US' : 'IT'
  const { from, to } = dateRange(60, 60)

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/discover/tv?language=${tmdbLang}&sort_by=popularity.desc&with_original_language=ja&with_genres=16&air_date.gte=${from}&air_date.lte=${to}&include_null_first_air_dates=false`,
      { headers: tmdbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) return []
    const json = await res.json()
    const shows = (json.results || []).slice(0, 20)
      .filter((m: any) => m.poster_path && m.overview)

    const details = await Promise.all(
      shows.map((s: any) => tmdbDetail(`/tv/${s.id}?language=${tmdbLang}&append_to_response=aggregate_credits,watch%2Fproviders,keywords`))
    )

    return shows.map((m: any, i: number) => {
      const d             = details[i]
      const studios       = (d?.networks || []).slice(0, 2).map((n: any) => n.name).filter(Boolean)
      const cast          = (d?.aggregate_credits?.cast || []).slice(0, 5).map((a: any) => a.name).filter(Boolean)
      const providers     = (d?.['watch/providers']?.results?.[region]?.flatrate || []).map((p: any) => p.provider_name).filter(Boolean)
      const keywords      = (d?.keywords?.results || []).slice(0, 6).map((k: any) => k.name).filter(Boolean)
      const nextEpisodeDate = d?.next_episode_to_air?.air_date || null
      return {
        id: `tmdb-anime-${m.id}`,
        type: 'anime',
        source_api: 'tmdb' as const,
        title: m.name,
        description: m.overview?.slice(0, 500),
        coverImage: tmdbImageUrl(m.poster_path),
        date: m.first_air_date,
        year: m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined,
        genres: (m.genre_ids || []).map((id: number) => TMDB_TV_GENRES[id]).filter(Boolean),
        score: m.vote_average > 0 ? Math.round(m.vote_average * 5) / 10 : undefined,
        episodes: d?.number_of_episodes || undefined,
        studios: studios.length ? studios : undefined,
        cast: cast.length ? cast : undefined,
        totalSeasons: d?.number_of_seasons || undefined,
        watchProviders: providers.length ? providers : undefined,
        themes: keywords.length ? keywords : undefined,
        nextEpisodeDate: nextEpisodeDate || undefined,
        category: 'anime' as const,
        source: 'TMDb',
        url: `https://www.themoviedb.org/tv/${m.id}`,
      }
    })
  } catch { return [] }
}

async function fetchGaming() {
  // IGDB è sempre in inglese — una sola versione
  try {
    const clientId     = process.env.IGDB_CLIENT_ID
    const clientSecret = process.env.IGDB_CLIENT_SECRET
    if (!clientId || !clientSecret) return []

    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials',
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) return []

    const nowUnix         = Math.floor(Date.now() / 1000)
    const threeMonthsBack = nowUnix - 3 * 30 * 24 * 3600   // ultimi 3 mesi
    const sixMonthsFwd    = nowUnix + 6 * 30 * 24 * 3600   // prossimi 6 mesi

    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'text/plain',
      },
      body: `
        fields name, cover.url, first_release_date, summary, slug, rating, rating_count;
        where first_release_date > ${threeMonthsBack} & first_release_date < ${sixMonthsFwd} & cover != null & rating_count > 5;
        sort first_release_date desc;
        limit 30;
      `,
    })
    if (!res.ok) return []
    const games = await res.json()
    return (Array.isArray(games) ? games : [])
      .filter((g: any) => g.cover?.url)
      .map((g: any) => ({
        title: g.name,
        description: g.summary?.slice(0, 300) || null,
        coverImage: `https:${g.cover.url.replace('t_thumb', 't_1080p')}`,
        date: g.first_release_date
          ? new Date(g.first_release_date * 1000).toISOString().split('T')[0]
          : null,
        category: 'gaming',
        source: 'IGDB',
        url: `https://www.igdb.com/games/${g.slug || g.name?.toLowerCase().replace(/\s+/g, '-')}`,
      }))
  } catch { return [] }
}

// ── Route handler ─────────────────────────────────────────────────────────────

async function runSync(lang: 'it' | 'en') {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const suffix = `_${lang}` // es. cinema_it, cinema_en

  const [cinema, tv, anime, gaming] = await Promise.all([
    fetchCinema(lang),
    fetchTV(lang),
    fetchAnime(lang),
    fetchGaming(),       // IGDB sempre in EN, condiviso
  ])

  const now = new Date().toISOString()

  await Promise.all([
    supabase.from('news_cache').upsert({ category: `cinema${suffix}`, data: cinema, updated_at: now }, { onConflict: 'category' }),
    supabase.from('news_cache').upsert({ category: `tv${suffix}`,     data: tv,     updated_at: now }, { onConflict: 'category' }),
    supabase.from('news_cache').upsert({ category: `anime${suffix}`,  data: anime,  updated_at: now }, { onConflict: 'category' }),
    supabase.from('news_cache').upsert({ category: `gaming${suffix}`, data: gaming, updated_at: now }, { onConflict: 'category' }),
  ])

  return { cinema: cinema.length, tv: tv.length, anime: anime.length, gaming: gaming.length }
}

export async function POST(request: NextRequest) {
  try {
    let lang: 'it' | 'en' = 'it'
    try {
      const body = await request.json()
      if (body?.lang === 'en') lang = 'en'
    } catch {}

    const counts = await runSync(lang)
    return NextResponse.json({ status: 'ok', lang, counts })
  } catch (err) {
    logger.error('[News sync] error:', err)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get('lang') === 'en' ? 'en' : 'it'
  try {
    const counts = await runSync(lang)
    return NextResponse.json({ status: 'ok', lang, counts })
  } catch (err) {
    logger.error('[News sync] error:', err)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}