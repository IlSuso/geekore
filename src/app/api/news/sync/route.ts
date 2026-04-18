import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmdbHeaders() {
  return {
    'Authorization': `Bearer ${process.env.TMDB_API_KEY}`,
    'Accept': 'application/json',
  }
}

function tmdbImageUrl(path: string | null, size = 'w500') {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null
}

async function tmdbDetail(endpoint: string): Promise<any> {
  try {
    const res = await fetch(`https://api.themoviedb.org/3${endpoint}`, {
      headers: tmdbHeaders(), cache: 'no-store',
    })
    return res.ok ? await res.json() : null
  } catch { return null }
}

function dateRange(daysBefore: number, daysAfter: number) {
  const now  = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - daysBefore)
  const to = new Date(now)
  to.setDate(to.getDate() + daysAfter)
  return {
    from: from.toISOString().split('T')[0],
    to:   to.toISOString().split('T')[0],
  }
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
  const { from, to } = dateRange(60, 60)

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/discover/movie?language=${tmdbLang}&region=${region}&sort_by=popularity.desc&primary_release_date.gte=${from}&primary_release_date.lte=${to}`,
      { headers: tmdbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) return []
    const json = await res.json()
    const movies = (json.results || []).slice(0, 15)
      .filter((m: any) => m.poster_path && m.overview)

    const details = await Promise.all(
      movies.map((m: any) => tmdbDetail(`/movie/${m.id}?language=${tmdbLang}&append_to_response=credits,keywords,watch%2Fproviders`))
    )

    return movies.map((m: any, i: number) => {
      const d = details[i]
      const director  = d?.credits?.crew?.find((p: any) => p.job === 'Director')?.name
      const studios   = (d?.production_companies || []).slice(0, 2).map((c: any) => c.name).filter(Boolean)
      const cast      = (d?.credits?.cast || []).slice(0, 5).map((a: any) => a.name).filter(Boolean)
      const keywords  = (d?.keywords?.keywords || []).slice(0, 6).map((k: any) => k.name).filter(Boolean)
      const providers = (d?.['watch/providers']?.results?.[region]?.flatrate || []).map((p: any) => p.provider_name).filter(Boolean)
      return {
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
        playing_time: d?.runtime || undefined,
        studios: studios.length ? studios : undefined,
        directors: director ? [director] : undefined,
        cast: cast.length ? cast : undefined,
        themes: keywords.length ? keywords : undefined,
        watchProviders: providers.length ? providers : undefined,
        category: 'cinema',
        source: 'TMDb',
        url: `https://www.themoviedb.org/movie/${m.id}`,
      }
    })
  } catch { return [] }
}

async function fetchTV(lang: string) {
  const tmdbLang = lang === 'en' ? 'en-US' : 'it-IT'
  const region   = lang === 'en' ? 'US' : 'IT'
  const { from, to } = dateRange(60, 60)

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/discover/tv?language=${tmdbLang}&sort_by=popularity.desc&air_date.gte=${from}&air_date.lte=${to}&include_null_first_air_dates=false`,
      { headers: tmdbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) return []
    const json = await res.json()
    const shows = (json.results || []).slice(0, 15)
      .filter((m: any) => m.poster_path && m.overview)

    const details = await Promise.all(
      shows.map((s: any) => tmdbDetail(`/tv/${s.id}?language=${tmdbLang}&append_to_response=aggregate_credits,watch%2Fproviders,keywords`))
    )

    return shows.map((m: any, i: number) => {
      const d        = details[i]
      const networks = (d?.networks || []).slice(0, 2).map((n: any) => n.name).filter(Boolean)
      const creators = (d?.created_by || []).slice(0, 2).map((c: any) => c.name).filter(Boolean)
      const runtime  = d?.episode_run_time?.[0] || undefined
      const cast     = (d?.aggregate_credits?.cast || []).slice(0, 5).map((a: any) => a.name).filter(Boolean)
      const providers        = (d?.['watch/providers']?.results?.[region]?.flatrate || []).map((p: any) => p.provider_name).filter(Boolean)
      const keywords         = (d?.keywords?.results || []).slice(0, 6).map((k: any) => k.name).filter(Boolean)
      const nextEpisodeDate  = d?.next_episode_to_air?.air_date || null
      const seasons: Record<number, { episode_count: number }> = {}
      for (const s of (d?.seasons || [])) {
        if (s.season_number > 0) seasons[s.season_number] = { episode_count: s.episode_count }
      }
      return {
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
        playing_time: runtime,
        studios: networks.length ? networks : undefined,
        directors: creators.length ? creators : undefined,
        cast: cast.length ? cast : undefined,
        totalSeasons: d?.number_of_seasons || undefined,
        seasons: Object.keys(seasons).length ? seasons : undefined,
        watchProviders: providers.length ? providers : undefined,
        themes: keywords.length ? keywords : undefined,
        nextEpisodeDate: nextEpisodeDate || undefined,
        category: 'tv',
        source: 'TMDb',
        url: `https://www.themoviedb.org/tv/${m.id}`,
      }
    })
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

    const nowUnix        = Math.floor(Date.now() / 1000)
    const thirtyDaysBack = nowUnix - 60 * 24 * 3600
    const thirtyDaysFwd  = nowUnix + 60 * 24 * 3600

    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'text/plain',
      },
      body: `
        fields id, name, cover.url, first_release_date, summary, storyline, slug, rating, rating_count,
               total_rating, hypes, genres.name, involved_companies.company.name, involved_companies.developer,
               platforms.name, game_modes.name, themes.name,
               language_supports.language.locale, language_supports.language_support_type.name;
        where first_release_date > ${thirtyDaysBack} & first_release_date < ${thirtyDaysFwd} & cover != null & (rating_count > 0 | hypes > 0 | first_release_date > ${nowUnix});
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
          score: (g.total_rating || g.rating) ? Math.round((g.total_rating ?? g.rating) / 2) / 10 : undefined,
          italianSupportTypes: (g.language_supports || [])
            .filter((ls: any) => ls.language?.locale?.startsWith('it'))
            .map((ls: any) => ls.language_support_type?.name)
            .filter(Boolean),
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
