import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { parseStringPromise } from 'xml2js'
import { translateTexts } from '@/lib/deepl'
import { truncateAtSentence } from '@/lib/utils'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

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
  const { from: pastFrom, to: today } = dateRange(60, 0)
  const { from: todayFrom, to: futureTo } = dateRange(0, 120)

  logger.info(`[fetchCinema] START lang=${lang} region=${region}`)
  logger.info(`[fetchCinema] PAST  range: ${pastFrom} -> ${today}`)
  logger.info(`[fetchCinema] FUTURE range: ${todayFrom} -> ${futureTo}`)

  const urlPast   = `https://api.themoviedb.org/3/discover/movie?language=${tmdbLang}&region=${region}&sort_by=popularity.desc&primary_release_date.gte=${pastFrom}&primary_release_date.lte=${today}`
  const urlFuture = `https://api.themoviedb.org/3/discover/movie?language=${tmdbLang}&region=${region}&sort_by=primary_release_date.asc&primary_release_date.gte=${todayFrom}&primary_release_date.lte=${futureTo}`

  logger.info(`[fetchCinema] URL_PAST:   ${urlPast}`)
  logger.info(`[fetchCinema] URL_FUTURE: ${urlFuture}`)

  try {
    const [resPast, resFuture] = await Promise.all([
      fetch(urlPast,   { headers: tmdbHeaders(), cache: 'no-store' }),
      fetch(urlFuture, { headers: tmdbHeaders(), cache: 'no-store' }),
    ])

    logger.info(`[fetchCinema] HTTP past=${resPast.status} future=${resFuture.status}`)

    const [jsonPast, jsonFuture] = await Promise.all([
      resPast.ok   ? resPast.json()   : { results: [] },
      resFuture.ok ? resFuture.json() : { results: [] },
    ])

    logger.info(`[fetchCinema] TMDB past results=${jsonPast.results?.length ?? 0}  future results=${jsonFuture.results?.length ?? 0}`)

    const pastTitles   = (jsonPast.results   || []).slice(0, 5).map((m: any) => `${m.title} (${m.release_date})`)
    const futureTitles = (jsonFuture.results || []).slice(0, 5).map((m: any) => `${m.title} (${m.release_date})`)
    logger.info(`[fetchCinema] PAST sample:   ${JSON.stringify(pastTitles)}`)
    logger.info(`[fetchCinema] FUTURE sample: ${JSON.stringify(futureTitles)}`)

    const seen = new Set<number>()
    const merged: any[] = []
    for (const m of [...(jsonPast.results || []).slice(0, 10), ...(jsonFuture.results || []).slice(0, 10)]) {
      if (!seen.has(m.id) && m.poster_path && m.overview) { seen.add(m.id); merged.push(m) }
    }

    logger.info(`[fetchCinema] merged after dedup+filter (poster+overview): ${merged.length}`)
    logger.info(`[fetchCinema] merged titles: ${JSON.stringify(merged.map((m: any) => m.title + " (" + m.release_date + ")"))}`)

    const movies = merged
    const details = await Promise.all(
      movies.map((m: any) => tmdbDetail(`/movie/${m.id}?language=${tmdbLang}&append_to_response=credits,keywords,watch%2Fproviders`))
    )
    const result = movies.map((m: any, i: number) => {
      const d = details[i]
      const director  = d?.credits?.crew?.find((p: any) => p.job === 'Director')?.name
      const studios   = (d?.production_companies || []).slice(0, 2).map((c: any) => c.name).filter(Boolean)
      const cast      = (d?.credits?.cast || []).slice(0, 5).map((a: any) => a.name).filter(Boolean)
      const keywords  = (d?.keywords?.keywords || []).slice(0, 6).map((k: any) => k.name).filter(Boolean)
      const providers = (d?.['watch/providers']?.results?.[region]?.flatrate || []).map((p: any) => p.provider_name).filter(Boolean)
      return {
        id: `tmdb-${m.id}`, type: 'movie', source_api: 'tmdb',
        title: m.title,
        description: m.overview ? truncateAtSentence(m.overview, 500) : undefined,
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
        category: 'cinema', source: 'TMDb',
        url: `https://www.themoviedb.org/movie/${m.id}`,
      }
    })
    logger.info(`[fetchCinema] DONE returning ${result.length} movies: ${JSON.stringify(result.map((m: any) => m.title + " (" + m.date + ")"))}`)
    return result
  } catch (err) {
    logger.error(`[fetchCinema] CATCH ERROR:`, err)
    return []
  }
}

async function fetchTV(lang: string) {
  const tmdbLang = lang === 'en' ? 'en-US' : 'it-IT'
  const region   = lang === 'en' ? 'US' : 'IT'
  const { from, to } = dateRange(60, 120)
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/discover/tv?language=${tmdbLang}&sort_by=popularity.desc&air_date.gte=${from}&air_date.lte=${to}&include_null_first_air_dates=false`,
      { headers: tmdbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) return []
    const json = await res.json()
    const shows = (json.results || []).slice(0, 15).filter((m: any) => m.poster_path && m.overview)
    const details = await Promise.all(
      shows.map((s: any) => tmdbDetail(`/tv/${s.id}?language=${tmdbLang}&append_to_response=aggregate_credits,watch%2Fproviders,keywords`))
    )
    return shows.map((m: any, i: number) => {
      const d        = details[i]
      const networks = (d?.networks || []).slice(0, 2).map((n: any) => n.name).filter(Boolean)
      const creators = (d?.created_by || []).slice(0, 2).map((c: any) => c.name).filter(Boolean)
      const runtime  = d?.episode_run_time?.[0] || undefined
      const cast     = (d?.aggregate_credits?.cast || []).slice(0, 5).map((a: any) => a.name).filter(Boolean)
      const providers       = (d?.['watch/providers']?.results?.[region]?.flatrate || []).map((p: any) => p.provider_name).filter(Boolean)
      const keywords        = (d?.keywords?.results || []).slice(0, 6).map((k: any) => k.name).filter(Boolean)
      const nextEpisodeDate = d?.next_episode_to_air?.air_date || null
      const seasons: Record<number, { episode_count: number }> = {}
      for (const s of (d?.seasons || [])) {
        if (s.season_number > 0) seasons[s.season_number] = { episode_count: s.episode_count }
      }
      return {
        id: `tmdb-${m.id}`, type: 'tv', source_api: 'tmdb',
        title: m.name,
        description: m.overview ? truncateAtSentence(m.overview, 500) : undefined,
        coverImage: tmdbImageUrl(m.poster_path),
        date: m.first_air_date,
        year: m.first_air_date ? parseInt(m.first_air_date.slice(0, 4)) : undefined,
        genres: (m.genre_ids || []).map((id: number) => TMDB_TV_GENRES[id]).filter(Boolean),
        score: m.vote_average > 0 ? Math.round(m.vote_average * 5) / 10 : undefined,
        original_language: m.original_language, playing_time: runtime,
        studios: networks.length ? networks : undefined,
        directors: creators.length ? creators : undefined,
        cast: cast.length ? cast : undefined,
        totalSeasons: d?.number_of_seasons || undefined,
        seasons: Object.keys(seasons).length ? seasons : undefined,
        watchProviders: providers.length ? providers : undefined,
        themes: keywords.length ? keywords : undefined,
        nextEpisodeDate: nextEpisodeDate || undefined,
        category: 'tv', source: 'TMDb',
        url: `https://www.themoviedb.org/tv/${m.id}`,
      }
    })
  } catch { return [] }
}

async function fetchAnime(lang: string) {
  const tmdbLang = lang === 'en' ? 'en-US' : 'it-IT'
  const region   = lang === 'en' ? 'US' : 'IT'
  const { from, to } = dateRange(60, 120)
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/discover/tv?language=${tmdbLang}&sort_by=popularity.desc&with_original_language=ja&with_genres=16&air_date.gte=${from}&air_date.lte=${to}&include_null_first_air_dates=false`,
      { headers: tmdbHeaders(), cache: 'no-store' }
    )
    if (!res.ok) return []
    const json = await res.json()
    const shows = (json.results || []).slice(0, 20).filter((m: any) => m.poster_path && m.overview)
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
        id: `tmdb-anime-${m.id}`, type: 'anime', source_api: 'tmdb' as const,
        title: m.name,
        description: m.overview ? truncateAtSentence(m.overview, 500) : undefined,
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
        category: 'anime' as const, source: 'TMDb',
        url: `https://www.themoviedb.org/tv/${m.id}`,
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
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) return []

    const nowUnix       = Math.floor(Date.now() / 1000)
    const sixtyDaysBack = nowUnix - 60 * 24 * 3600   // -2 mesi
    const fourMonthsFwd = nowUnix + 120 * 24 * 3600  // +4 mesi

    const fields = `fields id, name, cover.url, first_release_date, summary, storyline, slug, rating, rating_count,
               total_rating, hypes, genres.name, involved_companies.company.name, involved_companies.developer,
               platforms.name, game_modes.name, themes.name,
               language_supports.language.locale, language_supports.language_support_type.name;`

    const igdbPost = async (body: string) => {
      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: { 'Client-ID': clientId!, 'Authorization': `Bearer ${tokenData.access_token}`, 'Content-Type': 'text/plain' },
        body,
      })
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    }

    // Passato: giochi già usciti negli ultimi 2 mesi — SENZA filtro hypes/rating
    // perché i giochi appena usciti non hanno ancora recensioni
    // Futuro: giochi in arrivo nei prossimi 4 mesi — con hypes per filtrare titoli rilevanti
    const [pastGames, futureGames] = await Promise.all([
      igdbPost(`
        ${fields}
        where first_release_date >= ${sixtyDaysBack} & first_release_date <= ${nowUnix} & cover != null;
        sort first_release_date desc;
        limit 15;
      `),
      igdbPost(`
        ${fields}
        where first_release_date > ${nowUnix} & first_release_date <= ${fourMonthsFwd} & cover != null & (hypes > 0 | rating_count > 0);
        sort first_release_date asc;
        limit 15;
      `),
    ])

    // Deduplicazione e merge: passati prima (più recenti), poi futuri (più imminenti)
    const seen = new Set<number>()
    const allGames: any[] = []
    for (const g of [...pastGames, ...futureGames]) {
      if (!seen.has(g.id) && g.cover?.url) { seen.add(g.id); allGames.push(g) }
    }

    const mapped = allGames.slice(0, 30).map((g: any) => {
      const releaseDate = g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().split('T')[0] : null
      return {
        id: `igdb-${g.id}`, type: 'game', source_api: 'igdb',
        title: g.name,
        description: (g.summary || g.storyline) ? truncateAtSentence(g.summary || g.storyline, 500) : null,
        coverImage: `https:${g.cover.url.replace('t_thumb', 't_1080p')}`,
        date: releaseDate,
        year: releaseDate ? parseInt(releaseDate.slice(0, 4)) : undefined,
        genres: (g.genres || []).map((gr: any) => gr.name).filter(Boolean),
        score: (g.total_rating || g.rating) ? Math.round((g.total_rating ?? g.rating) / 2) / 10 : undefined,
        italianSupportTypes: (g.language_supports || []).filter((ls: any) => ls.language?.locale?.startsWith('it')).map((ls: any) => ls.language_support_type?.name).filter(Boolean),
        developers: (g.involved_companies || []).filter((c: any) => c.developer).map((c: any) => c.company?.name).filter(Boolean),
        platforms: (g.platforms || []).map((p: any) => p.name).filter(Boolean),
        mechanics: (g.game_modes || []).map((m: any) => m.name).filter(Boolean),
        themes: (g.themes || []).map((t: any) => t.name).filter(Boolean),
        category: 'gaming', source: 'IGDB',
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
  const toFuzzy = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  const nowDate   = new Date()
  const plus120   = new Date(nowDate); plus120.setDate(nowDate.getDate() + 120)  // +4 mesi
  const minus60   = new Date(nowDate); minus60.setDate(nowDate.getDate() - 60)   // -2 mesi
  const plus120Int = toFuzzy(plus120)
  const minus60Int = toFuzzy(minus60)
  const mediaFields = `id siteUrl format title { romaji english } coverImage { extraLarge large } startDate { year month day } description(asHtml: false) genres averageScore chapters volumes staff(sort: [RELEVANCE], page: 1, perPage: 3) { nodes { name { full } } } studios(isMain: true) { nodes { name } }`
  // 3 query:
  // upcoming: manga NON ancora usciti con startDate nei prossimi 4 mesi
  // trending: manga in corso popolari, iniziati negli ultimi 2 mesi
  // recent: manga in corso, iniziati negli ultimi 2 mesi ordinati per data
  const query = `query {
    upcoming: Page(page: 1, perPage: 15) {
      media(type: MANGA, status: NOT_YET_RELEASED, sort: [START_DATE], isAdult: false, format_not_in: [NOVEL], startDate_lesser: ${plus120Int}) {
        ${mediaFields}
      }
    }
    trending: Page(page: 1, perPage: 20) {
      media(type: MANGA, status: RELEASING, sort: [TRENDING_DESC], isAdult: false, format_not_in: [NOVEL], startDate_greater: ${minus60Int}) {
        ${mediaFields}
      }
    }
    recent: Page(page: 1, perPage: 15) {
      media(type: MANGA, status: RELEASING, sort: [START_DATE_DESC], isAdult: false, format_not_in: [NOVEL], startDate_greater: ${minus60Int}) {
        ${mediaFields}
      }
    }
  }`
  try {
    const res = await fetch(ANILIST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return []
    const json = await res.json()
    if (json.errors) { logger.error('[fetchManga] AniList GraphQL errors:', json.errors); return [] }
    const upcoming: any[] = (json.data?.upcoming?.media || []).filter((m: any) => m.startDate?.year)
    const trending: any[] = json.data?.trending?.media || []
    const recent: any[]   = json.data?.recent?.media   || []
    const isRealCover = (url?: string) => !!url && !url.includes('default')
    const seen = new Set<number>(); const all: any[] = []
    // upcoming prima (futuri), poi trending (popolari recenti), poi recent
    for (const m of [...upcoming, ...trending, ...recent]) {
      const img = m.coverImage?.extraLarge || m.coverImage?.large
      if (!seen.has(m.id) && isRealCover(img)) { seen.add(m.id); all.push(m) }
      if (all.length >= 20) break
    }
    const mapped = all.map((m: any) => {
      const sd = m.startDate
      const date = sd?.year ? `${sd.year}-${String(sd.month || 1).padStart(2, '0')}-${String(sd.day || 1).padStart(2, '0')}` : null
      const authors = (m.staff?.nodes || []).map((s: any) => s.name?.full).filter(Boolean)
      const publishers = (m.studios?.nodes || []).map((s: any) => s.name).filter(Boolean)
      return { id: `anilist-manga-${m.id}`, type: 'manga', source_api: 'anilist', title: m.title?.english || m.title?.romaji || 'Senza titolo', description: m.description ? truncateAtSentence(m.description.replace(/<[^>]+>/g, ''), 500) : null, coverImage: m.coverImage?.extraLarge || m.coverImage?.large, date, year: sd?.year || undefined, genres: m.genres || [], score: m.averageScore ? Math.round(m.averageScore / 20) / 10 : undefined, episodes: m.chapters || undefined, developers: authors.length ? authors : undefined, studios: publishers.length ? publishers : undefined, category: 'manga', source: 'AniList', url: m.siteUrl || `https://anilist.co/manga/${m.id}` }
    })
    if (lang === 'it') {
      const descriptions = mapped.map(m => m.description ?? '')
      const translated = await translateTexts(descriptions)
      mapped.forEach((m, i) => { if (m.description) m.description = translated[i] || m.description })
    }
    return mapped
  } catch (err) { logger.error('[fetchManga] error:', err); return [] }
}

// ── BGG ───────────────────────────────────────────────────────────────────────

function bggHeaders(): HeadersInit {
  const token = process.env.BGG_BEARER_TOKEN
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function bggFetchSync(url: string, signal?: AbortSignal): Promise<string | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt < 3 ? 2000 : 4000))
    try {
      const res = await fetch(url, { cache: 'no-store', headers: bggHeaders(), signal: signal ?? AbortSignal.timeout(15000) })
      if (res.status === 202) { logger.info(`[BGG] 202 attempt ${attempt + 1}/6`); continue }
      if (!res.ok) { logger.info(`[BGG] HTTP ${res.status} for ${url}`); return null }
      const text = await res.text()
      if (!text.trim().startsWith('<')) { logger.info(`[BGG] non-XML response`); return null }
      return text
    } catch (e: any) { logger.info(`[BGG] attempt ${attempt + 1} error: ${e?.message}`); if (attempt === 5) return null }
  }
  return null
}

function mapBggCategories(categories: string[]): string[] {
  const map: Record<string, string> = { Fantasy: 'Fantasy', 'Science Fiction': 'Science Fiction', Horror: 'Horror', Medieval: 'Medieval', Adventure: 'Adventure', Fighting: 'Fighting', Deduction: 'Mystery', 'Murder/Mystery': 'Mystery', 'Thriller/Suspense': 'Thriller', Humor: 'Comedy', Wargame: 'War', 'World War II': 'War', Historical: 'History', Economic: 'Strategy', 'Card Game': 'Card Game', 'Abstract Strategy': 'Abstract', 'Cooperative Game': 'Cooperative', 'Party Game': 'Party', Family: 'Family', Sports: 'Sports', Exploration: 'Adventure', Civilization: 'Strategy', 'Space Exploration': 'Science Fiction', Zombies: 'Horror', Mythology: 'Fantasy' }
  const genres = new Set<string>()
  for (const cat of categories) { const m = map[cat]; if (m) genres.add(m) }
  return Array.from(genres)
}

async function fetchBoardgameNews(lang: string): Promise<any[]> {
  logger.info(`[BGG] fetchBoardgameNews START lang=${lang}`)
  const ctrl = new AbortController()
  const budget = setTimeout(() => ctrl.abort(), 50_000)
  try {
    const hotXml = await bggFetchSync('https://boardgamegeek.com/xmlapi2/hot?type=boardgame', ctrl.signal)
    if (!hotXml) { logger.info(`[BGG] hot list failed`); return [] }
    const hotResult = await parseStringPromise(hotXml)
    const hotItems: any[] = hotResult?.items?.item || []
    const now60 = new Date()
    const twoMonthsAgo = new Date(now60); twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
    const twoMonthsFwd = new Date(now60); twoMonthsFwd.setMonth(twoMonthsFwd.getMonth() + 2)
    const currentYear = now60.getFullYear()
    // BGG non ha date precise — filtriamo per anno di pubblicazione abbastanza vicino
    // Un gioco pubblicato quest'anno o l'anno scorso dopo ottobre rientra nella finestra ±2 mesi
    const inWindow = (item: any) => {
      const year = item.yearpublished?.[0]?.$?.value ? parseInt(item.yearpublished[0].$.value) : null
      if (year === null) return true
      if (year > currentYear) return true // futuro
      if (year === currentYear) return true // anno corrente
      if (year === currentYear - 1) {
        // Solo se siamo nei primi 2 mesi dell'anno (quindi il titolo di fine anno scorso è nella finestra)
        return now60.getMonth() < 2
      }
      return false
    }
    const recent = hotItems.filter(inWindow)
    const candidates = recent.length >= 5 ? recent : hotItems.slice(0, 25) // fallback se pochissimi
    const ids = candidates.slice(0, 25).map((i: any) => i.$.id)
    if (ids.length === 0) return []
    await new Promise(r => setTimeout(r, 300))
    const detailXml = await bggFetchSync(`https://boardgamegeek.com/xmlapi2/thing?id=${ids.join(',')}&type=boardgame&stats=1`, ctrl.signal)
    if (!detailXml) {
      const basicCards = candidates.slice(0, 25).map((item: any) => {
        const id = item.$.id; const title = item.name?.[0]?.$?.value || 'Unknown'
        const rawThumb = item.thumbnail?.[0]?.$?.value || ''
        const coverImage = rawThumb ? (rawThumb.startsWith('http') ? rawThumb : `https:${rawThumb}`) : null
        if (!coverImage) return null
        const year = item.yearpublished?.[0]?.$?.value ? parseInt(item.yearpublished[0].$.value) : undefined
        return { id: `bgg-${id}`, type: 'boardgame', source_api: 'bgg', title, coverImage, year, date: year ? `${year}-01-01` : undefined, genres: [], category: 'boardgame', source: 'BGG', url: `https://boardgamegeek.com/boardgame/${id}` }
      }).filter(Boolean)
      return basicCards
    }
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
      const description = item.description?.[0] ? truncateAtSentence(item.description[0].replace(/&#10;/g, ' ').replace(/&amp;/g, '&').replace(/<[^>]+>/g, ''), 500) : null
      const links: any[] = item.link || []
      const cats = links.filter((l: any) => l.$.type === 'boardgamecategory').map((l: any) => l.$.value).filter(Boolean)
      const mechanics = links.filter((l: any) => l.$.type === 'boardgamemechanic').map((l: any) => l.$.value).filter(Boolean).slice(0, 5)
      const designers = links.filter((l: any) => l.$.type === 'boardgamedesigner').map((l: any) => l.$.value).filter(Boolean)
      const publishers = links.filter((l: any) => l.$.type === 'boardgamepublisher').map((l: any) => l.$.value).filter(Boolean).slice(0, 3)
      const playingTime = item.playingtime?.[0]?.$?.value ? parseInt(item.playingtime[0].$.value) : undefined
      const bggRating = item.statistics?.[0]?.ratings?.[0]?.average?.[0]?.$?.value ? parseFloat(item.statistics[0].ratings[0].average[0].$.value) : undefined
      return { id: `bgg-${id}`, type: 'boardgame', source_api: 'bgg', title, description, coverImage, date: year ? `${year}-01-01` : undefined, year, genres: mapBggCategories(cats), score: bggRating ? Math.round(bggRating * 10) / 10 : undefined, developers: designers.length ? designers : undefined, studios: publishers.length ? publishers : undefined, mechanics: mechanics.length ? mechanics : undefined, playing_time: playingTime || undefined, category: 'boardgame', source: 'BGG', url: `https://boardgamegeek.com/boardgame/${id}` }
    }).filter(Boolean)
    if (lang === 'it') {
      const descriptions = mapped.map((m: any) => m.description ?? '')
      const translated = await translateTexts(descriptions)
      mapped.forEach((m: any, i: number) => { if (m.description) m.description = translated[i] || m.description })
    }
    return mapped
  } catch (e: any) { logger.info(`[BGG] CATCH: ${e?.name}: ${e?.message}`); return [] }
  finally { clearTimeout(budget) }
}


// ── runSync ───────────────────────────────────────────────────────────────────

async function runSync(lang: 'it' | 'en') {
  logger.info(`[runSync] START lang=${lang} at ${new Date().toISOString()}`)
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const suffix = `_${lang}`

  logger.info(`[runSync] launching fast fetchers in parallel`)
  const [cinema, tv, anime, gaming, manga] = await Promise.all([
    fetchCinema(lang),
    fetchTV(lang),
    fetchAnime(lang),
    fetchGaming(lang),
    fetchManga(lang),
  ])

  const now = new Date().toISOString()

  await Promise.all([
    supabase.from('news_cache').upsert({ category: `cinema${suffix}`,    data: cinema,    updated_at: now }, { onConflict: 'category' }),
    supabase.from('news_cache').upsert({ category: `tv${suffix}`,        data: tv,        updated_at: now }, { onConflict: 'category' }),
    supabase.from('news_cache').upsert({ category: `anime${suffix}`,     data: anime,     updated_at: now }, { onConflict: 'category' }),
    supabase.from('news_cache').upsert({ category: `gaming${suffix}`,    data: gaming,    updated_at: now }, { onConflict: 'category' }),
    supabase.from('news_cache').upsert({ category: `manga${suffix}`,     data: manga,     updated_at: now }, { onConflict: 'category' }),
  ])

  logger.info(`[runSync] fast fetchers done: cinema=${cinema.length} tv=${tv.length} anime=${anime.length} gaming=${gaming.length} manga=${manga.length}`)

  // BGG sequenziale dopo
  logger.info(`[runSync] starting BGG fetch`)
  const bggStart = Date.now()
  const boardgame = await fetchBoardgameNews(lang)
  logger.info(`[runSync] BGG done in ${Date.now() - bggStart}ms, ${boardgame.length} items`)

  if (boardgame.length > 0) {
    const { error: bggErr } = await supabase.from('news_cache').upsert(
      { category: `boardgame${suffix}`, data: boardgame, updated_at: new Date().toISOString() },
      { onConflict: 'category' }
    )
    if (bggErr) logger.info(`[runSync] boardgame upsert FAILED: ${bggErr.message}`)
    else logger.info(`[runSync] boardgame upsert OK`)
  }

  const counts = { cinema: cinema.length, tv: tv.length, anime: anime.length, gaming: gaming.length, manga: manga.length, boardgame: boardgame.length }
  logger.info(`[runSync] DONE counts=${JSON.stringify(counts)}`)
  return counts
}

export async function POST(request: NextRequest) {
  try {
    let lang: 'it' | 'en' = 'it'
    try { const body = await request.json(); if (body?.lang === 'en') lang = 'en' } catch {}
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