// src/lib/reco/genre-maps.ts
// Mappe generi cross-media per il Taste Engine
// Estratto da api/recommendations/route.ts — Fix #14 Repair Bible

export const CROSS_TO_IGDB_GENRE: Record<string, string[]> = {
  'Action':           ['Action', "Hack and slash/Beat 'em up", 'Fighting', 'Shooter'],
  'Adventure':        ['Adventure', 'Role-playing (RPG)', 'Point-and-click'],
  'Fantasy':          ['Role-playing (RPG)', 'Adventure'],
  'Science Fiction':  ['Shooter', 'Strategy', 'Role-playing (RPG)'],
  'Horror':           ['Adventure'],
  'Mystery':          ['Adventure', 'Puzzle', 'Point-and-click'],
  'Drama':            ['Role-playing (RPG)', 'Visual Novel'],
  'Romance':          ['Visual Novel'],
  'Comedy':           ['Platform', 'Arcade'],
  'Thriller':         ['Action', 'Shooter'],
  'Psychological':    ['Role-playing (RPG)', 'Puzzle'],
  'Supernatural':     ['Role-playing (RPG)', 'Adventure'],
  'Slice of Life':    ['Simulation'],
  'Sports':           ['Sport', 'Racing'],
  'Sci-Fi':           ['Shooter', 'Strategy', 'Role-playing (RPG)'],
  'Mecha':            ['Action', 'Shooter'],
  'Strategy':         ['Strategy', 'Real Time Strategy (RTS)', 'Turn-based strategy (TBS)', 'Tactical'],
  'Simulation':       ['Simulation'],
  'Crime':            ['Action', 'Adventure'],
  'Survival':         ['Adventure', 'Action'],
  'Role-playing (RPG)': ['Role-playing (RPG)'],
  'Shooter':          ['Shooter'],
  'Platform':         ['Platform'],
  'Puzzle':           ['Puzzle'],
  'Indie':            ['Indie'],
  'Sandbox':          ['Simulation', 'Adventure'],
  'Fighting':         ['Fighting', "Hack and slash/Beat 'em up"],
}

export const CROSS_TO_IGDB_THEME: Record<string, number[]> = {
  'Horror':        [19],
  'Thriller':      [20],
  'Drama':         [31],
  'Science Fiction': [18],
  'Sci-Fi':        [18],
  'Fantasy':       [17],
  'Psychological': [31, 20],
}

export const IGDB_VALID_GENRES = new Set([
  'Action', 'Adventure', 'Role-playing (RPG)', 'Shooter', 'Strategy',
  'Simulation', 'Puzzle', 'Racing', 'Sport', 'Fighting', 'Platform',
  "Hack and slash/Beat 'em up", 'Real Time Strategy (RTS)', 'Turn-based strategy (TBS)',
  'Tactical', 'Visual Novel', 'Card & Board Game', 'Massively Multiplayer Online (MMO)',
  'Battle Royale', 'Indie', 'Arcade', 'Music', 'Point-and-click',
])

export const TMDB_GENRE_MAP: Record<string, number> = {
  'Action': 28, 'Adventure': 12, 'Animation': 16, 'Comedy': 35, 'Crime': 80,
  'Documentary': 99, 'Drama': 18, 'Family': 10751, 'Fantasy': 14, 'History': 36,
  'Horror': 27, 'Music': 10402, 'Mystery': 9648, 'Romance': 10749,
  'Science Fiction': 878, 'Thriller': 53, 'War': 10752, 'Western': 37,
  'Azione': 28, 'Avventura': 12, 'Animazione': 16, 'Commedia': 35, 'Crimine': 80,
  'Documentario': 99, 'Dramma': 18, 'Fantasia': 14, 'Storia': 36, 'Orrore': 27,
  'Musica': 10402, 'Mistero': 9648, 'Romantico': 10749, 'Fantascienza': 878,
  'Guerra': 10752,
}

export const TMDB_TV_GENRE_MAP: Record<string, number> = {
  ...TMDB_GENRE_MAP,
  'Action & Adventure': 10759, 'Kids': 10762, 'Reality': 10764,
  'Sci-Fi & Fantasy': 10765, 'Talk': 10767,
}

export const IGDB_TO_CROSS_GENRE: Record<string, string[]> = {
  'Role-playing (RPG)': ['Fantasy', 'Adventure', 'Drama'],
  'Action': ['Action', 'Adventure'],
  'Adventure': ['Adventure', 'Fantasy'],
  'Shooter': ['Action', 'Thriller', 'Science Fiction'],
  "Hack and slash/Beat 'em up": ['Action'],
  'Strategy': ['Strategy'],
  'Simulation': ['Simulation'],
  'Horror': ['Horror', 'Thriller', 'Mystery'],
  'Puzzle': ['Mystery', 'Drama'],
  'Platform': ['Adventure', 'Comedy'],
  'Stealth': ['Thriller', 'Action', 'Crime'],
  'Fighting': ['Action'],
  'Visual Novel': ['Drama', 'Romance', 'Mystery'],
  'Turn-based strategy (TBS)': ['Strategy'],
  'Survival': ['Horror', 'Thriller', 'Adventure'],
  'Battle Royale': ['Action', 'Thriller'],
  'Massively Multiplayer Online (MMO)': ['Fantasy', 'Adventure'],
  'Indie': ['Drama', 'Adventure'],
}

export const ADJACENCY_GRAPH: Record<string, string[]> = {
  'Action': ['Thriller', 'Adventure', 'Crime'],
  'Adventure': ['Fantasy', 'Action', 'Science Fiction'],
  'Fantasy': ['Adventure', 'Supernatural', 'Drama', 'Action'],
  'Science Fiction': ['Thriller', 'Mystery', 'Action', 'Drama'],
  'Thriller': ['Mystery', 'Crime', 'Horror', 'Drama'],
  'Horror': ['Mystery', 'Thriller', 'Supernatural'],
  'Drama': ['Romance', 'Mystery', 'Psychological'],
  'Mystery': ['Thriller', 'Crime', 'Psychological', 'Horror'],
  'Romance': ['Drama', 'Comedy', 'Slice of Life'],
  'Comedy': ['Romance', 'Slice of Life', 'Adventure'],
  'Psychological': ['Drama', 'Mystery', 'Thriller', 'Horror'],
  'Supernatural': ['Fantasy', 'Horror', 'Mystery'],
  'Sci-Fi': ['Science Fiction', 'Action', 'Mystery'],
  'Crime': ['Thriller', 'Mystery', 'Drama'],
  'Role-playing (RPG)': ['Fantasy', 'Adventure', 'Action'],
  'Strategy': ['Simulation', 'Puzzle'],
  'Simulation': ['Strategy', 'Adventure'],
  'Sports': ['Action', 'Comedy'],
  'Slice of Life': ['Comedy', 'Romance', 'Drama'],
}