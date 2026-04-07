import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12 ore

// ── Helpers ──────────────────────────────────────────────────────────────────

function tmdbHeaders() {
  return {
    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_TMDB_API_KEY}`,
    'Accept': 'application/json',
  }
}

function tmdbImageUrl(path: string | null, size = 'w500') {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null
}

// ── Fetchers per categoria ────────────────────────────────────────────────────

async function fetchCinema() {
  try {
    const res = await fetch(
      'https://api.themoviedb.org/3/movie/upcoming?language=it-IT&page=1&region=IT',
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

async function fetchTV() {
  try {
    const res = await fetch(
      'https://api.themoviedb.org/3/tv/on_the_air?language=it-IT&page=1',
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

async function fetchAnime() {
  try {
    // Calcola la stagione corrente
    const month = new Date().getMonth() + 1
    const year = new Date().getFullYear()
    const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL'

    const query = `query ($season: MediaSeason, $year: Int) {
      current: Page(perPage: 15) {
        media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, status: RELEASING) {
          id title { romaji } coverImage { large } nextAiringEpisode { airingAt episode }
          description(asHtml: false) siteUrl startDate { year month day }
        }
      }
    }`
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { season, year } }),
    })
    if (!res.ok) return []
    const json = await res.json()
    return (json.data?.current?.media || [])
      .filter((m: any) => m.coverImage?.large)
      .map((m: any) => {
        const d = m.startDate
        const date = d?.year ? `${d.year}-${String(d.month || 1).padStart(2, '0')}-${String(d.day || 1).padStart(2, '0')}` : null
        return {
          title: m.title.romaji,
          description: m.description
            ? m.description.replace(/<[^>]+>/g, '').slice(0, 300)
            : null,
          coverImage: m.coverImage.large,
          date,
          nextEpisode: m.nextAiringEpisode?.episode,
          category: 'anime',
          source: 'AniList',
          url: m.siteUrl,
        }
      })
  } catch { return [] }
}

async function fetchGaming() {
  try {
    const clientId = process.env.IGDB_CLIENT_ID
    const clientSecret = process.env.IGDB_CLIENT_SECRET
    if (!clientId || !clientSecret) return []

    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) return []

    const nowUnix = Math.floor(Date.now() / 1000)
    const sixMonthsUnix = nowUnix + 6 * 30 * 24 * 3600

    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'text/plain',
      },
      body: `
        fields name, cover.url, first_release_date, summary, platforms.name;
        where first_release_date > ${nowUnix} & first_release_date < ${sixMonthsUnix} & cover != null;
        sort first_release_date asc;
        limit 20;
      `,
    })
    if (!res.ok) return []
    const games = await res.json()
    return (Array.isArray(games) ? games : [])
      .filter((g: any) => g.cover?.url)
      .map((g: any) => ({
        title: g.name,
        description: g.summary?.slice(0, 300) || null,
        coverImage: `https:${g.cover.url.replace('t_thumb', 't_cover_big')}`,
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

export async function POST() {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const [cinema, tv, anime, gaming] = await Promise.all([
      fetchCinema(),
      fetchTV(),
      fetchAnime(),
      fetchGaming(),
    ])

    const now = new Date().toISOString()

    await Promise.all([
      supabase.from('news_cache').upsert({ category: 'cinema', data: cinema, updated_at: now }, { onConflict: 'category' }),
      supabase.from('news_cache').upsert({ category: 'tv',     data: tv,     updated_at: now }, { onConflict: 'category' }),
      supabase.from('news_cache').upsert({ category: 'anime',  data: anime,  updated_at: now }, { onConflict: 'category' }),
      supabase.from('news_cache').upsert({ category: 'gaming', data: gaming, updated_at: now }, { onConflict: 'category' }),
    ])

    return NextResponse.json({
      status: 'ok',
      counts: { cinema: cinema.length, tv: tv.length, anime: anime.length, gaming: gaming.length },
    })
  } catch (err) {
    console.error('[News sync] error:', err)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}

export async function GET() {
  // Trigger sync via GET per comodità (es. da cron Vercel)
  return POST()
}
