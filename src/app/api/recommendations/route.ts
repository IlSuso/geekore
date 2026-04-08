import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── Tipi ────────────────────────────────────────────────────────────────────

type MediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game'

interface TasteProfile {
  // Profilo unificato cross-media: aggrega gusti da TUTTI i tipi
  globalGenres: Array<{ genre: string; score: number }>
  // Per tipo (usato nel widget UI)
  topGenres: Record<MediaType, Array<{ genre: string; score: number }>>
  // Top item da qualsiasi categoria per le spiegazioni cross-media
  topItems: Array<{ title: string; type: string; rating: number; genres: string[] }>
  collectionSize: Record<string, number>
}

interface Recommendation {
  id: string
  title: string
  type: MediaType
  coverImage?: string
  year?: number
  genres: string[]
  score?: number
  description?: string
  why: string  // spiegazione personalizzata
}

// ── TMDb genre name → ID map ────────────────────────────────────────────────
const TMDB_GENRE_MAP: Record<string, number> = {
  'Action': 28, 'Adventure': 12, 'Animation': 16, 'Comedy': 35, 'Crime': 80,
  'Documentary': 99, 'Drama': 18, 'Family': 10751, 'Fantasy': 14, 'History': 36,
  'Horror': 27, 'Music': 10402, 'Mystery': 9648, 'Romance': 10749,
  'Science Fiction': 878, 'Thriller': 53, 'War': 10752, 'Western': 37,
  // IT aliases
  'Azione': 28, 'Avventura': 12, 'Animazione': 16, 'Commedia': 35, 'Crimine': 80,
  'Documentario': 99, 'Dramma': 18, 'Fantasia': 14, 'Storia': 36, 'Orrore': 27,
  'Musica': 10402, 'Mistero': 9648, 'Romantico': 10749, 'Fantascienza': 878,
  'Guerra': 10752,
}

// TMDb TV-specific genre IDs
const TMDB_TV_GENRE_MAP: Record<string, number> = {
  ...TMDB_GENRE_MAP,
  'Action & Adventure': 10759, 'Kids': 10762, 'News': 10763, 'Reality': 10764,
  'Sci-Fi & Fantasy': 10765, 'Soap': 10766, 'Talk': 10767, 'War & Politics': 10768,
}

// ── Compute taste profile from user's media entries ──────────────────────────

function computeTasteProfile(entries: any[], preferences: any): TasteProfile {
  // Score globale cross-media: aggrega generi da TUTTI i tipi
  const globalScores: Record<string, number> = {}
  // Score per-tipo (per il widget UI)
  const perTypeScores: Record<string, Record<string, number>> = {
    anime: {}, manga: {}, movie: {}, tv: {}, game: {},
  }

  for (const entry of entries) {
    const genres: string[] = entry.genres || []
    if (genres.length === 0) continue

    const ratingWeight = entry.rating ? entry.rating * 2 : 3

    let engagementWeight = 0
    if (entry.is_steam && entry.current_episode > 0) {
      engagementWeight = Math.min(entry.current_episode / 10, 5)
    } else if (entry.current_episode > 0) {
      engagementWeight = Math.min(entry.current_episode / 5, 3)
    }

    const totalWeight = ratingWeight + engagementWeight

    for (const genre of genres) {
      // Accumula nello score globale (cross-media)
      globalScores[genre] = (globalScores[genre] || 0) + totalWeight

      // E anche nello score per-tipo
      const type = entry.type
      if (perTypeScores[type]) {
        perTypeScores[type][genre] = (perTypeScores[type][genre] || 0) + totalWeight
      }
    }
  }

  // Applica preferenze esplicite: boost globale + per-tipo
  if (preferences) {
    const allFavGenres = [
      ...(preferences.fav_game_genres || []),
      ...(preferences.fav_anime_genres || []),
      ...(preferences.fav_movie_genres || []),
      ...(preferences.fav_tv_genres || []),
      ...(preferences.fav_manga_genres || []),
    ]
    for (const genre of allFavGenres) {
      if (globalScores[genre]) globalScores[genre] *= 2
      else globalScores[genre] = 10 // preferenza esplicita anche senza storico
    }

    // Rimuovi generi non graditi da tutto
    const disliked: string[] = preferences.disliked_genres || []
    for (const genre of disliked) {
      delete globalScores[genre]
      for (const type of Object.keys(perTypeScores)) {
        delete perTypeScores[type][genre]
      }
    }
  }

  // Top generi globali (usati per le query alle API)
  const globalGenres = Object.entries(globalScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([genre, score]) => ({ genre, score }))

  // Top generi per-tipo (usati nel widget UI)
  const topGenres = {} as TasteProfile['topGenres']
  for (const [type, scores] of Object.entries(perTypeScores)) {
    topGenres[type as MediaType] = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([genre, score]) => ({ genre, score }))
  }

  // Top items da QUALSIASI categoria (per spiegazioni cross-media)
  const topItems = entries
    .filter(e => e.rating && e.rating >= 4 && (e.genres || []).length > 0)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 15)
    .map(e => ({
      title: e.title,
      type: e.type,
      rating: e.rating,
      genres: e.genres || [],
    }))

  const collectionSize: Record<string, number> = {}
  for (const entry of entries) {
    collectionSize[entry.type] = (collectionSize[entry.type] || 0) + 1
  }

  return { globalGenres, topGenres, topItems, collectionSize }
}

// ── Genera spiegazione personalizzata (cross-media) ──────────────────────────

const TYPE_LABEL_IT: Record<string, string> = {
  anime: 'anime', manga: 'manga', movie: 'film', tv: 'serie', game: 'videogioco',
}

function buildWhy(genres: string[], _type: MediaType, tasteProfile: TasteProfile): string {
  // Cerca il miglior item da QUALSIASI categoria che condivide generi
  const topItem = tasteProfile.topItems.find(item =>
    item.genres.some(g => genres.includes(g))
  )
  if (topItem) {
    const label = TYPE_LABEL_IT[topItem.type] || topItem.type
    return `Perché ami "${topItem.title}" (${label})`
  }

  // Fallback: primo genere globale in comune
  const matchingGlobal = tasteProfile.globalGenres.find(g => genres.includes(g.genre))
  if (matchingGlobal) {
    return `Basato sui tuoi gusti: ${matchingGlobal.genre}`
  }

  return `Consigliato per te`
}

// ── Fetcher: Anime (AniList) ─────────────────────────────────────────────────

async function fetchAnimeRecs(
  genres: string[], ownedIds: Set<string>, tasteProfile: TasteProfile
): Promise<Recommendation[]> {
  if (genres.length === 0) return []

  const query = `
    query($genres: [String]) {
      Page(page: 1, perPage: 20) {
        media(genre_in: $genres, type: ANIME, sort: [SCORE_DESC, POPULARITY_DESC], isAdult: false) {
          id title { romaji english } coverImage { large }
          seasonYear episodes genres description(asHtml: false) averageScore
        }
      }
    }
  `
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { genres } }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []
  const json = await res.json()
  const media = json.data?.Page?.media || []

  return media
    .filter((m: any) => {
      const id = `anilist-anime-${m.id}`
      return !ownedIds.has(id) && !ownedIds.has(m.id.toString()) && m.coverImage?.large
    })
    .slice(0, 8)
    .map((m: any): Recommendation => {
      const recGenres: string[] = m.genres || []
      return {
        id: `anilist-anime-${m.id}`,
        title: m.title.romaji || m.title.english || 'Senza titolo',
        type: 'anime',
        coverImage: m.coverImage?.large,
        year: m.seasonYear,
        genres: recGenres,
        score: m.averageScore ? m.averageScore / 10 : undefined,
        description: m.description ? m.description.replace(/<[^>]+>/g, '').slice(0, 300) : undefined,
        why: buildWhy(recGenres, 'anime', tasteProfile),
      }
    })
}

// ── Fetcher: Manga (AniList) ─────────────────────────────────────────────────

async function fetchMangaRecs(
  genres: string[], ownedIds: Set<string>, tasteProfile: TasteProfile
): Promise<Recommendation[]> {
  if (genres.length === 0) return []

  const query = `
    query($genres: [String]) {
      Page(page: 1, perPage: 15) {
        media(genre_in: $genres, type: MANGA, format_in: [MANGA, ONE_SHOT], sort: [SCORE_DESC, POPULARITY_DESC]) {
          id title { romaji english } coverImage { large }
          seasonYear chapters genres description(asHtml: false) averageScore
        }
      }
    }
  `
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { genres } }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []
  const json = await res.json()
  const media = json.data?.Page?.media || []

  return media
    .filter((m: any) => !ownedIds.has(`anilist-manga-${m.id}`) && m.coverImage?.large)
    .slice(0, 6)
    .map((m: any): Recommendation => {
      const recGenres: string[] = m.genres || []
      return {
        id: `anilist-manga-${m.id}`,
        title: m.title.romaji || m.title.english || 'Senza titolo',
        type: 'manga',
        coverImage: m.coverImage?.large,
        year: m.seasonYear,
        genres: recGenres,
        score: m.averageScore ? m.averageScore / 10 : undefined,
        description: m.description ? m.description.replace(/<[^>]+>/g, '').slice(0, 300) : undefined,
        why: buildWhy(recGenres, 'manga', tasteProfile),
      }
    })
}

// ── Fetcher: Film (TMDb) ─────────────────────────────────────────────────────

async function fetchMovieRecs(
  genres: string[], ownedIds: Set<string>, tasteProfile: TasteProfile, tmdbToken: string
): Promise<Recommendation[]> {
  if (genres.length === 0 || !tmdbToken) return []

  const genreIds = genres
    .map(g => TMDB_GENRE_MAP[g])
    .filter(Boolean)
    .slice(0, 3)
    .join(',')

  if (!genreIds) return []

  const res = await fetch(
    `https://api.themoviedb.org/3/discover/movie?with_genres=${genreIds}&sort_by=vote_average.desc&vote_count.gte=100&language=it-IT&page=1`,
    {
      headers: { Authorization: `Bearer ${tmdbToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    }
  )
  if (!res.ok) return []
  const json = await res.json()
  const results = json.results || []

  return results
    .filter((m: any) => !ownedIds.has(m.id.toString()) && m.poster_path)
    .slice(0, 8)
    .map((m: any): Recommendation => {
      const recGenres = genres.filter(g => TMDB_GENRE_MAP[g])
      return {
        id: m.id.toString(),
        title: m.title || m.original_title || 'Senza titolo',
        type: 'movie',
        coverImage: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
        year: m.release_date ? parseInt(m.release_date.substring(0, 4)) : undefined,
        genres: recGenres,
        score: m.vote_average ? Math.round(m.vote_average) / 2 : undefined,
        description: m.overview ? m.overview.slice(0, 300) : undefined,
        why: buildWhy(recGenres, 'movie', tasteProfile),
      }
    })
}

// ── Fetcher: Serie TV (TMDb) ─────────────────────────────────────────────────

async function fetchTvRecs(
  genres: string[], ownedIds: Set<string>, tasteProfile: TasteProfile, tmdbToken: string
): Promise<Recommendation[]> {
  if (genres.length === 0 || !tmdbToken) return []

  const genreIds = genres
    .map(g => TMDB_TV_GENRE_MAP[g])
    .filter(Boolean)
    .slice(0, 3)
    .join(',')

  if (!genreIds) return []

  const res = await fetch(
    `https://api.themoviedb.org/3/discover/tv?with_genres=${genreIds}&sort_by=vote_average.desc&vote_count.gte=50&language=it-IT&page=1`,
    {
      headers: { Authorization: `Bearer ${tmdbToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    }
  )
  if (!res.ok) return []
  const json = await res.json()
  const results = json.results || []

  return results
    .filter((m: any) => !ownedIds.has(m.id.toString()) && m.poster_path)
    .slice(0, 8)
    .map((m: any): Recommendation => {
      const recGenres = genres.filter(g => TMDB_TV_GENRE_MAP[g])
      return {
        id: m.id.toString(),
        title: m.name || m.original_name || 'Senza titolo',
        type: 'tv',
        coverImage: `https://image.tmdb.org/t/p/w500${m.poster_path}`,
        year: m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : undefined,
        genres: recGenres,
        score: m.vote_average ? Math.round(m.vote_average) / 2 : undefined,
        description: m.overview ? m.overview.slice(0, 300) : undefined,
        why: buildWhy(recGenres, 'tv', tasteProfile),
      }
    })
}

// ── Fetcher: Giochi (IGDB) ───────────────────────────────────────────────────

let cachedToken: { token: string; expiresAt: number } | null = null

async function getIgdbToken(clientId: string, clientSecret: string): Promise<string | null> {
  const now = Date.now()
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' }),
  })
  const data = await res.json()
  if (!data.access_token) return null
  cachedToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) * 1000 }
  return cachedToken.token
}

async function fetchGameRecs(
  genres: string[], ownedIds: Set<string>, tasteProfile: TasteProfile,
  clientId: string, clientSecret: string
): Promise<Recommendation[]> {
  if (genres.length === 0) return []

  const token = await getIgdbToken(clientId, clientSecret)
  if (!token) return []

  // IGDB genre filter: cerca per nome genere
  const genreFilter = genres.slice(0, 3).map(g => `"${g}"`).join(',')
  const body = `
    fields name, cover.url, first_release_date, summary, genres.name, rating, rating_count;
    where genres.name = (${genreFilter}) & rating_count > 50 & cover != null;
    sort rating desc;
    limit 20;
  `

  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
    body,
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return []
  const games = await res.json()
  if (!Array.isArray(games)) return []

  return games
    .filter((g: any) => !ownedIds.has(g.id.toString()) && g.cover?.url)
    .slice(0, 8)
    .map((g: any): Recommendation => {
      const recGenres: string[] = g.genres?.map((gen: any) => gen.name) || []
      return {
        id: g.id.toString(),
        title: g.name,
        type: 'game',
        coverImage: `https:${g.cover.url.replace('t_thumb', 't_cover_big')}`,
        year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined,
        genres: recGenres,
        score: g.rating ? Math.round(g.rating) / 20 : undefined,
        description: g.summary ? g.summary.slice(0, 300) : undefined,
        why: buildWhy(recGenres, 'game', tasteProfile),
      }
    })
}

// ── Handler principale ───────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const requestedType = searchParams.get('type') || 'all'
    const forceRefresh = searchParams.get('refresh') === '1'

    // Controlla cache (skip se force refresh)
    if (!forceRefresh && requestedType !== 'all') {
      const { data: cached } = await supabase
        .from('recommendations_cache')
        .select('data, expires_at')
        .eq('user_id', user.id)
        .eq('media_type', requestedType)
        .single()

      if (cached && new Date(cached.expires_at) > new Date()) {
        return NextResponse.json({ recommendations: cached.data, cached: true })
      }
    }

    // Carica collezione utente
    const { data: entries } = await supabase
      .from('user_media_entries')
      .select('type, rating, genres, current_episode, is_steam, title, external_id')
      .eq('user_id', user.id)

    // Carica preferenze utente
    const { data: preferences } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    // Carica wishlist (da escludere)
    const { data: wishlist } = await supabase
      .from('wishlist')
      .select('external_id')
      .eq('user_id', user.id)

    const allEntries = entries || []
    const tasteProfile = computeTasteProfile(allEntries, preferences)

    // Set di ID già posseduti o in wishlist
    const ownedIds = new Set<string>([
      ...allEntries.map(e => e.external_id).filter(Boolean),
      ...(wishlist || []).map(w => w.external_id).filter(Boolean),
    ])

    const tmdbToken = process.env.NEXT_PUBLIC_TMDB_API_KEY || ''
    const igdbClientId = process.env.IGDB_CLIENT_ID || ''
    const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || ''

    // Determina quali tipi fetchare
    const typesToFetch: MediaType[] = requestedType === 'all'
      ? ['anime', 'manga', 'movie', 'tv', 'game']
      : [requestedType as MediaType]

    // Generi globali cross-media (base per tutte le query)
    const globalGenreNames = tasteProfile.globalGenres.map(g => g.genre)

    // Fallback se la collezione è vuota
    const UNIVERSAL_FALLBACK = ['Action', 'Adventure', 'Fantasy', 'Drama', 'Thriller']

    // Restituisce i generi globali dell'utente, con fallback se vuoti
    const getGenresForType = (_type: MediaType): string[] => {
      return globalGenreNames.length >= 2 ? globalGenreNames : UNIVERSAL_FALLBACK
    }

    // Fetcha raccomandazioni in parallelo
    const results = await Promise.allSettled(
      typesToFetch.map(async type => {
        const genres = getGenresForType(type)
        switch (type) {
          case 'anime': return { type, items: await fetchAnimeRecs(genres, ownedIds, tasteProfile) }
          case 'manga': return { type, items: await fetchMangaRecs(genres, ownedIds, tasteProfile) }
          case 'movie': return { type, items: await fetchMovieRecs(genres, ownedIds, tasteProfile, tmdbToken) }
          case 'tv':    return { type, items: await fetchTvRecs(genres, ownedIds, tasteProfile, tmdbToken) }
          case 'game':  return { type, items: await fetchGameRecs(genres, ownedIds, tasteProfile, igdbClientId, igdbClientSecret) }
        }
      })
    )

    const recommendations: Record<string, Recommendation[]> = {}
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        recommendations[result.value.type] = result.value.items
      }
    }

    // Salva in cache (solo per tipo singolo)
    if (requestedType !== 'all') {
      const items = recommendations[requestedType] || []
      await supabase.from('recommendations_cache').upsert({
        user_id: user.id,
        media_type: requestedType,
        data: items,
        taste_snapshot: tasteProfile.topGenres,
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'user_id,media_type' })
    }

    return NextResponse.json({
      recommendations,
      tasteProfile: {
        globalGenres: tasteProfile.globalGenres,
        topGenres: tasteProfile.topGenres,
        collectionSize: tasteProfile.collectionSize,
      },
      cached: false,
    })

  } catch (error) {
    console.error('Recommendations error:', error)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }
}
