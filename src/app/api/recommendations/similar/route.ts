// /api/recommendations/similar
// Cerca titoli simili in tutti i media (giochi, anime, film, serie, manga).
// Generi IGDB vengono espansi in generi cross-media per query TMDb/AniList.
// Il profilo utente è usato SOLO per boost secondario nell'ordinamento.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const ANILIST_URL = 'https://graphql.anilist.co'

// Generi IGDB → generi cross-media (per fare query TMDb/AniList)
const IGDB_TO_CROSS: Record<string, string[]> = {
  'Role-playing (RPG)':         ['Fantasy', 'Adventure', 'Drama'],
  'Adventure':                  ['Adventure', 'Fantasy'],
  'Action':                     ['Action', 'Adventure'],
  "Hack and slash/Beat 'em up": ['Action'],
  'Strategy':                   ['Strategy', 'Science Fiction'],
  'Real Time Strategy (RTS)':   ['Strategy', 'Science Fiction'],
  'Turn-based strategy (TBS)':  ['Strategy', 'Drama'],
  'Tactical':                   ['Strategy', 'Thriller'],
  'Shooter':                    ['Action', 'Science Fiction', 'Thriller'],
  'Simulation':                 ['Slice of Life', 'Drama'],
  'Horror':                     ['Horror', 'Thriller', 'Mystery'],
  'Thriller':                   ['Thriller', 'Mystery'],
  'Puzzle':                     ['Mystery', 'Psychological'],
  'Platform':                   ['Adventure', 'Comedy'],
  'Visual Novel':               ['Drama', 'Romance', 'Psychological'],
  'Fighting':                   ['Action'],
  'Sport':                      ['Sports'],
  'Racing':                     ['Action'],
  'Indie':                      ['Adventure', 'Drama'],
  'Arcade':                     ['Action', 'Comedy'],
  'Massively Multiplayer Online (MMO)': ['Fantasy', 'Science Fiction'],
}

const IGDB_VALID = new Set([
  'Action','Adventure','Role-playing (RPG)','Shooter','Strategy','Simulation',
  'Puzzle','Racing','Sport','Fighting','Platform',"Hack and slash/Beat \'em up",
  'Real Time Strategy (RTS)','Turn-based strategy (TBS)','Tactical','Visual Novel',
  'Massively Multiplayer Online (MMO)','Indie','Arcade',
])

const GENRE_TO_TMDB_MOVIE: Record<string, number> = {
  'Action':28,'Adventure':12,'Animation':16,'Comedy':35,'Crime':80,
  'Drama':18,'Fantasy':14,'Horror':27,'Mystery':9648,'Romance':10749,
  'Science Fiction':878,'Sci-Fi':878,'Thriller':53,'War':10752,
  'History':36,'Psychological':9648,'Sports':10402,
}
const GENRE_TO_TMDB_TV: Record<string, number> = {
  'Action':10759,'Adventure':10759,'Animation':16,'Comedy':35,'Crime':80,
  'Drama':18,'Fantasy':10765,'Horror':9648,'Mystery':9648,'Romance':10749,
  'Science Fiction':10765,'Sci-Fi':10765,'Thriller':80,'Psychological':9648,
}
const ANILIST_VALID = new Set([
  'Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery',
  'Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller','Psychological',
])

let cachedIgdbToken: { token: string; expiresAt: number } | null = null

async function getIgdbToken(clientId: string, secret: string): Promise<string | null> {
  const now = Date.now()
  if (cachedIgdbToken && cachedIgdbToken.expiresAt > now + 60_000) return cachedIgdbToken.token
  try {
    const res = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'client_credentials' }),
    })
    const data = await res.json()
    if (!data.access_token) return null
    cachedIgdbToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) * 1000 }
    return cachedIgdbToken.token
  } catch { return null }
}

function resolveGenres(rawGenres: string[]) {
  const crossSet = new Set<string>()
  const igdbDirect: string[] = []

  for (const g of rawGenres) {
    if (IGDB_VALID.has(g)) {
      igdbDirect.push(g)
      for (const c of (IGDB_TO_CROSS[g] || [])) crossSet.add(c)
    } else {
      // gia cross-media (anime/film)
      crossSet.add(g)
    }
  }

  const crossGenres = [...crossSet]
  return {
    igdbGenres: igdbDirect,
    crossGenres,
    anilistGenres: crossGenres.filter(g => ANILIST_VALID.has(g)),
    tmdbMovieIds: [...new Set(crossGenres.map(g => GENRE_TO_TMDB_MOVIE[g]).filter(Boolean) as number[])],
    tmdbTvIds:    [...new Set(crossGenres.map(g => GENRE_TO_TMDB_TV[g]).filter(Boolean) as number[])],
  }
}

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'similar' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sourceTitle = searchParams.get('title') || ''
  const rawGenres = (searchParams.get('genres') || '').split(',').map(g => g.trim()).filter(Boolean)

  if (rawGenres.length === 0) return NextResponse.json({ error: 'genres richiesti' }, { status: 400 })

  const tmdbToken = process.env.TMDB_API_KEY || ''
  const igdbClientId = process.env.IGDB_CLIENT_ID || ''
  const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || ''

  const { data: tasteData } = await supabase
    .from('user_taste_profile').select('genre_scores').eq('user_id', user.id).maybeSingle()
  const genreScores: Record<string, number> = (tasteData?.genre_scores as any) || {}
  const maxGenreScore = Math.max(...Object.values(genreScores), 1)

  const { data: owned } = await supabase.from('user_media_entries').select('external_id').eq('user_id', user.id)
  const ownedIds = new Set((owned || []).map((e: any) => e.external_id).filter(Boolean))

  const { igdbGenres, crossGenres, anilistGenres, tmdbMovieIds, tmdbTvIds } = resolveGenres(rawGenres)

  const results: any[] = []
  const seenIds = new Set<string>()

  const profileBoost = (recGenres: string[]) =>
    Math.min(25, Math.round(recGenres.reduce((s, g) => s + (genreScores[g] || 0), 0) / maxGenreScore * 25))

  const whyText = (recGenres: string[]) => {
    const shared = recGenres.filter(g => rawGenres.includes(g) || crossGenres.includes(g)).slice(0, 2)
    return shared.length > 0 ? `Condivide ${shared.join(', ')} con "${sourceTitle}"` : `Simile a "${sourceTitle}"`
  }

  const add = (item: any) => {
    if (seenIds.has(item.id) || ownedIds.has(item.id)) return
    seenIds.add(item.id)
    results.push(item)
  }

  const fetches: Promise<void>[] = []

  // ── IGDB giochi ───────────────────────────────────────────────────────────
  if (igdbClientId && igdbClientSecret && igdbGenres.length > 0) {
    fetches.push((async () => {
      try {
        const token = await getIgdbToken(igdbClientId, igdbClientSecret)
        if (!token) return
        const genreQuery = igdbGenres.slice(0, 2).map(g => `"${g}"`).join(',')
        const body = `
          fields name,cover.url,first_release_date,summary,genres.name,
                 rating,rating_count,involved_companies.company.name,involved_companies.developer;
          where genres.name = (${genreQuery}) & rating_count > 50 & rating >= 60 & cover != null;
          sort rating desc; limit 25;`
        const res = await fetch('https://api.igdb.com/v4/games', {
          method: 'POST',
          headers: { 'Client-ID': igdbClientId, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
          body, signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return
        const games = await res.json()
        if (!Array.isArray(games)) return
        for (const g of games) {
          const id = g.id.toString()
          const recGenres: string[] = (g.genres || []).map((x: any) => x.name)
          const developer = (g.involved_companies || [])
            .filter((ic: any) => ic.developer).map((ic: any) => ic.company?.name).filter(Boolean)[0] as string | undefined
          add({
            id, title: g.name || '', type: 'game',
            coverImage: g.cover?.url ? `https:${g.cover.url.replace('t_thumb','t_1080p')}` : undefined,
            year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : undefined,
            genres: recGenres, score: g.rating ? Math.min(g.rating / 20, 5) : undefined,
            matchScore: 55 + profileBoost(recGenres),
            why: whyText(recGenres), creatorBoost: developer, _pop: g.rating_count || 0,
          })
        }
      } catch {}
    })())
  }

  // ── AniList anime ─────────────────────────────────────────────────────────
  if (anilistGenres.length > 0) {
    fetches.push((async () => {
      try {
        const q = `query($g:[String]){Page(page:1,perPage:25){media(type:ANIME,genre_in:$g,sort:[SCORE_DESC],isAdult:false){id title{romaji english}coverImage{large}seasonYear genres averageScore popularity}}}`
        const res = await fetch(ANILIST_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, variables: { g: anilistGenres.slice(0, 2) } }),
          signal: AbortSignal.timeout(6000),
        })
        if (!res.ok) return
        const json = await res.json()
        for (const m of json.data?.Page?.media || []) {
          const id = `anilist-anime-${m.id}`
          const recGenres: string[] = m.genres || []
          add({ id, title: m.title?.romaji || m.title?.english || '', type: 'anime',
            coverImage: m.coverImage?.large, year: m.seasonYear, genres: recGenres,
            score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
            matchScore: 50 + profileBoost(recGenres), why: whyText(recGenres), _pop: m.popularity || 0 })
        }
      } catch {}
    })())
  }

  // ── TMDb film ────────────────────────────────────────────────────────────
  if (tmdbToken && tmdbMovieIds.length > 0) {
    fetches.push((async () => {
      try {
        const params = new URLSearchParams({ with_genres: tmdbMovieIds.slice(0,3).join(','), sort_by: 'vote_average.desc', 'vote_count.gte': '150', language: 'it-IT' })
        const res = await fetch(`${TMDB_BASE}/discover/movie?${params}`, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(6000) })
        if (!res.ok) return
        const json = await res.json()
        for (const m of (json.results || []).slice(0, 20)) {
          const id = `tmdb-movie-${m.id}`
          const recGenres = crossGenres.filter(g => GENRE_TO_TMDB_MOVIE[g])
          add({ id, title: m.title || '', type: 'movie',
            coverImage: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
            year: m.release_date ? new Date(m.release_date).getFullYear() : undefined,
            genres: recGenres, score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
            matchScore: 50 + profileBoost(recGenres), why: whyText(recGenres), _pop: m.popularity || 0 })
        }
      } catch {}
    })())
  }

  // ── TMDb serie TV ────────────────────────────────────────────────────────
  if (tmdbToken && tmdbTvIds.length > 0) {
    fetches.push((async () => {
      try {
        const params = new URLSearchParams({ with_genres: tmdbTvIds.slice(0,3).join(','), sort_by: 'vote_average.desc', 'vote_count.gte': '80', language: 'it-IT' })
        const res = await fetch(`${TMDB_BASE}/discover/tv?${params}`, { headers: { Authorization: `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(6000) })
        if (!res.ok) return
        const json = await res.json()
        for (const m of (json.results || []).slice(0, 20)) {
          const id = `tmdb-tv-${m.id}`
          const recGenres = crossGenres.filter(g => GENRE_TO_TMDB_TV[g])
          add({ id, title: m.name || '', type: 'tv',
            coverImage: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
            year: m.first_air_date ? new Date(m.first_air_date).getFullYear() : undefined,
            genres: recGenres, score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
            matchScore: 50 + profileBoost(recGenres), why: whyText(recGenres), _pop: m.popularity || 0 })
        }
      } catch {}
    })())
  }

  // ── AniList manga ────────────────────────────────────────────────────────
  if (anilistGenres.length > 0) {
    fetches.push((async () => {
      try {
        const q = `query($g:[String]){Page(page:1,perPage:15){media(type:MANGA,genre_in:$g,sort:[SCORE_DESC]){id title{romaji english}coverImage{large}startDate{year}genres averageScore popularity}}}`
        const res = await fetch(ANILIST_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, variables: { g: anilistGenres.slice(0, 2) } }),
          signal: AbortSignal.timeout(6000),
        })
        if (!res.ok) return
        const json = await res.json()
        for (const m of json.data?.Page?.media || []) {
          const id = `anilist-manga-${m.id}`
          const recGenres: string[] = m.genres || []
          add({ id, title: m.title?.romaji || m.title?.english || '', type: 'manga',
            coverImage: m.coverImage?.large, year: m.startDate?.year, genres: recGenres,
            score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
            matchScore: 48 + profileBoost(recGenres), why: whyText(recGenres), _pop: m.popularity || 0 })
        }
      } catch {}
    })())
  }

  // Tutte le fetch in parallelo
  await Promise.allSettled(fetches)

  results.sort((a, b) => b.matchScore !== a.matchScore ? b.matchScore - a.matchScore : b._pop - a._pop)
  const clean = results.map(({ _pop, ...r }) => r)

  return NextResponse.json({ items: clean, total: clean.length }, { headers: rl.headers })
}