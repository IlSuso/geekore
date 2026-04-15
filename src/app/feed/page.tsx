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
  Bell, ChevronRight, ArrowLeft
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
      if (!res.ok) return []
      const data = await res.json()
      return (data || []).slice(0, 8).map((item: any) => ({
        id: String(item.id || item.tmdbId || item.title),
        title: item.title || item.name || '',
        subtitle: item.year ? String(item.year) : item.releaseDate?.slice(0, 4),
        image: item.poster || item.cover,
      }))
    }

    if (category === 'Serie TV') {
      const res = await fetch(`/api/tmdb?q=${q}&type=tv`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const data = await res.json()
      return (data || []).slice(0, 8).map((item: any) => ({
        id: String(item.id || item.tmdbId || item.title),
        title: item.title || item.name || '',
        subtitle: item.year ? String(item.year) : item.releaseDate?.slice(0, 4),
        image: item.poster || item.cover,
      }))
    }

    if (category === 'Videogiochi') {
      const res = await fetch(`/api/igdb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: query.trim(), limit: 8 }),
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return []
      const data = await res.json()
      const items = Array.isArray(data) ? data : (data.results || data.games || [])
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id || item.name),
        title: item.name || item.title || '',
        subtitle: item.first_release_date ? new Date(item.first_release_date * 1000).getFullYear().toString()
          : item.year ? String(item.year) : undefined,
        image: item.cover?.url ? `https:${item.cover.url.replace('t_thumb', 't_cover_small')}` : item.cover,
      }))
    }

    if (category === 'Anime' || category === 'Manga') {
      const type = category === 'Anime' ? 'ANIME' : 'MANGA'
      const res = await fetch(`/api/anilist?search=${q}&type=${type}`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const data = await res.json()
      const items = Array.isArray(data) ? data : (data.results || data.media || [])
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id || item.anilistId),
        title: item.title?.english || item.title?.romaji || item.title || '',
        subtitle: item.seasonYear ? String(item.seasonYear) : undefined,
        image: item.coverImage?.large || item.cover,
      }))
    }

    if (category === 'Board Game') {
      const res = await fetch(`/api/boardgames?q=${q}`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return []
      const data = await res.json()
      const items = Array.isArray(data) ? data : (data.results || data.games || [])
      return items.slice(0, 8).map((item: any) => ({
        id: String(item.id || item.name),
        title: item.name || item.title || '',
        subtitle: item.year ? String(item.year) : item.yearPublished ? String(item.yearPublished) : undefined,
        image: item.image || item.cover,
      }))
    }

  } catch {}
  return []
}

// ── Selettore categoria (composer) con autocomplete API ──────────────────────
// Step 1: scegli macro-categoria
// Step 2: digita → autocomplete live via API → clicca per selezionare

function CategorySelector({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [open, setOpen] = useState(false)
  const [selectedCat, setSelectedCat] = useState('')
  const [subInput, setSubInput] = useState('')
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Categorie con API support
  const API_CATEGORIES = new Set(['Film', 'Serie TV', 'Videogiochi', 'Anime', 'Manga', 'Board Game'])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (open && selectedCat) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open, selectedCat])

  // Debounced search
  useEffect(() => {
    if (!selectedCat || !API_CATEGORIES.has(selectedCat)) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!subInput.trim() || subInput.trim().length < 2) {
      setSuggestions([]); setIsSearching(false); return
    }
    setIsSearching(true)
    debounceRef.current = setTimeout(async () => {
      const results = await searchByCategory(selectedCat, subInput)
      setSuggestions(results)
      setIsSearching(false)
      setActiveSuggestion(-1)
    }, 320)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [subInput, selectedCat])

  const handleSelectMacro = (cat: string) => {
    setSelectedCat(cat); setSubInput(''); setSuggestions([]); onChange(cat)
  }

  const handleSelectSuggestion = (result: SearchResult) => {
    setSubInput(result.title)
    onChange(`${selectedCat}:${result.title}`)
    setSuggestions([])
    setOpen(false)
  }

  const handleClear = () => {
    setSelectedCat(''); setSubInput(''); setSuggestions([]); onChange(''); setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeSuggestion >= 0) handleSelectSuggestion(suggestions[activeSuggestion])
    }
    else if (e.key === 'Escape') { setSuggestions([]); setActiveSuggestion(-1) }
  }

  const parsed = parseCategoryString(value)
  const displayLabel = parsed?.subcategory
    ? `${parsed.category}: ${parsed.subcategory}`
    : parsed?.category || 'Aggiungi categoria'

  const hasApiSupport = API_CATEGORIES.has(selectedCat)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
          value
            ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
            : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600'
        }`}
      >
        <Tag size={12} />
        {value && <CategoryIcon category={parsed?.category || ''} size={11} />}
        {displayLabel}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {value && (
          <span onClick={e => { e.stopPropagation(); handleClear() }} className="ml-1 text-zinc-400 hover:text-red-400 transition-colors">
            <X size={11} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-2 left-0 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
          style={{ minWidth: selectedCat ? 320 : 280 }}>
          <div className="p-3">
            {!selectedCat ? (
              <>
                <p className="text-[10px] text-zinc-500 font-semibold px-1 pb-2 uppercase tracking-wider">Scegli categoria</p>
                <div className="grid grid-cols-2 gap-1">
                  {MACRO_CATEGORIES.map(cat => (
                    <button key={cat} type="button" onClick={() => handleSelectMacro(cat)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all text-left group">
                      <CategoryIcon category={cat} size={14} className="text-zinc-500 group-hover:text-violet-400 transition-colors" />
                      <span className="flex-1">{cat}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3 pb-2.5 border-b border-zinc-800">
                  <button type="button" onClick={() => { setSelectedCat(''); setSuggestions([]) }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all">
                    <ArrowLeft size={14} />
                  </button>
                  <CategoryIcon category={selectedCat} size={15} className="text-violet-400" />
                  <p className="text-sm font-semibold text-white flex-1">{selectedCat}</p>
                </div>

                {/* Input ricerca */}
                <div className="relative mb-1">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={subInput}
                    onChange={e => setSubInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={hasApiSupport
                      ? `Cerca ${selectedCat === 'Film' ? 'un film...' : selectedCat === 'Serie TV' ? 'una serie...' : selectedCat === 'Videogiochi' ? 'un videogioco...' : selectedCat === 'Anime' ? 'un anime...' : selectedCat === 'Manga' ? 'un manga...' : 'un titolo...'}`
                      : `titolo specifico...`}
                    className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-xl pl-8 pr-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none transition"
                  />
                  {isSearching && (
                    <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-400 animate-spin" />
                  )}
                </div>

                {/* Suggerimenti API */}
                {suggestions.length > 0 && (
                  <div className="mt-1 rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-950 max-h-[260px] overflow-y-auto">
                    {suggestions.map((result, idx) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => handleSelectSuggestion(result)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors border-b border-zinc-800/60 last:border-0 ${
                          idx === activeSuggestion ? 'bg-violet-600/20 text-white' : 'hover:bg-zinc-800 text-zinc-200'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{result.title}</p>
                          {result.subtitle && <p className="text-[11px] text-zinc-500">{result.subtitle}</p>}
                        </div>
                        <ChevronDown size={12} className="text-zinc-600 -rotate-90 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {/* Stato vuoto o hint */}
                {!hasApiSupport && !suggestions.length && (
                  <>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(QUICK_SUBS[selectedCat] || []).map(sub => (
                        <button key={sub} type="button"
                          onClick={() => { onChange(`${selectedCat}:${sub}`); setOpen(false) }}
                          className="px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:border-violet-500/60 hover:text-violet-300 transition-all">
                          {sub}
                        </button>
                      ))}
                    </div>
                    {subInput.trim() && (
                      <button type="button"
                        onClick={() => { onChange(`${selectedCat}:${subInput.trim()}`); setOpen(false) }}
                        className="mt-2 w-full px-3 py-2.5 rounded-xl bg-violet-600/20 border border-violet-500/50 text-violet-200 text-sm font-semibold hover:bg-violet-600/30 hover:border-violet-500 transition flex items-center justify-center gap-1.5">
                        <Check size={13} /> Usa <span className="font-bold">«{subInput.trim()}»</span>
                      </button>
                    )}
                  </>
                )}

                {hasApiSupport && subInput.trim().length >= 2 && !isSearching && suggestions.length === 0 && (
                  <p className="text-xs text-zinc-600 text-center py-3">Nessun risultato trovato</p>
                )}

                {hasApiSupport && subInput.trim().length < 2 && !suggestions.length && (
                  <p className="text-[11px] text-zinc-600 text-center py-2">
                    Digita almeno 2 caratteri per cercare
                  </p>
                )}

                <button type="button" onClick={() => { onChange(selectedCat); setOpen(false) }}
                  className="mt-3 w-full text-center text-sm text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 hover:border-zinc-500 rounded-xl py-2 font-medium transition-all flex items-center justify-center gap-1.5">
                  Usa solo <span className="text-violet-300 font-semibold">«{selectedCat}»</span> senza titolo
                  <ChevronRight size={13} className="text-zinc-500" />
                </button>
              </>
            )}
          </div>
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
        <div className="absolute top-full mt-2 left-0 z-50 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl shadow-black/60 w-[300px] p-3">
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl w-full max-w-xs p-6 shadow-2xl animate-in zoom-in-95 duration-150">
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
    <div className={`bg-zinc-950 border rounded-2xl md:rounded-3xl p-4 md:p-6 transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${
      post.pinned ? 'border-violet-500/40 ring-1 ring-violet-500/20'
      : post.isDiscovery ? 'border-fuchsia-500/30 ring-1 ring-fuchsia-500/10'
      : 'border-zinc-800'
    }`}>

      {post.pinned && (
        <div className="flex items-center gap-1.5 mb-4 text-violet-400">
          <Pin size={12} className="rotate-45" />
          <span className="text-[10px] font-bold uppercase tracking-widest">In evidenza</span>
        </div>
      )}

      {post.isDiscovery && !post.pinned && (
        <div className="flex items-center gap-1.5 mb-4 text-fuchsia-400">
          <Sparkles size={12} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Consigliato per te</span>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <Link href={`/profile/${post.profiles.username}`} className="w-11 h-11 rounded-2xl overflow-hidden ring-2 ring-violet-500/20 hover:ring-violet-500/50 transition-all flex-shrink-0">
          <Avatar src={post.profiles.avatar_url} username={post.profiles.username} displayName={post.profiles.display_name} size={44} className="rounded-2xl" />
        </Link>
        <div className="flex-1">
          <Link href={`/profile/${post.profiles.username}`} className="hover:text-violet-400 transition-colors">
            <p className="font-bold text-white">{post.profiles.display_name || post.profiles.username}</p>
          </Link>
          <p className="text-xs text-zinc-500">
            @{post.profiles.username} · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: locale === 'en' ? enUS : it })}
          </p>
        </div>
        {currentUser && currentUser.id === post.user_id && (
          <button onClick={() => setConfirmPost(true)} className="p-2 rounded-xl text-zinc-600 hover:text-red-400 hover:bg-red-400/10 transition-all" title="Elimina post">
            <Trash2 size={15} />
          </button>
        )}
      </div>

      {post.category && (
        <div className="mb-3">
          <CategoryBadge
            category={post.category}
            onClick={onCategoryClick ? () => onCategoryClick(post.category!) : undefined}
          />
        </div>
      )}

      <p className="text-[16px] leading-relaxed mb-5 whitespace-pre-wrap text-zinc-100">{post.content}</p>

      {post.image_url && post.image_url !== 'NULL' && post.image_url !== 'null' && (
        <div className="mb-5 rounded-2xl overflow-hidden border border-zinc-700">
          <img src={post.image_url} alt="post" className="w-full max-h-[400px] object-contain bg-black" loading="lazy" />
        </div>
      )}

      <div className="flex gap-5 md:gap-8 border-t border-zinc-800 pt-4 md:pt-5 text-zinc-400">
        <button onClick={() => onLike(post.id)} className={`flex items-center gap-2 transition-all ${post.liked_by_user ? 'text-red-500' : 'hover:text-red-400'}`}>
          <Heart size={22} fill={post.liked_by_user ? 'currentColor' : 'none'} className={isLiking ? 'animate-heart-burst' : ''} />
          <span className="text-sm font-medium">{post.likes_count}</span>
        </button>
        <button onClick={() => onToggleComment(post.id)} className={`flex items-center gap-2 transition-all ${isCommenting ? 'text-violet-400' : 'hover:text-violet-400'}`}>
          <MessageCircle size={22} />
          <span className="text-sm font-medium">{post.comments_count}</span>
        </button>
      </div>

      {isCommenting && (
        <div className="mt-4 flex flex-col gap-1">
          <div className="flex gap-2">
            <input type="text" value={commentContent} onChange={e => onCommentChange(e.target.value.slice(0, 500))}
              placeholder="Scrivi un commento..." maxLength={500}
              className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-2xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none transition"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAddComment(post.id) } }} />
            <button onClick={() => onAddComment(post.id)} className="bg-violet-600 hover:bg-violet-500 px-4 rounded-2xl transition"><Send size={16} /></button>
          </div>
          {commentContent.length > 400 && (
            <div className={`text-right text-xs pr-14 ${commentContent.length >= 480 ? 'text-orange-400' : 'text-zinc-600'}`}>{commentContent.length}/500</div>
          )}
        </div>
      )}

      {post.comments.length > 0 && (
        <div className="mt-4 pl-3 border-l-2 border-zinc-800 space-y-3 text-sm">
          {visibleComments.map(comment => (
            <div key={comment.id} className="flex items-start justify-between gap-2 group">
              <div>
                <Link href={`/profile/${comment.username}`} className="font-semibold text-violet-400 hover:text-violet-300 transition-colors">@{comment.username}</Link>
                <span className="ml-2 text-zinc-300">{comment.content}</span>
              </div>
              {currentUser && currentUser.id === comment.user_id && (
                <button onClick={() => setConfirmComment(comment.id)} className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"><Trash2 size={11} /></button>
              )}
            </div>
          ))}
          {!isExpanded && hiddenCount > 0 && (
            <button onClick={() => onExpandComments(post.id)} className="text-xs text-zinc-500 hover:text-violet-400 transition-colors">
              +{hiddenCount} {hiddenCount === 1 ? 'altro commento' : 'altri commenti'}
            </button>
          )}
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
      <div className="min-h-screen bg-black text-white">
        <div className="pt-8 pb-20 max-w-screen-2xl mx-auto px-6 space-y-8">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonFeedPost key={i} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <PullToRefreshIndicator distance={pullDistance} refreshing={isPullRefreshing} />
      <PullWrapper distance={pullDistance} refreshing={isPullRefreshing}>
      <div className="pt-2 md:pt-8 pb-24 md:pb-20 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6">
        <div className="flex gap-8 items-start min-h-screen">

          {/* ── Colonna principale ─────────────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* Composer */}
            {currentUser && (
              <div className="mb-4 md:mb-8 bg-zinc-950 border border-zinc-800 rounded-2xl md:rounded-3xl p-3 md:p-6">
                <form onSubmit={handleCreatePost}>
                  <textarea
                    data-testid="post-composer"
                    value={newPostContent}
                    onChange={e => setNewPostContent(e.target.value.slice(0, 500))}
                    placeholder={f.placeholder}
                    maxLength={500}
                    className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 rounded-2xl p-3 md:p-5 text-sm md:text-base min-h-[80px] md:min-h-[120px] resize-none focus:outline-none transition-colors"
                  />
                  <div className={`text-right text-xs mt-1 ${newPostContent.length >= 480 ? 'text-orange-400' : 'text-zinc-600'}`}>
                    {newPostContent.length}/500
                  </div>
                  {imagePreview && (
                    <div className="mt-3 relative rounded-2xl overflow-hidden border border-zinc-700">
                      <img src={imagePreview} alt="preview" className="max-h-72 w-full object-contain bg-black" />
                      <button type="button" onClick={() => { setSelectedImage(null); setImagePreview(null) }}
                        className="absolute top-3 right-3 bg-black/80 p-2 rounded-full hover:bg-red-600 transition">
                        <X size={16} />
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <CategorySelector value={newPostCategory} onChange={setNewPostCategory} />
                    <label className="cursor-pointer bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition">
                      <ImageIcon size={14} /> {f.addImage}
                      <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                    </label>
                    <button type="submit" disabled={isPublishing}
                      className="ml-auto bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 md:px-5 py-1.5 rounded-xl font-semibold text-sm hover:brightness-110 disabled:opacity-70 transition flex items-center gap-2">
                      {isPublishing ? <><Loader2 size={14} className="animate-spin" /> {f.publishing}</> : f.publish}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Banner nuovi post */}
            {newPostsCount > 0 && (
              <button onClick={handleShowNewPosts}
                className="flex items-center gap-2 mx-auto mb-4 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-full text-sm font-semibold text-white shadow-lg shadow-violet-500/30 transition-all hover:scale-105 animate-in fade-in slide-in-from-top-2">
                <Bell size={14} />
                {newPostsCount === 1 ? '1 nuovo post' : `${newPostsCount} nuovi post`} — clicca per vedere
              </button>
            )}

            {/* Filter tabs + filtro categoria */}
            {currentUser && (
              <div className="flex items-center gap-2 mb-5 md:mb-6 overflow-x-auto scrollbar-hide -mx-3 sm:-mx-4 md:mx-0 px-3 sm:px-4 md:px-0 pb-1">
                <div className="flex gap-2 bg-zinc-950 border border-zinc-800 rounded-2xl p-1.5 flex-shrink-0">
                  {(['all', 'following'] as const).map(filter => (
                    <button key={filter} data-testid={`filter-${filter}`} onClick={() => handleFilterChange(filter)}
                      className={`px-4 md:px-5 py-2 rounded-xl text-sm font-semibold transition-all ${feedFilter === filter ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
                      {filter === 'all' ? f.filterAll : f.filterFollowing}
                    </button>
                  ))}
                </div>

                <div className="flex-shrink-0">
                  <CategoryFilter activeFilter={categoryFilter} onFilterChange={setCategoryFilter} />
                </div>

                {/* Badge filtro attivo con X rapida */}
                {categoryFilter && (
                  <span className="text-xs text-zinc-500 flex-shrink-0">
                    {displayedPosts.length} post trovati
                  </span>
                )}
              </div>
            )}

            {/* Post in evidenza */}
            {feedFilter === 'all' && !categoryFilter && pinnedPosts.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={14} className="text-violet-400" />
                  <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">In evidenza questa settimana</span>
                </div>
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
                <div className="h-px bg-zinc-800 my-8" />
              </div>
            )}

            {/* Feed posts */}
            <div className="space-y-6">
              {displayedPosts.length === 0 ? (
                <div className="text-center py-24">
                  <Sparkles className="mx-auto mb-6 text-violet-500" size={56} />
                  <p className="text-xl font-medium">
                    {categoryFilter
                      ? `Nessun post per "${parseCategoryString(categoryFilter)?.subcategory || categoryFilter}"`
                      : feedFilter === 'following' ? f.noFollowingTitle : f.emptyTitle}
                  </p>
                  <p className="text-zinc-500 mt-2">
                    {categoryFilter
                      ? 'Sii il primo a pubblicare in questa categoria!'
                      : feedFilter === 'following' ? f.noFollowingHint : f.emptyHint}
                  </p>
                  {categoryFilter && (
                    <button onClick={() => setCategoryFilter('')}
                      className="mt-4 px-4 py-2 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-sm transition">
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
                <div className="flex justify-center py-6"><Loader2 size={24} className="animate-spin text-violet-400" /></div>
              )}

              {!hasMore && posts.length > 0 && (
                <p className="text-center text-zinc-600 text-sm py-6 flex items-center justify-center gap-2">
                  <PartyPopper size={14} /> Hai visto tutto!
                </p>
              )}
            </div>
          </div>

          {/* ── Sidebar ────────────────────────────────────────────── */}
          <div className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-20">
              <FeedSidebar currentUserId={currentUser?.id || null} />
            </div>
          </div>

        </div>
      </div>
      </PullWrapper>
    </div>
  )
}