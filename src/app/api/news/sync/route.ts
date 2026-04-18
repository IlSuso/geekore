import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { parseStringPromise } from 'xml2js'
import { translateTexts } from '@/lib/deepl'

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

async function tmdbDetail(endpoint: string): Promise<any> {
  try {
    const res = await fetch(`https://api.themoviedb.org/3${endpoint}`, {
      headers: tmdbHeaders(), cache: 'no-store',
    })
    return res.ok ? await res.json() : null
  } catch { return null }
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
    const movies = (json.results || []).slice(0, 15)
      .filter((m: any) => m.poster_path && m.overview)

    const details = await Promise.all(
      movies.map((m: any) => tmdbDetail(`/movie/${m.id}?language=${tmdbLang}&append_to_response=credits,keywords,watch%2Fproviders`))
    )

    return movies.map((m: any, i: number) => {
      const d = details[i]
      const director = d?.credits?.crew?.find((p: any) => p.job === 'Director')?.name
      const studios = (d?.production_companies || []).slice(0, 2).map((c: any) => c.name).filter(Boolean)
      const cast = (d?.credits?.cast || []).slice(0, 5).map((a: any) => a.name).filter(Boolean)
      const keywords = (d?.keywords?.keywords || []).slice(0, 6).map((k: any) => k.name).filter(Boolean)
      const providers = (d?.['watch/providers']?.results?.IT?.flatrate || []).map((p: any) => p.provider_name).filter(Boolean)
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
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/on_the_air?language=${tmdbLang}&page=1`,
      { headers: tmdbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) return []
    const json = await res.json()
    const shows = (json.results || []).slice(0, 15)
      .filter((m: any) => m.poster_path && m.overview)

    const details = await Promise.all(
      shows.map((s: any) => tmdbDetail(`/tv/${s.id}?language=${tmdbLang}&append_to_response=aggregate_credits,watch%2Fproviders`))
    )

    return shows.map((m: any, i: number) => {
      const d = details[i]
      const networks = (d?.networks || []).slice(0, 2).map((n: any) => n.name).filter(Boolean)
      const creators = (d?.created_by || []).slice(0, 2).map((c: any) => c.name).filter(Boolean)
      const runtime = d?.episode_run_time?.[0] || undefined
      const cast = (d?.aggregate_credits?.cast || []).slice(0, 5).map((a: any) => a.name).filter(Boolean)
      const providers = (d?.['watch/providers']?.results?.IT?.flatrate || []).map((p: any) => p.provider_name).filter(Boolean)
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
        category: 'tv',
        source: 'TMDb',
        url: `https://www.themoviedb.org/tv/${m.id}`,
      }
    })
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

async function fetchGaming(lang: string) {
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
    const mapped = (Array.isArray(games) ? games : [])
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
    if (lang === 'it') {
      const descriptions = mapped.map(g => g.description ?? '')
      const translated = await translateTexts(descriptions)
      mapped.forEach((g, i) => { if (g.description) g.description = translated[i] || g.description })
    }
    return mapped
  } catch { return [] }
}

// ── Manga (AniList) ───────────────────────────────────────────────────────────

const ANILIST_URL = 'https://graphql.anilist.co'

async function fetchManga(lang: string): Promise<any[]> {
  const toFuzzy = (d: Date) =>
    d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()

  const now    = new Date()
  const plus60 = new Date(now); plus60.setDate(now.getDate() + 60)
  const minus60 = new Date(now); minus60.setDate(now.getDate() - 60)
  const plus60Int  = toFuzzy(plus60)
  const minus60Int = toFuzzy(minus60)

  const mediaFields = `
    id siteUrl format
    title { romaji english }
    coverImage { extraLarge large }
    startDate { year month day }
    description(asHtml: false)
    genres averageScore chapters volumes
    staff(sort: [RELEVANCE], page: 1, perPage: 3) { nodes { name { full } } }
    studios(isMain: true) { nodes { name } }
  `

  const query = `
    query {
      upcoming: Page(page: 1, perPage: 10) {
        media(type: MANGA, status: NOT_YET_RELEASED, sort: [START_DATE], isAdult: false,
              format_not_in: [NOVEL], startDate_lesser: ${plus60Int}) {
          ${mediaFields}
        }
      }
      trending: Page(page: 1, perPage: 20) {
        media(type: MANGA, status: RELEASING, sort: [TRENDING_DESC], isAdult: false,
              format_not_in: [NOVEL], startDate_greater: ${minus60Int}) {
          ${mediaFields}
        }
      }
      popular: Page(page: 1, perPage: 10) {
        media(type: MANGA, status: RELEASING, sort: [POPULARITY_DESC], isAdult: false,
              format_not_in: [NOVEL]) {
          ${mediaFields}
        }
      }
    }
  `
  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    const json = await res.json()
    if (json.errors) {
      logger.error('[fetchManga] AniList GraphQL errors:', json.errors)
      return []
    }

    const upcoming: any[] = (json.data?.upcoming?.media || []).filter((m: any) => m.startDate?.year)
    const trending: any[] = json.data?.trending?.media || []
    const popular: any[] = json.data?.popular?.media || []

    const isRealCover = (url?: string) => !!url && !url.includes('default')
    const seen = new Set<number>()
    const all: any[] = []
    for (const m of [...upcoming, ...trending, ...popular]) {
      const img = m.coverImage?.extraLarge || m.coverImage?.large
      if (!seen.has(m.id) && isRealCover(img)) {
        seen.add(m.id)
        all.push(m)
      }
      if (all.length >= 20) break
    }

    const mapped = all.map((m: any) => {
      const sd = m.startDate
      const date = sd?.year
        ? `${sd.year}-${String(sd.month || 1).padStart(2, '0')}-${String(sd.day || 1).padStart(2, '0')}`
        : null
      const authors = (m.staff?.nodes || []).map((s: any) => s.name?.full).filter(Boolean)
      const publishers = (m.studios?.nodes || []).map((s: any) => s.name).filter(Boolean)
      return {
        id: `anilist-manga-${m.id}`,
        type: 'manga',
        source_api: 'anilist',
        title: m.title?.english || m.title?.romaji || 'Senza titolo',
        description: m.description ? m.description.replace(/<[^>]+>/g, '').slice(0, 500) : null,
        coverImage: m.coverImage?.extraLarge || m.coverImage?.large,
        date,
        year: sd?.year || undefined,
        genres: m.genres || [],
        score: m.averageScore ? Math.round(m.averageScore / 20) / 10 : undefined,
        episodes: m.chapters || undefined,
        developers: authors.length ? authors : undefined,
        studios: publishers.length ? publishers : undefined,
        category: 'manga',
        source: 'AniList',
        url: m.siteUrl || `https://anilist.co/manga/${m.id}`,
      }
    })

    if (lang === 'it') {
      const descriptions = mapped.map(m => m.description ?? '')
      const translated = await translateTexts(descriptions)
      mapped.forEach((m, i) => { if (m.description) m.description = translated[i] || m.description })
    }

    return mapped
  } catch (err) {
    logger.error('[fetchManga] error:', err)
    return []
  }
}

// ── BGG helpers ───────────────────────────────────────────────────────────────

async function bggFetchSync(url: string, signal?: AbortSignal): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 800))
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        signal: signal ?? AbortSignal.timeout(5000),
      })
      if (res.status === 202) continue
      if (!res.ok) return null
      const text = await res.text()
      if (!text.trim().startsWith('<')) return null
      return text
    } catch { if (attempt === 2) return null }
  }
  return null
}

function mapBggCategories(categories: string[]): string[] {
  const map: Record<string, string> = {
    Fantasy: 'Fantasy', 'Science Fiction': 'Science Fiction', Horror: 'Horror',
    Medieval: 'Medieval', Adventure: 'Adventure', Fighting: 'Fighting',
    Deduction: 'Mystery', 'Murder/Mystery': 'Mystery', 'Thriller/Suspense': 'Thriller',
    Humor: 'Comedy', Wargame: 'War', 'World War II': 'War', Historical: 'History',
    Economic: 'Strategy', 'Card Game': 'Card Game', 'Abstract Strategy': 'Abstract',
    'Cooperative Game': 'Cooperative', 'Party Game': 'Party', Family: 'Family',
    Sports: 'Sports', Exploration: 'Adventure', Civilization: 'Strategy',
    'Space Exploration': 'Science Fiction', Zombies: 'Horror', Mythology: 'Fantasy',
  }
  const genres = new Set<string>()
  for (const cat of categories) { const m = map[cat]; if (m) genres.add(m) }
  return Array.from(genres)
}

async function fetchBoardgameNews(lang: string): Promise<any[]> {
  const ctrl = new AbortController()
  const budget = setTimeout(() => ctrl.abort(), 12_000)
  try {
    const hotXml = await bggFetchSync('https://boardgamegeek.com/xmlapi2/hot?type=boardgame', ctrl.signal)
    if (!hotXml) return []

    const hotResult = await parseStringPromise(hotXml)
    const hotItems: any[] = hotResult?.items?.item || []

    const currentYear = new Date().getFullYear()
    const recent = hotItems.filter((item: any) => {
      const year = item.yearpublished?.[0]?.$?.value ? parseInt(item.yearpublished[0].$.value) : 0
      return year >= currentYear - 2
    })
    const candidates = recent.length >= 10 ? recent : hotItems
    const ids = candidates.slice(0, 20).map((i: any) => i.$.id)
    if (ids.length === 0) return []

    await new Promise(r => setTimeout(r, 300))
    const detailXml = await bggFetchSync(
      `https://boardgamegeek.com/xmlapi2/thing?id=${ids.join(',')}&type=boardgame&stats=1`,
      ctrl.signal,
    )
    if (!detailXml) return []

    const detailResult = await parseStringPromise(detailXml)
    const detailItems: any[] = detailResult?.items?.item || []

    const mapped = detailItems.map((item: any) => {
      const id = item.$.id
      const nameEl = (item.name || []).find((n: any) => n.$.type === 'primary')
      const title = nameEl?.$.value || 'Senza titolo'

      const rawImg = item.image?.[0]?.trim?.() || item.thumbnail?.[0]?.trim?.() || null
      const coverImage = rawImg ? (rawImg.startsWith('http') ? rawImg : `https:${rawImg}`) : null
      if (!coverImage) return null

      const year = item.yearpublished?.[0]?.$?.value ? parseInt(item.yearpublished[0].$.value) : undefined
      const description = item.description?.[0]
        ? item.description[0].replace(/&#10;/g, ' ').replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').slice(0, 500)
        : null

      const links: any[] = item.link || []
      const cats = links.filter((l: any) => l.$.type === 'boardgamecategory').map((l: any) => l.$.value).filter(Boolean)
      const mechanics = links.filter((l: any) => l.$.type === 'boardgamemechanic').map((l: any) => l.$.value).filter(Boolean).slice(0, 5)
      const designers = links.filter((l: any) => l.$.type === 'boardgamedesigner').map((l: any) => l.$.value).filter(Boolean)
      const publishers = links.filter((l: any) => l.$.type === 'boardgamepublisher').map((l: any) => l.$.value).filter(Boolean).slice(0, 3)
      const playingTime = item.playingtime?.[0]?.$?.value ? parseInt(item.playingtime[0].$.value) : undefined
      const bggRating = item.statistics?.[0]?.ratings?.[0]?.average?.[0]?.$?.value
        ? parseFloat(item.statistics[0].ratings[0].average[0].$.value) : undefined

      return {
        id: `bgg-${id}`,
        type: 'boardgame',
        source_api: 'bgg',
        title,
        description,
        coverImage,
        date: year ? `${year}-01-01` : undefined,
        year,
        genres: mapBggCategories(cats),
        score: bggRating ? Math.round(bggRating * 10) / 10 : undefined,
        developers: designers.length ? designers : undefined,
        studios: publishers.length ? publishers : undefined,
        mechanics: mechanics.length ? mechanics : undefined,
        playing_time: playingTime || undefined,
        category: 'boardgame',
        source: 'BGG',
        url: `https://boardgamegeek.com/boardgame/${id}`,
      }
    }).filter(Boolean)

    if (lang === 'it') {
      const descriptions = mapped.map((m: any) => m.description ?? '')
      const translated = await translateTexts(descriptions)
      mapped.forEach((m: any, i: number) => { if (m.description) m.description = translated[i] || m.description })
    }

    return mapped
  } catch { return [] } finally { clearTimeout(budget) }
}

// ── Route handler ─────────────────────────────────────────────────────────────

async function runSync(lang: 'it' | 'en') {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const suffix = `_${lang}`

  const [cinema, tv, anime, gaming, manga, boardgame] = await Promise.all([
    fetchCinema(lang),
    fetchTV(lang),
    fetchAnime(lang),
    fetchGaming(lang),
    fetchManga(lang),
    fetchBoardgameNews(lang),
  ])

  const now = new Date().toISOString()

  await Promise.all([
    supabase.from('news_cache').upsert({ category: `cinema${suffix}`,    data: cinema,    updated_at: now }, { onConflict: 'category' }),
    supabase.from('news_cache').upsert({ category: `tv${suffix}`,        data: tv,        updated_at: now }, { onConflict: 'category' }),
    supabase.from('news_cache').upsert({ category: `anime${suffix}`,     data: anime,     updated_at: now }, { onConflict: 'category' }),
    supabase.from('news_cache').upsert({ category: `gaming${suffix}`,    data: gaming,    updated_at: now }, { onConflict: 'category' }),
    supabase.from('news_cache').upsert({ category: `manga${suffix}`,     data: manga,     updated_at: now }, { onConflict: 'category' }),
    supabase.from('news_cache').upsert({ category: `boardgame${suffix}`, data: boardgame, updated_at: now }, { onConflict: 'category' }),
  ])

  return { cinema: cinema.length, tv: tv.length, anime: anime.length, gaming: gaming.length, manga: manga.length, boardgame: boardgame.length }
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
