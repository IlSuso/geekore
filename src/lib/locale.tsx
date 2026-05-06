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
      continueWatching: 'Continua a guardare', continueWatchingSubtitle: 'Sequel e capitoli successivi dei tuoi titoli completati', sequel: 'Sequel',
      notInterested: 'Non mi interessa', alreadySeen: 'L’ho già visto', addToWishlist: 'Aggiungi alla wishlist', removeFromWishlist: 'Rimuovi dalla wishlist',
      similarSearchPlaceholder: 'Cerca un titolo per trovare contenuti simili…', clearSimilarSearch: 'Cancella ricerca simili', noResultsFound: 'Nessun risultato trovato',
      similarTitlesTo: (title: string) => `Titoli simili a “${title}”`, titlesFound: (count: number) => `${count} ${count === 1 ? 'titolo trovato' : 'titoli trovati'}`,
      titlesFoundFiltered: (count: number, total: number) => `${count} di ${total} totali`, noTitlesForFilter: 'Nessun titolo trovato per questo filtro.', showMore: (count: number) => `+${count} altri`,
      details: 'Dettagli', similar: 'Simili', close: 'Chiudi', all: 'Tutti', whyNotInterested: 'Perché non ti interessa?',
      dislikeReasons: { notMyGenre: 'Non è il mio genere', notMyGenreSub: 'Aiuta a calibrare i tuoi gusti', notForMe: 'Non fa per me', notForMeSub: 'Non suggerirlo più' },
      primaryType: 'Il tuo tipo principale', greatMatch: 'Ottimo match', titlesCount: (count: number) => `${count} ${count === 1 ? 'titolo' : 'titoli'}`, refreshRecommendations: 'Aggiorna consigli', lowConfidenceTitle: 'Consigli in miglioramento', lowConfidenceBody: (count: number) => `I tuoi consigli migliorano man mano che aggiungi titoli. Hai ancora ${count} titoli per sbloccare i consigli personalizzati.`, addFromLibrary: 'Aggiungi dalla libreria', friendsWatching: 'Amici che guardano', timeNow: 'ora', hoursAgo: (count: number) => `${count}h fa`, daysAgo: (count: number) => `${count}g fa`,
      signals: { award: 'Premiato', seasonal: 'Stagionale', serendipity: 'Scoperta' },
      units: { chaptersShort: 'cap.', episodesShort: 'ep.' },
    },
    feed: {
      placeholder: 'Condividi un pensiero, una scoperta o un consiglio...', current: 'In corso', emptyTitle: 'Il feed è vuoto', emptyHint: 'Segui qualcuno o pubblica il primo post.', noFollowingTitle: 'Nessun post dai profili che segui', noFollowingHint: 'Segui altri utenti per vedere attività qui.',
    },
    notifications: { enableTitle: 'Abilita le notifiche', enableBody: 'Ricevi avvisi per follow, like e commenti anche con l’app chiusa.', enabling: 'Attivazione…', enable: 'Attiva', later: 'Dopo' },
    social: { similarTasteTitle: 'Gusti simili ai tuoi', similarTasteSubtitle: 'Amici con cui condividi più gusti' },
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
      backToProfileOf: (username: string) => `Profilo di @${username}`, titlesCount: (count: number) => `${count} ${count === 1 ? 'titolo' : 'titoli'}`,
      completedCount: (count: number) => `${count} completati`, averageRating: (rating: string | number) => `voto medio ${rating}`, searchIn: (label: string) => `Cerca in ${label}...`,
      statusFilters: { all: 'Tutti gli stati', completed: 'Completati', watching: 'In corso', paused: 'In pausa', dropped: 'Abbandonati', wishlist: 'Wishlist' },
      sortModes: { default: 'Ordine personalizzato', ratingDesc: 'Voto (↓)', ratingAsc: 'Voto (↑)', titleAsc: 'Titolo (A-Z)', titleDesc: 'Titolo (Z-A)', dateDesc: 'Aggiunto di recente', progressDesc: 'Ore (↓)' },
      done: 'Fine', reorder: 'Riordina', noTitlesFound: 'Nessun titolo trovato', tryAnotherSearch: 'Prova con un altro termine di ricerca',
      resultsCounter: (shown: number, total: number) => `${shown} di ${total} ${total === 1 ? 'titolo' : 'titoli'}`, filteredCounter: (filtered: number, total: number) => `(filtrati su ${total} totali)`,
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
      continueWatching: 'Continue watching', continueWatchingSubtitle: 'Sequels and next chapters from titles you completed', sequel: 'Sequel',
      notInterested: 'Not interested', alreadySeen: 'Already seen', addToWishlist: 'Add to wishlist', removeFromWishlist: 'Remove from wishlist',
      similarSearchPlaceholder: 'Search a title to find similar content…', clearSimilarSearch: 'Clear similar search', noResultsFound: 'No results found',
      similarTitlesTo: (title: string) => `Titles similar to “${title}”`, titlesFound: (count: number) => `${count} ${count === 1 ? 'title found' : 'titles found'}`,
      titlesFoundFiltered: (count: number, total: number) => `${count} of ${total} total`, noTitlesForFilter: 'No titles found for this filter.', showMore: (count: number) => `+${count} more`,
      details: 'Details', similar: 'Similar', close: 'Close', all: 'All', whyNotInterested: 'Why are you not interested?',
      dislikeReasons: { notMyGenre: 'Not my genre', notMyGenreSub: 'Helps calibrate your taste', notForMe: 'Not for me', notForMeSub: 'Do not suggest it again' },
      primaryType: 'Your main type', greatMatch: 'Great match', titlesCount: (count: number) => `${count} ${count === 1 ? 'title' : 'titles'}`, refreshRecommendations: 'Refresh recommendations', lowConfidenceTitle: 'Recommendations are improving', lowConfidenceBody: (count: number) => `Your recommendations improve as you add titles. Add ${count} more titles to unlock personalized recommendations.`, addFromLibrary: 'Add from library', friendsWatching: 'Friends watching', timeNow: 'now', hoursAgo: (count: number) => `${count}h ago`, daysAgo: (count: number) => `${count}d ago`,
      signals: { award: 'Awarded', seasonal: 'Seasonal', serendipity: 'Discovery' },
      units: { chaptersShort: 'ch.', episodesShort: 'ep.' },
    },
    feed: {
      placeholder: 'Share a thought, discovery, or recommendation...', current: 'Current', emptyTitle: 'The feed is empty', emptyHint: 'Follow someone or publish the first post.', noFollowingTitle: 'No posts from people you follow', noFollowingHint: 'Follow more users to see activity here.',
    },
    notifications: { enableTitle: 'Enable notifications', enableBody: 'Get alerts for follows, likes, and comments even when the app is closed.', enabling: 'Enabling…', enable: 'Enable', later: 'Later' },
    social: { similarTasteTitle: 'Similar tastes to yours', similarTasteSubtitle: 'Friends who share the most tastes with you' },
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
      backToProfileOf: (username: string) => `Profile of @${username}`, titlesCount: (count: number) => `${count} ${count === 1 ? 'title' : 'titles'}`,
      completedCount: (count: number) => `${count} completed`, averageRating: (rating: string | number) => `avg rating ${rating}`, searchIn: (label: string) => `Search in ${label}...`,
      statusFilters: { all: 'All statuses', completed: 'Completed', watching: 'In progress', paused: 'Paused', dropped: 'Dropped', wishlist: 'Wishlist' },
      sortModes: { default: 'Custom order', ratingDesc: 'Rating (↓)', ratingAsc: 'Rating (↑)', titleAsc: 'Title (A-Z)', titleDesc: 'Title (Z-A)', dateDesc: 'Recently added', progressDesc: 'Hours (↓)' },
      done: 'Done', reorder: 'Reorder', noTitlesFound: 'No titles found', tryAnotherSearch: 'Try another search term',
      resultsCounter: (shown: number, total: number) => `${shown} of ${total} ${total === 1 ? 'title' : 'titles'}`, filteredCounter: (filtered: number, total: number) => `(filtered from ${total} total)`,
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

const LOCALE_WARNING_ZONE_MS = 24 * 60 * 60 * 1000

function markLocaleWarningZone(previousLocale: Locale, nextLocale: Locale) {
  if (typeof window === 'undefined') return
  const until = Date.now() + LOCALE_WARNING_ZONE_MS
  try {
    window.localStorage.setItem('geekore_locale_warning_until', String(until))
    window.localStorage.setItem('geekore_locale_previous', previousLocale)
  } catch {}
  if (typeof document !== 'undefined') {
    document.cookie = `geekore_locale_warning_until=${until}; path=/; max-age=86400; samesite=lax`
    document.cookie = `geekore_locale_previous=${previousLocale}; path=/; max-age=86400; samesite=lax`
  }
}

function localeWarningZoneActive(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const until = Number(window.localStorage.getItem('geekore_locale_warning_until') || '0')
    return Number.isFinite(until) && until > Date.now()
  } catch {
    return false
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
        if (localeWarningZoneActive()) {
          headers.set('x-geekore-locale-dual', '1')
          headers.set('x-geekore-warning-zone', '1')
        }
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


function triggerLocaleAssetBackfill(locale: Locale) {
  // Il cambio lingua non deve più lanciare recommendations + tutte le swipe queue.
  // La rotta /api/user/locale aggiorna il profilo e fa backfill degli asset del master pool
  // in warning zone, senza montare/caricare pagine inutili.
  fetch('/api/user/locale', {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      'x-lang': locale,
      'x-geekore-locale': locale,
      ...(localeWarningZoneActive() ? { 'x-geekore-locale-dual': '1', 'x-geekore-warning-zone': '1' } : {}),
    },
    body: JSON.stringify({ locale }),
  }).catch(() => null)
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
    const previous = localeRef.current
    localeRef.current = normalized
    markLocaleWarningZone(previous, normalized)
    setLocaleState(normalized)
    writeLocaleEverywhere(normalized)
    triggerLocaleAssetBackfill(normalized)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('geekore:locale-changed', { detail: { locale: normalized } }))
      window.dispatchEvent(new CustomEvent('geekore:media-locale-switch', { detail: { locale: normalized } }))
    }
  }

  const value = useMemo<LocaleContextValue>(() => ({ locale: localeState, setLocale, t: dictionaries[localeState] }), [localeState])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) throw new Error('useLocale must be used inside LocaleProvider')
  return context
}
