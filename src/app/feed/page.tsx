'use client'
// src/app/feed/page.tsx
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
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'
import {
  Heart, MessageCircle, Send, Sparkles, Image as ImageIcon, X,
  Loader2, Pin, ArrowUp, Trash2, Tag, ChevronDown, Filter, Search,
  Film, Tv, Gamepad2, BookOpen, Dices, Swords, Check, PartyPopper,
  Bell, ChevronRight, ArrowLeft, Flame
} from 'lucide-react'
import { SkeletonFeedPost } from '@/components/ui/SkeletonCard'
import { Avatar } from '@/components/ui/Avatar'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { formatDistanceToNow } from 'date-fns'
import { it } from 'date-fns/locale/it'
import { enUS } from 'date-fns/locale/en-US'
import { useLocale } from '@/lib/locale'
import { FeedSidebar } from '@/components/feed/FeedSidebar'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '@/components/ui/ErrorState'
import { PullWrapper } from '@/components/ui/PullWrapper'
import { ReportButton } from '@/components/ui/ReportButton'

// ── Macro-categorie ───────────────────────────────────────────────────────────

const MACRO_CATEGORIES = [
  'Film', 'Serie TV', 'Videogiochi', 'Anime', 'Manga', 'Board Game',
]

// ── Icone categoria (Lucide) ──────────────────────────────────────────────────
import type { LucideIcon } from 'lucide-react'

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  'Film': Film,
  'Serie TV': Tv,
  'Videogiochi': Gamepad2,
  'Anime': Swords,
  'Manga': BookOpen,
  'Board Game': Dices,
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
  'Board Game': ['Strategia', 'Party', 'Cooperativo', 'Deck Building'],
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
  category?: string | null
  profiles: {
    username: string
    display_name?: string
    avatar_url?: string
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

function CategoryBadge({ category, onClick }: { category: string | null | undefined; onClick?: () => void }) {
  if (!category) return null
  const parsed = parseCategoryString(category)
  if (!parsed) return null
  const label = parsed.subcategory ? `${parsed.category}: ${parsed.subcategory}` : parsed.category
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] font-semibold text-zinc-300 ${onClick ? 'cursor-pointer hover:border-fuchsia-500/60 hover:text-fuchsia-300 transition-colors' : ''}`}
    >
      <CategoryIcon category={parsed.category} size={10} />
      {label}
    </span>
  )
}

// ── API search per categoria ─────────────────────────────────────────────────

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
      const type = category === 'Anime' ? 'ANIME' : 'MANGA'
      const res = await fetch(`/api/anilist?search=${q}&type=${type}`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) { console.warn('[CategorySearch] AniList error:', res.status); return [] }
      const data = await res.json()
      const items = Array.isArray(data) ? data : (data.results || data.media || [])
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id || item.anilistId),
        title: item.title?.english || item.title?.romaji || item.title || '',
        subtitle: item.seasonYear ? String(item.seasonYear) : undefined,
        image: item.coverImage?.large || item.cover,
      })).filter((i: SearchResult) => i.title)
    }

    if (category === 'Board Game') {
      const res = await fetch(`/api/boardgames?q=${q}`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) { console.warn('[CategorySearch] BoardGame error:', res.status); return [] }
      const data = await res.json()
      const items = Array.isArray(data) ? data : (data.results || data.games || [])
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id || item.name),
        title: item.name || item.title || '',
        subtitle: item.year ? String(item.year) : item.yearPublished ? String(item.yearPublished) : undefined,
        image: item.image || item.cover,
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

  const API_CATEGORIES = new Set(['Film', 'Serie TV', 'Videogiochi', 'Anime', 'Manga', 'Board Game'])

  // Chiudi cliccando fuori
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
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
      setSuggestions(results); setIsSearching(false); setActiveSuggestion(-1)
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [subInput, selectedCat, step])

  const openDropup = () => { setOpen(true); setStep('macro') }
  const close = () => { setOpen(false); setSubInput(''); setSuggestions([]) }

  const selectMacro = (cat: string) => {
    setSelectedCat(cat); setSubInput(''); setSuggestions([]); onChange(cat); setStep('search')
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
          <span className="flex items-center gap-1 max-w-[160px] truncate">
            <CategoryIcon category={parsed?.category || ''} size={12} />
            {parsed?.subcategory ? `${parsed.category}: ${parsed.subcategory}` : parsed?.category}
            <X size={11} className="flex-shrink-0 ml-0.5" />
          </span>
        ) : (
          <span>Categoria</span>
        )}
      </button>

      {/* Dropup panel */}
      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 z-[300] bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl shadow-black/70 overflow-hidden"
          style={{ width: '300px', maxHeight: '60vh' }}
        >
          {/* Step 1: griglia macro-categorie */}
          {step === 'macro' && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Seleziona categoria</span>
                <button type="button" onClick={close} className="text-zinc-600 hover:text-zinc-400 transition-colors p-0.5"><X size={13} /></button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {MACRO_CATEGORIES.map(cat => (
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
          {step === 'search' && (
            <div className="p-3">
              {/* Header */}
              <div className="flex items-center gap-2 mb-2.5">
                <button type="button" onClick={() => { setStep('macro'); setSuggestions([]) }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all flex-shrink-0">
                  <ArrowLeft size={13} />
                </button>
                <CategoryIcon category={selectedCat} size={14} className="text-violet-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-white flex-1 truncate">{selectedCat}</span>
                <button type="button" onClick={close} className="text-zinc-600 hover:text-zinc-400 p-0.5"><X size={13} /></button>
              </div>

              {/* Input */}
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={subInput}
                  onChange={e => setSubInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={hasApiSupport ? searchPlaceholder : 'Titolo specifico...'}
                  className="no-nav-hide w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500/70 rounded-xl pl-8 pr-8 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none transition"
                />
                {isSearching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-400 animate-spin" />}
                {!isSearching && subInput && (
                  <button type="button" onClick={() => setSubInput('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Risultati */}
              {suggestions.length > 0 && (
                <div className="rounded-xl overflow-hidden border border-zinc-700/50 bg-zinc-950 max-h-[200px] overflow-y-auto">
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
              )}

              {/* Quick chips */}
              {!hasApiSupport && !subInput && (
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {(QUICK_SUBS[selectedCat] || []).map(sub => (
                    <button key={sub} type="button" onClick={() => { onChange(`${selectedCat}:${sub}`); close() }}
                      className="px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700/80 text-[11px] text-zinc-300 hover:border-violet-500/50 hover:text-violet-300 transition-all">
                      {sub}
                    </button>
                  ))}
                </div>
              )}

              {/* Usa testo libero */}
              {subInput.trim() && !isSearching && (
                <button type="button" onClick={() => { onChange(`${selectedCat}:${subInput.trim()}`); close() }}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600/15 border border-violet-500/30 text-violet-300 text-[13px] font-medium hover:bg-violet-600/25 transition">
                  <Check size={13} />
                  Usa <strong className="font-semibold">"{subInput.trim()}"</strong>
                </button>
              )}

              {hasApiSupport && subInput.length >= 2 && !isSearching && suggestions.length === 0 && (
                <p className="text-[12px] text-zinc-600 text-center py-2">Nessun risultato</p>
              )}

              {/* Usa solo macro */}
              <button type="button" onClick={() => { onChange(selectedCat); close() }}
                className="mt-2 w-full text-center text-[12px] text-zinc-600 hover:text-zinc-400 transition py-1">
                Usa solo "{selectedCat}" senza titolo
              </button>
            </div>
          )}
        </div>
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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleMacro = (cat: string) => {
    if (activeMacro === cat) {
      setActiveMacro('')
      setSubSearch('')
    } else {
      setActiveMacro(cat)
      setSubSearch('')
    }
  }

  const applyFilter = (val: string) => {
    onFilterChange(val)
    setOpen(false)
  }

  const parsed = parseCategoryString(activeFilter)
  const displayLabel = activeFilter
    ? (parsed?.subcategory ? `${parsed.category}: ${parsed.subcategory}` : parsed?.category || 'Filtra categoria')
    : 'Filtra categoria'

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold border transition-all ${
          activeFilter ? 'bg-fuchsia-600/20 border-fuchsia-500/40 text-fuchsia-300' : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white'
        }`}>
        <Filter size={14} />
        {activeFilter && <CategoryIcon category={parsed?.category || ''} size={13} />}
        {displayLabel}
        {activeFilter && (
          <span onClick={e => { e.stopPropagation(); applyFilter(''); setActiveMacro(''); setSubSearch('') }} className="ml-1 hover:text-red-400 transition-colors">
            <X size={12} />
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute top-auto sm:top-full left-0 right-0 sm:left-auto sm:right-auto bottom-0 sm:bottom-auto mt-0 sm:mt-2 z-50 bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-2xl shadow-2xl shadow-black/60 w-full sm:w-[300px] p-3 pb-6 sm:pb-3">
          <p className="text-[10px] text-zinc-500 font-semibold px-1 pb-2 uppercase tracking-wider">Filtra per categoria</p>

          {/* Macro chips */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {MACRO_CATEGORIES.map(cat => (
              <button key={cat} onClick={() => handleMacro(cat)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                  activeMacro === cat
                    ? 'bg-fuchsia-600/30 border-fuchsia-500/60 text-fuchsia-300'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                }`}>
                <CategoryIcon category={cat} size={11} />
                {cat}
              </button>
            ))}
          </div>

          {activeMacro && (
            <>
              {/* Applica solo macro */}
              <button onClick={() => applyFilter(activeMacro)}
                className="w-full text-left px-3 py-2 rounded-xl text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition mb-2">
                Tutti i post di <strong>{activeMacro}</strong>
              </button>

              {/* Ricerca titolo specifico */}
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  autoFocus
                  type="text"
                  value={subSearch}
                  onChange={e => setSubSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && subSearch.trim()) applyFilter(`${activeMacro}:${subSearch.trim()}`) }}
                  placeholder={`Cerca titolo in ${activeMacro}...`}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-fuchsia-500 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none transition"
                />
              </div>

              {subSearch.trim() && (
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

// ── PostCard ──────────────────────────────────────────────────────────────────

// ── Popup conferma eliminazione ───────────────────────────────────────────────
function ConfirmDialog({
  open, title, message, onConfirm, onCancel,
}: {
  open: boolean; title: string; message: string
  onConfirm: () => void; onCancel: () => void
}) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[300] bg-black/70 animate-in fade-in duration-150"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={onCancel}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-3xl w-full max-w-xs p-6 shadow-2xl animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 mx-auto mb-4">
          <Trash2 size={20} className="text-red-400" />
        </div>
        <h3 className="text-white font-bold text-center mb-1">{title}</h3>
        <p className="text-zinc-500 text-sm text-center mb-6">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm font-semibold transition">
            Annulla
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition">
            Elimina
          </button>
        </div>
      </div>
    </div>
  )
}

const PostCard = memo(function PostCard({
  post, currentUser, isLiking, commentingPostId, commentContent, locale,
  onLike, onToggleComment, onCommentChange, onAddComment, onDelete, onDeleteComment,
  expandedComments, onExpandComments, onCategoryClick,
}: {
  post: Post; currentUser: User | null; isLiking: boolean
  commentingPostId: string | null; commentContent: string; locale: string
  onLike: (id: string) => void; onToggleComment: (id: string) => void
  onCommentChange: (val: string) => void; onAddComment: (id: string) => void
  onDelete: (id: string) => void; onDeleteComment: (commentId: string, postId: string) => void
  expandedComments: Set<string>; onExpandComments: (id: string) => void
  onCategoryClick?: (category: string) => void
}) {
  const isCommenting = commentingPostId === post.id
  const isExpanded = expandedComments.has(post.id)
  const visibleComments = isExpanded ? post.comments : post.comments.slice(0, 3)
  const hiddenCount = post.comments.length - 3
  const [confirmPost, setConfirmPost] = useState(false)
  const [confirmComment, setConfirmComment] = useState<string | null>(null)

  return (
    <>
    <ConfirmDialog
      open={confirmPost}
      title="Eliminare il post?"
      message="Questa azione è irreversibile. Il post verrà rimosso definitivamente."
      onConfirm={() => { setConfirmPost(false); onDelete(post.id) }}
      onCancel={() => setConfirmPost(false)}
    />
    <ConfirmDialog
      open={!!confirmComment}
      title="Eliminare il commento?"
      message="Il commento verrà rimosso definitivamente."
      onConfirm={() => { if (confirmComment) { onDeleteComment(confirmComment, post.id); setConfirmComment(null) } }}
      onCancel={() => setConfirmComment(null)}
    />

    {/* Card Geekore — bordi arrotondati, contenuto sopra le azioni */}
    <div className={`bg-zinc-900 border rounded-2xl md:rounded-3xl overflow-hidden transition-all duration-300 animate-fade-in ${
      post.pinned ? 'border-violet-500/40 ring-1 ring-violet-500/20'
      : post.isDiscovery ? 'border-fuchsia-500/20 ring-1 ring-fuchsia-500/10'
      : 'border-zinc-800 hover:border-violet-500/25'
    }`}>

      {post.pinned && (
        <div className="flex items-center gap-1.5 px-5 pt-4 pb-0 text-violet-400">
          <Pin size={11} className="rotate-45" />
          <span className="text-[10px] font-bold uppercase tracking-widest">In evidenza</span>
        </div>
      )}
      {post.isDiscovery && !post.pinned && (
        <div className="flex items-center gap-1.5 px-5 pt-4 pb-0 text-fuchsia-400">
          <Sparkles size={11} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Consigliato per te</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <Link href={`/profile/${post.profiles.username}`} className="group shrink-0">
          <div className="w-10 h-10 rounded-2xl overflow-hidden ring-2 ring-violet-500/20 group-hover:ring-violet-500/50 transition-all">
            <Avatar src={post.profiles.avatar_url} username={post.profiles.username} displayName={post.profiles.display_name} size={40} className="rounded-2xl" />
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/profile/${post.profiles.username}`} className="hover:text-violet-400 transition-colors">
            <p className="font-semibold text-[var(--text-primary)] text-sm leading-tight truncate">
              {post.profiles.display_name || post.profiles.username}
            </p>
          </Link>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-xs text-[var(--text-muted)]">
              @{post.profiles.username} · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: locale === 'en' ? enUS : it })}
            </p>
            {post.category && (
              <CategoryBadge category={post.category} onClick={onCategoryClick ? () => onCategoryClick(post.category!) : undefined} />
            )}
          </div>
        </div>
        {currentUser?.id === post.user_id && (
          <button onClick={() => setConfirmPost(true)} className="p-2 rounded-xl text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-all">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Testo del post — prominente, ben separato */}
      <div className="px-5 pb-4">
        <p className="text-[var(--text-primary)] text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
      </div>

      {/* Immagine */}
      {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
        <div className="mx-4 mb-4 rounded-2xl overflow-hidden border border-zinc-800">
          <img src={post.image_url} alt={`Post di ${post.profiles.username}`}
            className="w-full max-h-[420px] object-cover hover:scale-[1.02] transition-transform duration-500"
            loading="lazy" />
        </div>
      )}

      {/* Azioni — Flame + MessageSquare, stile Geekore */}
      <div className="px-5 py-3.5 border-t border-zinc-800/60 flex items-center gap-5">
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
          onClick={() => onToggleComment(post.id)}
          aria-label={isCommenting ? 'Chiudi commenti' : 'Commenta'}
          className={`flex items-center gap-2 group transition-all ${isCommenting ? 'text-violet-400' : 'text-zinc-500 hover:text-violet-400'}`}
        >
          <div className={`p-1.5 rounded-xl transition-colors ${isCommenting ? 'bg-violet-500/15' : 'group-hover:bg-violet-500/10'}`}>
            <MessageCircle size={19} />
          </div>
          <span className="text-xs font-bold">{post.comments_count}</span>
        </button>

        {currentUser && currentUser.id !== post.user_id && (
          <div className="ml-auto">
            <ReportButton targetType="post" targetId={post.id} iconOnly />
          </div>
        )}
      </div>

      {/* Commenti — preview sempre visibile (max 2) con lo stesso stile dei commenti aperti */}
      {post.comments.length > 0 && !isCommenting && (
        <div className="px-5 pb-4 border-t border-zinc-800/40 pt-3 bg-black/10 space-y-2">
          {post.comments.slice(0, 2).map(comment => (
            <div key={comment.id} className="flex gap-2.5">
              <Link href={`/profile/${comment.username}`} className="w-7 h-7 rounded-xl overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-violet-500/50 transition-all mt-0.5">
                <Avatar src={undefined} username={comment.username || 'user'} displayName={comment.display_name} size={28} className="rounded-xl" />
              </Link>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3.5 py-2 flex-1 min-w-0">
                <Link href={`/profile/${comment.username}`} className="text-[10px] font-bold text-violet-400 uppercase tracking-wider hover:text-violet-300">
                  @{comment.username}
                </Link>
                <p className="text-zinc-300 text-xs mt-0.5 leading-snug">{comment.content}</p>
              </div>
            </div>
          ))}
          {post.comments.length > 2 && (
            <button onClick={() => onToggleComment(post.id)} className="text-xs text-zinc-500 hover:text-violet-400 transition-colors pl-9">
              +{post.comments.length - 2} {post.comments.length - 2 === 1 ? 'altro commento' : 'altri commenti'}
            </button>
          )}
        </div>
      )}

      {/* Commenti */}
      {isCommenting && (
        <div className="px-5 pb-5 border-t border-zinc-800/60 pt-4 bg-black/20">
          {post.comments.length > 0 && (
            <div className="space-y-3 mb-4 max-h-56 overflow-y-auto">
              {visibleComments.map(comment => (
                <div key={comment.id} className="flex gap-3">
                  <Link href={`/profile/${comment.username}`} className="w-7 h-7 rounded-xl overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-violet-500/50 transition-all">
                    <Avatar src={undefined} username={comment.username || 'user'} displayName={comment.display_name} size={28} className="rounded-xl" />
                  </Link>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/profile/${comment.username}`} className="text-[10px] font-bold text-violet-400 uppercase tracking-wider hover:text-violet-300">
                        @{comment.username}
                      </Link>
                      {currentUser?.id === comment.user_id && (
                        <button onClick={() => setConfirmComment(comment.id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                    <p className="text-zinc-300 text-xs mt-0.5">{comment.content}</p>
                  </div>
                </div>
              ))}
              {!isExpanded && hiddenCount > 0 && (
                <button onClick={() => onExpandComments(post.id)} className="text-xs text-zinc-500 hover:text-violet-400 transition-colors">
                  +{hiddenCount} {hiddenCount === 1 ? 'altro commento' : 'altri commenti'}
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <input type="text" value={commentContent} onChange={e => onCommentChange(e.target.value.slice(0, 500))}
              placeholder="Scrivi un commento..." maxLength={500}
              className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none transition"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAddComment(post.id) } }} />
            <button onClick={() => onAddComment(post.id)} className="bg-violet-600 hover:bg-violet-500 px-4 rounded-2xl transition">
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  )
})

// ── Pagina principale ────────────────────────────────────────────────────────

export default function FeedPage() {
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
  const [commentContent, setCommentContent] = useState('')
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null)
  const [feedFilter, setFeedFilter] = useState<'all' | 'following'>('all')
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set())
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [newPostsCount, setNewPostsCount] = useState(0)
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [modalPos, setModalPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  const scrollPositionRef = useRef(0)

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

  useEffect(() => {
    const channel = supabase.channel('public:posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
        const newId = payload.new?.id
        if (!newId || newId === latestPostIdRef.current) return
        setNewPostsCount(prev => prev + 1)
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  useEffect(() => {
    if (posts.length > 0) latestPostIdRef.current = posts[0].id
  }, [posts])

  const handleShowNewPosts = async () => {
    if (!currentUser) return
    setNewPostsCount(0); pageRef.current = 0; setPage(0); setHasMore(true)
    await loadPosts(currentUser.id, 0, false, feedFilter)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const loadPinnedPosts = useCallback(async (userId: string) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase.from('posts')
      .select('id, user_id, content, image_url, created_at, category, likes (id, user_id), comments (id, content, created_at, user_id)')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(50)
    if (error || !data) return
    const uids1 = [...new Set(data.map((p: any) => p.user_id))]
    const { data: profiles1 } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', uids1)
    const pm1: Record<string, any> = {}; (profiles1 || []).forEach((p: any) => { pm1[p.id] = p })
    const commentUids1 = [...new Set(data.flatMap((p: any) => (p.comments || []).map((c: any) => c.user_id)))]
    const { data: cProfiles1 } = commentUids1.length ? await supabase.from('profiles').select('id, username, display_name').in('id', commentUids1) : { data: [] }
    const cpm1: Record<string, any> = {}; (cProfiles1 || []).forEach((p: any) => { cpm1[p.id] = p })
    const dataWithProfiles = data.map((p: any) => ({
      ...p,
      profiles: pm1[p.user_id] || { username: '', display_name: null, avatar_url: null },
      comments: (p.comments || []).map((c: any) => ({ ...c, profiles: cpm1[c.user_id] || { username: 'utente', display_name: null } }))
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
        })),
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
    const { data: discProfiles } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', discUids)
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
        image_url: post.image_url, created_at: post.created_at, category: post.category,
        profiles: { username: profile?.username || '', display_name: profile?.display_name, avatar_url: profile?.avatar_url },
        likes_count: likes.length, liked_by_user: likes.some((l: any) => l.user_id === userId),
        comments_count: 0, comments: [], isDiscovery: true,
      }
    })
  }, [supabase])

  const loadPosts = useCallback(async (userId: string, pageIndex = 0, append = false, filter: 'all' | 'following' = 'all') => {
    if (append) setLoadingMore(true); else setLoading(true)
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
      .select('id, user_id, content, image_url, created_at, category, likes (id, user_id), comments (id, content, created_at, user_id)')
      .order('created_at', { ascending: false }).range(from, to)
    if (filter === 'following' && followingIds.length > 0) query = query.in('user_id', followingIds)

    const { data: rawPosts } = await query
    const postUids = [...new Set((rawPosts || []).map((p: any) => p.user_id))]
    const { data: postProfiles } = postUids.length ? await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', postUids) : { data: [] }
    const postPm: Record<string, any> = {}; (postProfiles || []).forEach((p: any) => { postPm[p.id] = p })
    const commentUids = [...new Set((rawPosts || []).flatMap((p: any) => (p.comments || []).map((c: any) => c.user_id)))]
    const { data: commentProfs } = commentUids.length ? await supabase.from('profiles').select('id, username, display_name').in('id', commentUids) : { data: [] }
    const commentPm: Record<string, any> = {}; (commentProfs || []).forEach((p: any) => { commentPm[p.id] = p })
    const postsData = (rawPosts || []).map((p: any) => ({
      ...p,
      profiles: postPm[p.user_id] || { username: '', display_name: null, avatar_url: null },
      comments: (p.comments || []).map((c: any) => ({ ...c, profiles: commentPm[c.user_id] || { username: 'utente', display_name: null } }))
    }))

    const formatted: Post[] = (postsData || []).map((post: any) => {
      const likes = post.likes || []
      const profile = post.profiles
      return {
        id: post.id, user_id: post.user_id, content: post.content,
        image_url: post.image_url, created_at: post.created_at, category: post.category,
        profiles: { username: profile?.username || '', display_name: profile?.display_name, avatar_url: profile?.avatar_url },
        likes_count: likes.length, liked_by_user: likes.some((l: any) => l.user_id === userId),
        comments_count: (post.comments || []).length,
        comments: (post.comments || []).map((c: any) => ({
          id: c.id, content: c.content, created_at: c.created_at, user_id: c.user_id,
          username: c.profiles?.username || 'utente',
          display_name: c.profiles?.display_name,
        })),
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
      setLoading(false)
    }
    setHasMore(newHasMore)
  }, [supabase, pinnedPosts, getUserTopCategory, loadDiscoveryPosts])

  const openComposer = () => {
    scrollPositionRef.current = window.scrollY
    document.body.style.overflow = 'hidden'
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (vw >= 640) {
      const modalW = Math.min(548, vw - 48)
      const top = 40  // vicino alla navbar
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
    setComposerOpen(true)
  }

  const closeComposer = () => {
    document.body.style.overflow = ''
    setComposerOpen(false)
    setNewPostContent('')
    setNewPostCategory('')
    setSelectedImage(null)
    setImagePreview(null)
  }

  // Pull-to-refresh su mobile
  const handlePullRefresh = async () => {
    if (!currentUser) return
    invalidateCache(feedFilter)
    await loadPosts(currentUser.id, 0, false, feedFilter)
  }
  const { distance: pullDistance, refreshing: isPullRefreshing } = usePullToRefresh({ onRefresh: handlePullRefresh })

  const handleFilterChange = async (filter: 'all' | 'following') => {
    if (!currentUser) return
    setFeedFilter(filter); pageRef.current = 0; setPage(0); setHasMore(true)
    await loadPosts(currentUser.id, 0, false, filter)
  }

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((!newPostContent.trim() && !selectedImage) || !currentUser || isPublishing) return
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
      .insert({ user_id: currentUser.id, content: newPostContent.trim(), image_url: imageUrl, category: newPostCategory || null })
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
    setPosts(prev => prev.map((p, i) => i === postIndex ? { ...p, likes_count: willLike ? p.likes_count + 1 : p.likes_count - 1, liked_by_user: willLike } : p))
    if (willLike) await supabase.from('likes').insert({ post_id: postId, user_id: currentUser.id })
    else await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
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
    }
    setPinnedPosts(prev => prev.map((p, i) => i === postIndex ? { ...p, likes_count: willLike ? p.likes_count + 1 : p.likes_count - 1, liked_by_user: willLike } : p))
    if (willLike) await supabase.from('likes').insert({ post_id: postId, user_id: currentUser.id })
    else await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', currentUser.id)
  }, [currentUser, pinnedPosts, supabase])

  const handleAddComment = useCallback(async (postId: string) => {
    if (!commentContent.trim() || !currentUser) return
    haptic(30)
    const post = posts.find(p => p.id === postId)
    if (post?.category) trackAffinity(supabase, currentUser.id, post.category)
    const newCommentTemp: Comment = {
      id: 'temp-' + Date.now(), content: commentContent.trim(),
      created_at: new Date().toISOString(), user_id: currentUser.id,
      username: currentProfile?.username || 'utente', display_name: currentProfile?.display_name,
    }
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: p.comments_count + 1, comments: [newCommentTemp, ...p.comments] } : p))
    await supabase.from('comments').insert({ post_id: postId, user_id: currentUser.id, content: commentContent.trim() })
    setCommentContent(''); setCommentingPostId(null)
  }, [commentContent, currentUser, currentProfile, posts, supabase])

  const handleToggleComment = useCallback((postId: string) => {
    setCommentingPostId(prev => prev === postId ? null : postId); setCommentContent('')
  }, [])

  const handleExpandComments = useCallback((postId: string) => {
    setExpandedComments(prev => new Set([...prev, postId]))
  }, [])

  const handleDeleteComment = useCallback(async (commentId: string, postId: string) => {
    if (!currentUser) return
    await supabase.from('comments').delete().eq('id', commentId)
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

  // Filtro client-side: supporta sia "Film" (solo macro) che "Film:Forrest Gump" (match esatto sottocategoria)
  const displayedPosts = categoryFilter
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

  // Click su un badge categoria in un post → attiva il filtro per quella categoria
  const handleCategoryClick = useCallback((category: string) => {
    setCategoryFilter(prev => prev === category ? '' : category)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
        <div className="max-w-screen-2xl mx-auto pt-4 pb-20">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonFeedPost key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <PullToRefreshIndicator distance={pullDistance} refreshing={isPullRefreshing} />
      <PullWrapper distance={pullDistance} refreshing={isPullRefreshing}>
      {/* Layout: full-bleed su mobile, due colonne su desktop */}
      <div className="pt-0 pb-24 max-w-screen-2xl mx-auto px-0 sm:px-4 md:px-6">
        <div className="flex gap-8 items-start min-h-screen">

          {/* ── Colonna principale ─────────────────────────────────── */}
          <div className="flex-1 min-w-0">

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
                    <div className="fixed inset-0 z-[250] bg-black/70 backdrop-blur-sm" onClick={closeComposer} />
                    <div
                      className={modalPos
                        ? "fixed z-[260] flex flex-col rounded-2xl shadow-2xl shadow-black/70 border border-zinc-700/60 overflow-hidden"
                        : "fixed z-[260] flex flex-col inset-0"}
                      style={modalPos ? {
                        top: modalPos.top,
                        left: modalPos.left,
                        width: modalPos.width,
                        maxHeight: modalPos.maxHeight,
                        background: 'var(--bg-primary)',
                      } : {
                        background: 'var(--bg-primary)',
                        paddingTop: 'env(safe-area-inset-top)',
                        paddingBottom: 'env(safe-area-inset-bottom)',
                      }}
                      onClick={e => e.stopPropagation()}
                    >
                      {/* ── Header ── */}
                      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 flex-shrink-0">
                        <button onClick={closeComposer} className="text-[14px] font-medium text-zinc-400 hover:text-white transition-colors">
                          Annulla
                        </button>
                        <span className="text-[16px] font-bold text-white tracking-tight">Nuovo post</span>
                        <button
                          onClick={async (e) => { await handleCreatePost(e as any); closeComposer() }}
                          disabled={isPublishing || (!newPostContent.trim() && !selectedImage)}
                          className="px-5 py-2 rounded-full text-[13px] font-bold disabled:opacity-30 transition-all"
                          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 50%, #db2777 100%)', color: 'white', boxShadow: '0 2px 16px rgba(124,58,237,0.45)' }}
                        >
                          {isPublishing ? <Loader2 size={14} className="animate-spin" /> : 'Pubblica'}
                        </button>
                      </div>

                      {/* ── Body: cresce con il contenuto, scorre se supera maxHeight ── */}
                      <div className="overflow-y-auto">

                        {/* Avatar + nome + textarea */}
                        <div className="flex gap-3 px-5 pt-5 pb-3">
                          <div className="flex-shrink-0">
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 ring-2 ring-zinc-700/50">
                              {currentProfile?.avatar_url ? (
                                <img src={currentProfile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center text-white font-bold text-sm">
                                  {(currentProfile?.username?.[0] || '?').toUpperCase()}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-bold text-white mb-1.5 leading-none">{currentProfile?.display_name || currentProfile?.username}</p>
                            <textarea
                              data-testid="post-composer"
                              autoFocus
                              value={newPostContent}
                              onChange={e => {
                                setNewPostContent(e.target.value.slice(0, 500))
                                const el = e.target
                                el.style.height = 'auto'
                                el.style.height = el.scrollHeight + 'px'
                              }}
                              placeholder={f.placeholder}
                              maxLength={500}
                              rows={3}
                              className="no-nav-hide w-full bg-transparent text-[16px] text-white placeholder-zinc-500 outline-none resize-none leading-relaxed"
                              style={{ minHeight: '80px' }}
                            />
                          </div>
                        </div>

                        {/* Immagine: piena larghezza, sotto il testo, come Facebook */}
                        {imagePreview && (
                          <div className="relative bg-zinc-950 border-t border-b border-zinc-800/60">
                            <img src={imagePreview} alt="preview" className="w-full object-contain" style={{ maxHeight: '400px' }} />
                            <button type="button" onClick={() => { setSelectedImage(null); setImagePreview(null) }}
                              className="absolute top-3 right-3 w-8 h-8 bg-black/75 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors shadow-lg">
                              <X size={14} />
                            </button>
                          </div>
                        )}

                      </div>

                      {/* ── Footer ── */}
                      <div
                        className="flex-shrink-0 border-t border-zinc-800/80 px-5 flex items-center gap-2.5 h-[56px] relative"
                        style={{ background: 'var(--bg-primary)', paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
                      >
                        {/* Foto */}
                        <label className="cursor-pointer w-9 h-9 flex items-center justify-center rounded-xl text-zinc-400 hover:text-violet-400 hover:bg-zinc-800 transition-all select-none" title="Aggiungi foto">
                          <ImageIcon size={21} strokeWidth={1.6} />
                          <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                        </label>

                        {/* Tag dropup */}
                        <CategorySelector value={newPostCategory} onChange={setNewPostCategory} />

                        {/* Contatore */}
                        <div className="ml-auto flex items-center gap-2.5">
                          {newPostContent.length >= 400 && (
                            <span className={`text-[12px] font-semibold tabular-nums ${newPostContent.length >= 490 ? 'text-red-400' : 'text-zinc-500'}`}>
                              {500 - newPostContent.length}
                            </span>
                          )}
                          {newPostContent.length > 0 && (
                            <svg width="24" height="24" viewBox="0 0 24 24">
                              <circle cx="12" cy="12" r="9" fill="none" stroke="#27272a" strokeWidth="2.5" />
                              <circle cx="12" cy="12" r="9" fill="none"
                                stroke={newPostContent.length >= 490 ? '#f87171' : newPostContent.length >= 450 ? '#fb923c' : '#7c3aed'}
                                strokeWidth="2.5"
                                strokeDasharray={`${(newPostContent.length / 500) * 56.55} 56.55`}
                                strokeLinecap="round"
                                transform="rotate(-90 12 12)"
                              />
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
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
                style={{ borderBottom: '0.5px solid var(--border)', borderTop: '0.5px solid var(--border)' }}
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
                  <CategoryFilter activeFilter={categoryFilter} onFilterChange={setCategoryFilter} />
                </div>
              </div>
            )}

            {/* Post in evidenza — il badge "In evidenza" è già dentro la card */}
            {feedFilter === 'all' && !categoryFilter && pinnedPosts.length > 0 && (
              <div className="mb-5">
                <div className="space-y-4">
                  {pinnedPosts.map(post => (
                    <PostCard key={`pinned-${post.id}`} post={post} currentUser={currentUser}
                      isLiking={likingIds.has(post.id)} commentingPostId={commentingPostId}
                      commentContent={commentContent} locale={locale}
                      onLike={toggleLikePinned} onToggleComment={handleToggleComment}
                      onCommentChange={setCommentContent} onAddComment={handleAddComment}
                      onDelete={handleDeletePost} onDeleteComment={handleDeleteComment}
                      expandedComments={expandedComments} onExpandComments={handleExpandComments}
                      onCategoryClick={handleCategoryClick} />
                  ))}
                </div>
                <div className="h-px bg-zinc-800 mt-5" />
              </div>
            )}

            {/* Feed posts — respiro tra le card */}
            <div className="space-y-5 md:space-y-7">
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
                displayedPosts.map(post => (
                  <PostCard key={post.id} post={post} currentUser={currentUser}
                    isLiking={likingIds.has(post.id)} commentingPostId={commentingPostId}
                    commentContent={commentContent} locale={locale}
                    onLike={toggleLike} onToggleComment={handleToggleComment}
                    onCommentChange={setCommentContent} onAddComment={handleAddComment}
                    onDelete={handleDeletePost} onDeleteComment={handleDeleteComment}
                    expandedComments={expandedComments} onExpandComments={handleExpandComments}
                    onCategoryClick={handleCategoryClick} />
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

          {/* ── Sidebar desktop ─────────────────────────────────────── */}
          <div className="hidden lg:block w-80 flex-shrink-0 sticky top-16">
            <FeedSidebar currentUserId={currentUser?.id ?? null} />
          </div>

        </div>
      </div>
      </PullWrapper>
    </div>
  )
}