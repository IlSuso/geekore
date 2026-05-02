import {
  ANILIST_VALID,
  GENRE_TO_TMDB_MOVIE,
  GENRE_TO_TMDB_TV,
  IGDB_TO_CROSS,
  IGDB_VALID,
} from './constants'

export function resolveGenres(rawGenres: string[]) {
  const crossSet = new Set<string>()
  const igdbDirect: string[] = []

  for (const g of rawGenres) {
    if (IGDB_VALID.has(g)) {
      igdbDirect.push(g)
      for (const c of (IGDB_TO_CROSS[g] || [])) crossSet.add(c)
    }
    crossSet.add(g)
  }

  const crossGenres = [...crossSet]
  return {
    igdbGenres: igdbDirect,
    crossGenres,
    anilistGenres: crossGenres.filter(g => ANILIST_VALID.has(g)),
    tmdbMovieIds: [...new Set(crossGenres.map(g => GENRE_TO_TMDB_MOVIE[g]).filter(Boolean) as number[])],
    tmdbTvIds: [...new Set(crossGenres.map(g => GENRE_TO_TMDB_TV[g]).filter(Boolean) as number[])],
  }
}

export function toTitleCase(s: string) {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}
