import type { AppLocale } from './serverLocale'

export const PRODUCT_TERM = {
  it: {
    home: 'Home',
    discover: 'Discover',
    swipe: 'Swipe',
    wishlist: 'Wishlist',
    library: 'Libreria',
    forYou: 'Per te',
    settings: 'Impostazioni',
    boardgame: 'Giochi da Tavolo',
    movie: 'Film',
    tv: 'Serie TV',
    game: 'Videogiochi',
    anime: 'Anime',
    manga: 'Manga',
  },
  en: {
    home: 'Home',
    discover: 'Discover',
    swipe: 'Swipe',
    wishlist: 'Wishlist',
    library: 'Library',
    forYou: 'For You',
    settings: 'Settings',
    boardgame: 'Board Games',
    movie: 'Movies',
    tv: 'TV Shows',
    game: 'Games',
    anime: 'Anime',
    manga: 'Manga',
  },
} as const

export function productTerm(key: keyof typeof PRODUCT_TERM.it, locale: AppLocale) {
  return PRODUCT_TERM[locale][key]
}
