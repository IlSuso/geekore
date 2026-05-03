'use client'
// DESTINAZIONE: src/app/for-you/page.tsx
// V5: Serendipity badge + Award badge + Seasonal badge + Social boost display +
//     lowConfidence banner + Feedback granulare micro-menu + Anti-ripetizione (recommendations_shown)

import { useState, useEffect, useCallback, memo, useRef, type ReactNode } from 'react'
import { useScrollPanel } from '@/context/ScrollPanelContext'
import { useTabActive } from '@/context/TabActiveContext'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, RefreshCw, SlidersHorizontal, Gamepad2, Tv, Film,
  Zap, Plus, Bookmark, X, Check, ChevronDown, ChevronUp, Users,
  ThumbsDown, Eye, Flame, Brain, Star, ArrowRight, Clapperboard, Swords,
  TrendingUp, Search, BookmarkCheck, Trophy, Calendar,
  MessageCircleQuestion, Tag, MonitorPlay, AlertCircle, Layers,
  Dices, Compass, List, Shuffle,
} from 'lucide-react'
import { SwipeMode } from '@/components/for-you/SwipeMode'
import type { SwipeItem } from '@/components/for-you/SwipeMode'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/Avatar'
import { useLocale } from '@/lib/locale'
import { SkeletonForYouRow } from '@/components/ui/SkeletonCard'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '@/components/ui/ErrorState'
import { PreferencesModal } from '@/components/for-you/PreferencesModal'
import { androidBack } from '@/hooks/androidBack'
import { DNAWidget } from '@/components/for-you/DNAWidget'
import type { TasteProfile } from '@/components/for-you/DNAWidget'
import { EmptyState } from '@/components/ui/EmptyState'
import { profileInvalidateBridge } from '@/hooks/profileInvalidateBridge'
import { optimizeCover } from '@/lib/imageOptimizer'

// V5: Tipi per feedback granulare
type FeedbackAction = 'not_interested' | 'already_seen' | 'added' | 'wishlist_add';
type FeedbackReason = 'too_similar' | 'not_my_genre' | 'already_know' | 'bad_rec' | undefined;

type MediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game' | 'boardgame'

interface FriendActivity {
  userId: string; username: string; displayName?: string; avatarUrl?: string
  mediaId: string; mediaTitle: string; mediaCover?: string; mediaType: string; updatedAt: string
  isHighSim?: boolean; simScore?: number
}

const TYPE_ICONS: Record<MediaType, React.ElementType> = {
  anime: Swords, manga: Layers, movie: Film, tv: Tv, game: Gamepad2,
  boardgame: Dices,
}

const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', movie: 'Film', tv: 'Serie TV', game: 'Videogioco',
  boardgame: 'Gioco da Tavolo',
}

// Colori CSS vars per ogni tipo — coerenti col design system
const TYPE_COLORS: Record<string, string> = {
  anime: 'var(--type-anime)',
  manga: 'var(--type-manga)',
  movie: 'var(--type-movie)',
  tv: 'var(--type-tv)',
  game: 'var(--type-game)',
  boardgame: 'var(--type-board)',
}

function triggerTasteDelta(options: {
  action: 'rating' | 'status_change' | 'wishlist_add' | 'rewatch' | 'progress'
  mediaId: string; mediaType: string; genres: string[]
  rating?: number; prevRating?: number; status?: string; prevStatus?: string
}) {
  fetch('/api/taste/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) }).catch(() => { })
}

function MatchBadge({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-black font-mono px-1.5 py-0.5 rounded-full" style={{ color: 'var(--accent)', background: 'rgba(230,255,61,0.15)', border: '1px solid rgba(230,255,61,0.3)' }}>
      <Zap size={8} fill="currentColor" />{score}%
    </span>
  )
}


interface Recommendation {
  id: string; title: string; type: MediaType; coverImage?: string; year?: number
  genres: string[]; score?: number; description?: string; why: string
  matchScore: number; isDiscovery?: boolean
  episodes?: number
  tags?: string[]
  keywords?: string[]
  isContinuity?: boolean
  continuityFrom?: string
  creatorBoost?: string
  isSerendipity?: boolean
  isAwardWinner?: boolean
  isSeasonal?: boolean
  socialBoost?: string
  friendWatching?: string
  // Extra metadata per il drawer
  authors?: string[]
  developers?: string[]
  platforms?: string[]
  min_players?: number
  max_players?: number
  playing_time?: number
  complexity?: number
  [key: string]: any  // permette campi extra senza errori TS
}

interface RecommendationRail {
  id: string
  title: string
  subtitle: string
  kind: 'top-match' | 'continue' | 'social' | 'fresh' | 'discovery' | 'genre' | 'because-title' | 'quick-picks' | 'hidden-gems'
  items: Recommendation[]
  badge?: string
  priority?: number
}

// V3: Continuity Section
const ContinuitySection = memo(function ContinuitySection({ items, onFeedback, onDetail, dismissedIds }: {
  items: Recommendation[]
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onDetail?: (i: Recommendation) => void
  dismissedIds: Set<string>
}) {
  const visible = items.filter(i => i.isContinuity && !dismissedIds.has(i.id))
  if (!visible.length) return null

  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center">
          <ArrowRight size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Continua a guardare</h2>
          <p className="text-[10px] text-amber-400">Sequel e capitoli successivi dei tuoi titoli completati</p>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
        {visible.map(item => {
          const Icon = TYPE_ICONS[item.type]
          return (
            <div key={item.id} className="flex-shrink-0 w-44 group relative cursor-pointer" onClick={() => onDetail?.(item)}>
              <div className="relative h-64 rounded-2xl overflow-hidden bg-zinc-900 mb-2">
                {item.coverImage
                  ? <img src={optimizeCover(item.coverImage, 'foryou-card-small')} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center"><Icon size={36} className="text-zinc-700" /></div>
                }
                <div className="absolute inset-0 ring-2 ring-amber-500/40 rounded-2xl pointer-events-none" />
                <div className="absolute top-2 left-2 bg-amber-500/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                  <ArrowRight size={8} />Sequel
                </div>
                <div className="absolute top-2 right-2 bg-black/70 text-[9px] text-zinc-300 px-1.5 py-0.5 rounded-full">
                  {TYPE_LABEL[item.type]}
                </div>
                <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />
  
              </div>
              <p className="text-xs font-bold text-white leading-tight line-clamp-2 mb-0.5">{item.title}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
})

const RecommendationCard = memo(function RecommendationCard({
  item, onFeedback, onSimilar, onDetail, isSimilarLoading, dismissed, showDetails,
  added = false, wishlisted = false, adding = false, onAdd, onWishlist,
}: {
  item: Recommendation
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  isSimilarLoading: boolean
  dismissed: boolean
  showDetails?: boolean
  added?: boolean
  wishlisted?: boolean
  adding?: boolean
  onAdd?: (i: Recommendation) => void
  onWishlist?: (i: Recommendation) => void
}) {
  const Icon = TYPE_ICONS[item.type]
  const colorClass = TYPE_COLORS[item.type]
  if (dismissed) return null

  const episodeLabel = item.type === 'manga'
    ? (item.episodes ? `${item.episodes} cap.` : null)
    : (item.episodes && item.type !== 'movie' ? `${item.episodes} ep.` : null)

  const signals = [
    item.isAwardWinner ? { key: 'award', label: 'Award', icon: Trophy, tone: 'text-amber-300 border-amber-400/25 bg-amber-500/12' } : null,
    item.isSeasonal ? { key: 'seasonal', label: 'Seasonal', icon: Calendar, tone: 'text-sky-300 border-sky-400/25 bg-sky-500/12' } : null,
    item.isSerendipity ? { key: 'serendipity', label: 'Serendipity', icon: Compass, tone: 'text-violet-300 border-violet-400/25 bg-violet-500/12' } : null,
    item.friendWatching ? { key: 'friend', label: item.friendWatching, icon: Users, tone: 'text-emerald-300 border-emerald-400/25 bg-emerald-500/12' } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; icon: React.ElementType; tone: string }>

  const addDisabled = adding || added

  return (
    <div className={`flex-shrink-0 group ${showDetails ? 'w-52' : 'w-40'}`}>
      <div
        className={`relative ${showDetails ? 'h-72' : 'h-60'} rounded-[22px] overflow-hidden bg-zinc-900 mb-2 cursor-pointer border border-white/8 shadow-[0_14px_40px_rgba(0,0,0,0.22)]`}
        onClick={() => onDetail?.(item)}
      >
        {item.coverImage
          ? <img src={optimizeCover(item.coverImage, 'foryou-card-large')} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          : <div className="w-full h-full flex items-center justify-center"><Icon size={32} className="text-zinc-700" /></div>
        }
        <div className="absolute inset-0 rounded-[22px] ring-1 ring-inset ring-white/10 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/92 via-black/45 to-transparent pointer-events-none" />

        <div className="absolute left-2 top-2 flex max-w-[calc(100%-4rem)] flex-wrap gap-1.5">
          <span className="text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-sm" style={{ background: colorClass }}>
            {TYPE_LABEL[item.type] || item.type.toUpperCase()}
          </span>
        </div>

        <div className="absolute right-2 top-2">
          <MatchBadge score={item.isContinuity ? 100 : item.matchScore} />
        </div>

        {signals.length > 0 && (
          <div className="absolute bottom-14 left-2 right-2 flex flex-wrap gap-1.5">
            {signals.slice(0, 1).map(signal => {
              const SignalIcon = signal.icon
              return (
                <span key={signal.key} className={`inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold backdrop-blur-sm ${signal.tone}`}>
                  <SignalIcon size={10} className="flex-shrink-0" />
                  <span className="truncate">{signal.label}</span>
                </span>
              )
            })}
          </div>
        )}

        {item.socialBoost && showDetails && (
          <div className="absolute bottom-20 left-2 right-2 rounded-xl border border-white/10 bg-black/62 px-2.5 py-1.5 text-[10px] font-semibold text-zinc-200 backdrop-blur-sm">
            {item.socialBoost}
          </div>
        )}

        {/* 3 bottoni tondi glass: ThumbsDown, Eye, Bookmark — fissi in basso centrati */}
        <div className="absolute bottom-2 inset-x-0 flex items-center justify-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'not_interested') }} title="Non mi interessa"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 border border-white/15 text-zinc-300 backdrop-blur-md transition-all hover:text-red-300 hover:border-red-400/30">
            <ThumbsDown size={11} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'already_seen') }} title="L'ho già visto"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 border border-white/15 text-zinc-300 backdrop-blur-md transition-all hover:text-white hover:border-white/30">
            <Eye size={11} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onWishlist?.(item) }} disabled={!onWishlist}
            title={wishlisted ? 'Rimuovi dalla wishlist' : 'Aggiungi alla wishlist'}
            className={`flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md border transition-all disabled:opacity-40 ${wishlisted ? 'bg-black/70 border-[rgba(230,255,61,0.45)] text-[var(--accent)]' : 'bg-black/60 border-white/15 text-zinc-300 hover:text-[var(--accent)] hover:border-[rgba(230,255,61,0.35)]'}`}>
            {wishlisted ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
          </button>
        </div>
      </div>

      <p className="text-xs font-semibold text-white leading-tight line-clamp-2 mb-1">{item.title}</p>
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        {item.year && <p className="text-[10px] text-zinc-500">{item.year}</p>}
        {item.score && (
          <span className="flex items-center gap-0.5 text-[10px] text-yellow-400 font-semibold">
            <Star size={8} fill="currentColor" />{Math.min(item.score, 5).toFixed(1)}
          </span>
        )}
        {episodeLabel && <span className="text-[10px] text-zinc-500">{episodeLabel}</span>}
      </div>

    </div>
  )
})


// Sezione "Simili a X" — persiste finché l'utente non la chiude o cerca un altro simile
// Barra di ricerca "Trova titoli simili a..." — stile identico alla navbar
// Cerca in tutte le API (AniList, TMDb, IGDB) in parallelo — stesso pattern della discover
const TYPE_LABEL_SEARCH: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', movie: 'Film', tv: 'Serie TV',
  game: 'Videogioco', boardgame: 'Gioco da Tavolo',
}

interface SearchSuggestion {
  id: string; title: string; type: string
  genres?: string[]; year?: number; coverImage?: string
  description?: string; keywords?: string[]
}

function SimilarSearchBar({ onSearch, loading, actions }: {
  onSearch: (title: string, genres: string[], keywords?: string[], type?: string) => void
  loading: boolean
  actions?: ReactNode
}) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Chiudi dropdown se si clicca fuori
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchSuggestions = async (q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); setOpen(false); return }
    setSearching(true)
    try {
      // Chiama tutte le API in parallelo — stesse della discover
      const [anilistRes, tmdbRes, igdbRes] = await Promise.allSettled([
        fetch(`/api/anilist?q=${encodeURIComponent(q)}`),
        fetch(`/api/tmdb?q=${encodeURIComponent(q)}&type=all&lang=it-IT`),
        fetch(`/api/igdb?q=${encodeURIComponent(q)}`),
      ])

      const all: SearchSuggestion[] = []
      const parse = (j: any) => Array.isArray(j) ? j : (j.results || j.data || [])

      if (anilistRes.status === 'fulfilled' && anilistRes.value.ok) {
        const j = await anilistRes.value.json()
        for (const r of parse(j).slice(0, 2)) {
          all.push({ id: r.id || r.external_id, title: r.title, type: r.type || 'anime', genres: r.genres, year: r.year, coverImage: r.coverImage || r.cover_image, keywords: r.tags })
        }
      }
      if (tmdbRes.status === 'fulfilled' && tmdbRes.value.ok) {
        const j = await tmdbRes.value.json()
        for (const r of parse(j).slice(0, 2)) {
          all.push({ id: r.id || r.external_id, title: r.title, type: r.type || 'movie', genres: r.genres, year: r.year, coverImage: r.coverImage || r.cover_image, description: r.description, keywords: r.keywords })
        }
      }
      if (igdbRes.status === 'fulfilled' && igdbRes.value.ok) {
        const j = await igdbRes.value.json()
        for (const r of parse(j).slice(0, 2)) {
          all.push({ id: r.id || r.external_id, title: r.title, type: 'game', genres: r.genres, year: r.year, coverImage: r.coverImage || r.cover_image, keywords: r.keywords })
        }
      }

      setSuggestions(all.slice(0, 4))
      setOpen(all.length > 0)
    } catch { }
    setSearching(false)
  }

  const handleChange = (v: string) => {
    setQuery(v)
    setOpen(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 320)
  }

  const handleSelect = (s: SearchSuggestion) => {
    setQuery(s.title)
    setOpen(false)
    setSuggestions([])
    const genres = s.genres?.filter(Boolean) || []
    onSearch(s.title, genres, (s as any).keywords, s.type)
  }

  const handleClear = () => {
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative mb-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        {/* Input — stile identico alla navbar */}
        <div className="relative min-w-0 flex-1">
        <Search
          size={14}
          className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${searching || loading ? 'animate-pulse' : 'text-zinc-500'}`}
          style={searching || loading ? { color: 'var(--accent)' } : {}}
        />
        <input
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); return }
            if (e.key === 'Enter' && query.trim().length >= 2) {
              setOpen(false)
              if (suggestions.length > 0) handleSelect(suggestions[0])
              else onSearch(query.trim(), [])
            }
          }}
          placeholder="Cerca un titolo per trovare contenuti simili…"
          className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-2xl pl-9 pr-8 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
        />
        {query && (
          <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors" aria-label="Cancella ricerca simili">
            <X size={13} />
          </button>
        )}
        </div>
        {actions && (
          <div className="flex flex-shrink-0 items-center justify-end gap-2 lg:min-w-[240px]" data-no-swipe="true">
            {actions}
          </div>
        )}
      </div>

      {/* Dropdown suggerimenti — stile identico alla navbar */}
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 z-[110]">
          {suggestions.map((s, i) => (
            <button key={`${s.id}-${i}`} onClick={() => handleSelect(s)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors border-b border-zinc-800/50 last:border-0 text-left">
              {/* Copertina */}
              <div className="w-8 h-11 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0">
                {s.coverImage
                  ? <img src={optimizeCover(s.coverImage, 'drawer-cover')} alt="" className="w-full h-full object-cover" loading="lazy" />
                  : <div className="w-full h-full" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-tight truncate">{s.title}</p>
                <p className="text-xs" style={{ color: 'var(--accent)' }}>
                  {TYPE_LABEL_SEARCH[s.type] || s.type}{s.year ? ` · ${s.year}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && query.length >= 2 && suggestions.length === 0 && !searching && (
        <div className="absolute top-full left-0 w-full mt-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-zinc-500 shadow-2xl z-[110]">
          Nessun risultato trovato
        </div>
      )}
    </div>
  )
}

const SIMILAR_TYPE_FILTERS: Array<{ key: MediaType | 'all'; label: string }> = [
  { key: 'all', label: 'Tutti' },
  { key: 'anime', label: 'Anime' },
  { key: 'movie', label: 'Film' },
  { key: 'tv', label: 'Serie TV' },
  { key: 'game', label: 'Videogiochi' },
  { key: 'manga', label: 'Manga' },
]

const SimilarSection = memo(function SimilarSection({
  sourceTitle, sourceType, items, onFeedback, onSimilar, onDetail, onClose, dismissedIds,
  similarLoadingId, addedIds, wishlistIds, addingIds, onAdd, onWishlist,
}: {
  sourceTitle: string
  sourceType: MediaType
  items: Recommendation[]
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  onClose: () => void
  dismissedIds: Set<string>
  similarLoadingId?: string | null
  addedIds: Set<string>
  wishlistIds: Set<string>
  addingIds: Set<string>
  onAdd: (i: Recommendation) => void
  onWishlist: (i: Recommendation) => void
}) {
  const [visibleCount, setVisibleCount] = useState(20)
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')

  // Tipi effettivamente presenti nei risultati
  const presentTypes = new Set(items.map(i => i.type))
  const activeFilters = SIMILAR_TYPE_FILTERS.filter(f => f.key === 'all' || presentTypes.has(f.key as MediaType))

  const filtered = typeFilter === 'all'
    ? items.filter(i => !dismissedIds.has(i.id))
    : items.filter(i => i.type === typeFilter && !dismissedIds.has(i.id))

  const shown = filtered.slice(0, visibleCount)
  const hasMore = filtered.length > visibleCount

  // Reset visibleCount quando cambia il filtro
  const handleFilterChange = (key: MediaType | 'all') => {
    setTypeFilter(key)
    setVisibleCount(20)
  }

  return (
    <div className="mb-10 rounded-3xl p-5" style={{ border: '1px solid rgba(230,255,61,0.2)', background: 'rgba(230,255,61,0.03)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0" style={{ background: 'var(--accent)' }}>
          <Search size={15} className="text-black" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-white">
            Titoli simili a <span style={{ color: 'var(--accent)' }}>"{sourceTitle}"</span>
          </h2>
          <p className="text-[10px] text-zinc-500">
            {filtered.length} {filtered.length === items.filter(i => !dismissedIds.has(i.id)).length ? 'titoli trovati' : `di ${items.filter(i => !dismissedIds.has(i.id)).length} totali`}
          </p>
        </div>
        <button onClick={onClose}
          className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all"
          title="Chiudi">
          <X size={15} />
        </button>
      </div>

      {/* Filtri per tipo — pill scrollabili */}
      {activeFilters.length > 2 && (
        <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide mb-4">
          {activeFilters.map(({ key, label }) => {
            const count = key === 'all'
              ? items.filter(i => !dismissedIds.has(i.id)).length
              : items.filter(i => i.type === key && !dismissedIds.has(i.id)).length
            const isActive = typeFilter === key
            return (
              <button key={key} onClick={() => handleFilterChange(key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${isActive
                  ? 'border-transparent'
                  : 'bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'
                  }`}
                style={isActive ? { background: 'var(--accent)', color: '#0B0B0F', borderColor: 'var(--accent)' } : {}}>
                {key !== 'all' && <span className="w-1.5 h-1.5 rounded-full" style={{ background: TYPE_COLORS[key as MediaType] }} />}
                {label}
                <span className={`text-[10px] ${isActive ? '' : 'text-zinc-600'}`} style={isActive ? { color: 'rgba(11,11,15,0.7)' } : {}}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-6">Nessun titolo trovato per questo filtro.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
          {shown.map(item => (
            <RecommendationCard
              key={item.id}
              item={item}
              onFeedback={onFeedback}
              onSimilar={onSimilar}
              onDetail={onDetail}
              isSimilarLoading={similarLoadingId === item.id}
              dismissed={dismissedIds.has(item.id)}
              showDetails
              added={addedIds.has(item.id)}
              wishlisted={wishlistIds.has(item.id)}
              adding={addingIds.has(item.id)}
              onAdd={onAdd}
              onWishlist={onWishlist}
            />
          ))}
          {hasMore && (
            <div className="flex-shrink-0 w-40 flex items-center justify-center">
              <button onClick={() => setVisibleCount(v => v + 10)}
                className="flex flex-col items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors">
                <div className="w-10 h-10 rounded-full border border-zinc-700 hover:border-zinc-500 flex items-center justify-center">
                  <ChevronDown size={18} />
                </div>
                <span className="text-[10px]">+{filtered.length - visibleCount} altri</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
})


const INITIAL_VISIBLE = 20
const LOAD_MORE_STEP = 10

const RAIL_ICONS: Record<RecommendationRail['kind'], React.ElementType> = {
  'top-match': Sparkles,
  continue: ArrowRight,
  social: Users,
  fresh: Flame,
  discovery: Compass,
  genre: Tag,
  'because-title': Brain,
  'quick-picks': Zap,
  'hidden-gems': Trophy,
}

const RAIL_COLORS: Record<RecommendationRail['kind'], string> = {
  'top-match': 'var(--accent)',
  continue: '#f59e0b',
  social: 'var(--type-anime)',
  fresh: 'var(--type-movie)',
  discovery: 'var(--type-game)',
  genre: '#0ea5e9',
  'because-title': '#10b981',
  'quick-picks': 'var(--accent)',
  'hidden-gems': 'var(--type-board)',
}

const NetflixRailSection = memo(function NetflixRailSection({
  rail, onFeedback, dismissedIds, onSimilar, onDetail, similarLoadingId,
  addedIds, wishlistIds, addingIds, onAdd, onWishlist,
}: {
  rail: RecommendationRail
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  dismissedIds: Set<string>
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  similarLoadingId?: string | null
  addedIds: Set<string>
  wishlistIds: Set<string>
  addingIds: Set<string>
  onAdd: (i: Recommendation) => void
  onWishlist: (i: Recommendation) => void
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const visible = rail.items.filter(i => !dismissedIds.has(i.id))
  if (!visible.length) return null

  const Icon = RAIL_ICONS[rail.kind] || Sparkles
  const shown = visible.slice(0, visibleCount)
  const hasMore = visible.length > visibleCount

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg" style={{ background: RAIL_COLORS[rail.kind] }}>
          <Icon size={16} className={rail.kind === 'quick-picks' || rail.kind === 'top-match' ? 'text-black' : 'text-white'} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-bold text-white">{rail.title}</h2>
          <p className="text-[10px] text-zinc-500 line-clamp-1">{rail.subtitle}</p>
        </div>
        {rail.badge && (
          <span className="ml-auto hidden sm:inline-flex text-[10px] font-semibold text-zinc-300 bg-zinc-900/80 border border-zinc-800 px-2 py-0.5 rounded-full">
            {rail.badge}
          </span>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
        {shown.map(item => (
          <RecommendationCard
            key={`${rail.id}-${item.type}-${item.id}`}
            item={item}
            onFeedback={onFeedback}
            onSimilar={onSimilar}
            onDetail={onDetail}
            isSimilarLoading={similarLoadingId === item.id}
            dismissed={dismissedIds.has(item.id)}
            showDetails={rail.kind === 'top-match' || rail.kind === 'because-title'}
            added={addedIds.has(item.id)}
            wishlisted={wishlistIds.has(item.id)}
            adding={addingIds.has(item.id)}
            onAdd={onAdd}
            onWishlist={onWishlist}
          />
        ))}
        {hasMore && (
          <div className="flex-shrink-0 w-40 flex items-center justify-center">
            <button onClick={() => setVisibleCount(v => v + LOAD_MORE_STEP)}
              className="flex flex-col items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors">
              <div className="w-10 h-10 rounded-full border border-zinc-700 hover:border-zinc-500 flex items-center justify-center">
                <ChevronDown size={18} />
              </div>
              <span className="text-[10px]">+{visible.length - visibleCount} altri</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

const SpotlightRecommendation = memo(function SpotlightRecommendation({ item, onFeedback, onSimilar, onDetail, isSimilarLoading }: {
  item: Recommendation
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  isSimilarLoading: boolean
}) {
  const Icon = TYPE_ICONS[item.type]
  const colorClass = TYPE_COLORS[item.type]

  return (
    <section className="relative min-h-[190px] md:min-h-[230px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 mb-8">
      {item.coverImage && (
        <img
          src={optimizeCover(item.coverImage, 'foryou-card-large')}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-35 blur-[1px] scale-105"
          loading="lazy"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/25" />
      <div className="relative z-10 flex min-h-[190px] md:min-h-[230px] items-end p-4 md:p-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-white px-2 py-1 rounded-full" style={{ background: colorClass }}>
              <Icon size={11} /> {TYPE_LABEL[item.type]}
            </span>
            <MatchBadge score={item.isContinuity ? 100 : item.matchScore} />
          </div>
          <h1 className="text-2xl md:text-4xl font-black text-white leading-tight mb-2 line-clamp-2">{item.title}</h1>
          <p className="text-sm text-zinc-300 line-clamp-2 mb-4">{item.why}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => onDetail?.(item)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-colors">
              <Plus size={14} /> Dettagli
            </button>
            {onSimilar && (
              <button onClick={() => onSimilar(item)} disabled={isSimilarLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/80 border border-zinc-700 text-zinc-100 text-xs font-semibold hover:bg-zinc-800 transition-colors disabled:opacity-60">
                {isSimilarLoading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                Simili
              </button>
            )}
            <button onClick={() => onFeedback(item, 'not_interested')}
              className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-900/80 border border-zinc-700 text-zinc-300 hover:text-red-300 hover:border-red-900/70 transition-colors"
              title="Non mi interessa">
              <ThumbsDown size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
})

const RecommendationSection = memo(function RecommendationSection({
  type, items, label, onAdd, onWishlist, onFeedback, dismissedIds, onSimilar, onDetail,
  similarLoadingId, isPrimary, addedIds, wishlistIds, addingIds,
}: {
  type: MediaType; items: Recommendation[]; label: string
  onAdd: (i: Recommendation) => void; onWishlist: (i: Recommendation) => void
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  dismissedIds: Set<string>
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  similarLoadingId?: string | null
  isPrimary?: boolean
  addedIds: Set<string>
  wishlistIds: Set<string>
  addingIds: Set<string>
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)  // Fix 2.13
  const Icon = TYPE_ICONS[type]; const colorClass = TYPE_COLORS[type]
  const visible = items.filter(i => !dismissedIds.has(i.id))
  if (!visible.length) return null

  const shown = visible.slice(0, visibleCount)
  const hasMore = visible.length > visibleCount
  const topScore = visible[0]?.matchScore || 0

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg" style={{ background: colorClass }}>
          <Icon size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">{label}</h2>
          <p className="text-[10px] text-zinc-500">{visible.length} titoli</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isPrimary && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: 'var(--accent)', background: 'rgba(230,255,61,0.1)', border: '1px solid rgba(230,255,61,0.2)' }}>
              Il tuo tipo principale
            </span>
          )}
          {topScore >= 80 && !isPrimary && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ color: 'var(--accent)', background: 'rgba(230,255,61,0.1)', border: '1px solid rgba(230,255,61,0.2)' }}>
              <Flame size={9} /> Ottimo match
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
        {shown.map(item => (
          <RecommendationCard
            key={item.id} item={item} onFeedback={onFeedback} onSimilar={onSimilar} onDetail={onDetail}
            isSimilarLoading={similarLoadingId === item.id} dismissed={dismissedIds.has(item.id)}
            added={addedIds.has(item.id)} wishlisted={wishlistIds.has(item.id)} adding={addingIds.has(item.id)}
            onAdd={onAdd} onWishlist={onWishlist}
          />
        ))}
        {hasMore && (
          <div className="flex-shrink-0 w-40 flex items-center justify-center">
            <button onClick={() => setVisibleCount(v => v + LOAD_MORE_STEP)}
              className="flex flex-col items-center gap-2 text-zinc-500 hover:text-zinc-300 transition-colors">
              <div className="w-10 h-10 rounded-full border border-zinc-700 hover:border-zinc-500 flex items-center justify-center">
                <ChevronDown size={18} />
              </div>
              <span className="text-[10px]">+{visible.length - visibleCount} altri</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

// Quick-reason modal — raccoglie il motivo dopo "non mi interessa"
function QuickReasonSheet({ item, onConfirm, onDismiss }: {
  item: Recommendation
  onConfirm: (reason: FeedbackReason) => void
  onDismiss: () => void
}) {
  useEffect(() => {
    androidBack.push(onDismiss)
    return () => androidBack.pop(onDismiss)
  }, [onDismiss])

  const options: { reason: FeedbackReason; label: string; sub: string; icon: React.ReactNode }[] = [
    {
      reason: 'not_my_genre',
      label: 'Non è il mio genere',
      sub: 'Aiuta a calibrare i tuoi gusti',
      icon: <X size={15} className="text-zinc-400" />,
    },
    {
      reason: 'bad_rec',
      label: 'Non fa per me',
      sub: 'Non suggerirlo più',
      icon: <ThumbsDown size={15} className="text-zinc-400" />,
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={onDismiss}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-5"
        onClick={e => e.stopPropagation()}>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-1">Perché non ti interessa?</p>
        <p className="text-sm font-semibold text-white mb-5 truncate">{item.title}</p>
        <div className="space-y-2">
          {options.map(({ reason, label, sub, icon }) => (
            <button key={reason} onClick={() => onConfirm(reason)}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-2xl transition-all text-left group">
              <div className="w-8 h-8 rounded-xl bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center flex-shrink-0 transition-colors">
                {icon}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-[11px] text-zinc-500">{sub}</p>
              </div>
            </button>
          ))}
        </div>
        <button onClick={onDismiss}
          className="w-full mt-3 py-2.5 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-all">
          Annulla
        </button>
      </div>
    </div>
  )
}

function LowConfidenceBanner({ totalEntries }: { totalEntries: number }) {
  const needed = 15
  const pct = Math.min(100, Math.round((totalEntries / needed) * 100))
  return (
    <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6">
      <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-300 mb-1">Consigli in miglioramento</p>
        <p className="text-xs text-amber-200/70 mb-3">
          I tuoi consigli migliorano man mano che aggiungi titoli. Hai ancora {needed - totalEntries} titoli per sbloccare i consigli personalizzati.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-amber-500/20 rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-amber-400 font-bold">{totalEntries}/{needed}</span>
        </div>
        <Link href="/discover" className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-amber-400 hover:text-amber-300">
          <Plus size={13} />Aggiungi dalla libreria
        </Link>
      </div>
    </div>
  )
}

const FriendsWatchingSection = memo(function FriendsWatchingSection({ items }: { items: FriendActivity[] }) {
  if (!items.length) return null
  const timeAgo = (d: string) => {
    const diff = Date.now() - new Date(d).getTime()
    const h = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000)
    if (h < 1) return 'ora'; if (h < 24) return `${h}h fa`; return `${days}g fa`
  }
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-3xl p-5 mb-10">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
          <Users size={16} className="text-black" />
        </div>
        <h2 className="text-sm font-bold text-white">Amici che guardano</h2>
        <span className="text-xs text-zinc-500 ml-auto">{items.length}</span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {items.map(a => (
          <Link key={`${a.userId}-${a.mediaId}`} href={`/profile/${a.username}`} className="flex-shrink-0 w-28 group">
            <div className="relative h-40 rounded-2xl overflow-hidden bg-zinc-800 mb-2">
              {a.mediaCover
                ? <img src={optimizeCover(a.mediaCover, 'foryou-friend')} alt={a.mediaTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                : <div className="w-full h-full flex items-center justify-center text-zinc-600"><Tv size={28} /></div>
              }
              <div className="absolute bottom-2 left-2 ring-2 ring-black rounded-full">
                <Avatar src={a.avatarUrl} username={a.username} displayName={a.displayName} size={24} />
              </div>
              <div className="absolute top-2 right-2 bg-black/70 text-[9px] text-zinc-300 px-1.5 py-0.5 rounded-full">{timeAgo(a.updatedAt)}</div>
            </div>
            <p className="text-[10px] font-semibold text-zinc-300 line-clamp-2 mb-0.5">{a.mediaTitle}</p>
            <p className="text-[9px] truncate" style={{ color: 'var(--accent)' }}>@{a.username}</p>
          </Link>
        ))}
      </div>
    </div>
  )
})

// Module-level cache — sopravvive alle navigazioni nella stessa sessione
const forYouCache: {
  recommendations: Record<string, Recommendation[]> | null
  rails: RecommendationRail[] | null
  tasteProfile: TasteProfile | null
  friendsActivity: FriendActivity[]
  addedIds: Set<string>
  wishlistIds: Set<string>
  addedTitles: Set<string>
  totalEntries: number
  ts: number
} = {
  recommendations: null, rails: null, tasteProfile: null, friendsActivity: [],
  addedIds: new Set(), wishlistIds: new Set(), addedTitles: new Set(),
  totalEntries: 0, ts: 0,
}

// Inline swipe mode wrapper — carica le raccomandazioni dalla cache e le passa a SwipeMode
function SwipeModeWrapper({ onClose }: { onClose: () => void }) {
  const supabase = createClient()
  const router = useRouter()
  const [items, setItems] = useState<SwipeItem[]>([])
  const [loading, setLoading] = useState(true)
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      userIdRef.current = user.id
      // Try queue first
      const { data: queueRows } = await supabase
        .from('swipe_queue_all').select('*').eq('user_id', user.id)
        .order('inserted_at', { ascending: true })
      if (queueRows && queueRows.length >= 5) {
        setItems(queueRows.map((r: any) => ({
          id: r.external_id, title: r.title, type: r.type,
          coverImage: r.cover_image, year: r.year, genres: r.genres || [],
          score: r.score, description: r.description, why: r.why,
          matchScore: r.match_score || 0, episodes: r.episodes,
          source: r.source,
        })))
        setLoading(false)
        return
      }
      // Fall back to recommendations API
      try {
        const res = await fetch('/api/recommendations?type=all')
        if (res.ok) {
          const json = await res.json()
          const all = (Object.values(json.recommendations || {}) as any[][]).flat()
          setItems(all.map((r: any) => ({
            id: r.id, title: r.title, type: r.type,
            coverImage: r.coverImage, year: r.year, genres: r.genres || [],
            score: r.score, description: r.description, why: r.why,
            matchScore: r.matchScore || 0, episodes: r.episodes,
            source: r.source,
          })))
        }
      } catch { }
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  )

  const sendSwipeFeedback = async (item: SwipeItem, action: FeedbackAction, rating?: number) => {
    await fetch('/api/recommendations/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rec_id: item.id, rec_type: item.type, rec_genres: item.genres || [], action }),
    }).catch(() => null)
    if ((action === 'already_seen' || action === 'added') && (item.genres || []).length > 0) {
      triggerTasteDelta({
        action: 'rating',
        mediaId: item.id,
        mediaType: item.type,
        genres: item.genres || [],
        rating: rating || item.score || 3.5,
      })
    }
  }

  const requestMore = async (): Promise<SwipeItem[]> => {
    const res = await fetch('/api/recommendations?type=all&refresh=1', { credentials: 'include' }).catch(() => null)
    if (!res?.ok) return []
    const json = await res.json()
    const all = (Object.values(json.recommendations || {}) as any[][]).flat()
    return all.map((r: any) => ({
      id: r.id, title: r.title, type: r.type,
      coverImage: r.coverImage, year: r.year, genres: r.genres || [],
      score: r.score, description: r.description, why: r.why,
      matchScore: r.matchScore || 0, episodes: r.episodes,
      source: r.source,
    }))
  }

  return (
    <SwipeMode
      items={items}
      userId={userIdRef.current || undefined}
      onSeen={(item, rating) => sendSwipeFeedback(item, 'already_seen', rating ?? undefined)}
      onSkip={(item) => sendSwipeFeedback(item, 'not_interested')}
      onClose={onClose}
      onRequestMore={requestMore}
    />
  )
}

export default function ForYouPage() {
  const pathname = usePathname()
  const { scrollToTop } = useScrollPanel()
  const isActive = useTabActive()
  const supabase = createClient(); const router = useRouter()
  const { t } = useLocale(); const fy = t.forYou
  const hasCachedData = forYouCache.recommendations !== null
  const [loading, setLoading] = useState(!hasCachedData); const [refreshing, setRefreshing] = useState(false)
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation[]>>(forYouCache.recommendations ?? {})
  const [rails, setRails] = useState<RecommendationRail[]>(forYouCache.rails ?? [])
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(forYouCache.tasteProfile)
  const [totalEntries, setTotalEntries] = useState(forYouCache.totalEntries)
  const [addedIds, setAddedIds] = useState<Set<string>>(forYouCache.addedIds)
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(forYouCache.wishlistIds)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [showPrefs, setShowPrefs] = useState(false)
  const [isCached, setIsCached] = useState(hasCachedData)
  const [friendsActivity, setFriendsActivity] = useState<FriendActivity[]>(forYouCache.friendsActivity)
  const [friendsLoading, setFriendsLoading] = useState(!hasCachedData || forYouCache.friendsActivity.length === 0)
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set())
  const [reasonPending, setReasonPending] = useState<Recommendation | null>(null)
  const [similarLoading, setSimilarLoading] = useState<string | null>(null)
  const [detailItem, setDetailItem] = useState<Recommendation | null>(null)
  const [similarSection, setSimilarSection] = useState<{ sourceTitle: string; sourceType: MediaType; items: Recommendation[] } | null>(null)
  const [showNewRecsBadge, setShowNewRecsBadge] = useState(false)
  const [viewMode, setViewMode] = useState<'lista' | 'swipe'>('lista')
  const addedTitlesRef = useRef<Set<string>>(forYouCache.addedTitles)

  const fetchRecommendations = useCallback(async (force = false) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const res = await fetch(`/api/recommendations?type=all${force ? '&refresh=1' : ''}`)
    if (!res.ok) return
    const json = await res.json()
    const incoming = json.recommendations || {}
    if (Array.isArray(json.rails)) {
      setRails(json.rails)
      forYouCache.rails = json.rails
    }
    // Merge invece di replace: non sovrascrivere con dati parziali.
    // Se la risposta contiene meno tipi di quelli in memoria, manteniamo i vecchi.
    setRecommendations(prev => {
      const merged = { ...prev }
      for (const [type, items] of Object.entries(incoming)) {
        if (Array.isArray(items) && items.length > 0) {
          merged[type] = items as Recommendation[]
        }
      }
      return merged
    })
    setTasteProfile(json.tasteProfile || null)
    setIsCached(!!json.cached)
  }, [])

  const fetchFriends = useCallback(async (userId: string) => {
    setFriendsLoading(true)
    try {
      const { data: follows } = await supabase.from('follows').select('following_id').eq('follower_id', userId)
      const ids = (follows || []).map((f: any) => f.following_id)
      if (!ids.length) { setFriendsActivity([]); setFriendsLoading(false); return }
      const since = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data: entries } = await supabase.from('user_media_entries').select('user_id, external_id, title, cover_image, type, updated_at').in('user_id', ids).gte('updated_at', since).order('updated_at', { ascending: false }).limit(20)
      if (!entries?.length) { setFriendsActivity([]); setFriendsLoading(false); return }
      const uids = [...new Set(entries.map(e => e.user_id))]

      // Profiles + similarity in parallel → single setState, no double-render wave
      const [{ data: profiles }, { data: simData }] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', uids),
        supabase.from('taste_similarity').select('other_user_id, similarity_score')
          .eq('user_id', userId).in('other_user_id', ids).gte('similarity_score', 80),
      ])

      const pm: Record<string, any> = {}; profiles?.forEach(p => { pm[p.id] = p })
      const highSimIds = new Set((simData || []).map((s: any) => s.other_user_id))
      const simMap = Object.fromEntries((simData || []).map((s: any) => [s.other_user_id, s.similarity_score]))

      const seen = new Set<string>(); const activity: FriendActivity[] = []
      for (const e of entries) {
        const key = `${e.user_id}-${e.external_id}`
        if (seen.has(key)) continue; seen.add(key)
        const p = pm[e.user_id]; if (!p) continue
        activity.push({
          userId: e.user_id, username: p.username, displayName: p.display_name,
          avatarUrl: p.avatar_url, mediaId: e.external_id, mediaTitle: e.title,
          mediaCover: e.cover_image, mediaType: e.type, updatedAt: e.updated_at,
          isHighSim: highSimIds.has(e.user_id), simScore: simMap[e.user_id] || 0,
        })
      }
      const result = activity.slice(0, 12)
      setFriendsActivity(result)
      forYouCache.friendsActivity = result
    } catch { setFriendsActivity([]) }
    setFriendsLoading(false)
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    let profileChannel: ReturnType<typeof supabase.channel> | null = null

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) { if (!user) router.push('/login'); return }
      const userId = user.id

      // Realtime: aggiorna entry_count solo se il panel è attivo.
      // Controlla getChannels() per evitare doppia subscribe (StrictMode).
      if (isActive) {
        const chName = `profile-entry-count-${userId}`
        const existing = supabase.getChannels().find(c => c.topic === `realtime:${chName}`)
        if (!existing) {
          profileChannel = supabase
            .channel(chName)
            .on('postgres_changes', {
              event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}`,
            }, (payload: any) => { setTotalEntries(payload.new?.entry_count ?? 0) })
            .subscribe()
        }
      }

      // ── Cache hit: mostra tutto immediatamente, poi aggiorna in background ──
      if (forYouCache.recommendations !== null) {
        // Aggiorna libreria e amici in background senza bloccare la UI
        Promise.all([
          supabase.from('user_media_entries').select('external_id, title').eq('user_id', userId),
          supabase.from('wishlist').select('external_id').eq('user_id', userId),
        ]).then(([{ data: entries }, { data: wish }]) => {
          const newAddedIds: Set<string> = new Set((entries || []).map((e: any) => e.external_id as string).filter(Boolean))
          const newTitles: Set<string> = new Set((entries || []).map((e: any) => (e.title as string)?.toLowerCase()).filter(Boolean))
          const newWishIds: Set<string> = new Set((wish || []).map((w: any) => w.external_id as string).filter(Boolean))
          setAddedIds(newAddedIds); setWishlistIds(newWishIds); setTotalEntries(entries?.length || 0)
          addedTitlesRef.current = newTitles
          forYouCache.addedIds = newAddedIds; forYouCache.wishlistIds = newWishIds
          forYouCache.addedTitles = newTitles; forYouCache.totalEntries = entries?.length || 0
        })
        fetchFriends(userId)
        return
      }

      // ── Cold start: fetch sequenziale ────────────────────────────────────────
      const [{ data: entries }, { data: wish }] = await Promise.all([
        supabase.from('user_media_entries').select('external_id, title').eq('user_id', userId),
        supabase.from('wishlist').select('external_id').eq('user_id', userId),
      ])

      const newAddedIds: Set<string> = new Set((entries || []).map((e: any) => e.external_id as string).filter(Boolean))
      const newTitles: Set<string> = new Set((entries || []).map((e: any) => (e.title as string)?.toLowerCase()).filter(Boolean))
      const newWishIds: Set<string> = new Set((wish || []).map((w: any) => w.external_id as string).filter(Boolean))
      setAddedIds(newAddedIds); setWishlistIds(newWishIds); setTotalEntries(entries?.length || 0)
      addedTitlesRef.current = newTitles
      forYouCache.addedIds = newAddedIds; forYouCache.wishlistIds = newWishIds
      forYouCache.addedTitles = newTitles; forYouCache.totalEntries = entries?.length || 0

      fetchFriends(userId)

      // 1. Pool persistente (fast path ~50ms)
      const poolRes = await fetch('/api/recommendations?source=pool', { cache: 'no-store' })
      if (poolRes.ok) {
        const poolJson = await poolRes.json()
        if ((poolJson.source === 'pool' || poolJson.source === 'pool_master_sample') && poolJson.recommendations) {
          const recs = poolJson.recommendations || {}
          const nextRails = Array.isArray(poolJson.rails) ? poolJson.rails : []
          setRecommendations(recs); setTasteProfile(poolJson.tasteProfile || null); setIsCached(true)
          setRails(nextRails)
          forYouCache.recommendations = recs; forYouCache.rails = nextRails; forYouCache.tasteProfile = poolJson.tasteProfile || null
          forYouCache.ts = Date.now()
          setLoading(false)
          const lastVisit = localStorage.getItem('for_you_last_visit')
          const now = Date.now()
          if (lastVisit && now - parseInt(lastVisit || '') > 4 * 3600000) setShowNewRecsBadge(true)
          localStorage.setItem('for_you_last_visit', String(now))
          return
        }
      }

      // 2. Pool vuota → calcola tutto
      const recsRes = await fetch('/api/recommendations?type=all')
      if (recsRes.ok) {
        const json = await recsRes.json()
        const incoming = json.recommendations || {}
        const merged: Record<string, Recommendation[]> = {}
        for (const [type, items] of Object.entries(incoming)) {
          if (Array.isArray(items) && (items as any[]).length > 0) merged[type] = items as Recommendation[]
        }
        setRecommendations(merged); setTasteProfile(json.tasteProfile || null); setIsCached(!!json.cached)
        const nextRails = Array.isArray(json.rails) ? json.rails : []
        setRails(nextRails)
        forYouCache.recommendations = merged; forYouCache.rails = nextRails; forYouCache.tasteProfile = json.tasteProfile || null
        forYouCache.ts = Date.now()
      }

      setLoading(false)
      const lastVisit = localStorage.getItem('for_you_last_visit')
      const now = Date.now()
      if (lastVisit && now - parseInt(lastVisit || '') > 4 * 3600000) setShowNewRecsBadge(true)
      localStorage.setItem('for_you_last_visit', String(now))
    }
    init()
    return () => {
      cancelled = true
      if (profileChannel) supabase.removeChannel(profileChannel)
    }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    setShowNewRecsBadge(false)
    const { data: { user } } = await supabase.auth.getUser()
    const [lightJson] = await Promise.all([
      fetch('/api/recommendations?type=all&refresh=1', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null),
      user ? fetchFriends(user.id) : Promise.resolve(),
    ])

    let json = lightJson

    if (json && json.recommendations) {
      const incoming = json.recommendations as Record<string, Recommendation[]>
      if (Array.isArray(json.rails)) {
        setRails(json.rails)
        forYouCache.rails = json.rails
      }
      setRecommendations(prev => {
        const merged = { ...prev }
        for (const [type, items] of Object.entries(incoming)) {
          if (Array.isArray(items) && items.length > 0) merged[type] = items
        }
        forYouCache.recommendations = merged
        forYouCache.ts = Date.now()
        return merged
      })
      if (json.tasteProfile) { setTasteProfile(json.tasteProfile); forYouCache.tasteProfile = json.tasteProfile }
      setIsCached(false)
    }
    setRefreshing(false)
  }

  // Pull-to-refresh su mobile — deve stare DOPO handleRefresh
  const { distance: pullDistance, refreshing: isPulling } = usePullToRefresh({
    onRefresh: handleRefresh,
    enabled: pathname === '/for-you',
  })

  const handleAdd = useCallback(async (item: Recommendation) => {
    if (addedIds.has(item.id) || addingIds.has(item.id)) return
    setAddingIds(prev => new Set([...prev, item.id]))
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { setAddingIds(prev => { const s = new Set(prev); s.delete(item.id); return s }); return }
    const isBoardgame = item.type === 'boardgame'
    const bggAchievementData = isBoardgame && ((item as any).complexity != null || (item as any).min_players != null || (item as any).playing_time != null)
      ? { bgg: { score: (item as any).score ?? null, complexity: (item as any).complexity ?? null, min_players: (item as any).min_players ?? null, max_players: (item as any).max_players ?? null, playing_time: (item as any).playing_time ?? null } }
      : null
    const res = await fetch('/api/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        external_id: item.id, title: item.title, type: item.type,
        cover_image: item.coverImage, genres: item.genres,
        tags: isBoardgame ? ((item as any).mechanics || []) : [],
        authors: isBoardgame ? ((item as any).designers || []) : [],
        achievement_data: bggAchievementData,
        status: (item.type === 'movie' || isBoardgame) ? 'completed' : 'watching',
        current_episode: isBoardgame ? null : 1,
        display_order: Date.now(),
      }),
    }).catch(() => null)
    if (res?.ok) {
      setAddedIds(prev => new Set([...prev, item.id]))
      addedTitlesRef.current.add(item.title.toLowerCase())
      await fetch('/api/recommendations/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rec_id: item.id, rec_type: item.type, rec_genres: item.genres, action: 'added' })
      })
      if (item.genres.length > 0) {
        triggerTasteDelta({ action: 'status_change', mediaId: item.id, mediaType: item.type, genres: item.genres, status: item.type === 'movie' ? 'completed' : 'watching' })
      }
      setDismissedIds(prev => new Set([...prev, item.id]))
      profileInvalidateBridge.invalidate()
    }
    setAddingIds(prev => { const s = new Set(prev); s.delete(item.id); return s })
  }, [supabase, addedIds, addingIds])

  const handleWishlist = useCallback(async (item: Recommendation) => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    if (wishlistIds.has(item.id)) {
      const res = await fetch('/api/wishlist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ external_id: item.id }),
      }).catch(() => null)
      if (res?.ok) setWishlistIds(prev => { const s = new Set(prev); s.delete(item.id); return s })
    } else {
      const res = await fetch('/api/wishlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_id: item.id,
          title: item.title,
          type: item.type,
          cover_image: item.coverImage,
        }),
      }).catch(() => null)
      if (!res?.ok) return
      setWishlistIds(prev => new Set([...prev, item.id]))
      if (item.genres.length > 0) {
        triggerTasteDelta({ action: 'wishlist_add', mediaId: item.id, mediaType: item.type, genres: item.genres })
      }
    }
  }, [supabase, wishlistIds, t])

  // Fix 1.15: "Simili a questo" — richiede i consigli filtrati per i generi del titolo
  const handleDetail = useCallback((item: Recommendation) => {
    const details: MediaDetails = {
      id: item.id,
      title: item.title,
      type: item.type,
      coverImage: item.coverImage,
      year: item.year,
      genres: item.genres,
      description: item.description,
      score: item.score,
      episodes: item.episodes,
      authors: item.authors,
      developers: item.developers,
      platforms: item.platforms,
      why: item.why,
      matchScore: item.matchScore,
      isAwardWinner: item.isAwardWinner,
      source: item.id.startsWith('anilist-anime') ? 'anilist'
        : item.id.startsWith('anilist-manga') ? 'anilist'
          : item.id.startsWith('tmdb-') ? 'tmdb'
            : item.id.startsWith('igdb-') ? 'igdb'
              : item.id.startsWith('ol-') ? 'ol'
                : item.id.startsWith('bgg-') ? 'bgg'
                  : item.type === 'boardgame' ? 'bgg'
                    : /^\d+$/.test(item.id) && item.type === 'game' ? 'igdb'
                      : /^\d+$/.test(item.id) && (item.type === 'movie' || item.type === 'tv' || item.type === 'anime') ? 'tmdb'
                        : undefined,
    }
    setDetailItem(details as any)
  }, [])

  // searchSimilar e handleSimilar unite — searchSimilar dichiarata prima per evitare
  // problemi di closure con useCallback deps=[]
  const searchSimilar = useCallback(async (title: string, genres: string[], excludeId?: string, tags?: string[], keywords?: string[], type?: string) => {
    const params = new URLSearchParams({ title })
    if (genres.length) params.set('genres', genres.slice(0, 5).join(','))
    if (tags?.length) params.set('tags', tags.slice(0, 15).join(','))
    if (keywords?.length) params.set('keywords', keywords.slice(0, 15).join(','))
    if (excludeId) params.set('excludeId', excludeId)
    if (type) params.set('type', type)
    const res = await fetch(`/api/recommendations/similar?${params}`)
    if (res.ok) {
      const json = await res.json()
      const items: Recommendation[] = (json.items || []).filter((r: Recommendation) => r.id !== excludeId)
      setSimilarSection({ sourceTitle: title, sourceType: (type as MediaType) || 'movie', items })
      scrollToTop('smooth')
    } else {
    }
  }, [])

  const handleSimilar = useCallback(async (item: Recommendation) => {
    if (!item.genres.length) return
    setSimilarLoading(item.id)
    await searchSimilar(item.title, item.genres, item.id, item.tags, item.keywords, item.type)
    setSimilarLoading(null)
  }, [searchSimilar])

  const sendFeedback = useCallback(async (item: Recommendation, action: FeedbackAction, reason?: FeedbackReason) => {
    await fetch('/api/recommendations/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rec_id: item.id, rec_type: item.type, rec_genres: item.genres, action, reason: reason || null })
    })
    if (action === 'not_interested' && item.genres.length > 0) {
      triggerTasteDelta({ action: 'status_change', mediaId: item.id, mediaType: item.type, genres: item.genres, status: 'dropped' })
    }
  }, [])

  const handleFeedback = useCallback((item: Recommendation, action: FeedbackAction, reason?: FeedbackReason) => {
    if (action === 'not_interested' && reason === undefined) {
      // Mostra il quick-reason sheet prima di inviare il segnale negativo.
      // Così il feedback non viene duplicato e il dismiss avviene solo alla conferma.
      setReasonPending(item)
      return
    }
    setDismissedIds(prev => new Set([...prev, item.id]))
    sendFeedback(item, action, reason)
  }, [sendFeedback])

  // Fix mutazione cache: clona i dati prima di modificarli
  // Senza clone, il boost si accumula ad ogni render perché modifica oggetti nel forYouCache
  const displayRecs = Object.fromEntries(
    Object.entries(recommendations).map(([type, items]) => [type, (items as Recommendation[]).map(r => ({ ...r }))])
  ) as Record<string, Recommendation[]>

  // Fix 2.9: eleva nelle sezioni i titoli guardati da amici con sim ≥80%
  const friendWatchingMap = new Map<string, string>()  // mediaId → username
  for (const a of friendsActivity) {
    if (a.isHighSim && a.mediaId && !friendWatchingMap.has(a.mediaId)) {
      friendWatchingMap.set(a.mediaId, a.displayName || a.username)
    }
  }
  // Inietta friendWatching nelle recs clonate (non nel cache originale)
  for (const recs of Object.values(displayRecs)) {
    for (const rec of recs) {
      if (friendWatchingMap.has(rec.id)) {
        rec.friendWatching = friendWatchingMap.get(rec.id)
        rec.matchScore = Math.min(100, rec.matchScore + 12)
      }
    }
  }

  const displayRailsWithFriends = rails.map(rail => ({
    ...rail,
    items: rail.items.map(rec => {
      if (!friendWatchingMap.has(rec.id)) return rec
      return { ...rec, friendWatching: friendWatchingMap.get(rec.id), matchScore: Math.min(100, rec.matchScore + 12) }
    }),
  }))

  const visibleRails = displayRailsWithFriends
    .map(rail => ({ ...rail, items: rail.items.filter(i => !dismissedIds.has(i.id)) }))
    .filter(rail => rail.items.length > 0)
  const spotlightItem = visibleRails.find(rail => rail.kind === 'top-match')?.items[0] || visibleRails[0]?.items[0]

  const hasEnoughData = totalEntries >= 1

  // Mostra solo sezioni per tipi che l'utente ha nella collezione
  // E ordina per numero di titoli consigliati (sezioni più ricche prima)
  const collectionSize = tasteProfile?.collectionSize || {}
  const ALL_SECTIONS: Array<{ key: MediaType; label: string }> = [
    { key: 'anime', label: fy.sections.anime },
    { key: 'game', label: fy.sections.game },
    { key: 'movie', label: fy.sections.movie },
    { key: 'tv', label: fy.sections.tv },
    { key: 'manga', label: fy.sections.manga },
    { key: 'boardgame', label: fy.sections.boardgame },
  ]
  // Fix 2.4: ordina per affinità reale (collectionSize nel profilo) non per count consigli
  // Chi ha più titoli nel profilo viene prima — riflette il tipo centrale per l'utente
  const SECTIONS = ALL_SECTIONS.filter(({ key }) =>
    (collectionSize[key] || 0) >= 1 || (displayRecs[key] || []).length >= 1
  ).sort((a, b) => {
    const sizeA = collectionSize[a.key] || 0
    const sizeB = collectionSize[b.key] || 0
    return sizeB - sizeA
  })
  const primarySectionKey = SECTIONS[0]?.key



  if (loading) return (
    <div className="gk-for-you-page min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="pt-2 md:pt-8 pb-28 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6">
        {/* Utility bar skeleton */}
        <div className="flex justify-end items-center gap-2 mb-4 animate-pulse">
          <div className="h-8 w-28 bg-zinc-900 border border-zinc-800/80 rounded-xl" />
          <div className="h-8 w-8 bg-zinc-900 border border-zinc-800/80 rounded-xl" />
        </div>
        {/* Search bar "Trova simili a…" */}
        <div className="h-9 w-full bg-zinc-900 rounded-2xl mb-6 animate-pulse" />
        <SkeletonForYouRow />
        <SkeletonForYouRow />
      </div>
    </div>
  )

  return (
    <div className="gk-for-you-page min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <PullToRefreshIndicator distance={pullDistance} refreshing={isPulling} />
      <div className="pt-2 md:pt-8 pb-24 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6">

        {!hasEnoughData ? (
          <EmptyState
            icon={Sparkles}
            title={fy.title}
            description={fy.emptyState}
            action={{ label: fy.emptyStateCta, href: '/discover' }}
            accent="violet"
          />
        ) : (
          <>
            {totalEntries < 15 && <LowConfidenceBanner totalEntries={totalEntries} />}
            {tasteProfile && <DNAWidget tasteProfile={tasteProfile} totalEntries={totalEntries} />}
            {/* Barra ricerca libera "Trova simili a..." + azioni pagina */}
            <SimilarSearchBar
              onSearch={(title, genres, keywords, type) => searchSimilar(title, genres, undefined, undefined, keywords, type)}
              loading={!!similarLoading}
              actions={(
                <>
                  <button onClick={() => setShowPrefs(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-[16px] border border-[var(--border)] bg-[var(--bg-card)] px-3.5 text-xs font-bold text-[var(--text-secondary)] transition-all hover:border-[rgba(230,255,61,0.28)] hover:text-[var(--text-primary)]">
                    <SlidersHorizontal size={14} />
                    <span>{fy.preferences}</span>
                  </button>
                  <div className="relative">
                    <button onClick={handleRefresh} disabled={refreshing}
                      className="flex h-10 w-10 items-center justify-center rounded-[16px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] transition-all hover:text-[var(--text-primary)] disabled:opacity-40"
                      aria-label="Aggiorna consigli">
                      <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                    {showNewRecsBadge && (
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full border border-black" style={{ background: 'var(--accent)' }} />
                    )}
                  </div>
                </>
              )}
            />

            {similarSection && (
              <SimilarSection
                key={similarSection.sourceTitle}
                sourceTitle={similarSection.sourceTitle}
                sourceType={similarSection.sourceType}
                items={similarSection.items}
                onFeedback={handleFeedback}
                onSimilar={handleSimilar}
                onDetail={handleDetail}
                onClose={() => setSimilarSection(null)}
                dismissedIds={dismissedIds}
                similarLoadingId={similarLoading}
                addedIds={addedIds}
                wishlistIds={wishlistIds}
                addingIds={addingIds}
                onAdd={handleAdd}
                onWishlist={handleWishlist}
              />
            )}
            {visibleRails.length > 0 ? visibleRails.map(rail => (
              <NetflixRailSection
                key={rail.id}
                rail={rail}
                onFeedback={handleFeedback}
                dismissedIds={dismissedIds}
                onSimilar={handleSimilar}
                onDetail={handleDetail}
                similarLoadingId={similarLoading}
                addedIds={addedIds}
                wishlistIds={wishlistIds}
                addingIds={addingIds}
                onAdd={handleAdd}
                onWishlist={handleWishlist}
              />
            )) : SECTIONS.map(({ key, label }) => {
              const items = displayRecs[key] || []
              const allItems = items
                .filter(i => !dismissedIds.has(i.id))
                .sort((a, b) => b.matchScore - a.matchScore)
              if (!allItems.length) return null
              return (
                <RecommendationSection
                  key={key}
                  type={key}
                  items={allItems}
                  label={label}
                  onAdd={handleAdd}
                  onWishlist={handleWishlist}
                  onFeedback={handleFeedback}
                  dismissedIds={dismissedIds}
                  onSimilar={handleSimilar}
                  onDetail={handleDetail}
                  similarLoadingId={similarLoading}
                  isPrimary={key === primarySectionKey}
                  addedIds={addedIds}
                  wishlistIds={wishlistIds}
                  addingIds={addingIds}
                />
              )
            })}

            {visibleRails.length === 0 && SECTIONS.every(({ key }) => {
              const items = (displayRecs[key] || []).filter(i => !dismissedIds.has(i.id))
              return !items.length
            }) && (
                <div className="text-center py-20">
                  <p className="text-zinc-400">{fy.sectionEmpty}</p>
                  <button onClick={handleRefresh} className="mt-4 text-sm hover:underline" style={{ color: 'var(--accent)' }}>{fy.refresh}</button>
                </div>
              )}
          </>
        )}
      </div>
      {showPrefs && <PreferencesModal onClose={() => setShowPrefs(false)} onSaved={handleRefresh} />}
      {/* Drawer dettaglio titolo — stesso del Discover */}
      {detailItem && (
        <MediaDetailsDrawer
          media={detailItem as any}
          onClose={() => setDetailItem(null)}
          onAdd={(media) => {
            setAddedIds(prev => new Set([...prev, media.id]))
            addedTitlesRef.current.add((media.title as string)?.toLowerCase())
            setDetailItem(null)
            profileInvalidateBridge.invalidate()
          }}
        />
      )}
      {/* Fix 2.6: quick-reason sheet */}
      {reasonPending && (
        <QuickReasonSheet
          item={reasonPending}
          onConfirm={(reason) => {
            setDismissedIds(prev => new Set([...prev, reasonPending.id]))
            sendFeedback(reasonPending, 'not_interested', reason)
            setReasonPending(null)
          }}
          onDismiss={() => setReasonPending(null)}
        />
      )}
    </div>
  )
}
