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
  const month = new Date().getMonth() + 1
  const year  = new Date().getFullYear()
  const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL'

  // In EN mode prefer english title, fallback to romaji
  const titleField = lang === 'en'
    ? 'romaji english'
    : 'romaji'

  try {
    const query = `query ($season: MediaSeason, $year: Int) {
      current: Page(perPage: 20) {
        media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC, status: RELEASING) {
          id title { ${titleField} } coverImage { extraLarge large }
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
      .filter((m: any) => m.coverImage?.extraLarge || m.coverImage?.large)
      .map((m: any) => {
        const d = m.startDate
        const date = d?.year
          ? `${d.year}-${String(d.month || 1).padStart(2, '0')}-${String(d.day || 1).padStart(2, '0')}`
          : null
        const title = (lang === 'en' && m.title.english) ? m.title.english : m.title.romaji
        return {
          title,
          description: m.description
            ? m.description.replace(/<[^>]+>/g, '').slice(0, 300)
            : null,
          coverImage: m.coverImage.extraLarge || m.coverImage.large,
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

    const nowUnix        = Math.floor(Date.now() / 1000)
    const thirtyDaysAgo  = nowUnix - 30 * 24 * 3600
    const sixMonthsUnix  = nowUnix + 6 * 30 * 24 * 3600

    const res = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'text/plain',
      },
      body: `
        fields name, cover.url, first_release_date, summary, slug, total_rating_count, hypes;
        where first_release_date > ${thirtyDaysAgo} & first_release_date < ${sixMonthsUnix} & cover != null & category = 0 & (total_rating_count > 5 | hypes > 10 | first_release_date > ${nowUnix - 7 * 24 * 3600});
        sort first_release_date desc;
        limit 30;
      `,
    })
    if (!res.ok) return []
    const games = await res.json()
    const nowSec = Math.floor(Date.now() / 1000)
    return (Array.isArray(games) ? games : [])
      .filter((g: any) => g.cover?.url)
      .map((g: any) => ({
        title: g.name,
        description: g.summary?.slice(0, 300) || null,
        coverImage: `https:${g.cover.url.replace('t_thumb', 't_cover_big_2x')}`,
        date: g.first_release_date
          ? new Date(g.first_release_date * 1000).toISOString().split('T')[0]
          : null,
        category: 'gaming',
        source: 'IGDB',
        url: `https://www.igdb.com/games/${g.slug || g.name?.toLowerCase().replace(/\s+/g, '-')}`,
        _releaseTs: g.first_release_date || 0,
        _popularity: g.total_rating_count || 0,
      }))
      // Priorità: usciti di recente (ultimi 14gg) prima, poi futuri; a parità ordine per popolarità
      .sort((a: any, b: any) => {
        const aRecent = a._releaseTs > 0 && a._releaseTs <= nowSec && a._releaseTs > nowSec - 14 * 24 * 3600
        const bRecent = b._releaseTs > 0 && b._releaseTs <= nowSec && b._releaseTs > nowSec - 14 * 24 * 3600
        if (aRecent && !bRecent) return -1
        if (!aRecent && bRecent) return 1
        return b._releaseTs - a._releaseTs
      })
      .slice(0, 20)
      .map(({ _releaseTs, _popularity, ...rest }: any) => rest)
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