'use client'
// src/app/discover/page.tsx
// Discover: search multi-source + browse sections + native URL query params.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Search, X, Film, Tv, Gamepad2, Mic, MicOff, Loader2, Swords, Layers, Dices, Sparkles,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/context/AuthContext'
import { useLocale } from '@/lib/locale'
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
  year?: number
  episodes?: number
  totalSeasons?: number
  seasons?: Record<number, { episode_count: number }>
  description?: string
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

const TYPE_LABELS: Record<string, string> = {
  anime: 'Anime',
  game: 'Videogiochi',
  tv: 'Serie TV',
  manga: 'Manga',
  movie: 'Film',
  boardgame: 'Giochi da tavolo',
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

const TYPE_COLORS: Record<string, string> = {
  anime: 'var(--type-anime)',
  manga: 'var(--type-manga)',
  game: 'var(--type-game)',
  tv: 'var(--type-tv)',
  movie: 'var(--type-movie)',
  boardgame: 'var(--type-board)',
}

const BROWSE_PROMPTS = [
  { label: 'Anime & Manga', subtitle: 'stagionali, cult, shonen', q: 'frieren', type: 'anime', icon: Swords, color: 'var(--type-anime)' },
  { label: 'Videogiochi', subtitle: 'must-play e indie', q: 'zelda', type: 'game', icon: Gamepad2, color: 'var(--type-game)' },
  { label: 'Serie TV', subtitle: 'prestige e binge', q: 'severance', type: 'tv', icon: Tv, color: 'var(--type-tv)' },
  { label: 'Manga', subtitle: 'seinen, shonen, cult', q: 'berserk', type: 'manga', icon: Layers, color: 'var(--type-manga)' },
  { label: 'Film', subtitle: 'sci-fi, horror, classici', q: 'dune', type: 'movie', icon: Film, color: 'var(--type-movie)' },
  { label: 'Board Game', subtitle: 'serate e collezioni', q: 'catan', type: 'boardgame', icon: Dices, color: 'var(--type-board)' },
]

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
  }).catch(() => {})
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
  }).catch(() => {})
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
  }).catch(() => {})
}

function useVoiceSearch(onResult: (text: string) => void) {
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
    rec.lang = 'it-IT'
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

function BrowseTile({ prompt, onClick }: { prompt: typeof BROWSE_PROMPTS[number]; onClick: () => void }) {
  const Icon = prompt.icon
  return (
    <button
      type="button"
      data-no-swipe="true"
      onClick={onClick}
      className="group flex min-h-[104px] flex-col justify-between rounded-[18px] border p-4 text-left transition-transform hover:scale-[1.015] active:scale-[0.97]"
      style={{ borderColor: `color-mix(in srgb, ${prompt.color} 18%, transparent)`, background: `color-mix(in srgb, ${prompt.color} 4%, transparent)` }}
    >
      <span className="grid h-10 w-10 place-items-center rounded-[14px]" style={{ background: `color-mix(in srgb, ${prompt.color} 12%, transparent)`, color: prompt.color }}>
        <Icon size={19} />
      </span>
      <span>
        <span className="block text-[14px] font-black text-[var(--text-primary)]">{prompt.label}</span>
        <span className="mt-1 block gk-mono text-[var(--text-muted)]">{prompt.subtitle}</span>
      </span>
    </button>
  )
}

export default function DiscoverPage() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const authUser = useUser()
  const { t, locale } = useLocale()
  const d = t.discover

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

  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const lastTrackedQueryRef = useRef<string>('')

  const { isListening, isSupported: voiceSupported, toggle: toggleVoice } = useVoiceSearch((transcript) => setSearchTerm(transcript))

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
    Promise.all([
      fetch('/api/trending?section=anime').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/trending?section=movie').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/trending?section=tv').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/trending?section=game').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/trending?section=boardgame').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([anime, movies, tv, games, boardgames]) => {
      setTrendingAnime(anime)
      setTrendingMovies(movies)
      setTrendingTV(tv)
      setTrendingGames(games)
      setTrendingBoardgames(boardgames)
    })
  }, [])

  useEffect(() => {
    if (!authUser) return
    supabase.from('wishlist').select('external_id').eq('user_id', authUser.id)
      .then(({ data }) => { if (data) setWishlistIds(data.map((w: any) => w.external_id)) })
    supabase.from('user_media_entries').select('external_id').eq('user_id', authUser.id)
      .then(({ data }) => { if (data) setAlreadyAdded(data.map((e: any) => e.external_id)) })
  }, [authUser]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyPrompt = useCallback((query: string, type: string) => {
    setActiveType(type)
    setSearchTerm(query)
    searchInputRef.current?.focus()
  }, [])

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
        reqs.push(fetch(`/api/bgg?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal }))
      }

      const responses = await Promise.allSettled(reqs)
      if (controller.signal.aborted) return

      const all: MediaItem[] = []
      for (const r of responses) {
        if (r.status === 'fulfilled' && r.value.ok) {
          try {
            const data = await r.value.json()
            if (Array.isArray(data)) all.push(...data)
          } catch {}
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
    { label: 'Anime', subtitle: 'Stagionali e cult', items: trendingAnime, typeKey: 'anime', icon: <Swords size={15} /> },
    { label: 'Videogiochi', subtitle: 'Must-play e scoperte', items: trendingGames, typeKey: 'game', icon: <Gamepad2 size={15} /> },
    { label: 'Serie TV', subtitle: 'Popolari ora', items: trendingTV, typeKey: 'tv', icon: <Tv size={15} /> },
    { label: 'Manga', subtitle: 'Dalle ricerche rapide', items: trendingAnime.filter(item => item.type === 'manga'), typeKey: 'manga', icon: <Layers size={15} /> },
    { label: 'Film', subtitle: 'Trending settimana', items: trendingMovies, typeKey: 'movie', icon: <Film size={15} /> },
    { label: 'Board Game', subtitle: 'Per la prossima serata', items: trendingBoardgames, typeKey: 'boardgame', icon: <Dices size={15} /> },
  ], [trendingAnime, trendingGames, trendingTV, trendingMovies, trendingBoardgames])

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
      <div className="mx-auto max-w-screen-2xl px-4 pt-14 md:px-6 md:pt-8 xl:px-8">
        <div className="mb-5 flex items-center gap-3 md:hidden">
          <div className="grid h-9 w-9 place-items-center rounded-[14px] border border-[rgba(230,255,61,0.2)] bg-[rgba(230,255,61,0.08)] text-[var(--accent)]">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="gk-label text-[var(--accent)]">Discover</p>
            <h1 className="text-[22px] font-black tracking-[-0.03em]">Esplora</h1>
          </div>
        </div>

        <div className="mb-4 md:mx-auto md:max-w-4xl" data-no-swipe="true">
          <div className="relative">
            <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              data-testid="search-input"
              data-no-swipe="true"
              type="text"
              value={searchTerm}
              ref={searchInputRef}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={isListening ? 'In ascolto...' : 'Cerca anime, film, giochi, boardgame...'}
              className={`h-12 w-full rounded-2xl border pl-11 pr-24 text-[16px] outline-none transition-colors md:h-[54px] ${isListening
                ? 'border-red-500/40 bg-red-500/10 text-[var(--text-primary)] placeholder-red-400/60'
                : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[rgba(230,255,61,0.45)] focus:ring-2 focus:ring-[rgba(230,255,61,0.16)]'
              }`}
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {searchTerm && !isListening && (
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={() => { setSearchTerm(''); setResults([]); setIsPending(false); lastTrackedQueryRef.current = '' }}
                  className="grid h-8 w-8 place-items-center rounded-[12px] bg-[var(--bg-elevated)] text-[var(--text-muted)] transition-colors hover:text-white"
                  aria-label="Cancella ricerca"
                >
                  <X size={13} strokeWidth={2.5} />
                </button>
              )}
              {voiceSupported && (
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={toggleVoice}
                  className={`grid h-9 w-9 place-items-center rounded-[14px] transition-all ${isListening ? 'bg-red-500 text-white' : 'bg-[var(--accent)] text-[#0B0B0F] hover:opacity-90'}`}
                  aria-label={isListening ? 'Ferma ricerca vocale' : 'Avvia ricerca vocale'}
                >
                  {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              )}
            </div>
          </div>
        </div>

        {isListening && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 md:mx-auto md:max-w-4xl" data-no-swipe="true">
            <div className="flex items-end gap-0.5">
              {[10, 16, 12].map((h, i) => (
                <div key={i} className="w-0.5 animate-bounce rounded-full bg-red-400" style={{ height: h, animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>
            <span className="flex-1 text-[13px] font-medium text-red-400">In ascolto...</span>
            <button type="button" data-no-swipe="true" onClick={toggleVoice} className="text-[12px] text-red-400 hover:text-red-300">Annulla</button>
          </div>
        )}

        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide md:mx-auto md:max-w-4xl" data-no-swipe="true">
          {FILTERS.map(tf => (
            <button
              key={tf.id}
              data-testid={`filter-${tf.id}`}
              data-no-swipe="true"
              type="button"
              onClick={() => setActiveType(tf.id)}
              className={`flex h-9 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px] font-bold transition-all ${activeType === tf.id
                ? 'border-transparent'
                : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              style={activeType === tf.id ? { background: 'var(--accent)', color: '#0B0B0F', border: '1px solid var(--accent)' } : {}}
            >
              {tf.icon}{tf.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
            {Array.from({ length: 14 }).map((_, i) => <SkeletonDiscoverCard key={i} />)}
          </div>
        )}

        {isPending && !loading && searchTerm.trim().length >= 2 && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span className="text-[13px] text-[var(--text-secondary)]">Ricerca in corso…</span>
          </div>
        )}

        {searchError && !loading && <p className="py-12 text-center text-[14px] text-[var(--text-muted)]">{searchError}</p>}

        {!loading && !searchTerm.trim() && (
          <div className="space-y-8">
            <DiscoverSection title="Sfoglia" subtitle="Scegli un universo e parti da una ricerca guidata" icon={<Sparkles size={15} />}>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {BROWSE_PROMPTS.map(prompt => (
                  <BrowseTile key={prompt.type} prompt={prompt} onClick={() => applyPrompt(prompt.q, prompt.type)} />
                ))}
              </div>
            </DiscoverSection>

            <DiscoverSection title="Trending oggi" subtitle="I media più caldi ora, mischiati per categoria" icon={<Sparkles size={15} />}>
              {trendingToday.length === 0 ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
                  {Array.from({ length: 7 }).map((_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-[var(--bg-card)]" />)}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
                  {trendingToday.map((item) => (
                    <DiscoverMediaCard
                      key={item.id}
                      title={item.title}
                      type={item.type}
                      coverImage={item.coverImage}
                      year={item.year}
                      score={item.score}
                      placeholderIcon={TYPE_PLACEHOLDER_ICON[item.type]}
                      onClick={() => setDrawerMedia({
                        id: item.id,
                        title: item.title,
                        type: item.type,
                        coverImage: item.coverImage,
                        year: item.year,
                        genres: item.genres,
                        source: item.source as any,
                      })}
                    />
                  ))}
                </div>
              )}
            </DiscoverSection>

            {browseSections.map(({ label, subtitle, items, typeKey, icon }) => (
              <DiscoverSection key={typeKey} title={label} subtitle={subtitle} icon={icon} action={(
                <button type="button" data-no-swipe="true" onClick={() => setActiveType(typeKey)} className="text-[12px] font-semibold text-[var(--accent)] transition-opacity hover:opacity-80">
                  Vedi tutti
                </button>
              )}>
                {items.length === 0 ? (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
                    {Array.from({ length: 7 }).map((_, i) => <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-[var(--bg-card)]" />)}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
                    {items.slice(0, 7).map((item) => (
                      <DiscoverMediaCard
                        key={item.id}
                        title={item.title}
                        type={item.type}
                        coverImage={item.coverImage}
                        year={item.year}
                        score={item.score}
                        placeholderIcon={TYPE_PLACEHOLDER_ICON[item.type]}
                        onClick={() => setDrawerMedia({
                          id: item.id,
                          title: item.title,
                          type: item.type,
                          coverImage: item.coverImage,
                          year: item.year,
                          genres: item.genres,
                          source: item.source as any,
                        })}
                      />
                    ))}
                  </div>
                )}
              </DiscoverSection>
            ))}
          </div>
        )}

        {!loading && searchTerm.trim().length === 1 && (
          <div className="flex items-center justify-center gap-2 py-6 text-[var(--text-muted)]">
            <span className="text-[13px]">Scrivi ancora qualcosa per avviare la ricerca…</span>
          </div>
        )}

        {!loading && !searchError && results.length === 0 && searchTerm.trim().length >= 2 && !isPending && (
          <EmptyState icon={Search} title="Nessun risultato" description={d.noResults} accent="zinc" />
        )}

        {showingResults && grouped.map(([type, items]) => items.length === 0 ? null : (
          <DiscoverSection key={type} title={TYPE_LABELS[type] || type} count={items.length} icon={TYPE_PLACEHOLDER_ICON[type]}>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
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
