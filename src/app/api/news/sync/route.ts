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

const TMDB_MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
  53: 'Thriller', 10752: 'War', 37: 'Western',
}

const TMDB_TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure', 16: 'Animation', 35: 'Comedy',
  80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
  10762: 'Kids', 9648: 'Mystery', 10765: 'Sci-Fi & Fantasy', 37: 'Western',
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
        id: `tmdb-${m.id}`,
        type: 'movie',
        source_api: 'tmdb',
        title: m.title,
        description: m.overview?.slice(0, 500),
        coverImage: tmdbImageUrl(m.poster_path),
        date: m.release_date,
        year: m.release_date ? parseInt(m.release_date.slice(0, 4)) : undefined,
        genres: (m.genre_ids || []).map((id: number) => TMDB_MOVIE_GENRES[id]).filter(Boolean),
        score: m.vote_average > 0 ? Math.round(m.vote_average * 5) / 10 : undefined,
        original_language: m.original_language,
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
        id: `tmdb-${m.id}`,
        type: 'tv',
        source_api: 'tmdb',
        title: m.name,
        description: m.overview?.slice(0, 500),
        coverImage: tmdbImageUrl(m.poster_path),
        date: m.first_air_date,
        year: m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined,
        genres: (m.genre_ids || []).map((id: number) => TMDB_TV_GENRES[id]).filter(Boolean),
        score: m.vote_average > 0 ? Math.round(m.vote_average * 5) / 10 : undefined,
        original_language: m.original_language,
        category: 'tv',
        source: 'TMDb',
        url: `https://www.themoviedb.org/tv/${m.id}`,
      }))
  } catch { return [] }
}

async function fetchAnime(lang: string) {
  const month = new Date().getMonth() + 1
  const year  = new Date().getFullYear()
  const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL'

  const titleField = lang === 'en' ? 'romaji english' : 'romaji'

  try {
    const query = `query ($season: MediaSeason, $year: Int) {
      current: Page(perPage: 20) {
        media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, status: RELEASING) {
          id title { ${titleField} } coverImage { large } genres episodes averageScore format duration
          studios(isMain: true) { nodes { name } }
          nextAiringEpisode { airingAt episode }
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
        const date = d?.year
          ? `${d.year}-${String(d.month || 1).padStart(2, '0')}-${String(d.day || 1).padStart(2, '0')}`
          : null
        const title = (lang === 'en' && m.title.english) ? m.title.english : m.title.romaji
        return {
          id: `anilist-${m.id}`,
          type: 'anime',
          source_api: 'anilist',
          title,
          description: m.description
            ? m.description.replace(/<[^>]+>/g, '').slice(0, 500)
            : null,
          coverImage: m.coverImage.large,
          date,
          year: d?.year ?? undefined,
          genres: m.genres || [],
          episodes: m.episodes ?? undefined,
          score: m.averageScore ? Math.round(m.averageScore / 2) / 10 : undefined,
          studios: (m.studios?.nodes || []).map((s: any) => s.name).filter(Boolean),
          nextEpisode: m.nextAiringEpisode?.episode,
          format: m.format ?? undefined,
          duration: m.duration ?? undefined,
          category: 'anime',
          source: 'AniList',
          url: m.siteUrl,
        }
      })
  } catch { return [] }
}

async function fetchGaming() {
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
    const threeMonthsBack = nowUnix - 3 * 30 * 24 * 3600
    const sixMonthsFwd    = nowUnix + 6 * 30 * 24 * 3600

    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'text/plain',
      },
      body: `
        fields id, name, cover.url, first_release_date, summary, storyline, slug, rating, rating_count,
               genres.name, involved_companies.company.name, involved_companies.developer,
               platforms.name, game_modes.name, themes.name;
        where first_release_date > ${threeMonthsBack} & first_release_date < ${sixMonthsFwd} & cover != null & rating_count > 5;
        sort first_release_date desc;
        limit 30;
      `,
    })
    if (!res.ok) return []
    const games = await res.json()
    return (Array.isArray(games) ? games : [])
      .filter((g: any) => g.cover?.url)
      .map((g: any) => {
        const releaseDate = g.first_release_date
          ? new Date(g.first_release_date * 1000).toISOString().split('T')[0]
          : null
        return {
          id: `igdb-${g.id}`,
          type: 'game',
          source_api: 'igdb',
          title: g.name,
          description: (g.summary || g.storyline)?.slice(0, 500) || null,
          coverImage: `https:${g.cover.url.replace('t_thumb', 't_1080p')}`,
          date: releaseDate,
          year: releaseDate ? parseInt(releaseDate.slice(0, 4)) : undefined,
          genres: (g.genres || []).map((gr: any) => gr.name).filter(Boolean),
          score: g.rating ? Math.round(g.rating / 2) / 10 : undefined,
          developers: (g.involved_companies || [])
            .filter((c: any) => c.developer)
            .map((c: any) => c.company?.name)
            .filter(Boolean),
          platforms: (g.platforms || []).map((p: any) => p.name).filter(Boolean),
          mechanics: (g.game_modes || []).map((m: any) => m.name).filter(Boolean),
          themes: (g.themes || []).map((t: any) => t.name).filter(Boolean),
          category: 'gaming',
          source: 'IGDB',
          url: `https://www.igdb.com/games/${g.slug || g.name?.toLowerCase().replace(/\s+/g, '-')}`,
        }
      })
  } catch { return [] }
}

// ── Route handler ─────────────────────────────────────────────────────────────

async function runSync(lang: 'it' | 'en') {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const suffix = `_${lang}`

  const [cinema, tv, anime, gaming] = await Promise.all([
    fetchCinema(lang),
    fetchTV(lang),
    fetchAnime(lang),
    fetchGaming(),
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
