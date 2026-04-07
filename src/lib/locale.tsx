'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type Locale = 'it' | 'en'

const translations = {
  it: {
    nav: {
      home: 'Home', discover: 'Discover', news: 'News',
      notifications: 'Notifiche', profile: 'Profilo',
      settings: 'Impostazioni', logout: 'Esci',
    },
    settings: {
      title: 'Impostazioni',
      language: 'Lingua',
      languageDesc: 'Lingua dell\'interfaccia e delle news (TMDb)',
      italian: '🇮🇹 Italiano',
      english: '🇬🇧 English',
    },
    news: {
      title: 'News',
      subtitle: 'Uscite imminenti dall\'universo nerd — TMDb, AniList e IGDB',
      all: 'Tutto', cinema: 'Film', tv: 'Serie TV', anime: 'Anime', gaming: 'Videogiochi',
      refresh: 'Aggiorna', load: 'Carica notizie', loading: 'Caricamento...',
      empty: 'Nessuna notizia disponibile.',
      updated: 'Aggiornato alle',
      episode: (n: number) => `Ep. ${n} in arrivo`,
    },
    profile: {
      editProfile: 'Modifica Profilo',
      follower: 'Follower', following: 'Following',
      completed: 'Completato',
      myProgress: 'I miei progressi',
      progressOf: (u: string) => `Progressi di @${u}`,
      logout: 'Esci',
    },
    discover: {
      searchPlaceholder: 'Cerca anime, giochi, film, serie...',
      noResults: 'Nessun risultato con copertina valida trovato.',
      minChars: 'Scrivi almeno 2 caratteri per cercare.',
      error: 'Errore durante la ricerca. Verifica la connessione o riprova tra qualche secondo.',
      wishlistAdd: 'Aggiunto alla wishlist',
      wishlistRemove: 'Rimosso dalla wishlist',
    },
    common: {
      loading: 'Caricamento...',
      save: 'Salva', cancel: 'Annulla', delete: 'Elimina', add: 'Aggiungi',
      notFound: 'Utente non trovato',
    },
  },
  en: {
    nav: {
      home: 'Home', discover: 'Discover', news: 'News',
      notifications: 'Notifications', profile: 'Profile',
      settings: 'Settings', logout: 'Logout',
    },
    settings: {
      title: 'Settings',
      language: 'Language',
      languageDesc: 'Interface and news language (TMDb)',
      italian: '🇮🇹 Italian',
      english: '🇬🇧 English',
    },
    news: {
      title: 'News',
      subtitle: 'Upcoming releases from the nerd universe — TMDb, AniList & IGDB',
      all: 'All', cinema: 'Movies', tv: 'TV Shows', anime: 'Anime', gaming: 'Games',
      refresh: 'Refresh', load: 'Load news', loading: 'Loading...',
      empty: 'No news available.',
      updated: 'Updated at',
      episode: (n: number) => `Ep. ${n} upcoming`,
    },
    profile: {
      editProfile: 'Edit Profile',
      follower: 'Follower', following: 'Following',
      completed: 'Completed',
      myProgress: 'My progress',
      progressOf: (u: string) => `${u}'s progress`,
      logout: 'Logout',
    },
    discover: {
      searchPlaceholder: 'Search anime, games, movies, series...',
      noResults: 'No results with valid cover found.',
      minChars: 'Type at least 2 characters to search.',
      error: 'Search error. Check your connection or try again.',
      wishlistAdd: 'Added to wishlist',
      wishlistRemove: 'Removed from wishlist',
    },
    common: {
      loading: 'Loading...',
      save: 'Save', cancel: 'Cancel', delete: 'Delete', add: 'Add',
      notFound: 'User not found',
    },
  },
} as const

export type T = typeof translations.it

type LocaleContextType = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: T
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'it',
  setLocale: () => {},
  t: translations.it,
})

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('it')

  useEffect(() => {
    const saved = localStorage.getItem('geekore_locale') as Locale | null
    if (saved === 'it' || saved === 'en') setLocaleState(saved)
  }, [])

  const setLocale = (l: Locale) => {
    setLocaleState(l)
    localStorage.setItem('geekore_locale', l)
  }

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t: translations[locale] }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  return useContext(LocaleContext)
}
