'use client'
// src/app/discover/page.tsx
// Discover: search multi-source + browse sections + native URL query params.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Search, X, Film, Tv, Gamepad2, Mic, MicOff, Loader2, Swords, Layers, Dices, Flame,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import { useLocale } from '@/lib/locale'
import { appCopy, discoverFilterLabel, typeLabel } from '@/lib/i18n/uiCopy'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'
import { SkeletonDiscoverCard } from '@/components/ui/SkeletonCard'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '@/components/ui/ErrorState'
import { EmptyState } from '@/components/ui/EmptyState'
import { profileInvalidateBridge } from '@/hooks/profileInvalidateBridge'
import { optimizeCover } from '@/lib/imageOptimizer'
import { DiscoverSection } from '@/components/discover/DiscoverSection'
import { DiscoverMediaCard } from '@/components/discover/DiscoverMediaCard'

type MediaItem = {
  id: string
  title: string
  title_en?: string
  type: string
  coverImage?: string
  cover_image?: string
  description?: string
  description_en?: string
  description_it?: string
  localized?: Record<string, any>
  external_id?: string
  year?: number
  episodes?: number
  totalSeasons?: number
  seasons?: Record<number, { episode_count: number }>
  genres?: string[]
  source: 'anilist' | 'tmdb' | 'igdb' | 'bgg'
  tags?: string[]
  keywords?: string[]
  themes?: string[]
  player_perspectives?: string[]
  game_modes?: string[]
  developers?: string[]
  categories?: string[]
  mechanics?: string[]
  designers?: string[]
  min_players?: number
  max_players?: number
  playing_time?: number
  complexity?: number
  score?: number
  authors?: string[]
  pages?: number
  isbn?: string
  publisher?: string
}

type TrendingItem = {
  id: string
  title: string
  type: string
  coverImage?: string
  cover_image?: string
  description?: string
  description_en?: string
  description_it?: string
  localized?: Record<string, any>
  external_id?: string
  year?: number
  genres?: string[]
  score?: number
  source: string
}

const DEBOUNCE_MS = 350
const VALID_DISCOVER_TYPES = new Set(['all', 'anime', 'manga', 'movie', 'tv', 'game', 'boardgame'])

// Roadmap Fase 8 + full.html: anime → game → tv → manga → movie → board.
const TYPE_ORDER: Record<string, number> = {
  anime: 0,
  game: 1,
  tv: 2,
  manga: 3,
  movie: 4,
  boardgame: 5,
}

const FILTERS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'Tutti', icon: null },
  { id: 'anime', label: 'Anime', icon: <Swords size={13} /> },
  { id: 'game', label: 'Game', icon: <Gamepad2 size={13} /> },
  { id: 'tv', label: 'TV', icon: <Tv size={13} /> },
  { id: 'manga', label: 'Manga', icon: <Layers size={13} /> },
  { id: 'movie', label: 'Film', icon: <Film size={13} /> },
  { id: 'boardgame', label: 'Board', icon: <Dices size={13} /> },
]

const TYPE_PLACEHOLDER_ICON: Record<string, React.ReactNode> = {
  game: <Gamepad2 size={28} />,
  boardgame: <Dices size={28} />,
  manga: <Layers size={28} />,
  anime: <Swords size={28} />,
  movie: <Film size={28} />,
  tv: <Tv size={28} />,
}


const TYPE_SECTION_ICON: Record<string, React.ReactNode> = {
  game: <Gamepad2 size={14} />,
  boardgame: <Dices size={14} />,
  manga: <Layers size={14} />,
  anime: <Swords size={14} />,
  movie: <Film size={14} />,
  tv: <Tv size={14} />,
}

const TYPE_COLORS: Record<string, string> = {
  anime: 'var(--type-anime)',
  manga: 'var(--type-manga)',
  game: 'var(--type-game)',
  tv: 'var(--type-tv)',
  movie: 'var(--type-movie)',
  boardgame: 'var(--type-board)',
}

function hasValidCover(item: any): item is MediaItem & { coverImage: string } {
  if (!item?.coverImage || typeof item.coverImage !== 'string') return false
  const url = item.coverImage.trim()
  return url.length >= 10 && !url.includes('N/A') && !url.includes('placeholder') && !url.includes('no-image')
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function rankByQuery(items: MediaItem[], query: string): MediaItem[] {
  if (query.length < 2) return items
  const q = normalize(query)
  const starts: MediaItem[] = []
  const contains: MediaItem[] = []
  for (const item of items) {
    const t = normalize(item.title)
    if (t.startsWith(q)) starts.push(item)
    else if (t.includes(q)) contains.push(item)
  }
  return [...starts, ...contains]
}

function toMediaDetails(item: MediaItem): MediaDetails {
  return {
    id: item.id,
    title: item.title,
    title_en: item.title_en,
    type: item.type,
    coverImage: item.coverImage,
    year: item.year,
    episodes: item.episodes,
    totalSeasons: item.totalSeasons,
    seasons: item.seasons,
    description: item.description,
    genres: item.genres,
    source: item.source,
    score: item.score,
    min_players: item.min_players,
    max_players: item.max_players,
    playing_time: item.playing_time,
    complexity: item.complexity,
    mechanics: item.mechanics,
    designers: item.designers,
    developers: item.developers,
    themes: item.themes,
    authors: item.authors,
    ...(item.pages ? { pages: item.pages } as any : {}),
    ...(item.isbn ? { isbn: item.isbn } as any : {}),
    ...(item.publisher ? { publisher: item.publisher } as any : {}),
  }
}

function haptic(duration: number | number[] = 50) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(duration)
}

function trackSearchQuery(query: string, mediaType?: string) {
  if (!query || query.trim().length < 2) return
  fetch('/api/search/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query.trim(), media_type: mediaType || null }),
  }).catch(() => { })
}

function trackSearchClick(query: string, item: MediaItem) {
  fetch('/api/search/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: query.trim(),
      media_type: item.type,
      result_clicked_id: item.id,
      result_clicked_type: item.type,
      result_clicked_genres: item.genres || [],
    }),
  }).catch(() => { })
}

function toDrawerMediaFromTrending(item: TrendingItem): MediaDetails {
  return {
    id: item.id,
    external_id: item.external_id || item.id,
    title: item.title,
    type: item.type,
    coverImage: item.coverImage || item.cover_image,
    cover_image: item.cover_image || item.coverImage,
    year: item.year,
    genres: item.genres,
    source: item.source as any,
    description: item.description,
    description_en: item.description_en,
    description_it: item.description_it,
    localized: item.localized,
  } as MediaDetails
}

function triggerTasteDelta(options: {
  action: 'rating' | 'status_change' | 'wishlist_add' | 'rewatch' | 'progress'
  mediaId: string
  mediaType: string
  genres: string[]
  rating?: number
  prevRating?: number
  status?: string
  prevStatus?: string
}) {
  fetch('/api/taste/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  }).catch(() => { })
}

function useVoiceSearch(onResult: (text: string) => void, locale: 'it' | 'en' = 'it') {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const recRef = useRef<any>(null)

  useEffect(() => {
    setIsSupported(!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition)
  }, [])

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    haptic(40)
    const rec = new SR()
    recRef.current = rec
    rec.lang = locale === 'en' ? 'en-US' : 'it-IT'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.continuous = false
    rec.onstart = () => setIsListening(true)
    rec.onresult = (e: any) => {
      const t = e.results[0]?.[0]?.transcript?.trim()
      if (t) {
        haptic([30, 20, 30])
        onResult(t)
      }
    }
    rec.onerror = () => setIsListening(false)
    rec.onend = () => setIsListening(false)
    rec.start()
  }, [onResult])

  const stopListening = useCallback(() => {
    recRef.current?.stop()
    setIsListening(false)
  }, [])

  const toggle = useCallback(() => {
    if (isListening) stopListening()
    else startListening()
  }, [isListening, startListening, stopListening])

  return { isListening, isSupported, toggle }
}

export default function DiscoverPage() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const authUser = useUser()
  const { locale } = useLocale()
  const ui = appCopy[locale]
  const d = ui.discover

  const [searchTerm, setSearchTerm] = useState('')
  const [activeType, setActiveType] = useState<string>('all')
  const [results, setResults] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [alreadyAdded, setAlreadyAdded] = useState<string[]>([])
  const [wishlistIds, setWishlistIds] = useState<string[]>([])
  const [drawerMedia, setDrawerMedia] = useState<MediaDetails | null>(null)
  const [trendingAnime, setTrendingAnime] = useState<TrendingItem[]>([])
  const [trendingMovies, setTrendingMovies] = useState<TrendingItem[]>([])
  const [trendingTV, setTrendingTV] = useState<TrendingItem[]>([])
  const [trendingGames, setTrendingGames] = useState<TrendingItem[]>([])
  const [trendingBoardgames, setTrendingBoardgames] = useState<TrendingItem[]>([])
  const [trendingManga, setTrendingManga] = useState<TrendingItem[]>([])

  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const lastTrackedQueryRef = useRef<string>('')

  const { isListening, isSupported: voiceSupported, toggle: toggleVoice } = useVoiceSearch((transcript) => setSearchTerm(transcript), locale)

  const urlQuery = searchParams.get('q')?.trim() || ''
  const urlType = searchParams.get('type')?.trim() || ''

  useEffect(() => {
    if (window.innerWidth >= 768) searchInputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (urlType && VALID_DISCOVER_TYPES.has(urlType) && urlType !== activeType) {
      setActiveType(urlType)
    }
    if (urlQuery.length >= 2 && urlQuery !== searchTerm) {
      setSearchTerm(urlQuery)
      searchInputRef.current?.focus()
    }
  }, [urlQuery, urlType]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    fetch(`/api/trending?section=all&lang=${locale}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data) return
        setTrendingAnime(Array.isArray(data.anime) ? data.anime : [])
        setTrendingMovies(Array.isArray(data.movie) ? data.movie : [])
        setTrendingTV(Array.isArray(data.tv) ? data.tv : [])
        setTrendingGames(Array.isArray(data.game) ? data.game : [])
        setTrendingBoardgames(Array.isArray(data.boardgame) ? data.boardgame : [])
        setTrendingManga(Array.isArray(data.manga) ? data.manga : [])
      })
      .catch(() => {
        if (cancelled) return
        setTrendingAnime([])
        setTrendingMovies([])
        setTrendingTV([])
        setTrendingGames([])
        setTrendingBoardgames([])
        setTrendingManga([])
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [locale])

  useEffect(() => {
    if (!authUser) return
    supabase.from('wishlist').select('external_id').eq('user_id', authUser.id)
      .then(({ data }) => { if (data) setWishlistIds(data.map((w: any) => w.external_id)) })
    supabase.from('user_media_entries').select('external_id').eq('user_id', authUser.id)
      .then(({ data }) => { if (data) setAlreadyAdded(data.map((e: any) => e.external_id)) })
  }, [authUser]) // eslint-disable-line react-hooks/exhaustive-deps


  const search = useCallback(async (term: string, type: string, lang: string) => {
    const trimmed = term.trim()
    if (!trimmed || trimmed.length < 2) {
      setResults([])
      setSearchError(null)
      setIsPending(false)
      return
    }

    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setIsPending(false)
    setSearchError(null)

    try {
      const reqs: Promise<Response>[] = []

      if (type === 'all' || type === 'anime' || type === 'manga') {
        reqs.push(fetch(`/api/anilist?q=${encodeURIComponent(trimmed)}${type !== 'all' ? `&type=${type}` : ''}&lang=${lang}`, { signal: controller.signal }))
      }
      if (type === 'all' || type === 'movie' || type === 'tv') {
        reqs.push(fetch(`/api/tmdb?q=${encodeURIComponent(trimmed)}${type !== 'all' ? `&type=${type}` : ''}&lang=${lang}`, { signal: controller.signal }))
      }
      if (type === 'all' || type === 'game') {
        reqs.push(fetch(`/api/igdb?q=${encodeURIComponent(trimmed)}&lang=${lang}`, { signal: controller.signal }))
      }
      if (type === 'all' || type === 'boardgame') {
        reqs.push(fetch(`/api/bgg?q=${encodeURIComponent(trimmed)}&lang=${lang}&lang=${lang}`, { signal: controller.signal }))
      }

      const responses = await Promise.allSettled(reqs)
      if (controller.signal.aborted) return

      const all: MediaItem[] = []
      for (const r of responses) {
        if (r.status === 'fulfilled' && r.value.ok) {
          try {
            const data = await r.value.json()
            if (Array.isArray(data)) all.push(...data)
          } catch { }
        }
      }
      if (controller.signal.aborted) return

      const seen = new Set<string>()
      const deduped = all.filter(i => {
        if (seen.has(i.id)) return false
        seen.add(i.id)
        return true
      })
      const withCover = deduped.filter(hasValidCover)
      const filtered = type !== 'all' ? withCover.filter(i => i.type === type) : withCover
      setResults(rankByQuery(filtered, trimmed))

      if (trimmed !== lastTrackedQueryRef.current && trimmed.length >= 2) {
        lastTrackedQueryRef.current = trimmed
        trackSearchQuery(trimmed, type !== 'all' ? type : undefined)
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setSearchError(d.searchError || 'Errore durante la ricerca')
      setResults([])
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [d.searchError])

  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.trim().length < 2) {
      setResults([])
      setIsPending(false)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      return
    }
    setIsPending(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(searchTerm, activeType, locale), DEBOUNCE_MS)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchTerm, activeType, search, locale])

  const toggleWishlist = async (media: MediaItem) => {
    haptic(30)
    if (!authUser) return

    if (wishlistIds.includes(media.id)) {
      const res = await fetch('/api/wishlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ external_id: media.id }),
      }).catch(() => null)
      if (res?.ok) setWishlistIds(prev => prev.filter(id => id !== media.id))
      return
    }

    const res = await fetch('/api/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ external_id: media.id, title: media.title, type: media.type, cover_image: media.coverImage }),
    }).catch(() => null)
    if (!res?.ok) return
    setWishlistIds(prev => [...prev, media.id])
    if ((media.genres || []).length > 0) {
      triggerTasteDelta({ action: 'wishlist_add', mediaId: media.id, mediaType: media.type, genres: media.genres || [] })
    }
  }

  const handleResultClick = useCallback((item: MediaItem) => {
    haptic(30)
    if (searchTerm.trim().length >= 2) trackSearchClick(searchTerm, item)
    setDrawerMedia(toMediaDetails(item))
  }, [searchTerm])

  const handlePullRefresh = async () => {
    if (searchTerm.trim().length >= 2) {
      setResults([])
      const term = searchTerm
      setSearchTerm('')
      setTimeout(() => setSearchTerm(term), 50)
    }
  }

  const { distance: pullDistance, refreshing: isPullRefreshing } = usePullToRefresh({
    onRefresh: handlePullRefresh,
    enabled: pathname === '/discover',
  })

  const grouped = Object.entries(
    results.reduce((acc, item) => {
      if (!acc[item.type]) acc[item.type] = []
      acc[item.type].push(item)
      return acc
    }, {} as Record<string, MediaItem[]>),
  ).sort(([a], [b]) => (TYPE_ORDER[a] ?? 99) - (TYPE_ORDER[b] ?? 99))

  const browseSections = useMemo(() => [
    { label: typeLabel('anime', locale), subtitle: d.sectionSubtitles.anime, items: trendingAnime, typeKey: 'anime', icon: <Swords size={15} /> },
    { label: typeLabel('game', locale), subtitle: d.sectionSubtitles.game, items: trendingGames, typeKey: 'game', icon: <Gamepad2 size={15} /> },
    { label: typeLabel('tv', locale), subtitle: d.sectionSubtitles.tv, items: trendingTV, typeKey: 'tv', icon: <Tv size={15} /> },
    { label: typeLabel('manga', locale), subtitle: d.sectionSubtitles.manga, items: trendingManga, typeKey: 'manga', icon: <Layers size={15} /> },
    { label: typeLabel('movie', locale), subtitle: d.sectionSubtitles.movie, items: trendingMovies, typeKey: 'movie', icon: <Film size={15} /> },
    { label: typeLabel('boardgame', locale), subtitle: d.sectionSubtitles.boardgame, items: trendingBoardgames, typeKey: 'boardgame', icon: <Dices size={15} /> },
  ], [d.sectionSubtitles, locale, trendingAnime, trendingGames, trendingTV, trendingManga, trendingMovies, trendingBoardgames])

  const trendingToday = useMemo(() => {
    const mixed = [
      ...trendingAnime.slice(0, 3),
      ...trendingGames.slice(0, 3),
      ...trendingTV.slice(0, 3),
      ...trendingMovies.slice(0, 3),
      ...trendingBoardgames.slice(0, 3),
    ]
    const seen = new Set<string>()
    return mixed.filter(item => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    }).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10)
  }, [trendingAnime, trendingGames, trendingTV, trendingMovies, trendingBoardgames])

  const showingResults = !loading && !searchError && results.length > 0

  return (
    <div className="gk-discover-page min-h-screen bg-[var(--bg-primary)] pb-24 text-[var(--text-primary)]">
      <PullToRefreshIndicator distance={pullDistance} refreshing={isPullRefreshing} />

      <div className="mx-auto max-w-screen-xl px-4 pt-14 md:px-6 md:pt-8 xl:px-8">
        <section className="mb-4 rounded-[24px] border border-[var(--border-subtle)] bg-[rgba(13,13,19,0.82)] p-3 shadow-[0_12px_42px_rgba(0,0,0,0.20)] ring-1 ring-white/5 backdrop-blur-xl" data-no-swipe="true" aria-label={ui.discover.searchLabel}>
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              data-testid="search-input"
              data-no-swipe="true"
              type="text"
              value={searchTerm}
              ref={searchInputRef}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={isListening ? ui.discover.listeningPlaceholder : ui.discover.searchPlaceholder}
              className={`h-[54px] w-full rounded-[18px] border pl-12 pr-[96px] text-[17px] font-semibold outline-none transition-colors ${isListening
                ? 'border-red-500/40 bg-red-500/10 text-[var(--text-primary)] placeholder-red-400/60'
                : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[rgba(230,255,61,0.26)]'
                }`}
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {searchTerm && !isListening && (
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={() => { setSearchTerm(''); setResults([]); setIsPending(false); lastTrackedQueryRef.current = '' }}
                  className="grid h-9 w-9 place-items-center rounded-[14px] bg-[var(--bg-elevated)] text-[var(--text-muted)] transition-colors hover:text-white"
                  aria-label={ui.discover.clearSearch}
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              )}
              {voiceSupported && (
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={toggleVoice}
                  className={`grid h-10 w-10 place-items-center rounded-[15px] transition-all ${isListening ? 'bg-red-500 text-white' : 'bg-[var(--accent)] text-[#0B0B0F] hover:opacity-90'}`}
                  aria-label={isListening ? d.voiceStopAria : d.voiceStartAria}
                >
                  {isListening ? <MicOff size={17} /> : <Mic size={17} />}
                </button>
              )}
            </div>
          </div>

          {isListening && (
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/8 px-3 py-2">
              <div className="flex items-end gap-0.5">
                {[10, 16, 12].map((h, i) => (
                  <div key={i} className="w-0.5 animate-bounce rounded-full bg-red-400" style={{ height: h, animationDelay: `${i * 0.12}s` }} />
                ))}
              </div>
              <span className="flex-1 text-[13px] font-medium text-red-400">{ui.discover.listening}</span>
              <button type="button" data-no-swipe="true" onClick={toggleVoice} className="text-[12px] text-red-400 hover:text-red-300">{ui.common.cancel}</button>
            </div>
          )}

          <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-0.5 pr-1 scrollbar-hide" data-horizontal-scroll="true" aria-label={ui.discover.filtersLabel}>
            {FILTERS.map(tf => (
              <button
                key={tf.id}
                data-testid={`filter-${tf.id}`}
                data-no-swipe="true"
                type="button"
                onClick={() => setActiveType(tf.id)}
                className={`flex h-9 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[12px] font-black transition-all ${activeType === tf.id
                  ? 'border-transparent'
                  : 'border-[var(--border)] bg-[rgba(255,255,255,0.035)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                style={activeType === tf.id ? { background: 'var(--accent)', color: '#0B0B0F', border: '1px solid var(--accent)' } : {}}
              >
                {tf.icon}{discoverFilterLabel(tf.id, locale)}
              </button>
            ))}
          </div>
        </section>

        {loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 16 }).map((_, i) => <SkeletonDiscoverCard key={i} />)}
          </div>
        )}

        {isPending && !loading && searchTerm.trim().length >= 2 && (
          <div className="mb-5 flex items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] py-4">
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span className="text-[13px] text-[var(--text-secondary)]">{ui.common.searching}</span>
          </div>
        )}

        {searchError && !loading && (
          <div className="rounded-[28px] border border-red-500/20 bg-red-500/8 px-6 py-10 text-center text-[14px] text-red-300">{searchError}</div>
        )}

        {!loading && !searchTerm.trim() && (
          <div className="space-y-5">
            <DiscoverSection title={ui.discover.trendingTitle} subtitle={ui.discover.trendingSubtitle} icon={<Flame size={15} />} variant="panel">
              {trendingToday.length === 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                  {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-[var(--bg-card)]" />)}
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.95fr)_minmax(0,1.6fr)]">
                  <button
                    type="button"
                    data-no-swipe="true"
                    onClick={() => {
                      const item = trendingToday[0]
                      if (!item) return
                      setDrawerMedia(toDrawerMediaFromTrending(item))
                    }}
                    className="group relative min-h-[310px] overflow-hidden rounded-[28px] border border-[rgba(230,255,61,0.22)] bg-[var(--bg-card)] text-left shadow-[0_20px_70px_rgba(0,0,0,0.26)] ring-1 ring-white/5"
                  >
                    {trendingToday[0]?.coverImage ? <img src={trendingToday[0].coverImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 transition-transform duration-500 group-hover:scale-105" /> : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/62 to-black/5" />
                    <div className="relative z-10 flex min-h-[310px] flex-col justify-end p-5">
                      <span className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-[rgba(230,255,61,0.24)] bg-[rgba(230,255,61,0.12)] px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-[var(--accent)]"><Flame size={12} /> {d.trendLeader}</span>
                      <h3 className="line-clamp-2 font-display text-[34px] font-black leading-[0.95] tracking-[-0.05em] text-white">{trendingToday[0]?.title}</h3>
                      <p className="mt-2 gk-mono text-white/70">{typeLabel(trendingToday[0]?.type || '', locale)}</p>
                    </div>
                  </button>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {trendingToday.slice(1, 11).map((item) => (
                      <DiscoverMediaCard
                        key={item.id}
                        title={item.title}
                        type={item.type}
                        coverImage={item.coverImage}
                        year={item.year}
                        score={item.score}
                        placeholderIcon={TYPE_PLACEHOLDER_ICON[item.type]}
                        onClick={() => setDrawerMedia(toDrawerMediaFromTrending(item))}
                      />
                    ))}
                  </div>
                </div>
              )}
            </DiscoverSection>

            <div className="grid gap-5 lg:grid-cols-2">
              {browseSections.map(({ label, subtitle, items, typeKey, icon }) => (
                <DiscoverSection key={typeKey} title={label} subtitle={subtitle} icon={icon} variant="panel" action={(
                  <button type="button" data-no-swipe="true" onClick={() => { setActiveType(typeKey); searchInputRef.current?.focus() }} className="rounded-full border border-[rgba(230,255,61,0.22)] bg-[rgba(230,255,61,0.08)] px-3 py-1.5 text-[12px] font-black text-[var(--accent)] transition-opacity hover:opacity-80">
                    {d.searchButton}
                  </button>
                )}>
                  {items.length === 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-[var(--bg-card)]" />)}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {items.slice(0, 6).map((item) => (
                        <DiscoverMediaCard
                          key={item.id}
                          title={item.title}
                          type={item.type}
                          coverImage={item.coverImage}
                          year={item.year}
                          score={item.score}
                          placeholderIcon={TYPE_PLACEHOLDER_ICON[item.type]}
                          onClick={() => setDrawerMedia(toDrawerMediaFromTrending(item))}
                        />
                      ))}
                    </div>
                  )}
                </DiscoverSection>
              ))}
            </div>
          </div>
        )}

        {!loading && searchTerm.trim().length === 1 && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] py-6 text-[var(--text-muted)]">
            <span className="text-[13px]">{d.typeMoreToSearch}</span>
          </div>
        )}

        {!loading && !searchError && results.length === 0 && searchTerm.trim().length >= 2 && !isPending && (
          <EmptyState icon={Search} title={d.emptyTitle} description={d.noResults} accent="zinc" />
        )}

        {showingResults && (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/40 px-3 py-2.5 ring-1 ring-white/5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="gk-label text-[var(--accent)]">{d.resultsTitle}</p>
                <h2 className="mt-1 font-display text-[22px] font-black leading-none tracking-[-0.04em] text-[var(--text-primary)]">“{searchTerm.trim()}”</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[var(--border)] bg-black/18 px-3 py-1.5 font-mono-data text-[11px] font-black text-[var(--text-muted)]">{d.resultsCount(results.length)}</span>
                <span className="rounded-full border border-[var(--border)] bg-black/18 px-3 py-1.5 font-mono-data text-[11px] font-black text-[var(--text-muted)]">{d.categoriesCount(grouped.length)}</span>
              </div>
            </div>

            {grouped.map(([type, items]) => items.length === 0 ? null : (
              <DiscoverSection key={type} title={typeLabel(type, locale)} count={items.length} icon={TYPE_SECTION_ICON[type]} variant="panel">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
                  {items.map((item) => (
                    <DiscoverMediaCard
                      key={item.id}
                      title={locale === 'en' && item.title_en ? item.title_en : item.title}
                      type={item.type}
                      coverImage={hasValidCover(item) ? optimizeCover(item.coverImage, 'discover-card') : undefined}
                      year={item.year}
                      score={item.score}
                      added={alreadyAdded.includes(item.id)}
                      wishlisted={wishlistIds.includes(item.id)}
                      placeholderIcon={TYPE_PLACEHOLDER_ICON[type] ?? <Film size={28} />}
                      onClick={() => handleResultClick(item)}
                      onWishlist={!alreadyAdded.includes(item.id) ? () => toggleWishlist(item) : undefined}
                      className="animate-fade-in"
                    />
                  ))}
                </div>
              </DiscoverSection>
            ))}
          </div>
        )}
      </div>

      {drawerMedia && (
        <MediaDetailsDrawer
          media={drawerMedia}
          onClose={() => setDrawerMedia(null)}
          onAdd={(media) => {
            setAlreadyAdded(prev => [...prev, media.id])
            setDrawerMedia(null)
            profileInvalidateBridge.invalidate()
          }}
        />
      )}
    </div>
  )
}
