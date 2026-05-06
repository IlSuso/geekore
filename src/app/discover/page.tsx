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
import { useTabActive } from '@/context/TabActiveContext'
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
import { localizeMediaRows } from '@/lib/i18n/clientMediaLocalization'

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



type DiscoverTrendingSection = 'anime' | 'game' | 'tv' | 'manga' | 'movie' | 'boardgame'

type DiscoverTrendingCacheEntry = {
  items: TrendingItem[]
  ts: number
}

const DISCOVER_TRENDING_SECTIONS: DiscoverTrendingSection[] = ['anime', 'game', 'tv', 'manga', 'movie', 'boardgame']
const discoverTrendingCache = new Map<string, DiscoverTrendingCacheEntry>()
const discoverTrendingPromises = new Map<string, Promise<TrendingItem[]>>()
const DISCOVER_TRENDING_TTL = 10 * 60 * 1000

function normalizeImageValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const url = value.trim()
  if (!url || url.length < 10) return undefined
  if (url.includes('N/A') || url.includes('placeholder') || url.includes('no-image')) return undefined
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`
  return url
}

function normalizeTrendingItem(item: any): TrendingItem | null {
  if (!item || typeof item !== 'object') return null

  const id = typeof item.id === 'string' && item.id.trim()
    ? item.id.trim()
    : typeof item.external_id === 'string' && item.external_id.trim()
      ? item.external_id.trim()
      : ''

  const type = typeof item.type === 'string' && item.type.trim() ? item.type.trim() : ''
  const title =
    typeof item.title === 'string' && item.title.trim()
      ? item.title.trim()
      : typeof item.title_en === 'string' && item.title_en.trim()
        ? item.title_en.trim()
        : typeof item.title_it === 'string' && item.title_it.trim()
          ? item.title_it.trim()
          : ''

  const cover = bestCover(item)
    || normalizeImageValue(item.coverImage)
    || normalizeImageValue(item.cover_image)
    || normalizeImageValue(item.poster_path)
    || normalizeImageValue(item.image)
    || normalizeImageValue(item.thumbnail)

  if (!id || !type || !title) return null

  return {
    ...item,
    id,
    external_id: item.external_id || id,
    title,
    type,
    coverImage: cover,
    cover_image: cover || item.cover_image,
  } as TrendingItem
}

function normalizeTrendingList(value: any): TrendingItem[] {
  const raw = Array.isArray(value)
    ? value
    : Array.isArray(value?.items)
      ? value.items
      : Array.isArray(value?.results)
        ? value.results
        : []

  const seen = new Set<string>()
  const out: TrendingItem[] = []
  for (const entry of raw) {
    const item = normalizeTrendingItem(entry)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

function applyTrendingSection(section: DiscoverTrendingSection, items: TrendingItem[], setters: {
  setTrendingAnime: (items: TrendingItem[]) => void
  setTrendingMovies: (items: TrendingItem[]) => void
  setTrendingTV: (items: TrendingItem[]) => void
  setTrendingGames: (items: TrendingItem[]) => void
  setTrendingBoardgames: (items: TrendingItem[]) => void
  setTrendingManga: (items: TrendingItem[]) => void
}) {
  if (section === 'anime') setters.setTrendingAnime(items)
  else if (section === 'movie') setters.setTrendingMovies(items)
  else if (section === 'tv') setters.setTrendingTV(items)
  else if (section === 'game') setters.setTrendingGames(items)
  else if (section === 'boardgame') setters.setTrendingBoardgames(items)
  else if (section === 'manga') setters.setTrendingManga(items)
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

function bestCover(item: any): string | undefined {
  const candidates = [
    item?.localized?.en?.coverImage,
    item?.localized?.en?.cover_image,
    item?.localized?.it?.coverImage,
    item?.localized?.it?.cover_image,
    item?.coverImage,
    item?.cover_image,
    item?.media_cover,
  ]
  for (const value of candidates) {
    if (typeof value !== 'string') continue
    const url = value.trim()
    if (url.length >= 10 && !url.includes('N/A') && !url.includes('placeholder') && !url.includes('no-image')) return url
  }
  return undefined
}

function hasValidCover(item: any): item is MediaItem & { coverImage: string } {
  return Boolean(bestCover(item))
}

function normalizeMediaItem(item: MediaItem): MediaItem {
  const cover = bestCover(item)
  return {
    ...item,
    coverImage: cover || item.coverImage,
    cover_image: cover || item.cover_image,
  }
}

const DISCOVER_LOCALIZE_OPTIONS = {
  titleKeys: ['title'],
  coverKeys: ['coverImage', 'cover_image', 'media_cover'],
  idKeys: ['external_id', 'id'],
  typeKeys: ['type'],
  descriptionKeys: ['description'],
  mode: 'full' as const,
  requireDescription: true,
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
    ...(item.type === 'manga' ? { episodes: item.episodes } : {}),
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
    coverImage: bestCover(item) || item.coverImage || item.cover_image,
    cover_image: bestCover(item) || item.cover_image || item.coverImage,
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
  const isActive = useTabActive()
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
    // Non usare /api/trending?section=all nel primo render: se una sorgente lenta
    // resta appesa, blocca anche sezioni già pronte. Ogni sezione viene caricata e
    // renderizzata appena risponde, con cache per lingua+sezione.
    const shouldLoadTrending = isActive || pathname === '/discover'
    if (!shouldLoadTrending) return

    let cancelled = false
    const setters = { setTrendingAnime, setTrendingMovies, setTrendingTV, setTrendingGames, setTrendingBoardgames, setTrendingManga }

    for (const section of DISCOVER_TRENDING_SECTIONS) {
      const cacheKey = `${locale}:${section}`
      const cached = discoverTrendingCache.get(cacheKey)
      if (cached && Date.now() - cached.ts < DISCOVER_TRENDING_TTL) {
        applyTrendingSection(section, cached.items, setters)
        continue
      }

      const existing = discoverTrendingPromises.get(cacheKey)
      const promise = existing || fetch(`/api/trending?section=${section}&lang=${locale}`)
        .then(r => r.ok ? r.json() : [])
        .then(data => normalizeTrendingList(data))
        .finally(() => { discoverTrendingPromises.delete(cacheKey) })

      if (!existing) discoverTrendingPromises.set(cacheKey, promise)

      promise
        .then((items) => {
          if (cancelled) return
          discoverTrendingCache.set(cacheKey, { items, ts: Date.now() })
          applyTrendingSection(section, items, setters)
        })
        .catch(() => {
          if (cancelled) return
          applyTrendingSection(section, [], setters)
        })
    }

    return () => {
      cancelled = true
    }
  }, [locale, isActive, pathname])

  useEffect(() => {
    if (!isActive || !authUser) return
    supabase.from('wishlist').select('external_id').eq('user_id', authUser.id)
      .then(({ data }) => { if (data) setWishlistIds(data.map((w: any) => w.external_id)) })
    supabase.from('user_media_entries').select('external_id').eq('user_id', authUser.id)
      .then(({ data }) => { if (data) setAlreadyAdded(data.map((e: any) => e.external_id)) })
  }, [authUser, isActive]) // eslint-disable-line react-hooks/exhaustive-deps


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
        reqs.push(fetch(`/api/bgg?q=${encodeURIComponent(trimmed)}&lang=${lang}`, { signal: controller.signal }))
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
      }).map(normalizeMediaItem)

      // Localizziamo subito anche la descrizione: il drawer deve aprirsi già con
      // descrizione/titolo/cover nella lingua corrente, senza skeleton o cambio tardivo.
      const localized = await localizeMediaRows(deduped, lang === 'en' ? 'en' : 'it', DISCOVER_LOCALIZE_OPTIONS, { mode: 'full' })
        .then(items => items.map(normalizeMediaItem))
        .catch(() => deduped)

      const withCover = localized.filter(hasValidCover)
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
    setDrawerMedia(toMediaDetails(normalizeMediaItem(item)))
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
                    {bestCover(trendingToday[0]) ? <img src={optimizeCover(bestCover(trendingToday[0]), 'discover-card')} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 transition-transform duration-500 group-hover:scale-105" /> : null}
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
                        coverImage={optimizeCover(bestCover(item), 'discover-card') || undefined}
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
                          coverImage={optimizeCover(bestCover(item), 'discover-card') || undefined}
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
                      title={item.title}
                      type={item.type}
                      coverImage={hasValidCover(item) ? optimizeCover(bestCover(item), 'discover-card') : undefined}
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
          initialInCollection={alreadyAdded.includes(drawerMedia.id)}
          initialInWishlist={wishlistIds.includes(drawerMedia.id)}
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
