import type { Locale } from './serverLocale'

const TYPE_LABELS: Record<Locale, Record<string, string>> = {
  it: {
    anime: 'Anime',
    manga: 'Manga',
    movie: 'Film',
    tv: 'Serie TV',
    game: 'Videogioco',
    boardgame: 'Gioco da Tavolo',
    board_game: 'Gioco da Tavolo',
    book: 'Libro',
  },
  en: {
    anime: 'Anime',
    manga: 'Manga',
    movie: 'Movie',
    tv: 'TV Show',
    game: 'Game',
    boardgame: 'Board Game',
    board_game: 'Board Game',
    book: 'Book',
  },
}

const STATUS_LABELS: Record<Locale, Record<string, string>> = {
  it: {
    watching: 'In corso',
    playing: 'In corso',
    reading: 'In lettura',
    completed: 'Completato',
    planned: 'Da iniziare',
    dropped: 'Abbandonato',
    paused: 'In pausa',
  },
  en: {
    watching: 'Watching',
    playing: 'Playing',
    reading: 'Reading',
    completed: 'Completed',
    planned: 'Planned',
    dropped: 'Dropped',
    paused: 'Paused',
  },
}

const GENRE_LABELS_IT: Record<string, string> = {
  Action: 'Azione',
  Adventure: 'Avventura',
  Animation: 'Animazione',
  Comedy: 'Commedia',
  Drama: 'Dramma',
  Fantasy: 'Fantasy',
  Horror: 'Horror',
  Mystery: 'Mistero',
  Romance: 'Romance',
  'Science Fiction': 'Fantascienza',
  SciFi: 'Fantascienza',
  Thriller: 'Thriller',
  Strategy: 'Strategia',
  Puzzle: 'Puzzle',
  Simulator: 'Simulazione',
  Sport: 'Sport',
  Sports: 'Sport',
  'Board Game': 'Gioco da Tavolo',
  'Deck Building': 'Deck building',
  'Worker Placement': 'Piazzamento lavoratori',
  Cooperative: 'Cooperativo',
  Deduction: 'Deduzione',
  Economic: 'Economico',
  Exploration: 'Esplorazione',
}

export function mediaTypeLabel(type: string, locale: Locale): string {
  return TYPE_LABELS[locale]?.[type] || type
}

export function statusLabel(status: string, locale: Locale): string {
  return STATUS_LABELS[locale]?.[status] || status
}

export function genreLabel(genre: string, locale: Locale): string {
  return locale === 'it' ? (GENRE_LABELS_IT[genre] || genre) : genre
}
