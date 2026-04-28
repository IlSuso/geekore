'use client'
// src/app/home/page.tsx
// ── Implementazioni ──────────────────────────────────────────────────────────
//   #13  Cache client-side in-memory (2 min TTL)
//   #25  Post in evidenza: i 2 con più like negli ultimi 7 giorni
//   #7   Skeleton loaders
//   P2   React.memo su PostCard
//   #31  Haptic feedback su like e pubblicazione
//   P5   Import condizionale locale date-fns
//   #9   Contatore caratteri live sui commenti (>400 char)
//   CAT  Categoria post: macro fissa + titolo specifico libero (es: Film:Forrest Gump)
//   AFF  Tracking affinità utente per categoria su like/commento
//   IGF  Algoritmo feed Instagram-like: ogni 5 post dei seguiti → 1 post discovery
//   FLT  Filtro feed per macro-categoria + ricerca sottocategoria libera

import { useState, useEffect, useCallback, memo, useRef } from 'react'
import { useScrollPanel } from '@/context/ScrollPanelContext'
import { useTabActive } from '@/context/TabActiveContext'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import {
  Heart, MessageCircle, Send, Sparkles, Image as ImageIcon, X,
  Loader2, Pin, ArrowUp, Trash2, Tag, ChevronDown, Filter, Search, MoreHorizontal,
  Film, Tv, Gamepad2, Swords, Check, PartyPopper, Layers, Dices,
  Bell, ChevronRight, ArrowLeft, Flame, Plus
} from 'lucide-react'
import { SkeletonFeedPost } from '@/components/ui/SkeletonCard'
import { Avatar } from '@/components/ui/Avatar'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale/it'
import { enUS } from 'date-fns/locale/en-US'
import { useLocale } from '@/lib/locale'
import { FeedSidebar } from '@/components/feed/FeedSidebar'
import { FeedLeftSidebar } from '@/components/feed/FeedLeftSidebar'
import { StickyFromBottom } from '@/components/ui/StickyFromBottom'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '@/components/ui/ErrorState'
import { PullWrapper } from '@/components/ui/PullWrapper'
import { ReportButton } from '@/components/ui/ReportButton'
import { gestureState } from '@/hooks/gestureState'
import { androidBack } from '@/hooks/androidBack'
import { UserBadge } from '@/components/ui/UserBadge'

// ── Macro-categorie ───────────────────────────────────────────────────────────

const MACRO_CATEGORIES = [
  'Film', 'Serie TV', 'Videogiochi', 'Anime', 'Manga', 'Giochi da tavolo',
]

// ── Icone categoria (Lucide) ──────────────────────────────────────────────────
import type { LucideIcon } from 'lucide-react'

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  'Film': Film,
  'Serie TV': Tv,
  'Videogiochi': Gamepad2,
  'Anime': Swords,
  'Manga': Layers,
  'Giochi da tavolo': Dices,
}

function CategoryIcon({ category, size = 13, className = '' }: { category: string; size?: number; className?: string }) {
  const Icon = CATEGORY_ICON_MAP[category] || Tag
  return <Icon size={size} className={className} />
}

// Suggerimenti rapidi per sottocategoria — mostrati come chip nel composer
const QUICK_SUBS: Record<string, string[]> = {
  'Film': ['Azione', 'Commedia', 'Horror', 'Fantascienza', 'Animazione'],
  'Serie TV': ['Drama', 'Commedia', 'Thriller', 'Fantascienza', 'Reality'],
  'Videogiochi': ['RPG', 'FPS', 'Battle Royale', 'Strategia', 'Indie'],
  'Anime': ['Shonen', 'Shojo', 'Seinen', 'Isekai', 'Slice of Life'],
  'Manga': ['Shonen', 'Shojo', 'Seinen', 'Josei', 'Webtoon'],
  'Giochi da tavolo': ['Eurogame', 'Cooperativo', 'Astratto', 'Family', 'Deck Building'],
}

// ── Tipi ─────────────────────────────────────────────────────────────────────

type Comment = {
  id: string
  content: string
  created_at: string
  user_id: string
  username?: string
  display_name?: string
}

type Post = {
  id: string
  user_id: string
  content: string
  image_url?: string | null
  created_at: string
  is_edited?: boolean
  category?: string | null
  profiles: {
    username: string
    display_name?: string
    avatar_url?: string
    badge?: string | null
  }
  likes_count: number
  comments_count: number
  liked_by_user: boolean
  comments: Comment[]
  pinned?: boolean
  isDiscovery?: boolean
}

// ── Cache in-memory ──────────────────────────────────────────────────────────

const cache: {
  posts: Post[] | null
  page: number
  hasMore: boolean
  filter: 'all' | 'following'
  ts: number
} = { posts: null, page: 0, hasMore: true, filter: 'all', ts: 0 }

const CACHE_TTL = 2 * 60 * 1000

function invalidateCache(_filter: 'all' | 'following') {
  cache.ts = 0
}

function isCacheValid(filter: 'all' | 'following') {
  return (
    cache.posts !== null &&
    cache.filter === filter &&
    Date.now() - cache.ts < CACHE_TTL
  )
}

function haptic(pattern: number | number[] = 30) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern)
}

const PAGE_SIZE = 20
const PINNED_LIKE_THRESHOLD = 3
const DISCOVERY_INTERVAL = 5

// ── Helpers categoria ────────────────────────────────────────────────────────

function parseCategoryString(cat: string | null | undefined): { category: string; subcategory: string } | null {
  if (!cat) return null
  const idx = cat.indexOf(':')
  if (idx === -1) return { category: cat, subcategory: '' }
  return { category: cat.slice(0, idx), subcategory: cat.slice(idx + 1) }
}

const CATEGORY_COLOR: Record<string, string> = {
  'Film': 'bg-red-500',
  'Serie TV': 'bg-purple-500',
  'Videogiochi': 'bg-green-500',
  'Anime': 'bg-sky-500',
  'Manga': 'bg-orange-500',
  'Giochi da tavolo': 'bg-amber-500',
}

function CategoryBadge({ category, onClick }: { category: string | null | undefined; onClick?: () => void }) {
  if (!category) return null
  const parsed = parseCategoryString(category)
  if (!parsed) return null
  const label = parsed.subcategory ? parsed.subcategory.trim() : parsed.category
  const colorClass = CATEGORY_COLOR[parsed.category] || 'bg-zinc-600'
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white max-w-full overflow-hidden ${colorClass} ${onClick ? 'cursor-pointer opacity-90 hover:opacity-100 transition-opacity' : ''}`}
    >
      <CategoryIcon category={parsed.category} size={11} className="flex-shrink-0" />
      <span className="truncate sm:whitespace-normal sm:overflow-visible">{label}</span>
    </span>
  )
}

// ── API search per categoria ─────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function rankByQuery(items: SearchResult[], query: string): SearchResult[] {
  if (query.length < 2) return items
  const q = normalize(query)
  const starts: SearchResult[] = []
  const contains: SearchResult[] = []
  for (const item of items) {
    const t = normalize(item.title)
    if (t.startsWith(q)) starts.push(item)
    else if (t.includes(q)) contains.push(item)
  }
  return [...starts, ...contains]
}

type SearchResult = { id: string; title: string; subtitle?: string; image?: string }

async function searchByCategory(category: string, query: string): Promise<SearchResult[]> {
  if (!query || query.trim().length < 2) return []
  const q = encodeURIComponent(query.trim())

  try {
    if (category === 'Film') {
      const res = await fetch(`/api/tmdb?q=${q}&type=movie`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) { console.warn('[CategorySearch] TMDB film error:', res.status); return [] }
      const data = await res.json()
      const items = Array.isArray(data) ? data : []
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id || item.title),
        title: item.title || item.name || '',
        subtitle: item.year ? String(item.year) : item.releaseDate?.slice(0, 4),
        image: item.coverImage || item.poster || item.cover,
      })).filter((i: SearchResult) => i.title)
    }

    if (category === 'Serie TV') {
      const res = await fetch(`/api/tmdb?q=${q}&type=tv`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) { console.warn('[CategorySearch] TMDB tv error:', res.status); return [] }
      const data = await res.json()
      const items = Array.isArray(data) ? data : []
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id || item.title),
        title: item.title || item.name || '',
        subtitle: item.year ? String(item.year) : item.releaseDate?.slice(0, 4),
        image: item.coverImage || item.poster || item.cover,
      })).filter((i: SearchResult) => i.title)
    }

    if (category === 'Videogiochi') {
      const res = await fetch(`/api/igdb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: query.trim(), limit: 8 }),
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) { console.warn('[CategorySearch] IGDB error:', res.status); return [] }
      const data = await res.json()
      const items = Array.isArray(data) ? data : (data.results || data.games || [])
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id || item.name),
        title: item.name || item.title || '',
        subtitle: item.first_release_date ? new Date(item.first_release_date * 1000).getFullYear().toString()
          : item.year ? String(item.year) : undefined,
        image: item.cover?.url ? `https:${item.cover.url.replace('t_thumb', 't_cover_small')}` : item.cover,
      })).filter((i: SearchResult) => i.title)
    }

    if (category === 'Anime' || category === 'Manga') {
      const type = category === 'Anime' ? 'anime' : 'manga'
      const res = await fetch(`/api/anilist?search=${q}&type=${type}&lang=it`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) { console.warn('[CategorySearch] AniList error:', res.status); return [] }
      const data = await res.json()
      const items = Array.isArray(data) ? data : (data.results || data.media || [])
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id),
        title: item.title || item.title?.english || item.title?.romaji || '',
        subtitle: item.year ? String(item.year) : item.seasonYear ? String(item.seasonYear) : undefined,
        image: item.coverImage || item.coverImage?.large || item.cover,
      })).filter((i: SearchResult) => i.title)
    }

    if (category === 'Giochi da tavolo') {
      const res = await fetch(`/api/bgg?q=${q}`, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) { console.warn('[CategorySearch] BGG error:', res.status); return [] }
      const data = await res.json()
      const items = Array.isArray(data) ? data : []
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id),
        title: item.title || '',
        subtitle: item.year ? String(item.year) : undefined,
        image: item.coverImage,
      })).filter((i: SearchResult) => i.title)
    }

  } catch (err) {
    console.warn('[CategorySearch] fetch error:', err)
  }
  return []
}

// ── Selettore categoria — dropup nel footer del composer ────────────────────

function CategorySelector({ value, onChange, alwaysExpanded = false }: {
  value: string; onChange: (val: string) => void; alwaysExpanded?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'macro' | 'search'>('macro')
  const [selectedCat, setSelectedCat] = useState('')
  const [subInput, setSubInput] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openAboveRef = useRef(false)
  const [openAbove, setOpenAbove] = useState(false)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Lock body scroll and page-swipe when the panel is open on mobile
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth >= 768) return
    if (open) {
      document.body.style.overflow = 'hidden'
      gestureState.drawerActive = true
    } else {
      document.body.style.overflow = ''
      gestureState.drawerActive = false
    }
    return () => { document.body.style.overflow = ''; gestureState.drawerActive = false }
  }, [open])

  const API_CATEGORIES = new Set(['Film', 'Serie TV', 'Videogiochi', 'Anime', 'Manga', 'Giochi da tavolo'])

  // Chiudi cliccando fuori
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapRef.current && !wrapRef.current.contains(target)) {
        // Check if click is inside the portal panel
        const portalPanel = document.getElementById('category-portal-panel')
        if (!portalPanel || !portalPanel.contains(target)) {
          setOpen(false)
        }
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open && step === 'search') setTimeout(() => inputRef.current?.focus(), 60)
  }, [open, step])

  // Debounced search
  useEffect(() => {
    if (!selectedCat || !API_CATEGORIES.has(selectedCat) || step !== 'search') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!subInput.trim() || subInput.trim().length < 2) { setSuggestions([]); setIsSearching(false); return }
    setIsSearching(true)
    debounceRef.current = setTimeout(async () => {
      const results = await searchByCategory(selectedCat, subInput)
      setSuggestions(rankByQuery(results, subInput.trim())); setIsSearching(false); setActiveSuggestion(-1)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [subInput, selectedCat, step])

  const openDropup = (e: React.MouseEvent<HTMLButtonElement>) => {
    {
      const rect = e.currentTarget.getBoundingClientRect()
      const isMobile = window.innerWidth < 768

      if (isMobile) {
        // Mobile: position above or below depending on where the trigger sits
        const above = rect.top + rect.height / 2 > window.innerHeight / 2
        openAboveRef.current = above
        setOpenAbove(above)
        setPanelPos({ top: rect.bottom + (above ? 0 : 8), left: 12 })
      } else {
        // Desktop: a destra del tag
        const left = rect.right + 6
        const triggerMidY = rect.top + rect.height / 2
        const above = triggerMidY > window.innerHeight / 2
        const top = above ? rect.bottom : rect.top
        openAboveRef.current = above
        setOpenAbove(above)
        setPanelPos({ top, left })
      }
    }
    setOpen(true)
    setStep('macro')
  }
  const close = () => { setOpen(false); setSubInput(''); setSuggestions([]) }

  const selectMacro = (cat: string) => {
    setSelectedCat(cat); setSubInput(''); setSuggestions([]); setStep('search')
  }

  const selectSuggestion = (result: SearchResult) => {
    onChange(`${selectedCat}:${result.title}`); close()
  }

  const clearValue = () => { setSelectedCat(''); setSubInput(''); setSuggestions([]); onChange(''); close() }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (activeSuggestion >= 0) selectSuggestion(suggestions[activeSuggestion]) }
    else if (e.key === 'Escape') close()
  }

  const parsed = parseCategoryString(value)
  const hasApiSupport = API_CATEGORIES.has(selectedCat)

  const searchPlaceholder = selectedCat === 'Film' ? 'Cerca un film...'
    : selectedCat === 'Serie TV' ? 'Cerca una serie...'
    : selectedCat === 'Videogiochi' ? 'Cerca un videogioco...'
    : selectedCat === 'Anime' ? 'Cerca un anime...'
    : selectedCat === 'Manga' ? 'Cerca un manga...'
    : selectedCat === 'Giochi da tavolo' ? 'Cerca un gioco da tavolo...'
    : 'Cerca un titolo...'

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={value ? clearValue : openDropup}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium border transition-all ${
          value
            ? 'bg-violet-600/20 border-violet-500/40 text-violet-300 hover:border-red-500/40 hover:text-red-400'
            : 'bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600'
        }`}
      >
        <Tag size={14} strokeWidth={1.6} />
        {value ? (
          <span className="flex items-center gap-1 min-w-0 max-w-[130px]">
            <CategoryIcon category={parsed?.category || ''} size={12} className="flex-shrink-0" />
            <span className="truncate">{parsed?.subcategory ? parsed.subcategory.trim() : parsed?.category}</span>
            <X size={11} className="flex-shrink-0 ml-0.5" />
          </span>
        ) : (
          <span>Categoria</span>
        )}
      </button>

      {/* Category panel — portal per evitare clipping da overflow */}
      {open && mounted && typeof document !== 'undefined' && createPortal(
        <div
          id="category-portal-panel"
          data-no-swipe
          className="fixed z-[10000] bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl shadow-black/70 overflow-hidden"
          style={{ top: panelPos.top, left: panelPos.left, width: '300px', transform: openAboveRef.current ? 'translateY(-100%)' : 'none' }}
        >
          {/* Step 1: griglia macro-categorie — specchiata se dropup */}
          {step === 'macro' && (
            <div className={`p-3 flex flex-col ${openAboveRef.current ? 'flex-col-reverse' : ''}`}>
              <div className={`flex items-center justify-between ${openAboveRef.current ? 'mb-1' : 'mb-2.5'}`}>
                <span className={`text-[11px] font-semibold text-zinc-500 uppercase tracking-wider ${openAboveRef.current ? 'mt-3' : ''}`}>Seleziona categoria</span>
                <button type="button" onClick={close} className="text-zinc-600 hover:text-zinc-400 transition-colors p-0.5"><X size={13} /></button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                {MACRO_CATEGORIES.slice(0, 3).map(cat => (
                  <button key={cat} type="button" onClick={() => selectMacro(cat)}
                    className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl bg-zinc-800/60 border border-zinc-700/60 hover:bg-zinc-800 hover:border-violet-500/50 transition-all group">
                    <CategoryIcon category={cat} size={18} className="text-zinc-400 group-hover:text-violet-400 transition-colors" />
                    <span className="text-[11px] font-medium text-zinc-300 group-hover:text-white leading-tight text-center">{cat}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MACRO_CATEGORIES.slice(3).map(cat => (
                  <button key={cat} type="button" onClick={() => selectMacro(cat)}
                    className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl bg-zinc-800/60 border border-zinc-700/60 hover:bg-zinc-800 hover:border-violet-500/50 transition-all group">
                    <CategoryIcon category={cat} size={18} className="text-zinc-400 group-hover:text-violet-400 transition-colors" />
                    <span className="text-[11px] font-medium text-zinc-300 group-hover:text-white leading-tight text-center">{cat}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: cerca titolo */}
          {step === 'search' && (() => {
            const isAbove = openAboveRef.current
            const header = (
              <div className="flex items-center gap-2 mb-2">
                <button type="button" onClick={() => { setStep('macro'); setSuggestions([]) }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all flex-shrink-0">
                  <ArrowLeft size={13} />
                </button>
                <CategoryIcon category={selectedCat} size={14} className="text-violet-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-white flex-1 truncate">{selectedCat}</span>
                <button type="button" onClick={close} className="text-zinc-600 hover:text-zinc-400 p-0.5"><X size={13} /></button>
              </div>
            )
            const inputEl = (
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={subInput}
                  onChange={e => setSubInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={hasApiSupport ? searchPlaceholder : 'Titolo specifico...'}
                  className="no-nav-hide w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 focus:outline-none rounded-xl pl-8 pr-8 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none transition"
                />
                {isSearching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-400 animate-spin" />}
                {!isSearching && subInput && (
                  <button type="button" onClick={() => setSubInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                    <X size={13} />
                  </button>
                )}
              </div>
            )
            const results = suggestions.length > 0 ? (
              <div className="rounded-xl overflow-hidden border border-zinc-700/50 bg-zinc-950 max-h-[200px] overflow-y-auto overscroll-contain mb-2">
                {suggestions.map((result, idx) => (
                  <button key={result.id} type="button" onClick={() => selectSuggestion(result)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left border-b border-zinc-800/60 last:border-0 transition-colors ${
                      idx === activeSuggestion ? 'bg-violet-600/20' : 'hover:bg-zinc-800/80'
                    }`}>
                    {result.image ? (
                      <img src={result.image} alt="" className="w-7 h-10 object-cover rounded-lg flex-shrink-0 bg-zinc-800"
                        onError={e => { e.currentTarget.style.display = 'none' }} />
                    ) : (
                      <div className="w-7 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <CategoryIcon category={selectedCat} size={12} className="text-zinc-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white truncate">{result.title}</p>
                      {result.subtitle && <p className="text-[11px] text-zinc-500">{result.subtitle}</p>}
                    </div>
                  </button>
                ))}
              </div>
            ) : null
            const usaLibero = subInput.trim() && !isSearching ? (
              <button type="button" onClick={() => { onChange(`${selectedCat}:${subInput.trim()}`); close() }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600/15 border border-violet-500/30 text-violet-300 text-[13px] font-medium hover:bg-violet-600/25 transition mb-2">
                <Check size={13} />
                Usa <strong className="font-semibold">"{subInput.trim()}"</strong>
              </button>
            ) : null
            const nessunRis = hasApiSupport && subInput.length >= 2 && !isSearching && suggestions.length === 0 ? (
              <p className="text-[12px] text-zinc-600 text-center py-2">Nessun risultato</p>
            ) : null
            const chips = !hasApiSupport && !subInput ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(QUICK_SUBS[selectedCat] || []).map(sub => (
                  <button key={sub} type="button" onClick={() => { onChange(`${selectedCat}:${sub}`); close() }}
                    className="px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700/80 text-[11px] text-zinc-300 hover:border-violet-500/50 hover:text-violet-300 transition-all">
                    {sub}
                  </button>
                ))}
              </div>
            ) : null
            const usaSoloMacro = (
              <button type="button" onClick={() => { onChange(selectedCat); close() }}
                className="mt-1 w-full text-center text-[12px] text-zinc-600 hover:text-zinc-400 transition py-1">
                Usa solo "{selectedCat}" senza titolo
              </button>
            )
            return isAbove ? (
              <div className="p-3">
                {usaSoloMacro}{results}{usaLibero}{nessunRis}{chips}{inputEl}{header}
              </div>
            ) : (
              <div className="p-3">
                {header}{inputEl}{results}{usaLibero}{nessunRis}{chips}{usaSoloMacro}
              </div>
            )
          })()}
        </div>
        , document.body
      )}
    </div>
  )
}


// ── Filtro feed per categoria ─────────────────────────────────────────────────
// Permette di filtrare per macro + cercare sottocategoria specifica

function CategoryFilter({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: string
  onFilterChange: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [activeMacro, setActiveMacro] = useState('')
  const [subSearch, setSubSearch] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const API_CATEGORIES = new Set(['Film', 'Serie TV', 'Videogiochi', 'Anime', 'Manga', 'Giochi da tavolo'])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!activeMacro || !API_CATEGORIES.has(activeMacro)) { setSuggestions([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!subSearch.trim() || subSearch.trim().length < 2) { setSuggestions([]); setIsSearching(false); return }
    setIsSearching(true)
    debounceRef.current = setTimeout(async () => {
      const results = await searchByCategory(activeMacro, subSearch)
      setSuggestions(rankByQuery(results, subSearch.trim()))
      setIsSearching(false)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [subSearch, activeMacro])

  const handleMacro = (cat: string) => {
    if (activeMacro === cat) { setActiveMacro(''); setSubSearch(''); setSuggestions([]) }
    else { setActiveMacro(cat); setSubSearch(''); setSuggestions([]) }
  }

  const applyFilter = (val: string) => { onFilterChange(val); setOpen(false) }

  const parsed = parseCategoryString(activeFilter)
  const displayLabel = activeFilter
    ? (parsed?.subcategory ? parsed.subcategory.trim() : parsed?.category || 'Filtra categoria')
    : 'Filtra categoria'

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold border transition-all max-w-[160px] sm:max-w-none ${
          activeFilter ? 'bg-fuchsia-600/20 border-fuchsia-500/40 text-fuchsia-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
        }`}>
        <Filter size={14} className="flex-shrink-0" />
        {activeFilter && <CategoryIcon category={parsed?.category || ''} size={13} className="flex-shrink-0" />}
        <span className="truncate">{displayLabel}</span>
        {activeFilter && (
          <span onClick={e => { e.stopPropagation(); applyFilter(''); setActiveMacro(''); setSubSearch('') }} className="ml-1 hover:text-red-400 transition-colors">
            <X size={12} />
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute top-auto sm:top-full left-0 right-0 sm:left-auto sm:right-auto bottom-0 sm:bottom-auto mt-0 sm:mt-2 bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-2xl shadow-2xl shadow-black/60 w-full sm:w-[300px] p-3 pb-6 sm:pb-3" style={{ zIndex: 20000 }}>
          <p className="text-[10px] text-zinc-500 font-semibold px-1 pb-2 uppercase tracking-wider">Filtra per categoria</p>

          {/* Macro chips — 3+3 */}
          <div className="mb-3">
            <div className="grid grid-cols-3 gap-1.5 mb-1.5">
              {MACRO_CATEGORIES.slice(0, 3).map(cat => (
                <button key={cat} onClick={() => handleMacro(cat)}
                  className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    activeMacro === cat
                      ? 'bg-fuchsia-600/30 border-fuchsia-500/60 text-fuchsia-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                  }`}>
                  <CategoryIcon category={cat} size={11} />
                  {cat}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MACRO_CATEGORIES.slice(3).map(cat => (
                <button key={cat} onClick={() => handleMacro(cat)}
                  className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    activeMacro === cat
                      ? 'bg-fuchsia-600/30 border-fuchsia-500/60 text-fuchsia-300'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                  }`}>
                  <CategoryIcon category={cat} size={11} />
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {activeMacro && (
            <>
              <button onClick={() => applyFilter(activeMacro)}
                className="w-full text-left px-3 py-2 rounded-xl text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition mb-2">
                Tutti i post di <strong>{activeMacro}</strong>
              </button>

              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  autoFocus
                  type="text"
                  value={subSearch}
                  onChange={e => setSubSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && subSearch.trim()) applyFilter(`${activeMacro}:${subSearch.trim()}`) }}
                  placeholder={`Cerca titolo in ${activeMacro}...`}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-fuchsia-500 focus:outline-none rounded-xl pl-8 pr-8 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none transition"
                />
                {isSearching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-fuchsia-400 animate-spin" />}
              </div>

              {/* Risultati API */}
              {suggestions.length > 0 && (
                <div className="rounded-xl overflow-hidden border border-zinc-700/50 bg-zinc-950 max-h-[200px] overflow-y-auto overscroll-contain mb-2">
                  {suggestions.map(result => (
                    <button key={result.id} onClick={() => applyFilter(`${activeMacro}:${result.title}`)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/80 transition-colors">
                      {result.image ? (
                        <img src={result.image} alt="" className="w-7 h-10 object-cover rounded-lg flex-shrink-0 bg-zinc-800"
                          onError={e => { e.currentTarget.style.display = 'none' }} />
                      ) : (
                        <div className="w-7 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                          <CategoryIcon category={activeMacro} size={12} className="text-zinc-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">{result.title}</p>
                        {result.subtitle && <p className="text-[11px] text-zinc-500">{result.subtitle}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {subSearch.trim() && !isSearching && (
                <button onClick={() => applyFilter(`${activeMacro}:${subSearch.trim()}`)}
                  className="w-full px-3 py-2 rounded-xl bg-fuchsia-600/20 border border-fuchsia-500/40 text-fuchsia-300 text-sm font-semibold hover:bg-fuchsia-600/30 transition">
                  Cerca «{subSearch.trim()}» in {activeMacro}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Smart feed (algoritmo IG-like) ───────────────────────────────────────────

function buildSmartFeed(followingPosts: Post[], discoveryPosts: Post[]): Post[] {
  if (discoveryPosts.length === 0) return followingPosts
  const result: Post[] = []
  let discIdx = 0
  for (let i = 0; i < followingPosts.length; i++) {
    result.push(followingPosts[i])
    if ((i + 1) % DISCOVERY_INTERVAL === 0 && discIdx < discoveryPosts.length) {
      result.push({ ...discoveryPosts[discIdx], isDiscovery: true })
      discIdx++
    }
  }
  return result
}

// ── Tracking affinità ────────────────────────────────────────────────────────

async function trackAffinity(supabase: any, userId: string, category: string | null | undefined) {
  if (!category) return
  const parsed = parseCategoryString(category)
  if (!parsed) return
  const { category: cat, subcategory: sub } = parsed
  try {
    const { error } = await supabase.from('user_category_affinity')
      .upsert(
        { user_id: userId, category: cat, subcategory: sub || 'Generico', score: 1, last_interacted_at: new Date().toISOString() },
        { onConflict: 'user_id,category,subcategory' }
      )
    if (!error) {
      await supabase.rpc('increment_category_score', { p_user_id: userId, p_category: cat, p_subcategory: sub || 'Generico' })
        .catch(() => {})
    }
  } catch {}
}


// ── VirtualPostCard ────────────────────────────────────────────────────────────
// Wrapper leggero che smonta il contenuto della card quando è lontana dal viewport.
// Misura l'altezza reale prima di smontare → placeholder esatta stessa dimensione.
// Le prime ALWAYS_MOUNTED card non vengono mai smontate (above-the-fold).
const VIRTUAL_MARGIN = '600px'  // margine fuori viewport prima di smontare

const VirtualPostCard = memo(function VirtualPostCard({
  index, alwaysMounted, children,
}: { index: number; alwaysMounted: boolean; children: React.ReactNode }) {
  const wrapRef   = useRef<HTMLDivElement>(null)
  const heightRef = useRef<number>(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (alwaysMounted) return
    const el = wrapRef.current
    if (!el) return

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
        } else {
          // Misura altezza reale prima di smontare
          heightRef.current = el.getBoundingClientRect().height || heightRef.current
          setVisible(false)
        }
      },
      { rootMargin: VIRTUAL_MARGIN, threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [alwaysMounted])

  return (
    <div ref={wrapRef} style={!visible && heightRef.current ? { height: heightRef.current } : undefined}>
      {(visible || alwaysMounted) ? children : null}
    </div>
  )
})

// ── PostCard ──────────────────────────────────────────────────────────────────

// ── Popup conferma eliminazione ───────────────────────────────────────────────
// ── Bottom Sheet globale stile Instagram ─────────────────────────────────────
// Usato per opzioni post/commento — viene montato a livello di pagina (fuori dal PostCard)
// per evitare che transform/overflow dei parent rompano il fixed positioning.

type BottomSheetAction = {
  label: string
  onClick: () => void
  danger?: boolean
}

function BottomSheet({
  open, title, actions, onClose,
}: {
  open: boolean
  title?: string
  actions: BottomSheetAction[]
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    androidBack.push(onClose)
    return () => androidBack.pop(onClose)
  }, [open, onClose])

  if (!open || !mounted) return null

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  const content = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      {/* Desktop: modale centrato */}
      <div className="hidden md:flex items-center justify-center h-full">
        <div className="bg-[#262626] rounded-2xl overflow-hidden w-[400px] shadow-2xl" onClick={e => e.stopPropagation()}>
          {title && <div className="px-6 py-4 border-b border-zinc-700/50"><p className="text-zinc-400 text-xs text-center leading-relaxed">{title}</p></div>}
          {actions.map((action, i) => (
            <button key={i} onClick={() => { action.onClick() }}
              className={`w-full py-4 font-semibold text-[15px] transition-colors border-b border-zinc-700/40 last:border-0 hover:bg-zinc-700/30 ${action.danger ? 'text-red-400' : 'text-white'}`}>
              {action.label}
            </button>
          ))}
          <button onClick={onClose} className="w-full py-4 text-white text-[15px] font-normal hover:bg-zinc-700/30 transition-colors border-t border-zinc-700/40">Annulla</button>
        </div>
      </div>

      {/* Mobile: bottom sheet */}
      <div className="md:hidden flex items-end justify-center h-full">
        <div className="w-full max-w-sm mb-4 mx-4" onClick={e => e.stopPropagation()}>
          <div className="bg-zinc-800 rounded-2xl overflow-hidden mb-2">
            {title && <div className="px-4 py-3 border-b border-zinc-700/50"><p className="text-zinc-400 text-xs text-center leading-relaxed">{title}</p></div>}
            {actions.map((action, i) => (
              <button key={i} onClick={() => { action.onClick() }}
                className={`w-full py-4 font-semibold text-[15px] border-b border-zinc-700/30 last:border-0 active:bg-zinc-700/50 ${action.danger ? 'text-red-400' : 'text-white'}`}>
                {action.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="w-full bg-zinc-800 rounded-2xl py-4 text-white font-semibold text-[15px] active:bg-zinc-700">Annulla</button>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

const PostCard = memo(function PostCard({
  post, currentUser, isLiking, locale,
  onLike, onOpenModal, onPostOptions, onCategoryClick,
}: {
  post: Post
  currentUser: User | null
  isLiking: boolean
  locale: string
  onLike: (id: string) => void
  onOpenModal: (id: string) => void
  onPostOptions: (postId: string) => void
  onCategoryClick?: (category: string) => void
}) {
  return (
    <div className={`rounded-2xl transition-all duration-300 animate-fade-in ${
      post.pinned ? 'bg-zinc-900 border border-violet-500/30 ring-1 ring-violet-500/10'
      : post.isDiscovery ? 'bg-zinc-900 border border-fuchsia-500/25 ring-1 ring-fuchsia-500/10'
      : 'bg-zinc-900 border border-zinc-800/70'
    }`}>

      {post.pinned && (
        <div className="flex items-center gap-1.5 px-5 pt-4 pb-1 text-violet-400">
          <Pin size={11} className="rotate-45" />
          <span className="text-[10px] font-bold uppercase tracking-widest">In evidenza</span>
        </div>
      )}
      {post.isDiscovery && !post.pinned && (
        <div className="flex items-center gap-1.5 px-5 pt-4 pb-1 text-fuchsia-400">
          <Sparkles size={11} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Consigliato per te</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2.5">
        <Link href={`/profile/${post.profiles.username}`} className="group shrink-0" onClick={e => e.stopPropagation()}>
          <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-violet-500/20 group-hover:ring-violet-500/50 transition-all">
            <Avatar src={post.profiles.avatar_url} username={post.profiles.username} displayName={post.profiles.display_name} size={40} className="rounded-full" />
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/profile/${post.profiles.username}`} className="hover:text-violet-400 transition-colors" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-[var(--text-primary)] text-[15px] leading-tight">
              <UserBadge badge={post.profiles.badge} displayName={post.profiles.display_name || post.profiles.username} />
            </p>
          </Link>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: locale === 'en' ? enUS : it })}
          </p>
        </div>
        {currentUser?.id === post.user_id && (
          <button onClick={() => onPostOptions(post.id)} className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all" aria-label="Opzioni post">
            <MoreHorizontal size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Testo del post */}
      <div className="px-5 pb-3">
        <p className="text-[var(--text-primary)] text-[15px] leading-relaxed whitespace-pre-wrap">{post.content.replace(/\n{3,}/g, '\n\n')}</p>
        {post.is_edited && (
          <p className="text-[11px] text-zinc-600 mt-1">modificato</p>
        )}
      </div>

      {/* Categoria */}
      {post.category && (
        <div className="px-5 pb-3 -mt-1">
          <CategoryBadge category={post.category} onClick={onCategoryClick ? () => onCategoryClick(post.category!) : undefined} />
        </div>
      )}

      {/* Immagine */}
      {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
        <div className="mx-5 mb-4 rounded-2xl overflow-hidden border border-zinc-800">
          <img src={post.image_url} alt={`Post di ${post.profiles.username}`}
            className="w-full max-h-[420px] object-cover hover:scale-[1.02] transition-transform duration-500"
            loading="lazy"
                          decoding="async" />
        </div>
      )}

      {/* Azioni */}
      <div className="px-5 py-2.5 flex items-center gap-6 border-t border-zinc-800/50">
        <button
          onClick={() => onLike(post.id)}
          aria-label={post.liked_by_user ? 'Rimuovi like' : 'Metti like'}
          className={`flex items-center gap-2 group transition-all ${post.liked_by_user ? 'text-orange-500' : 'text-zinc-500 hover:text-orange-400'}`}
        >
          <div className={`p-1.5 rounded-xl transition-colors ${post.liked_by_user ? 'bg-orange-500/15' : 'group-hover:bg-orange-500/10'}`}>
            <Flame size={19} className={`transition-transform ${post.liked_by_user ? 'fill-orange-500' : ''} ${isLiking ? 'animate-heart-burst' : ''}`} />
          </div>
          <span className="text-xs font-bold">{post.likes_count}</span>
        </button>

        <button
          onClick={() => onOpenModal(post.id)}
          aria-label="Vedi commenti"
          className="flex items-center gap-2 group transition-all text-zinc-500 hover:text-violet-400"
        >
          <div className="p-1.5 rounded-xl transition-colors group-hover:bg-violet-500/10">
            <MessageCircle size={19} />
          </div>
          <span className="text-xs font-bold">{post.comments_count}</span>
        </button>

        {currentUser && currentUser.id !== post.user_id && (
          <div className="ml-auto">
            <ReportButton targetType="post" targetId={post.id} iconOnly />
          </div>
        )}

        {/* Share — Web Share API nativa, fallback clipboard */}
        <button
          onClick={async () => {
            const url = `${window.location.origin}/home?post=${post.id}`
            if (navigator.share) {
              await navigator.share({ title: 'Geekore', text: post.content.slice(0, 80), url }).catch(() => {})
            } else {
              await navigator.clipboard.writeText(url).catch(() => {})
            }
          }}
          aria-label="Condividi post"
          className={`flex items-center gap-2 group text-zinc-500 hover:text-violet-400 transition-all ${currentUser && currentUser.id !== post.user_id ? '' : 'ml-auto'}`}
        >
          <div className="p-1.5 rounded-xl transition-colors group-hover:bg-violet-500/10">
            <Send size={18} aria-hidden="true" />
          </div>
        </button>
      </div>
    </div>
  )
})

// ── PostModal — Facebook style ────────────────────────────────────────────────

function PostModal({
  post, currentUser, currentProfile, onClose, onLike, onAddComment, onCommentOptions, isLiking, locale,
}: {
  post: Post
  currentUser: User | null
  currentProfile: any
  onClose: () => void
  onLike: (id: string) => void
  onAddComment: (postId: string, content: string) => void
  onCommentOptions: (commentId: string, postId: string) => void
  isLiking: boolean
  locale: string
}) {
  const [commentText, setCommentText] = useState('')

  const submitComment = () => {
    if (!commentText.trim()) return
    onAddComment(post.id, commentText.trim())
    setCommentText('')
  }

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      data-no-swipe
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 flex-shrink-0">
          <h3 className="font-semibold text-white text-[15px]">Post</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {post.pinned && (
            <div className="flex items-center gap-1.5 px-5 pt-4 pb-1 text-violet-400">
              <Pin size={11} className="rotate-45" />
              <span className="text-[10px] font-bold uppercase tracking-widest">In evidenza</span>
            </div>
          )}
          {post.isDiscovery && !post.pinned && (
            <div className="flex items-center gap-1.5 px-5 pt-4 pb-1 text-fuchsia-400">
              <Sparkles size={11} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Consigliato per te</span>
            </div>
          )}

          {/* Post header */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-2.5">
            <Link href={`/profile/${post.profiles.username}`} onClick={onClose} className="group shrink-0">
              <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-violet-500/20 group-hover:ring-violet-500/50 transition-all">
                <Avatar src={post.profiles.avatar_url} username={post.profiles.username} displayName={post.profiles.display_name} size={40} className="rounded-full" />
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <Link href={`/profile/${post.profiles.username}`} onClick={onClose} className="hover:text-violet-400 transition-colors">
                <p className="font-semibold text-[var(--text-primary)] text-[15px] leading-tight">
                  <UserBadge badge={post.profiles.badge} displayName={post.profiles.display_name || post.profiles.username} />
                </p>
              </Link>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: locale === 'en' ? enUS : it })}
              </p>
            </div>
          </div>

          {/* Post content */}
          <div className="px-5 pb-3">
            <p className="text-[var(--text-primary)] text-[15px] leading-relaxed whitespace-pre-wrap">{post.content.replace(/\n{3,}/g, '\n\n')}</p>
            {post.is_edited && <p className="text-[11px] text-zinc-600 mt-1">modificato</p>}
          </div>

          {/* Categoria */}
          {post.category && (
            <div className="px-5 pb-3 -mt-1">
              <CategoryBadge category={post.category} />
            </div>
          )}

          {/* Post image */}
          {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
            <div className="mx-5 mb-4 rounded-2xl overflow-hidden border border-zinc-800">
              <img src={post.image_url} alt={`Post di ${post.profiles.username}`}
                className="w-full max-h-[320px] object-cover" loading="lazy"
                          decoding="async" />
            </div>
          )}

          {/* Like/comment counts */}
          <div className="px-5 py-2.5 flex items-center gap-6 border-t border-zinc-800/50">
            <button
              onClick={() => onLike(post.id)}
              aria-label={post.liked_by_user ? 'Rimuovi like' : 'Metti like'}
              className={`flex items-center gap-2 group transition-all ${post.liked_by_user ? 'text-orange-500' : 'text-zinc-500 hover:text-orange-400'}`}
            >
              <div className={`p-1.5 rounded-xl transition-colors ${post.liked_by_user ? 'bg-orange-500/15' : 'group-hover:bg-orange-500/10'}`}>
                <Flame size={19} className={`transition-transform ${post.liked_by_user ? 'fill-orange-500' : ''} ${isLiking ? 'animate-heart-burst' : ''}`} />
              </div>
              <span className="text-xs font-bold">{post.likes_count}</span>
            </button>
            <div className="flex items-center gap-2 text-zinc-500">
              <MessageCircle size={17} />
              <span className="text-xs font-bold">{post.comments_count}</span>
            </div>
          </div>

          {/* Comments */}
          {post.comments.length > 0 ? (
            <>
              <div className="h-px bg-zinc-800/70 mx-5" />
              <div className="px-5 py-3 space-y-4">
                {post.comments.map(comment => (
                  <div key={comment.id} className="flex items-start gap-3 group/mc">
                    <Link href={`/profile/${comment.username}`} onClick={onClose} className="shrink-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-zinc-700/60">
                        <Avatar src={undefined} username={comment.username || 'user'} displayName={comment.display_name} size={32} className="rounded-full" />
                      </div>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] leading-snug">
                        <Link href={`/profile/${comment.username}`} onClick={onClose}
                          className="font-semibold text-white hover:text-violet-400 transition-colors mr-1">
                          {comment.username}
                        </Link>
                        <span className="text-zinc-400">{comment.content}</span>
                      </p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: locale === 'en' ? enUS : it })}
                      </p>
                    </div>
                    {currentUser?.id === comment.user_id && (
                      <button
                        onClick={() => onCommentOptions(comment.id, post.id)}
                        aria-label="Opzioni commento"
                        className="text-zinc-600 hover:text-white opacity-0 group-hover/mc:opacity-100 transition-all shrink-0 mt-0.5"
                      >
                        <MoreHorizontal size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] text-zinc-600">Nessun commento ancora. Sii il primo!</p>
            </div>
          )}
        </div>

        {/* Comment input */}
        {currentUser && (
          <div className="border-t border-zinc-800 px-5 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-1 ring-zinc-700/60">
              <Avatar src={currentProfile?.avatar_url} username={currentProfile?.username || 'user'} displayName={currentProfile?.display_name} size={32} className="rounded-full" />
            </div>
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value.slice(0, 500))}
              placeholder="Aggiungi un commento..."
              maxLength={500}
              className="flex-1 bg-transparent text-[14px] text-white placeholder-zinc-500 focus:outline-none min-w-0"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment() } }}
            />
            {commentText.trim() && (
              <button onClick={submitComment} className="text-violet-400 font-semibold text-sm hover:text-violet-300 transition-colors shrink-0">
                Pubblica
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Pagina principale ────────────────────────────────────────────────────────

export default function FeedPage() {
  const pathname = usePathname()
  const { scrollToTop } = useScrollPanel()
  const [posts, setPosts] = useState<Post[]>([])
  const [pinnedPosts, setPinnedPosts] = useState<Post[]>([])
  const [newPostContent, setNewPostContent] = useState('')
  const [newPostCategory, setNewPostCategory] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [currentProfile, setCurrentProfile] = useState<any>(null)
  const [modalPostId, setModalPostId] = useState<string | null>(null)

  // Lock body scroll + horizontal swipe when comment modal is open
  useEffect(() => {
    if (modalPostId) {
      document.body.style.overflow = 'hidden'
      gestureState.drawerActive = true
      const closeModal = () => setModalPostId(null)
      androidBack.push(closeModal)
      return () => {
        document.body.style.overflow = ''
        gestureState.drawerActive = false
        androidBack.pop(closeModal)
      }
    } else {
      document.body.style.overflow = ''
      gestureState.drawerActive = false
    }
    return () => { document.body.style.overflow = ''; gestureState.drawerActive = false }
  }, [modalPostId])

  // ── Bottom Sheet globale ──────────────────────────────────────────────────
  type SheetState = { open: false } | { open: true; type: 'post'; postId: string } | { open: true; type: 'comment'; commentId: string; postId: string } | { open: true; type: 'confirm-post'; postId: string } | { open: true; type: 'confirm-comment'; commentId: string; postId: string }
  const [sheet, setSheet] = useState<SheetState>({ open: false })
  const closeSheet = useCallback(() => setSheet({ open: false }), [])

  const handlePostOptions = useCallback((postId: string) => {
    setSheet({ open: true, type: 'post', postId })
  }, [])

  const handleCommentOptions = useCallback((commentId: string, postId: string) => {
    setSheet({ open: true, type: 'comment', commentId, postId })
  }, [])
  const [feedFilter, setFeedFilter] = useState<'all' | 'following'>('all')
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set())
  const [newPostsCount, setNewPostsCount] = useState(0)
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [modalPos, setModalPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)

  const latestPostIdRef = useRef<string | null>(null)
  const pageRef = useRef(0)
  const supabase = createClient()
  const { locale, t } = useLocale()
  const f = t.feed

  const sentinelRef = useInfiniteScroll({
    onLoadMore: () => {
      if (!currentUser || loadingMore || !hasMore) return
      const nextPage = pageRef.current + 1
      pageRef.current = nextPage
      setPage(nextPage)
      loadPosts(currentUser.id, nextPage, true, feedFilter)
    },
    hasMore,
    isLoading: loadingMore,
  })

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('username, display_name, avatar_url').eq('id', user.id).single()
        setCurrentProfile(profile)
        if (isCacheValid('all')) {
          setPosts(cache.posts!); setPage(cache.page); setHasMore(cache.hasMore); setLoading(false)
          loadPinnedPosts(user.id); return
        }
        await loadPosts(user.id, 0, false)
        await loadPinnedPosts(user.id)
      } else {
        setLoading(false)
      }
    }
    init()
  }, [])

  const isActive = useTabActive()

  // Realtime: si iscrive solo quando il tab è visibile.
  // Quando l'utente swippa su un altro tab, il canale viene rimosso.
  // Così il feed non consuma risorse durante lo swipe e non causa lag.
  useEffect(() => {
    if (!isActive) return // non attivo → non aprire il canale
    const CHANNEL_NAME = 'feed:posts:live'
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${CHANNEL_NAME}`)
    if (existing) return
    const channel = supabase.channel(CHANNEL_NAME)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
        const newId = payload.new?.id
        if (!newId || newId === latestPostIdRef.current) return
        setNewPostsCount(prev => prev + 1)
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (posts.length > 0) latestPostIdRef.current = posts[0].id
  }, [posts])

  const handleShowNewPosts = async () => {
    if (!currentUser) return
    setNewPostsCount(0); pageRef.current = 0; setPage(0); setHasMore(true)
    await loadPosts(currentUser.id, 0, false, feedFilter)
    scrollToTop('smooth')
  }

  const loadPinnedPosts = useCallback(async (userId: string) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase.from('posts')
      .select('id, user_id, content, image_url, created_at, category, is_edited, likes (id, user_id), comments (id, content, created_at, user_id)')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(50)
    if (error || !data) return
    const uids1 = [...new Set(data.map((p: any) => p.user_id))]
    const { data: profiles1 } = await supabase.from('profiles').select('id, username, display_name, avatar_url, badge').in('id', uids1)
    const pm1: Record<string, any> = {}; (profiles1 || []).forEach((p: any) => { pm1[p.id] = p })
    const commentUids1 = [...new Set(data.flatMap((p: any) => (p.comments || []).map((c: any) => c.user_id)))]
    const { data: cProfiles1 } = commentUids1.length ? await supabase.from('profiles').select('id, username, display_name').in('id', commentUids1) : { data: [] }
    const cpm1: Record<string, any> = {}; (cProfiles1 || []).forEach((p: any) => { cpm1[p.id] = p })
    const dataWithProfiles = data.map((p: any) => ({
      ...p,
      profiles: pm1[p.user_id] || { username: '', display_name: null, avatar_url: null },
      comments: (p.comments || []).map((c: any) => ({ ...c, profiles: cpm1[c.user_id] || { username: 'utente', display_name: null } })).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }))

    const withLikes = dataWithProfiles
      .map((p: any) => ({ ...p, _likeCount: (p.likes || []).length }))
      .filter((p: any) => p._likeCount >= PINNED_LIKE_THRESHOLD)
      .sort((a: any, b: any) => b._likeCount - a._likeCount).slice(0, 2)

    setPinnedPosts(withLikes.map((post: any) => {
      const likes = post.likes || []
      const profile = post.profiles
      return {
        id: post.id, content: post.content, image_url: post.image_url,
        created_at: post.created_at, category: post.category,
        profiles: { username: profile?.username || '', display_name: profile?.display_name, avatar_url: profile?.avatar_url },
        likes_count: likes.length, liked_by_user: likes.some((l: any) => l.user_id === userId),
        comments_count: (post.comments || []).length,
        comments: (post.comments || []).map((c: any) => ({
          id: c.id, content: c.content, created_at: c.created_at, user_id: c.user_id,
          username: c.profiles?.username || 'utente',
          display_name: c.profiles?.display_name,
        })).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        pinned: true, user_id: post.user_id,
      }
    }))
  }, [supabase])

  const getUserTopCategory = useCallback(async (userId: string) => {
    const { data } = await supabase.from('user_category_affinity')
      .select('category, subcategory, score').eq('user_id', userId)
      .order('score', { ascending: false }).limit(1)
    if (!data || data.length === 0) return null
    return { category: data[0].category, subcategory: data[0].subcategory }
  }, [supabase])

  const loadDiscoveryPosts = useCallback(async (userId: string, followingIds: string[], topAffinity: { category: string; subcategory: string } | null): Promise<Post[]> => {
    if (!topAffinity) return []
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

    const { data: discPosts } = await supabase.from('posts')
      .select('id, user_id, content, image_url, created_at, category, likes (id, user_id)')
      .ilike('category', `${topAffinity.category}:%`)
      .gte('created_at', since).limit(50)
    if (!discPosts) return []
    const discUids = [...new Set(discPosts.map((p: any) => p.user_id))]
    const { data: discProfiles } = await supabase.from('profiles').select('id, username, display_name, avatar_url, badge').in('id', discUids)
    const discPm: Record<string, any> = {}; (discProfiles || []).forEach((p: any) => { discPm[p.id] = p })
    const data = discPosts.map((p: any) => ({ ...p, profiles: discPm[p.user_id] || { username: '', display_name: null, avatar_url: null } }))

    const eligible = data
      .filter((p: any) => p.user_id !== userId && !followingIds.includes(p.user_id))
      .map((p: any) => ({ ...p, _likeCount: (p.likes || []).length }))
      .sort((a: any, b: any) => b._likeCount - a._likeCount).slice(0, 5)
    if (eligible.length === 0) return []

    return eligible.map((post: any) => {
      const likes = post.likes || []
      const profile = post.profiles
      return {
        id: post.id, user_id: post.user_id, content: post.content,
        image_url: post.image_url, created_at: post.created_at, category: post.category, is_edited: post.is_edited,
        profiles: { username: profile?.username || '', display_name: profile?.display_name, avatar_url: profile?.avatar_url },
        likes_count: likes.length, liked_by_user: likes.some((l: any) => l.user_id === userId),
        comments_count: 0, comments: [], isDiscovery: true,
      }
    })
  }, [supabase])

  const loadPosts = useCallback(async (userId: string, pageIndex = 0, append = false, filter: 'all' | 'following' = 'all', silent = false) => {
    if (append) setLoadingMore(true); else if (!silent) setLoading(true)
    const from = pageIndex * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let followingIds: string[] = []
    const { data: followsData } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
    followingIds = (followsData || []).map((f: any) => f.following_id)

    if (filter === 'following' && followingIds.length === 0) {
      setPosts(append ? (prev => prev) : []); setHasMore(false)
      if (append) setLoadingMore(false); else setLoading(false); return
    }

    let query = supabase.from('posts')
      .select('id, user_id, content, image_url, created_at, category, is_edited, likes (id, user_id), comments (id, content, created_at, user_id)')
      .order('created_at', { ascending: false }).range(from, to)
    if (filter === 'following' && followingIds.length > 0) query = query.in('user_id', followingIds)

    const { data: rawPosts } = await query
    const postUids = [...new Set((rawPosts || []).map((p: any) => p.user_id))]
    const { data: postProfiles } = postUids.length ? await supabase.from('profiles').select('id, username, display_name, avatar_url, badge').in('id', postUids) : { data: [] }
    const postPm: Record<string, any> = {}; (postProfiles || []).forEach((p: any) => { postPm[p.id] = p })
    const commentUids = [...new Set((rawPosts || []).flatMap((p: any) => (p.comments || []).map((c: any) => c.user_id)))]
    const { data: commentProfs } = commentUids.length ? await supabase.from('profiles').select('id, username, display_name').in('id', commentUids) : { data: [] }
    const commentPm: Record<string, any> = {}; (commentProfs || []).forEach((p: any) => { commentPm[p.id] = p })
    const postsData = (rawPosts || []).map((p: any) => ({
      ...p,
      profiles: postPm[p.user_id] || { username: '', display_name: null, avatar_url: null },
      comments: (p.comments || []).map((c: any) => ({ ...c, profiles: commentPm[c.user_id] || { username: 'utente', display_name: null } })).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }))

    const formatted: Post[] = (postsData || []).map((post: any) => {
      const likes = post.likes || []
      const profile = post.profiles
      return {
        id: post.id, user_id: post.user_id, content: post.content,
        image_url: post.image_url, created_at: post.created_at, category: post.category, is_edited: post.is_edited,
        profiles: { username: profile?.username || '', display_name: profile?.display_name, avatar_url: profile?.avatar_url },
        likes_count: likes.length, liked_by_user: likes.some((l: any) => l.user_id === userId),
        comments_count: (post.comments || []).length,
        comments: (post.comments || []).map((c: any) => ({
          id: c.id, content: c.content, created_at: c.created_at, user_id: c.user_id,
          username: c.profiles?.username || 'utente',
          display_name: c.profiles?.display_name,
        })).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      }
    })

    const newHasMore = (postsData || []).length === PAGE_SIZE
    const pinnedIds = new Set(pinnedPosts.map(p => p.id))
    const filteredFormatted = formatted.filter(p => !pinnedIds.has(p.id))

    let finalPosts = filteredFormatted
    if (filter === 'following' && pageIndex === 0) {
      const topAffinity = await getUserTopCategory(userId)
      const discoveryPosts = await loadDiscoveryPosts(userId, followingIds, topAffinity)
      finalPosts = buildSmartFeed(filteredFormatted, discoveryPosts)
    }

    if (append) {
      setPosts(prev => {
        const merged = [...prev, ...finalPosts]
        cache.posts = merged; cache.page = pageIndex; cache.hasMore = newHasMore; cache.filter = filter; cache.ts = Date.now()
        return merged
      })
      setLoadingMore(false)
    } else {
      setPosts(finalPosts)
      cache.posts = finalPosts; cache.page = pageIndex; cache.hasMore = newHasMore; cache.filter = filter; cache.ts = Date.now()
      if (!silent) setLoading(false)
    }
    setHasMore(newHasMore)
  }, [supabase, pinnedPosts, getUserTopCategory, loadDiscoveryPosts])

  const closeComposerRef = useRef<() => void>(null as any)
  const closeComposer = useCallback(() => {
    if (closeComposerRef.current) androidBack.pop(closeComposerRef.current)
    document.body.style.overflow = ''
    setComposerOpen(false)
    setNewPostContent('')
    setNewPostCategory('')
    setSelectedImage(null)
    setImagePreview(null)
  }, [])
  closeComposerRef.current = closeComposer

  const openComposer = () => {
    document.body.style.overflow = 'hidden'
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (vw >= 640) {
      const modalW = Math.min(548, vw - 48)
      const top = 25  // vicino alla navbar
      const bottomMargin = 80  // margine generoso dal fondo
      setModalPos({
        top,
        left: Math.round((vw - modalW) / 2),
        width: modalW,
        maxHeight: vh - top - bottomMargin,
      })
    } else {
      setModalPos(null)
    }
    androidBack.push(closeComposer)
    setComposerOpen(true)
  }

  // Pull-to-refresh su mobile
  const handlePullRefresh = async () => {
    if (!currentUser) return
    invalidateCache(feedFilter)
    // Silent: non mostra skeleton, aggiorna i post in background.
    // Dopo che i dati arrivano, scrolla silenziosamente in cima — come Instagram.
    await loadPosts(currentUser.id, 0, false, feedFilter, true)
    // Scroll to top senza flash: i dati sono già aggiornati, scroll smooth invisibile
    scrollToTop('smooth')
  }
  const { distance: pullDistance, refreshing: isPullRefreshing } = usePullToRefresh({
    onRefresh: handlePullRefresh,
    enabled: pathname === '/home' || pathname === '/',
  })

  const handleFilterChange = async (filter: 'all' | 'following') => {
    if (!currentUser) return
    setFeedFilter(filter); pageRef.current = 0; setPage(0); setHasMore(true)
    await loadPosts(currentUser.id, 0, false, filter)
  }

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser || isPublishing) return
    if (!newPostContent.trim() && !selectedImage) return
    if (newPostContent.trim().length > 0 && newPostContent.trim().length < 1) return // minimo 1 char visibile
    setIsPublishing(true); haptic(50)

    let imageUrl = null
    if (selectedImage) {
      const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!ALLOWED.includes(selectedImage.type)) { setIsPublishing(false); return }
      const fileName = `${Date.now()}-${selectedImage.name}`
      const { error: uploadErr } = await supabase.storage.from('post-images').upload(fileName, selectedImage, { contentType: selectedImage.type })
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(fileName)
        imageUrl = urlData.publicUrl
      }
    }

    const { data: newPostData, error } = await supabase.from('posts')
      .insert({ user_id: currentUser.id, content: newPostContent.trim().replace(/\n{3,}/g, '\n\n'), image_url: imageUrl, category: newPostCategory || null })
      .select('id, content, image_url, created_at, category').single()

    if (!error && newPostData) {
      const optimisticPost: Post = {
        id: newPostData.id, user_id: currentUser.id, content: newPostData.content,
        image_url: newPostData.image_url, created_at: newPostData.created_at, category: newPostData.category,
        profiles: { username: currentProfile?.username || '', display_name: currentProfile?.display_name, avatar_url: currentProfile?.avatar_url },
        likes_count: 0, comments_count: 0, liked_by_user: false, comments: [],
      }
      setPosts(prev => { const updated = [optimisticPost, ...prev]; cache.posts = updated; cache.ts = Date.now(); return updated })
      setNewPostContent(''); setNewPostCategory(''); setSelectedImage(null); setImagePreview(null)
      setComposerOpen(false)
    }
    setIsPublishing(false)
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { setSelectedImage(file); setImagePreview(URL.createObjectURL(file)) }
  }

  const toggleLike = useCallback(async (postId: string) => {
    if (!currentUser) return
    const postIndex = posts.findIndex(p => p.id === postId)
    if (postIndex === -1) return
    const current = posts[postIndex]
    const willLike = !current.liked_by_user
    if (willLike) {
      haptic([40, 20, 40])
      setLikingIds(prev => new Set([...prev, postId]))
      setTimeout(() => setLikingIds(prev => { const s = new Set(prev); s.delete(postId); return s }), 400)
      if (current.category) trackAffinity(supabase, currentUser.id, current.category)
    } else { haptic(20) }
    // UI ottimistica immediata
    setPosts(prev => prev.map((p, i) => i === postIndex ? { ...p, likes_count: willLike ? p.likes_count + 1 : p.likes_count - 1, liked_by_user: willLike } : p))
    // Insert/delete diretto (stesso pattern follow)
    if (willLike) {
      const { data: likeData } = await supabase.from('likes').insert({ post_id: postId, user_id: currentUser.id }).select('id').single()
      if (current.user_id !== currentUser.id && likeData?.id) {
        await supabase.from('notifications').insert({ receiver_id: current.user_id, sender_id: currentUser.id, type: 'like', post_id: postId, like_id: likeData.id })
        fetch('/api/social/like', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_id: postId }),
        }).catch(() => {})
      }
    } else {
      // Il CASCADE su like_id cancella automaticamente la notifica
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
    }
  }, [currentUser, posts, supabase])

  const toggleLikePinned = useCallback(async (postId: string) => {
    if (!currentUser) return
    const postIndex = pinnedPosts.findIndex(p => p.id === postId)
    if (postIndex === -1) return
    const current = pinnedPosts[postIndex]
    const willLike = !current.liked_by_user
    if (willLike) {
      haptic([40, 20, 40])
      setLikingIds(prev => new Set([...prev, postId]))
      setTimeout(() => setLikingIds(prev => { const s = new Set(prev); s.delete(postId); return s }), 400)
      if (current.category) trackAffinity(supabase, currentUser.id, current.category)
    } else { haptic(20) }
    // UI ottimistica immediata
    setPinnedPosts(prev => prev.map((p, i) => i === postIndex ? { ...p, likes_count: willLike ? p.likes_count + 1 : p.likes_count - 1, liked_by_user: willLike } : p))
    // Insert/delete diretto (stesso pattern follow)
    if (willLike) {
      const { data: likeData } = await supabase.from('likes').insert({ post_id: postId, user_id: currentUser.id }).select('id').single()
      if (current.user_id !== currentUser.id && likeData?.id) {
        await supabase.from('notifications').insert({ receiver_id: current.user_id, sender_id: currentUser.id, type: 'like', post_id: postId, like_id: likeData.id })
        fetch('/api/social/like', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ post_id: postId }),
        }).catch(() => {})
      }
    } else {
      // Il CASCADE su like_id cancella automaticamente la notifica
      await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
    }
  }, [currentUser, pinnedPosts, supabase])

  const handleAddComment = useCallback(async (postId: string, content: string) => {
    if (!content.trim() || !currentUser) return
    haptic(30)
    const post = [...posts, ...pinnedPosts].find(p => p.id === postId)
    if (post?.category) trackAffinity(supabase, currentUser.id, post.category)
    const trimmedContent = content.trim()
    const newCommentTemp: Comment = {
      id: 'temp-' + Date.now(), content: trimmedContent,
      created_at: new Date().toISOString(), user_id: currentUser.id,
      username: currentProfile?.username || 'utente', display_name: currentProfile?.display_name,
    }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: p.comments_count + 1, comments: [newCommentTemp, ...p.comments] } : p))
    setPinnedPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: p.comments_count + 1, comments: [newCommentTemp, ...p.comments] } : p))
    const { data: commentData } = await supabase.from('comments').insert({ post_id: postId, user_id: currentUser.id, content: trimmedContent }).select('id').single()
    if (post && post.user_id !== currentUser.id && commentData?.id) {
      await supabase.from('notifications').insert({ receiver_id: post.user_id, sender_id: currentUser.id, type: 'comment', post_id: postId, comment_id: commentData.id })
      fetch('/api/social/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: postId }),
      }).catch(() => {})
    }
  }, [currentUser, currentProfile, posts, pinnedPosts, supabase])

  const handleDeleteComment = useCallback(async (commentId: string, postId: string) => {
    if (!currentUser) return
    const { error } = await supabase.from('comments').delete().eq('id', commentId)
    if (error) return
    // Il CASCADE su comment_id cancella automaticamente la notifica
    const remove = (p: Post) => p.id === postId ? { ...p, comments_count: p.comments_count - 1, comments: p.comments.filter(c => c.id !== commentId) } : p
    setPosts(prev => prev.map(remove)); setPinnedPosts(prev => prev.map(remove))
  }, [currentUser, supabase])

  const handleDeletePost = useCallback(async (postId: string) => {
    if (!currentUser) return
    setPosts(prev => { const updated = prev.filter(p => p.id !== postId); cache.posts = updated; cache.ts = Date.now(); return updated })
    setPinnedPosts(prev => prev.filter(p => p.id !== postId))
    await supabase.from('comments').delete().eq('post_id', postId)
    await supabase.from('likes').delete().eq('post_id', postId)
    await supabase.from('posts').delete().eq('id', postId).eq('user_id', currentUser.id)
  }, [currentUser, supabase])

  // ── Edit post ─────────────────────────────────────────────────────────────
  const [editingPostId, setEditingPostId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const startEditPost = useCallback((postId: string) => {
    const post = [...posts, ...pinnedPosts].find(p => p.id === postId)
    if (!post) return
    setEditingPostId(postId)
    setEditContent(post.content)
    closeSheet()
  }, [posts, pinnedPosts])

  const handleEditPost = useCallback(async () => {
    if (!currentUser || !editingPostId || !editContent.trim()) return
    const newContent = editContent.trim()
    await supabase.from('posts').update({ content: newContent, is_edited: true }).eq('id', editingPostId).eq('user_id', currentUser.id)
    const update = (p: Post) => p.id === editingPostId ? { ...p, content: newContent, is_edited: true } : p
    setPosts(prev => { const updated = prev.map(update); cache.posts = updated; cache.ts = Date.now(); return updated })
    setPinnedPosts(prev => prev.map(update))
    setEditingPostId(null)
    setEditContent('')
  }, [currentUser, editingPostId, editContent, supabase])

  // Filtro client-side: supporta sia "Film" (solo macro) che "Film:Forrest Gump" (match esatto sottocategoria)
  const filteredPosts = categoryFilter
    ? posts.filter(p => {
        if (!p.category) return false
        const filterParsed = parseCategoryString(categoryFilter)
        const postParsed = parseCategoryString(p.category)
        if (!filterParsed || !postParsed) return false
        if (filterParsed.category !== postParsed.category) return false
        // Se il filtro ha una sottocategoria, controlla match case-insensitive
        if (filterParsed.subcategory) {
          return postParsed.subcategory.toLowerCase().includes(filterParsed.subcategory.toLowerCase())
        }
        return true // solo macro, mostra tutto
      })
    : posts

  // DOM cap: manteniamo al massimo DOM_CAP post renderizzati contemporaneamente.
  // Cresce di DOM_CAP_STEP ogni volta che posts si estende (nuova pagina Supabase).
  // Tiene il DOM leggero senza rompere l'infinite scroll esistente.
  const DOM_CAP_INITIAL = 25
  const DOM_CAP_STEP = 15
  const [domCap, setDomCap] = useState(DOM_CAP_INITIAL)
  const prevPostsLen = useRef(0)
  useEffect(() => {
    if (posts.length > prevPostsLen.current) {
      // Nuovi post arrivati: estendi il cap per mostrare quelli nuovi
      setDomCap(cap => Math.max(cap, posts.length))
    }
    prevPostsLen.current = posts.length
  }, [posts.length])
  // Reset cap quando cambia il filtro (lista completamente diversa)
  useEffect(() => { setDomCap(DOM_CAP_INITIAL) }, [categoryFilter])

  const displayedPosts = filteredPosts.slice(0, domCap)

  // Click su un badge categoria in un post → attiva il filtro per quella categoria
  const handleCategoryClick = useCallback((category: string) => {
    setCategoryFilter(prev => prev === category ? '' : category)
    scrollToTop('smooth')
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <div className="pt-0 pb-24 xl:pb-6 relative min-h-screen">
          <div className="lg:pl-[360px] flex items-start min-h-screen">
            {/* Colonna principale */}
            <div className="flex-1 min-w-0">
              <div className="max-w-[680px] mx-auto px-4">
                {/* Composer skeleton */}
                <div className="my-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3.5 flex items-center gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-zinc-800 flex-shrink-0" />
                  <div className="h-3.5 bg-zinc-800 rounded-full w-48" />
                </div>
                {/* Tab bar skeleton */}
                <div className="flex items-stretch mb-0 mt-1">
                  <div className="flex-1 py-3 flex justify-center">
                    <div className="h-3.5 w-10 bg-zinc-800 rounded-full animate-pulse" />
                  </div>
                  <div className="flex-1 py-3 flex justify-center">
                    <div className="h-3.5 w-20 bg-zinc-800 rounded-full animate-pulse" />
                  </div>
                </div>
                {/* Post skeletons */}
                <div className="flex flex-col gap-2 pt-3">
                  {Array.from({ length: 4 }).map((_, i) => <SkeletonFeedPost key={i} />)}
                </div>
              </div>
            </div>
            {/* Right sidebar skeleton */}
            <div className="hidden xl:block w-[420px] flex-shrink-0 sticky top-12 pt-4 px-4 space-y-6 animate-pulse">
              <div>
                <div className="h-4 w-40 bg-zinc-800 rounded-full mb-4" />
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5">
                    <div className="w-16 h-[88px] bg-zinc-800 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3.5 bg-zinc-800 rounded-full w-3/4" />
                      <div className="h-2.5 bg-zinc-800 rounded-full w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div className="h-4 w-32 bg-zinc-800 rounded-full mb-4" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-zinc-800 rounded-full flex-shrink-0" />
                      <div className="h-3 bg-zinc-800 rounded-full w-20" />
                    </div>
                    <div className="w-14 h-7 bg-zinc-800 rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Sheet actions
  const sheetActions: BottomSheetAction[] = (() => {
    if (!sheet.open) return []
    if (sheet.type === 'post') return [
      { label: 'Modifica post', onClick: () => startEditPost(sheet.postId) },
      { label: 'Elimina post', danger: true, onClick: () => setSheet({ open: true, type: 'confirm-post', postId: sheet.postId }) },
    ]
    if (sheet.type === 'comment') return [
      { label: 'Elimina commento', danger: true, onClick: () => setSheet({ open: true, type: 'confirm-comment', commentId: sheet.commentId, postId: sheet.postId }) },
    ]
    if (sheet.type === 'confirm-post') return [
      { label: 'Conferma eliminazione', danger: true, onClick: () => { handleDeletePost(sheet.postId); closeSheet() } },
    ]
    if (sheet.type === 'confirm-comment') return [
      { label: 'Conferma eliminazione', danger: true, onClick: () => { handleDeleteComment(sheet.commentId, sheet.postId); closeSheet() } },
    ]
    return []
  })()

  const sheetTitle = !sheet.open ? undefined
    : sheet.type === 'confirm-post' ? 'Eliminare il post? Questa azione è irreversibile.'
    : sheet.type === 'confirm-comment' ? 'Eliminare il commento?'
    : undefined

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Bottom Sheet globale — fuori da qualsiasi overflow/transform */}
      <BottomSheet open={sheet.open} title={sheetTitle} actions={sheetActions} onClose={closeSheet} />

      {/* Post Modal — Facebook style */}
      {modalPostId && (() => {
        const modalPost = [...posts, ...pinnedPosts].find(p => p.id === modalPostId)
        if (!modalPost) return null
        return (
          <PostModal
            post={modalPost}
            currentUser={currentUser}
            currentProfile={currentProfile}
            onClose={() => setModalPostId(null)}
            onLike={pinnedPosts.some(p => p.id === modalPostId) ? toggleLikePinned : toggleLike}
            onAddComment={handleAddComment}
            onCommentOptions={handleCommentOptions}
            isLiking={likingIds.has(modalPostId)}
            locale={locale}
          />
        )
      })()}

      {/* Modal modifica post */}
      {editingPostId && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/80 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !window.getSelection()?.toString()) setEditingPostId(null) }}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">Modifica post</h3>
              <button onClick={() => setEditingPostId(null)} className="text-zinc-500 hover:text-white transition"><X size={18} /></button>
            </div>
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value.slice(0, 2000))}
              rows={5}
              autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 focus:outline-none rounded-2xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none resize-none transition mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingPostId(null)} className="px-5 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-semibold transition">
                Annulla
              </button>
              <button onClick={handleEditPost} disabled={!editContent.trim()} className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold transition">
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
      <PullToRefreshIndicator distance={pullDistance} refreshing={isPullRefreshing} />

      {/* ── Sidebar sinistra — fixed al viewport, mai scorrevole.
           Vive FUORI da PullWrapper per evitare che il suo transform
           inline (translateY) rompa position:fixed. ── */}
      <div className="hidden lg:block fixed top-12 left-0 w-[360px] h-[calc(100vh-3rem)] z-20 bg-[var(--bg-primary)] overflow-y-auto">
        <FeedLeftSidebar profile={currentProfile} />
      </div>

      <PullWrapper distance={pullDistance} refreshing={isPullRefreshing}>
      {/* Layout: full-bleed su mobile, tre colonne su desktop — stile Facebook */}
      <div className="pt-0 pb-24 xl:pb-6 relative min-h-screen">

        <div className="lg:pl-[360px] flex items-start gap-0 min-h-screen">

          {/* ── Colonna principale ─────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex justify-center">
          <div className="w-full max-w-[680px] px-4">

            {/* Composer — barra statica non invasiva, modal fullscreen al tap */}
            {currentUser && (
              <>
                {/* Barra statica — sempre visibile, poco invasiva */}
                <div
                  className="mx-4 my-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 cursor-pointer hover:border-violet-500/30 hover:bg-zinc-900 transition-all duration-200"
                  onClick={openComposer}
                >
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-zinc-800">
                      {currentProfile?.avatar_url ? (
                        <img src={currentProfile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center text-white text-xs font-bold">
                          {(currentProfile?.username?.[0] || '?').toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="flex-1 text-[15px] text-zinc-500 select-none">{f.placeholder}</span>
                  </div>
                  <div className="flex items-center gap-4 px-4 pb-3 border-t border-zinc-800/60 pt-2.5">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-[13px]">
                      <ImageIcon size={16} strokeWidth={1.6} />
                      <span>Foto</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-zinc-500 text-[13px]">
                      <Tag size={15} strokeWidth={1.6} />
                      <span>Categoria</span>
                    </div>
                  </div>
                </div>

                {/* Modal composer */}
                {composerOpen && (
                  <>
                    {/* Desktop: backdrop */}
                    <div className="hidden md:block fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm" onClick={closeComposer} />

                    {/* Desktop: modal posizionato */}
                    {modalPos && (
                      <div
                        className="hidden md:flex fixed z-[260] flex-col rounded-2xl shadow-2xl shadow-black/70 border border-zinc-700/60"
                        style={{ top: modalPos.top, left: modalPos.left, width: modalPos.width, maxHeight: modalPos.maxHeight, background: 'var(--bg-primary)' }}
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 flex-shrink-0">
                          <button onClick={closeComposer} className="text-[14px] font-medium text-zinc-400 hover:text-white transition-colors">Annulla</button>
                          <span className="text-[16px] font-bold text-white tracking-tight">Nuovo post</span>
                          <button onClick={async (e) => { await handleCreatePost(e as any); closeComposer() }}
                            disabled={isPublishing || (!newPostContent.trim() && !selectedImage)}
                            className="px-5 py-2 rounded-full text-[13px] font-bold disabled:opacity-30 transition-all"
                            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #db2777 100%)', color: 'white' }}>
                            {isPublishing ? <Loader2 size={14} className="animate-spin" /> : 'Pubblica'}
                          </button>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto">
                          <div className="flex gap-3 px-5 pt-5 pb-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 flex-shrink-0">
                              {currentProfile?.avatar_url ? <img src={currentProfile.avatar_url} alt="avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center text-white font-bold text-sm">{(currentProfile?.username?.[0] || '?').toUpperCase()}</div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-bold text-white mb-1.5">{currentProfile?.display_name || currentProfile?.username}</p>
                              <textarea data-testid="post-composer" autoFocus value={newPostContent}
                                onChange={e => { setNewPostContent(e.target.value.slice(0, 500)); const el = e.target; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }}
                                placeholder={f.placeholder} maxLength={500} rows={3}
                                className="no-nav-hide w-full bg-transparent text-[16px] text-white placeholder-zinc-500 outline-none resize-none leading-relaxed"
                                style={{ minHeight: '80px' }} />
                            </div>
                          </div>
                          {imagePreview && (
                            <div className="relative bg-zinc-950 border-t border-b border-zinc-800/60">
                              <img src={imagePreview} alt="preview" className="w-full object-contain" style={{ maxHeight: '400px' }} />
                              <button type="button" onClick={() => { setSelectedImage(null); setImagePreview(null) }} className="absolute top-3 right-3 w-8 h-8 bg-black/75 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors"><X size={14} /></button>
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 border-t border-zinc-800/60 px-4 py-3 flex items-center gap-3" style={{ background: 'var(--bg-primary)' }}>
                          <label className="cursor-pointer flex items-center justify-center w-10 h-10 rounded-2xl text-zinc-400 hover:text-violet-400 hover:bg-zinc-800 transition-all select-none">
                            <ImageIcon size={22} strokeWidth={1.5} />
                            <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                          </label>
                          <CategorySelector value={newPostCategory} onChange={setNewPostCategory} />
                          <div className="ml-auto flex items-center gap-2.5">
                            {newPostContent.length >= 400 && <span className={`text-[12px] font-semibold ${newPostContent.length >= 490 ? 'text-red-400' : 'text-zinc-500'}`}>{500 - newPostContent.length}</span>}
                            {newPostContent.length > 0 && <svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="10" fill="none" stroke="#27272a" strokeWidth="2.5" /><circle cx="13" cy="13" r="10" fill="none" stroke={newPostContent.length >= 490 ? '#f87171' : newPostContent.length >= 450 ? '#fb923c' : '#7c3aed'} strokeWidth="2.5" strokeDasharray={`${(newPostContent.length / 500) * 62.83} 62.83`} strokeLinecap="round" transform="rotate(-90 13 13)" /></svg>}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Mobile: fullscreen usando un portale sul body */}
                    {!modalPos && typeof document !== 'undefined' && createPortal(
                      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column' }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
                          <button onClick={closeComposer} style={{ fontSize: 14, color: '#a1a1aa', background: 'none', border: 'none', cursor: 'pointer' }}>Annulla</button>
                          <span style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>Nuovo post</span>
                          <button
                            onClick={async (e) => { await handleCreatePost(e as any); closeComposer() }}
                            disabled={isPublishing || (!newPostContent.trim() && !selectedImage)}
                            style={{ background: 'linear-gradient(135deg, #7c3aed, #db2777)', color: 'white', border: 'none', borderRadius: 999, padding: '8px 20px', fontSize: 13, fontWeight: 700, opacity: (isPublishing || (!newPostContent.trim() && !selectedImage)) ? 0.3 : 1, cursor: 'pointer' }}
                          >
                            {isPublishing ? '...' : 'Pubblica'}
                          </button>
                        </div>

                        {/* Body scrollabile */}
                        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                          <div style={{ display: 'flex', gap: 12, padding: '20px 20px 12px' }}>
                            <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#27272a' }}>
                              {currentProfile?.avatar_url
                                ? <img src={currentProfile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#7c3aed,#db2777)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 14 }}>{(currentProfile?.username?.[0] || '?').toUpperCase()}</div>
                              }
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 8 }}>{currentProfile?.display_name || currentProfile?.username}</p>
                              <textarea
                                data-testid="post-composer"
                                value={newPostContent}
                                onChange={e => { setNewPostContent(e.target.value.slice(0, 500)); const el = e.target; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }}
                                placeholder={f.placeholder}
                                maxLength={500}
                                rows={4}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '12px', outline: 'none', resize: 'none', color: 'white', fontSize: 16, lineHeight: 1.6, minHeight: 100, fontFamily: 'inherit' }}
                              />
                            </div>
                          </div>

                          {imagePreview && (
                            <div style={{ position: 'relative', background: '#09090b', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                              <img src={imagePreview} alt="preview" style={{ width: '100%', objectFit: 'contain', maxHeight: 300 }} />
                              <button onClick={() => { setSelectedImage(null); setImagePreview(null) }}
                                style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.75)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                ✕
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Footer — attaccato al bottom, SEMPRE visibile */}
                        <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', paddingBottom: 'max(10px, env(safe-area-inset-bottom))', background: 'var(--bg-primary)' }}>
                          <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, color: '#a1a1aa' }}>
                            <ImageIcon size={22} strokeWidth={1.5} />
                            <input type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
                          </label>
                          <CategorySelector value={newPostCategory} onChange={setNewPostCategory} />
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                            {newPostContent.length >= 400 && <span style={{ fontSize: 12, fontWeight: 600, color: newPostContent.length >= 490 ? '#f87171' : '#71717a' }}>{500 - newPostContent.length}</span>}
                            {newPostContent.length > 0 && <svg width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="10" fill="none" stroke="#27272a" strokeWidth="2.5" /><circle cx="13" cy="13" r="10" fill="none" stroke={newPostContent.length >= 490 ? '#f87171' : newPostContent.length >= 450 ? '#fb923c' : '#7c3aed'} strokeWidth="2.5" strokeDasharray={`${(newPostContent.length / 500) * 62.83} 62.83`} strokeLinecap="round" transform="rotate(-90 13 13)" /></svg>}
                          </div>
                        </div>
                      </div>,
                      document.body
                    )}
                  </>
                )}
              </>
            )}

            {/* Banner nuovi post — Instagram "Nuovi post" pill */}
            {newPostsCount > 0 && (
              <div className="sticky top-[52px] z-10 flex justify-center py-2">
                <button
                  onClick={handleShowNewPosts}
                  className="flex items-center gap-2 px-5 py-2 rounded-full text-[13px] font-semibold shadow-lg transition-all hover:scale-105 animate-bounce-in"
                  style={{
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    border: '0.5px solid var(--border)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                  }}
                >
                  <ArrowUp size={14} />
                  {newPostsCount === 1 ? '1 nuovo post' : `${newPostsCount} nuovi post`}
                </button>
              </div>
            )}

            {/* Filter tabs — Instagram: "Per te" / "Seguiti" stile tab */}
            {currentUser && (
              <div
                className="flex items-stretch mb-0 mt-1"

              >
                {(['all', 'following'] as const).map(filter => (
                  <button
                    key={filter}
                    data-testid={`filter-${filter}`}
                    onClick={() => handleFilterChange(filter)}
                    className={`flex-1 py-3 text-[14px] font-semibold transition-all relative ${feedFilter === filter ? 'text-violet-400' : 'text-[var(--text-muted)]'}`}
                  >
                    {filter === 'all' ? f.filterAll : f.filterFollowing}
                    {feedFilter === filter && (
                      <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-violet-500" />
                    )}
                  </button>
                ))}

                {/* Category filter button */}
                <div className="flex items-center pr-2">
                  <CategorySelector value={categoryFilter} onChange={setCategoryFilter} />
                </div>
              </div>
            )}

            {/* Post in evidenza — il badge "In evidenza" è già dentro la card */}
            {feedFilter === 'all' && !categoryFilter && pinnedPosts.length > 0 && (
              <div className="mb-5">
                <div className="flex flex-col gap-3 pt-5">
                  {pinnedPosts.map(post => (
                    <PostCard key={`pinned-${post.id}`} post={post} currentUser={currentUser}
                      isLiking={likingIds.has(post.id)} locale={locale}
                      onLike={toggleLikePinned} onOpenModal={setModalPostId}
                      onCategoryClick={handleCategoryClick}
                      onPostOptions={handlePostOptions} />
                  ))}
                </div>
                <div className="h-px bg-zinc-800 mt-5" />
              </div>
            )}

            {/* Feed posts — respiro tra le card */}
            <div className="flex flex-col gap-3 pt-3">
              {displayedPosts.length === 0 ? (
                <div className="text-center py-24 px-8">
                  <div className="w-16 h-16 rounded-full border-2 border-[var(--border)] flex items-center justify-center mx-auto mb-4">
                    <Sparkles size={28} className="text-violet-400" />
                  </div>
                  <p className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">
                    {categoryFilter
                      ? `Nessun post per "${parseCategoryString(categoryFilter)?.subcategory || categoryFilter}"`
                      : feedFilter === 'following' ? f.noFollowingTitle : f.emptyTitle}
                  </p>
                  <p className="text-[14px] text-[var(--text-secondary)]">
                    {categoryFilter
                      ? 'Sii il primo a pubblicare in questa categoria!'
                      : feedFilter === 'following' ? f.noFollowingHint : f.emptyHint}
                  </p>
                  {categoryFilter && (
                    <button onClick={() => setCategoryFilter('')}
                      className="mt-4 px-5 py-2 rounded-full text-[13px] font-semibold transition-all"
                      style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                      Rimuovi filtro
                    </button>
                  )}
                </div>
              ) : (
                displayedPosts.map((post, idx) => (
                  <VirtualPostCard key={post.id} index={idx} alwaysMounted={idx < 5}>
                    <PostCard post={post} currentUser={currentUser}
                      isLiking={likingIds.has(post.id)} locale={locale}
                      onLike={toggleLike} onOpenModal={setModalPostId}
                      onCategoryClick={handleCategoryClick}
                      onPostOptions={handlePostOptions} />
                  </VirtualPostCard>
                ))
              )}

              <div ref={sentinelRef} className="h-4" />

              {loadingMore && (
                <div className="flex justify-center py-8">
                  <Loader2 size={22} className="animate-spin text-violet-400" />
                </div>
              )}

              {!hasMore && posts.length > 0 && (
                <div className="text-center py-10 flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full border border-[var(--border)] flex items-center justify-center">
                    <PartyPopper size={20} className="text-violet-400" />
                  </div>
                  <p className="text-[13px] text-[var(--text-muted)]">Hai visto tutto!</p>
                </div>
              )}
            </div>
          </div>
          </div>

          {/* ── Sidebar destra — sticky, scorre col feed e si ferma a fondo contenuto ── */}
          <div className="hidden xl:block w-[420px] flex-shrink-0 self-stretch">
            <StickyFromBottom navHeight={64}>
              <FeedSidebar currentUserId={currentUser?.id ?? null} />
            </StickyFromBottom>
          </div>

        </div>
      </div>
      </PullWrapper>

      {/* FAB mobile — position:sticky segue il panel durante lo swipe
          a differenza di fixed che è relativo al viewport */}
      {currentUser && (
        <div
          className="md:hidden"
          style={{
            position: 'sticky',
            bottom: `calc(56px + env(safe-area-inset-bottom, 0px) + 16px)`,
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: '1rem',
            pointerEvents: 'none',
            zIndex: 90,
          }}
        >
          <button
            onClick={() => {
              scrollToTop('smooth')
              setTimeout(() => {
                const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder]')
                textarea?.focus()
              }, 400)
            }}
            aria-label="Crea nuovo post"
            style={{ pointerEvents: 'auto' }}
            className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-xl shadow-violet-500/40 flex items-center justify-center active:scale-95 transition-transform border border-violet-400/30"
          >
            <Plus size={26} className="text-white" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}