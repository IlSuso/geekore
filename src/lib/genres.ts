const GENRE_IT: Record<string, string> = {
  // Generi base cross-media
  'Action': 'Azione',
  'Action & Adventure': 'Azione & Avventura',
  'Adventure': 'Avventura',
  'Animation': 'Animazione',
  'Comedy': 'Commedia',
  'Crime': 'Crimine',
  'Documentary': 'Documentario',
  'Drama': 'Dramma',
  'Family': 'Famiglia',
  'Fantasy': 'Fantasy',
  'History': 'Storia',
  'Horror': 'Horror',
  'Music': 'Musica',
  'Mystery': 'Mistero',
  'Romance': 'Romantico',
  'Science Fiction': 'Fantascienza',
  'Sci-Fi': 'Fantascienza',
  'Sci-Fi & Fantasy': 'Fantascienza & Fantasy',
  'Thriller': 'Thriller',
  'War': 'Guerra',
  'Western': 'Western',
  'Sports': 'Sport',
  'Sport': 'Sport',
  'Psychological': 'Psicologico',
  'Supernatural': 'Soprannaturale',
  'Slice of Life': 'Slice of Life',
  'Mecha': 'Mecha',
  'Isekai': 'Isekai',
  'Kids': 'Bambini',
  'Talk': 'Talk show',
  'Reality': 'Reality',
  'Soap': 'Soap opera',
  'News': 'Notizie',

  // IGDB
  'Role-playing (RPG)': 'GDR',
  'Shooter': 'Sparatutto',
  'Strategy': 'Strategia',
  'Simulation': 'Simulazione',
  'Puzzle': 'Puzzle',
  'Racing': 'Corse',
  'Fighting': 'Picchiaduro',
  'Platform': 'Platform',
  "Hack and slash/Beat 'em up": 'Picchiaduro',
  'Real Time Strategy (RTS)': 'Strategia in tempo reale',
  'Turn-based strategy (TBS)': 'Strategia a turni',
  'Tactical': 'Tattico',
  'Visual Novel': 'Visual Novel',
  'Massively Multiplayer Online (MMO)': 'MMO',
  'Indie': 'Indie',
  'Arcade': 'Arcade',
  'Pinball': 'Pinball',
  'Quiz/Trivia': 'Quiz',
  'Card & Board Game': 'Gioco di carte',
  'Point-and-click': 'Punta e clicca',
  'Beat em up': 'Picchiaduro',

  // BGG
  'Medieval': 'Medievale',
  'Card Game': 'Gioco di carte',
  'Dice': 'Dadi',
  'Abstract': 'Astratto',
  'Abstract Strategy': 'Strategia astratta',
  'Cooperative': 'Cooperativo',
  'Party': 'Party game',
  'Nature': 'Natura',
  'Political': 'Politico',
  'Wargame': 'Wargame',
}

export function translateGenre(genre: string): string {
  return GENRE_IT[genre] ?? genre
}

export function translateGenres(genres: string[]): string[] {
  return genres.map(translateGenre)
}
