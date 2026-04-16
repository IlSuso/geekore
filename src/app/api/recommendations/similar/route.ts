// /api/recommendations/similar
// Cerca titoli simili a un titolo sorgente in tutti i media, senza filtri di profilo.
// Il profilo viene usato SOLO per il boost secondario nell'ordinamento finale.
// Query: ?title=X&genres=Drama,Romance&type=movie&id=tmdb-movie-13

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const ANILIST_URL = 'https://graphql.anilist.co'

const GENRE_TO_TMDB_MOVIE: Record<string, number> = {
  'Action': 28, 'Adventure': 12, 'Animation': 16, 'Comedy': 35,
  'Crime': 80, 'Documentary': 99, 'Drama': 18, 'Fantasy': 14,
  'Horror': 27, 'Mystery': 9648, 'Romance': 10749,
  'Science Fiction': 878, 'Sci-Fi': 878, 'Thriller': 53,
  'War': 10752, 'History': 36, 'Music': 10402,
}
const GENRE_TO_TMDB_TV: Record<string, number> = {
  'Action': 10759, 'Adventure': 10759, 'Animation': 16, 'Comedy': 35,
  'Crime': 80, 'Drama': 18, 'Fantasy': 10765, 'Horror': 9648,
  'Mystery': 9648, 'Romance': 10749, 'Science Fiction': 10765,
  'Sci-Fi': 10765, 'Thriller': 80,
}
const ANILIST_VALID = new Set([
  'Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery',
  'Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller','Psychological',
])

export async function GET(request: NextRequest) {
  const rl = rateLimit(request, { limit: 20, windowMs: 60_000, prefix: 'similar' })
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const sourceTitle = searchParams.get('title') || ''
  const genresParam = searchParams.get('genres') || ''
  const genres = genresParam.split(',').map(g => g.trim()).filter(Boolean)

  if (genres.length === 0) {
    return NextResponse.json({ error: 'genres richiesti' }, { status: 400 })
  }

  const tmdbToken = process.env.TMDB_API_KEY || ''

  // Profilo utente per boost secondario
  const { data: tasteData } = await supabase
    .from('user_taste_profile')
    .select('genre_scores')
    .eq('user_id', user.id)
    .maybeSingle()
  const genreScores: Record<string, number> = (tasteData?.genre_scores as any) || {}
  const maxGenreScore = Math.max(...Object.values(genreScores), 1)

  // Titoli già posseduti (escludi)
  const { data: owned } = await supabase
    .from('user_media_entries')
    .select('external_id, title')
    .eq('user_id', user.id)
  const ownedIds = new Set((owned || []).map((e: any) => e.external_id).filter(Boolean))

  const results: any[] = []

  const genreBoost = (recGenres: string[]) => {
    const raw = recGenres.reduce((s, g) => s + (genreScores[g] || 0), 0)
    return Math.min(30, Math.round((raw / maxGenreScore) * 30))
  }

  const label = (title: string) =>
    `Condivide i generi ${genres.slice(0, 2).join(', ')} con "${title}"`

  // ── AniList anime ─────────────────────────────────────────────────────────
  const anilistGenres = genres.filter(g => ANILIST_VALID.has(g))
  if (anilistGenres.length > 0) {
    try {
      const q = `
        query($genres:[String]){
          Page(page:1,perPage:25){
            media(type:ANIME,genre_in:$genres,sort:[SCORE_DESC],isAdult:false){
              id title{romaji english} coverImage{large} seasonYear genres
              averageScore popularity
            }
          }
        }`
      const res = await fetch(ANILIST_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, variables: { genres: anilistGenres.slice(0, 2) } }),
        signal: AbortSignal.timeout(6000),
      })
      if (res.ok) {
        const json = await res.json()
        for (const m of json.data?.Page?.media || []) {
          const id = `anilist-anime-${m.id}`
          if (ownedIds.has(id)) continue
          const recGenres: string[] = m.genres || []
          results.push({
            id, title: m.title?.romaji || m.title?.english || '',
            type: 'anime', coverImage: m.coverImage?.large,
            year: m.seasonYear, genres: recGenres,
            score: m.averageScore ? Math.min(m.averageScore / 20, 5) : undefined,
            matchScore: 50 + genreBoost(recGenres),
            why: label(sourceTitle || '...'),
            _pop: m.popularity || 0,
          })
        }
      }
    } catch {}
  }

  // ── TMDb film ─────────────────────────────────────────────────────────────
  if (tmdbToken) {
    const movieGenreIds = genres.map(g => GENRE_TO_TMDB_MOVIE[g]).filter(Boolean)
    if (movieGenreIds.length > 0) {
      try {
        const params = new URLSearchParams({
          with_genres: movieGenreIds.slice(0, 3).join(','),
          sort_by: 'vote_average.desc',
          'vote_count.gte': '150',
          language: 'it-IT',
        })
        const res = await fetch(`${TMDB_BASE}/discover/movie?${params}`, {
          headers: { Authorization: `Bearer ${tmdbToken}` },
          signal: AbortSignal.timeout(6000),
        })
        if (res.ok) {
          const json = await res.json()
          for (const m of (json.results || []).slice(0, 20)) {
            const id = `tmdb-movie-${m.id}`
            if (ownedIds.has(id)) continue
            const recGenres = genres.filter(g => GENRE_TO_TMDB_MOVIE[g] && movieGenreIds.includes(GENRE_TO_TMDB_MOVIE[g]))
            results.push({
              id, title: m.title || '', type: 'movie',
              coverImage: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
              year: m.release_date ? new Date(m.release_date).getFullYear() : undefined,
              genres: recGenres,
              score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
              matchScore: 50 + genreBoost(recGenres),
              why: label(sourceTitle || '...'),
              _pop: m.popularity || 0,
            })
          }
        }
      } catch {}
    }

    // ── TMDb serie TV ─────────────────────────────────────────────────────
    const tvGenreIds = genres.map(g => GENRE_TO_TMDB_TV[g]).filter(Boolean)
    if (tvGenreIds.length > 0) {
      try {
        const params = new URLSearchParams({
          with_genres: tvGenreIds.slice(0, 3).join(','),
          sort_by: 'vote_average.desc',
          'vote_count.gte': '80',
          language: 'it-IT',
        })
        const res = await fetch(`${TMDB_BASE}/discover/tv?${params}`, {
          headers: { Authorization: `Bearer ${tmdbToken}` },
          signal: AbortSignal.timeout(6000),
        })
        if (res.ok) {
          const json = await res.json()
          for (const m of (json.results || []).slice(0, 20)) {
            const id = `tmdb-tv-${m.id}`
            if (ownedIds.has(id)) continue
            const recGenres = genres.filter(g => GENRE_TO_TMDB_TV[g] && tvGenreIds.includes(GENRE_TO_TMDB_TV[g]))
            results.push({
              id, title: m.name || '', type: 'tv',
              coverImage: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
              year: m.first_air_date ? new Date(m.first_air_date).getFullYear() : undefined,
              genres: recGenres,
              score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
              matchScore: 50 + genreBoost(recGenres),
              why: label(sourceTitle || '...'),
              _pop: m.popularity || 0,
            })
          }
        }
      } catch {}
    }

    // ── TMDb manga/anime via ricerca testo (se sourceTitle noto) ─────────
    if (sourceTitle) {
      try {
        const res = await fetch(`${TMDB_BASE}/search/movie?query=${encodeURIComponent(sourceTitle)}&language=it-IT`, {
          headers: { Authorization: `Bearer ${tmdbToken}` },
          signal: AbortSignal.timeout(5000),
        })
        if (res.ok) {
          const json = await res.json()
          const top = (json.results || []).slice(0, 3)
          for (const m of top) {
            // Se il risultato è già nella lista, skippa
            const id = `tmdb-movie-${m.id}`
            if (results.some(r => r.id === id)) continue
            if (ownedIds.has(id)) continue
            const recGenres = genres
            results.push({
              id, title: m.title || '', type: 'movie',
              coverImage: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
              year: m.release_date ? new Date(m.release_date).getFullYear() : undefined,
              genres: recGenres,
              score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
              matchScore: 70 + genreBoost(recGenres), // boost alto: risultato diretto per nome
              why: `Risultato diretto per "${sourceTitle}"`,
              _pop: m.popularity || 0,
            })
          }
        }
      } catch {}
    }
  }

  // Ordina: matchScore desc, poi popularity desc
  results.sort((a, b) =>
    b.matchScore !== a.matchScore
      ? b.matchScore - a.matchScore
      : b._pop - a._pop
  )

  // Deduplica per id e rimuovi _pop
  const seen = new Set<string>()
  const clean = results
    .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true })
    .map(({ _pop, ...r }) => r)

  return NextResponse.json({ items: clean, total: clean.length }, { headers: rl.headers })
}