// src/lib/locale.tsx
'use client'

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'

export type Locale = 'it' | 'en'

type Dictionary = {
  [key: string]: any
  common: Record<string, any>
  nav: Record<string, any>
  settings: Record<string, any>
  discover: Record<string, any>
  forYou: Record<string, any>
  feed: Record<string, any>
  login: Record<string, any>
  register: Record<string, any>
  media: Record<string, any>
  profile: Record<string, any>
  profileEdit: Record<string, any>
  toasts: Record<string, any>
  legal: Record<string, any>
}

const dictionaries: Record<Locale, Dictionary> = {
  it: {
    common: {
      loading: 'Caricamento…', searching: 'Ricerca in corso…', refresh: 'Aggiorna', retry: 'Riprova',
      close: 'Chiudi', cancel: 'Annulla', save: 'Salva', add: 'Aggiungi', remove: 'Rimuovi',
      wishlist: 'Wishlist', noResults: 'Nessun risultato', error: 'Qualcosa è andato storto',
    },
    nav: {
      home: 'Home', forYou: 'Per te', discover: 'Discover', library: 'Libreria', profile: 'Profilo', settings: 'Impostazioni',
    },
    settings: {
      title: 'Impostazioni', language: 'Lingua', languageDesc: 'Scegli la lingua dell’app. I titoli ufficiali e le descrizioni vengono localizzati quando disponibili.', italian: 'Italiano', english: 'English',
    },
    discover: {
      searchLabel: 'Ricerca Discover', searchPlaceholder: 'Cerca anime, film, giochi, serie...', listeningPlaceholder: 'In ascolto...', placeholder: 'Cerca anime, film, giochi, serie...',
      listening: 'In ascolto...', cancelVoice: 'Annulla', clearSearch: 'Cancella ricerca', filtersLabel: 'Filtri Discover', voiceStart: 'Avvia ricerca vocale', voiceStop: 'Ferma ricerca vocale',
      browseTitle: 'Parti da un universo', browseSubtitle: 'Shortcut editoriali per aprire subito ricerche utili', trendingTitle: 'Trending oggi', trendingSubtitle: 'Il mix più caldo tra community e cataloghi',
      startUniverse: 'Parti da un universo', startUniverseSubtitle: 'Shortcut editoriali per aprire subito ricerche utili', trendingToday: 'Trending oggi', trendingTodaySubtitle: 'Il mix più caldo tra community e cataloghi',
      searching: 'Ricerca in corso…', noResults: 'Nessun risultato trovato', searchError: 'Errore durante la ricerca',
    },
    forYou: {
      title: 'Per te', refresh: 'Aggiorna', refreshing: 'Aggiornamento…', loading: 'Caricamento…', empty: 'Nessun consiglio disponibile', retry: 'Riprova', preferences: 'Preferenze',
      emptyState: 'Non abbiamo ancora abbastanza segnali per costruire consigli affidabili.', emptyStateCta: 'Vai su Discover', sectionEmpty: 'Nessun titolo disponibile in questa sezione.',
      sections: { anime: 'Anime', manga: 'Manga', movie: 'Film', tv: 'Serie TV', game: 'Videogiochi', boardgame: 'Giochi da Tavolo' },
    },
    feed: {
      placeholder: 'Condividi un pensiero, una scoperta o un consiglio...', current: 'In corso', emptyTitle: 'Il feed è vuoto', emptyHint: 'Segui qualcuno o pubblica il primo post.', noFollowingTitle: 'Nessun post dai profili che segui', noFollowingHint: 'Segui altri utenti per vedere attività qui.',
    },
    login: {
      welcome: 'Bentornato', subtitle: 'Accedi al tuo universo Geekore.', email: 'Email', emailPlaceholder: 'La tua email', password: 'Password', passwordPlaceholder: 'La tua password', signIn: 'Accedi', signingIn: 'Accesso…', registerLink: 'Non hai un account? Registrati', error: 'Email o password non validi',
    },
    register: {
      title: 'Crea il tuo account', subtitle: 'Costruisci il tuo profilo nerd in pochi secondi.', email: 'Email', emailPlaceholder: 'La tua email', password: 'Password', passwordPlaceholder: 'Crea una password', displayName: 'Nome visualizzato', displayNamePlaceholder: 'Come vuoi apparire', create: 'Crea account', creating: 'Creazione…', loginLink: 'Hai già un account? Accedi', backToLogin: 'Torna al login', confirmTitle: 'Controlla la tua email', confirmSent: 'Ti abbiamo inviato un link di conferma.', confirmSpam: 'Controlla anche spam/promozioni.', confirmLink: 'Torna al login', error: 'Impossibile creare l’account',
    },
    media: {
      cancel: 'Annulla', delete: 'Elimina', genres: 'Generi', rating: 'Voto', status: 'Stato',
      hoursPlayed: (hours: number) => `${hours} ore giocate`, season: (n: number) => `Stagione ${n}`, ep: (n: number) => `Ep. ${n}`,
    },
    profile: {
      notFound: 'Profilo non trovato', editProfile: 'Modifica profilo', follower: 'Follower', following: 'Seguiti', emptyOwner: 'La tua libreria è ancora vuota.', emptyOther: 'Questo profilo non ha ancora elementi pubblici.', elements: (n: number) => `${n} elementi`, notesTitle: (title: string) => `Note su ${title}`, notesPlaceholder: 'Scrivi una nota privata...',
      categories: { all: 'Tutti', games: 'Videogiochi', manga: 'Manga', anime: 'Anime', tv: 'Serie TV', movies: 'Film', boardgames: 'Giochi da Tavolo' },
    },
    profileEdit: {
      backToProfile: 'Torna al profilo', username: 'Username', usernameHint: 'Solo lettere, numeri e underscore.', usernameTooShort: (n: number) => `Minimo ${n} caratteri`, usernameTooLong: (n: number) => `Massimo ${n} caratteri`, usernameInvalid: 'Username non valido', usernameTaken: 'Username già occupato', displayName: 'Nome visualizzato', bio: 'Bio', bioPlaceholder: 'Racconta qualcosa di te...', bioTooLong: (n: number) => `Massimo ${n} caratteri`, changePhoto: 'Cambia foto', removePhoto: 'Rimuovi foto', imageTooLarge: 'Immagine troppo grande', save: 'Salva modifiche', saving: 'Salvataggio…', saved: 'Profilo salvato', saveError: 'Errore durante il salvataggio',
    },
    toasts: {
      steamNoGames: 'Nessun gioco Steam trovato', steamImported: (count: number) => `${count} giochi Steam importati`,
    },
    legal: {
      privacy: 'Privacy', terms: 'Termini', rights: '© Geekore. Tutti i diritti riservati.',
    },
  },
  en: {
    common: {
      loading: 'Loading…', searching: 'Searching…', refresh: 'Refresh', retry: 'Retry',
      close: 'Close', cancel: 'Cancel', save: 'Save', add: 'Add', remove: 'Remove', wishlist: 'Wishlist', noResults: 'No results', error: 'Something went wrong',
    },
    nav: {
      home: 'Home', forYou: 'For You', discover: 'Discover', library: 'Library', profile: 'Profile', settings: 'Settings',
    },
    settings: {
      title: 'Settings', language: 'Language', languageDesc: 'Choose the app language. Official titles and descriptions are localized when available.', italian: 'Italiano', english: 'English',
    },
    discover: {
      searchLabel: 'Discover search', searchPlaceholder: 'Search anime, movies, games, shows...', listeningPlaceholder: 'Listening...', placeholder: 'Search anime, movies, games, shows...',
      listening: 'Listening...', cancelVoice: 'Cancel', clearSearch: 'Clear search', filtersLabel: 'Discover filters', voiceStart: 'Start voice search', voiceStop: 'Stop voice search',
      browseTitle: 'Start from a universe', browseSubtitle: 'Editorial shortcuts to open useful searches fast', trendingTitle: 'Trending today', trendingSubtitle: 'The hottest mix across community and catalogs',
      startUniverse: 'Start from a universe', startUniverseSubtitle: 'Editorial shortcuts to open useful searches fast', trendingToday: 'Trending today', trendingTodaySubtitle: 'The hottest mix across community and catalogs',
      searching: 'Searching…', noResults: 'No results found', searchError: 'Search error',
    },
    forYou: {
      title: 'For You', refresh: 'Refresh', refreshing: 'Refreshing…', loading: 'Loading…', empty: 'No recommendations available', retry: 'Retry', preferences: 'Preferences',
      emptyState: 'We do not have enough signals yet to build reliable recommendations.', emptyStateCta: 'Go to Discover', sectionEmpty: 'No titles available in this section.',
      sections: { anime: 'Anime', manga: 'Manga', movie: 'Movies', tv: 'TV Shows', game: 'Games', boardgame: 'Board Games' },
    },
    feed: {
      placeholder: 'Share a thought, discovery, or recommendation...', current: 'Current', emptyTitle: 'The feed is empty', emptyHint: 'Follow someone or publish the first post.', noFollowingTitle: 'No posts from people you follow', noFollowingHint: 'Follow more users to see activity here.',
    },
    login: {
      welcome: 'Welcome back', subtitle: 'Sign in to your Geekore universe.', email: 'Email', emailPlaceholder: 'Your email', password: 'Password', passwordPlaceholder: 'Your password', signIn: 'Sign in', signingIn: 'Signing in…', registerLink: 'No account yet? Sign up', error: 'Invalid email or password',
    },
    register: {
      title: 'Create your account', subtitle: 'Build your nerd profile in seconds.', email: 'Email', emailPlaceholder: 'Your email', password: 'Password', passwordPlaceholder: 'Create a password', displayName: 'Display name', displayNamePlaceholder: 'How you want to appear', create: 'Create account', creating: 'Creating…', loginLink: 'Already have an account? Sign in', backToLogin: 'Back to login', confirmTitle: 'Check your email', confirmSent: 'We sent you a confirmation link.', confirmSpam: 'Check spam/promotions too.', confirmLink: 'Back to login', error: 'Could not create account',
    },
    media: {
      cancel: 'Cancel', delete: 'Delete', genres: 'Genres', rating: 'Rating', status: 'Status',
      hoursPlayed: (hours: number) => `${hours} hours played`, season: (n: number) => `Season ${n}`, ep: (n: number) => `Ep. ${n}`,
    },
    profile: {
      notFound: 'Profile not found', editProfile: 'Edit profile', follower: 'Followers', following: 'Following', emptyOwner: 'Your library is still empty.', emptyOther: 'This profile has no public items yet.', elements: (n: number) => `${n} items`, notesTitle: (title: string) => `Notes on ${title}`, notesPlaceholder: 'Write a private note...',
      categories: { all: 'All', games: 'Games', manga: 'Manga', anime: 'Anime', tv: 'TV Shows', movies: 'Movies', boardgames: 'Board Games' },
    },
    profileEdit: {
      backToProfile: 'Back to profile', username: 'Username', usernameHint: 'Letters, numbers, and underscores only.', usernameTooShort: (n: number) => `At least ${n} characters`, usernameTooLong: (n: number) => `Max ${n} characters`, usernameInvalid: 'Invalid username', usernameTaken: 'Username already taken', displayName: 'Display name', bio: 'Bio', bioPlaceholder: 'Tell something about yourself...', bioTooLong: (n: number) => `Max ${n} characters`, changePhoto: 'Change photo', removePhoto: 'Remove photo', imageTooLarge: 'Image too large', save: 'Save changes', saving: 'Saving…', saved: 'Profile saved', saveError: 'Could not save profile',
    },
    toasts: {
      steamNoGames: 'No Steam games found', steamImported: (count: number) => `${count} Steam games imported`,
    },
    legal: {
      privacy: 'Privacy', terms: 'Terms', rights: '© Geekore. All rights reserved.',
    },
  },
}

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Dictionary
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== 'string') return null
  const v = value.toLowerCase()
  if (v === 'it' || v === 'it-it' || v === 'italiano') return 'it'
  if (v === 'en' || v === 'en-us' || v === 'en-gb' || v === 'english') return 'en'
  return null
}

function cookieLocale(): Locale | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)geekore_locale=([^;]+)/)
  return normalizeLocale(match ? decodeURIComponent(match[1]) : null)
}

function storageLocale(): Locale | null {
  if (typeof window === 'undefined') return null
  try { return normalizeLocale(window.localStorage.getItem('geekore_locale')) } catch { return null }
}

function writeLocaleEverywhere(locale: Locale) {
  if (typeof document !== 'undefined') {
    document.cookie = `geekore_locale=${locale}; path=/; max-age=31536000; samesite=lax`
    document.documentElement.lang = locale
  }
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem('geekore_locale', locale) } catch {}
  }
}

function isLocaleSensitiveUrl(url: URL): boolean {
  const path = url.pathname
  return path.startsWith('/api/tmdb') || path.startsWith('/api/anilist') || path.startsWith('/api/igdb') || path.startsWith('/api/bgg') || path.startsWith('/api/recommendations') || path.startsWith('/api/swipe/queue') || path.startsWith('/api/media/localize') || path.startsWith('/api/trending') || path.startsWith('/api/news') || path.startsWith('/api/translate/description')
}

function installLocaleFetchBridge(getLocale: () => Locale) {
  if (typeof window === 'undefined') return () => {}
  const w = window as any
  if (w.__geekoreLocaleFetchBridgeInstalled) return () => {}
  w.__geekoreLocaleFetchBridgeInstalled = true
  const originalFetch = window.fetch.bind(window)
  w.__geekoreOriginalFetch = originalFetch

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const locale = getLocale()
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
      const url = new URL(rawUrl, window.location.origin)
      if (url.origin === window.location.origin && isLocaleSensitiveUrl(url)) {
        if (!url.searchParams.get('lang')) url.searchParams.set('lang', locale)
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
        headers.set('x-lang', locale)
        headers.set('x-geekore-locale', locale)
        const nextInit = { ...(init || {}), headers }
        if (typeof input === 'string') {
          const nextUrl = rawUrl.startsWith('http') ? url.toString() : `${url.pathname}${url.search}${url.hash}`
          return originalFetch(nextUrl, nextInit)
        }
        if (input instanceof URL) return originalFetch(url, nextInit)
        return originalFetch(new Request(url.toString(), input), nextInit)
      }
    } catch {}
    return originalFetch(input as any, init)
  }) as typeof window.fetch

  return () => {}
}

async function safeWarmFetch(url: string, locale: Locale) {
  try {
    await fetch(url, {
      method: 'GET', credentials: 'include', cache: 'no-store', keepalive: true,
      headers: { 'x-lang': locale, 'x-geekore-locale': locale, 'x-geekore-prewarm': 'locale-switch' },
    }).catch(() => null)
  } catch {}
}

function prewarmForYouAndSwipeForLocale(locale: Locale) {
  if (typeof window === 'undefined') return
  const run = async () => {
    try {
      await safeWarmFetch(`/api/recommendations?source=pool&type=all&prewarm=1&lang=${locale}`, locale)
      for (const queue of ['all', 'anime', 'manga', 'movie', 'tv', 'game', 'boardgame']) {
        await safeWarmFetch(`/api/swipe/queue?queue=${queue}&type=${queue}&limit=40&prewarm=1&lang=${locale}`, locale)
      }
      window.dispatchEvent(new CustomEvent('geekore:locale-prewarm-complete', { detail: { locale, targets: ['for-you', 'swipe'] } }))
    } catch {}
  }
  const w = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 1500 })
  else globalThis.setTimeout(run, 250)
}

export function LocaleProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [localeState, setLocaleState] = useState<Locale>(() => normalizeLocale(initialLocale) || storageLocale() || cookieLocale() || 'it')
  const localeRef = useRef<Locale>(localeState)
  localeRef.current = localeState

  useEffect(() => { writeLocaleEverywhere(localeState) }, [localeState])
  useEffect(() => installLocaleFetchBridge(() => localeRef.current), [])

  const setLocale = (next: Locale) => {
    const normalized = normalizeLocale(next) || 'it'
    if (normalized === localeRef.current) { writeLocaleEverywhere(normalized); return }
    localeRef.current = normalized
    setLocaleState(normalized)
    writeLocaleEverywhere(normalized)
    fetch('/api/user/locale', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'x-lang': normalized, 'x-geekore-locale': normalized }, body: JSON.stringify({ locale: normalized }) }).catch(() => null)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('geekore:locale-changed', { detail: { locale: normalized } }))
      window.dispatchEvent(new CustomEvent('geekore:media-locale-switch', { detail: { locale: normalized } }))
    }
    prewarmForYouAndSwipeForLocale(normalized)
  }

  const value = useMemo<LocaleContextValue>(() => ({ locale: localeState, setLocale, t: dictionaries[localeState] }), [localeState])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used inside LocaleProvider')
  return context
}
