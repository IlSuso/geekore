export const TMDB_BASE = 'https://api.themoviedb.org/3'
export const ANILIST_URL = 'https://graphql.anilist.co'

export const IGDB_TO_CROSS: Record<string, string[]> = {
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

export const TAG_TO_IGDB_THEME: Record<string, number> = {
  'Science Fiction': 18, 'Sci-Fi': 18, 'space': 18, 'alien': 18, 'aliens': 18,
  'Fantasy': 17, 'magic': 17, 'dragon': 17,
  'Horror': 19, 'horror': 19,
  'Thriller': 20, 'thriller': 20,
  'Drama': 31, 'drama': 31,
  'Comedy': 27, 'comedy': 27,
  'Business': 26, 'Romance': 32,
  'Sandbox': 33, 'Educational': 34, 'Kids': 35,
  'Open World': 33, 'survival': 23, 'Survival': 23,
  'Stealth': 24, 'Historical': 22, 'historical': 22,
}

export const IGDB_VALID = new Set([
  'Action','Adventure','Role-playing (RPG)','Shooter','Strategy','Simulation',
  'Puzzle','Racing','Sport','Fighting','Platform',"Hack and slash/Beat 'em up",
  'Real Time Strategy (RTS)','Turn-based strategy (TBS)','Tactical','Visual Novel',
  'Massively Multiplayer Online (MMO)','Indie','Arcade',
])

export const GENRE_TO_TMDB_MOVIE: Record<string, number> = {
  'Action':28,'Adventure':12,'Animation':16,'Comedy':35,'Crime':80,
  'Drama':18,'Fantasy':14,'Horror':27,'Mystery':9648,'Romance':10749,
  'Science Fiction':878,'Sci-Fi':878,'Thriller':53,'War':10752,
  'History':36,'Psychological':9648,'Sports':10402,
}

export const GENRE_TO_TMDB_TV: Record<string, number> = {
  'Action':10759,'Adventure':10759,'Animation':16,'Comedy':35,'Crime':80,
  'Drama':18,'Fantasy':10765,'Horror':9648,'Mystery':9648,'Romance':10749,
  'Science Fiction':10765,'Sci-Fi':10765,'Thriller':80,'Psychological':9648,
}

export const TMDB_MOVIE_ID_TO_GENRE: Record<number, string> = {
  28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',
  18:'Drama',14:'Fantasy',27:'Horror',9648:'Mystery',10749:'Romance',
  878:'Science Fiction',53:'Thriller',10752:'War',36:'History',
}

export const TMDB_TV_ID_TO_GENRE: Record<number, string> = {
  10759:'Action',16:'Animation',35:'Comedy',80:'Crime',
  18:'Drama',10765:'Science Fiction',27:'Horror',9648:'Mystery',10749:'Romance',53:'Thriller',
}

export const ANILIST_VALID = new Set([
  'Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery',
  'Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller','Psychological',
])

export const TMDB_META_KW_BLOCKLIST = new Set([
  'based on novel or book','based on novel','based on book','based on true story',
  'based on true events','based on real events','based on comic','based on comic book',
  'based on manga','based on video game','based on tv series','based on play',
  'based on short story','based on anime','based on graphic novel','based on play or musical',
  'independent film','edited from tv series',
  'duringcreditsstinger','aftercreditsstinger','female protagonist','male protagonist',
  'heterosexual','lgbt','lgbtq+',
  'prequel','sequel','spin off','spin-off','remake','reboot','compilation',
  'anime','cartoon','adult animation','stop motion','3d animation','live action','short film',
  'original video animation (ova)','original net animation (ona)',
  'seinen','shounen','josei','shoujo','kodomomuke','manhwa','manhua',
  'action','adventure','drama','comedy','horror','thriller','mystery','fantasy','romance',
  'animation','animated','science fiction','sci-fi','indie','simulator','simulation',
  'puzzle','strategy','open world','sandbox','stealth','survival','historical',
  'role-playing','turn-based','real-time','multiplayer','massively multiplayer',
  'visual novel','platform','racing','fighting','sport','sports','educational','kids',
])

export const NICHE_LANGS = new Set(['th','vi','id','ar','hi','tl','ms','te','ta','ml','bn','uk','ro','hu','cs','sr','hr','sk','bg','el'])
