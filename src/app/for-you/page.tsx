'use client'
// DESTINAZIONE: src/app/for-you/page.tsx
// V5: Serendipity badge + Award badge + Seasonal badge + Social boost display +
//     lowConfidence banner + Feedback granulare micro-menu + Anti-ripetizione (recommendations_shown)

import { useState, useEffect, useCallback, memo, useRef } from 'react'
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
    <span className="inline-flex items-center gap-1 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-full" style={{ color: 'var(--accent)', background: 'rgba(230,255,61,0.1)', border: '1px solid rgba(230,255,61,0.2)' }}>
      <Star size={8} fill="currentColor" />{score}%
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
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
                  <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'already_seen') }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-white hover:bg-zinc-600/60 transition-colors">
                    <Eye size={11} />
                  </button>
                </div>
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
          <span className="text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm" style={{ background: colorClass }}>
            {TYPE_LABEL[item.type] || item.type.toUpperCase()}
          </span>
          {item.creatorBoost && showDetails && (
            <span className="max-w-[110px] truncate rounded-full border border-white/10 bg-black/65 px-2 py-0.5 text-[9px] font-bold text-zinc-200 backdrop-blur-sm">
              {item.creatorBoost}
            </span>
          )}
        </div>

        <div className="absolute right-2 top-2">
          <MatchBadge score={item.isContinuity ? 100 : item.matchScore} />
        </div>

        {signals.length > 0 && (
          <div className="absolute bottom-12 left-2 right-2 flex flex-wrap gap-1.5">
            {signals.slice(0, showDetails ? 3 : 2).map(signal => {
              const SignalIcon = signal.icon
              return (
                <span key={signal.key} className={`inline-flex min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold backdrop-blur-sm ${signal.tone}`}>
                  <SignalIcon size={9} className="flex-shrink-0" />
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

        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onAdd?.(item) }}
            disabled={addDisabled || !onAdd}
            title={added ? 'Già in libreria' : 'Aggiungi alla libreria'}
            className={`flex h-8 flex-1 items-center justify-center gap-1 rounded-xl text-[11px] font-black transition-all disabled:cursor-default ${added
                ? 'bg-[var(--accent)] text-[#0B0B0F]'
                : 'bg-white text-black hover:bg-zinc-200 disabled:opacity-50'
              }`}
          >
            {added ? <Check size={13} /> : <Plus size={13} />}
            <span>{added ? 'Aggiunto' : 'Add'}</span>
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); onWishlist?.(item) }}
            disabled={!onWishlist}
            title={wishlisted ? 'Rimuovi dalla wishlist' : 'Aggiungi alla wishlist'}
            className={`flex h-8 w-8 items-center justify-center rounded-xl border backdrop-blur-sm transition-all ${wishlisted
                ? 'border-[rgba(230,255,61,0.55)] bg-black/75 text-[var(--accent)]'
                : 'border-white/10 bg-black/68 text-zinc-200 hover:text-[var(--accent)]'
              }`}
          >
            {wishlisted ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
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
      <div className="flex items-center gap-1">
        <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'not_interested') }} title="Non mi interessa"
          className="w-7 h-7 flex items-center justify-center rounded-full bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-red-300 hover:border-red-900/70 transition-colors">
          <ThumbsDown size={11} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'already_seen') }} title="L'ho già visto"
          className="w-7 h-7 flex items-center justify-center rounded-full bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
          <Eye size={11} />
        </button>
        {onSimilar && (
          <button onClick={(e) => { e.stopPropagation(); onSimilar(item) }} disabled={isSimilarLoading} title="Simili"
            className={`w-7 h-7 flex items-center justify-center rounded-full border transition-colors ${isSimilarLoading ? 'bg-zinc-800/80 border-zinc-700' : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600'}`}
            style={isSimilarLoading ? { color: 'var(--accent)' } : {}}>
            {isSimilarLoading ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
          </button>
        )}
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

function SimilarSearchBar({ onSearch, loading }: {
  onSearch: (title: string, genres: string[], keywords?: string[], type?: string) => void
  loading: boolean
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
      {/* Input — stile identico alla navbar */}
      <div className="relative">
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
          <button onClick={handleClear} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
            <X size={13} />
          </button>
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
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-500 transition-all text-xs font-semibold">
                Mostra altri
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

// v6: Generic rail component
const RecommendationRailSection = memo(function RecommendationRailSection({
  rail, onFeedback, onSimilar, onDetail, dismissedIds, similarLoadingId,
  addedIds, wishlistIds, addingIds, onAdd, onWishlist,
}: {
  rail: RecommendationRail
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  dismissedIds: Set<string>
  similarLoadingId?: string | null
  addedIds: Set<string>
  wishlistIds: Set<string>
  addingIds: Set<string>
  onAdd: (i: Recommendation) => void
  onWishlist: (i: Recommendation) => void
}) {
  const visible = rail.items.filter(i => !dismissedIds.has(i.id))
  if (!visible.length) return null

  const kindIcon: Record<string, React.ElementType> = {
    'top-match': Brain,
    continue: ArrowRight,
    social: Users,
    fresh: Sparkles,
    discovery: Compass,
    genre: Tag,
    'because-title': Search,
    'quick-picks': Zap,
    'hidden-gems': Trophy,
  }
  const Icon = kindIcon[rail.kind] || Sparkles

  return (
    <div className="mb-10">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-[rgba(230,255,61,0.24)] bg-[rgba(230,255,61,0.07)] text-[var(--accent)]">
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-[15px] font-black text-white">{rail.title}</h2>
            {rail.badge && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[9px] font-bold text-zinc-400">{rail.badge}</span>}
          </div>
          <p className="line-clamp-1 text-[11px] text-zinc-500">{rail.subtitle}</p>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
        {visible.map(item => (
          <RecommendationCard
            key={item.id}
            item={item}
            onFeedback={onFeedback}
            onSimilar={onSimilar}
            onDetail={onDetail}
            isSimilarLoading={similarLoadingId === item.id}
            dismissed={dismissedIds.has(item.id)}
            showDetails={rail.kind === 'top-match' || rail.kind === 'social' || rail.kind === 'because-title'}
            added={addedIds.has(item.id)}
            wishlisted={wishlistIds.has(item.id)}
            adding={addingIds.has(item.id)}
            onAdd={onAdd}
            onWishlist={onWishlist}
          />
        ))}
      </div>
    </div>
  )
})

function buildFallbackRails(items: Recommendation[]): RecommendationRail[] {
  const byScore = [...items].sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
  const top = byScore.slice(0, 10)
  const discovery = byScore.filter(i => i.isDiscovery || i.isSerendipity).slice(0, 10)
  const social = byScore.filter(i => i.friendWatching || i.socialBoost).slice(0, 10)
  const award = byScore.filter(i => i.isAwardWinner || i.isSeasonal).slice(0, 10)

  const rails: RecommendationRail[] = []
  if (top.length) rails.push({ id: 'top-match', title: 'Top match per te', subtitle: 'I consigli con maggiore affinità, ma non solo score.', kind: 'top-match', items: top, priority: 100 })
  if (social.length) rails.push({ id: 'social', title: 'Visti dalla tua cerchia', subtitle: 'Titoli con segnali dagli utenti che segui.', kind: 'social', items: social, priority: 90 })
  if (discovery.length) rails.push({ id: 'discovery', title: 'Fuori dalla comfort zone', subtitle: 'Serendipity controllata per evitare consigli troppo ripetitivi.', kind: 'discovery', items: discovery, priority: 80 })
  if (award.length) rails.push({ id: 'fresh-awards', title: 'Premiati e stagionali', subtitle: 'Titoli con segnali editoriali forti.', kind: 'fresh', items: award, priority: 70 })

  const byType = new Map<MediaType, Recommendation[]>()
  for (const item of byScore) {
    if (!byType.has(item.type)) byType.set(item.type, [])
    byType.get(item.type)!.push(item)
  }
  for (const [type, typeItems] of byType) {
    if (typeItems.length >= 4) {
      rails.push({
        id: `type-${type}`,
        title: `${TYPE_LABEL[type]} che potresti amare`,
        subtitle: 'Rilevanza + varietà controllata.',
        kind: 'genre',
        items: typeItems.slice(0, 10),
        priority: 50,
      })
    }
  }

  return rails.sort((a, b) => (b.priority || 0) - (a.priority || 0)).slice(0, 8)
}

// ════════════════════════════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════════════════════════════

export default function ForYouPage() {
  const { t } = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const scrollRef = useScrollPanel()
  const isTabActive = useTabActive('/for-you')

  const [items, setItems] = useState<Recommendation[]>([])
  const [rails, setRails] = useState<RecommendationRail[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeType, setActiveType] = useState<MediaType | 'all'>('all')
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<Recommendation | null>(null)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [feedbackToast, setFeedbackToast] = useState<{ msg: string; undo?: () => void } | null>(null)
  const [lowConfidence, setLowConfidence] = useState(false)
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null)
  const [similarSection, setSimilarSection] = useState<{ title: string; type: MediaType; items: Recommendation[] } | null>(null)
  const [similarLoadingId, setSimilarLoadingId] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set())
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set())
  const [friendActivity, setFriendActivity] = useState<FriendActivity[]>([])
  const userIdRef = useRef<string | null>(null)
  const [isSwipeMode, setIsSwipeMode] = useState(false)

  const shownRef = useRef<Set<string>>(new Set())
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const markShown = useCallback((recs: Recommendation[], userId?: string | null) => {
    if (!userId) return
    const unseen = recs.filter(r => !shownRef.current.has(r.id)).slice(0, 40)
    if (!unseen.length) return
    unseen.forEach(r => shownRef.current.add(r.id))
    fetch('/api/recommendations/shown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unseen.map(r => r.id), context: 'for-you' }),
    }).catch(() => { })
  }, [])

  const fetchRecommendations = useCallback(async (force = false) => {
    setLoading(!force)
    setRefreshing(force)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); setRefreshing(false); return }
      userIdRef.current = user.id

      const url = `/api/recommendations?type=${activeType === 'all' ? 'all' : activeType}${force ? '&refresh=1' : ''}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed')
      const data = await res.json()
      let recs: Recommendation[] = []
      let apiRails: RecommendationRail[] = []

      if (Array.isArray(data)) {
        recs = data
      } else {
        recs = data.items || data.recommendations || []
        apiRails = data.rails || []
        setLowConfidence(!!data.lowConfidence)
        setTasteProfile(data.tasteProfile || null)
      }

      if (activeType !== 'all') recs = recs.filter(r => r.type === activeType)

      const finalRails = apiRails.length ? apiRails : buildFallbackRails(recs)
      setItems(recs)
      setRails(finalRails)
      markShown(recs, user.id)

      // Carica stato già in libreria/wishlist
      const ids = recs.map(r => r.id)
      if (ids.length) {
        const [{ data: mediaRows }, { data: wishlistRows }] = await Promise.all([
          supabase.from('user_media_entries').select('media_id').eq('user_id', user.id).in('media_id', ids),
          supabase.from('wishlist').select('media_id').eq('user_id', user.id).in('media_id', ids),
        ])
        setAddedIds(new Set((mediaRows || []).map((r: any) => r.media_id)))
        setWishlistIds(new Set((wishlistRows || []).map((r: any) => r.media_id)))
      }
    } catch (e) { console.error('recommendations', e) }
    setLoading(false)
    setRefreshing(false)
  }, [activeType, supabase, markShown])

  useEffect(() => { fetchRecommendations() }, [fetchRecommendations])

  useEffect(() => {
    let cancelled = false
    const loadFriends = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const res = await fetch('/api/social/friend-activity?limit=8').catch(() => null)
      if (!res?.ok) return
      const data = await res.json().catch(() => [])
      if (!cancelled) setFriendActivity(Array.isArray(data) ? data : [])
    }
    loadFriends()
    return () => { cancelled = true }
  }, [supabase])

  const { distance: pullDistance, refreshing: isPullRefreshing } = usePullToRefresh({
    onRefresh: () => fetchRecommendations(true),
    containerRef: scrollRef,
    enabled: isTabActive && !isSwipeMode && !detail && !prefsOpen,
  })

  useEffect(() => {
    if (!isSwipeMode) return
    const close = () => setIsSwipeMode(false)
    androidBack.push(close)
    return () => androidBack.pop(close)
  }, [isSwipeMode])

  const sendSwipeFeedback = useCallback(async (item: Recommendation, action: FeedbackAction, rating?: number, reason?: FeedbackReason) => {
    // Rimuovi subito dalla UI
    setDismissedIds(prev => new Set([...prev, item.id]))
    setFeedbackToast({
      msg: action === 'not_interested' ? 'Nascosto' : action === 'already_seen' ? 'Segnato come visto' : 'Salvato',
      undo: () => {
        if (dismissTimersRef.current.has(item.id)) {
          clearTimeout(dismissTimersRef.current.get(item.id)!)
          dismissTimersRef.current.delete(item.id)
        }
        setDismissedIds(prev => { const n = new Set(prev); n.delete(item.id); return n })
      },
    })

    const timer = setTimeout(async () => {
      dismissTimersRef.current.delete(item.id)
      await fetch('/api/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: item.id, mediaType: item.type, action, reason, rating }),
      }).catch(() => { })
    }, 900)
    dismissTimersRef.current.set(item.id, timer)
  }, [])

  const handleAdd = useCallback(async (item: Recommendation) => {
    if (addedIds.has(item.id) || addingIds.has(item.id)) return
    setAddingIds(prev => new Set(prev).add(item.id))
    try {
      const res = await fetch('/api/media/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_id: item.id,
          title: item.title,
          type: item.type,
          cover_image: item.coverImage,
          total_episodes: item.episodes,
          episodes: item.episodes,
          status: 'watching',
          rating: item.score,
          genres: item.genres,
        }),
      })
      if (res.ok) {
        setAddedIds(prev => new Set(prev).add(item.id))
        setFeedbackToast({ msg: 'Aggiunto alla libreria' })
        profileInvalidateBridge.notify()
        triggerTasteDelta({ action: 'status_change', mediaId: item.id, mediaType: item.type, genres: item.genres, status: 'watching' })
      }
    } catch { }
    setAddingIds(prev => { const n = new Set(prev); n.delete(item.id); return n })
  }, [addedIds, addingIds])

  const handleWishlist = useCallback(async (item: Recommendation) => {
    const exists = wishlistIds.has(item.id)
    setWishlistIds(prev => { const n = new Set(prev); exists ? n.delete(item.id) : n.add(item.id); return n })
    await fetch('/api/wishlist', {
      method: exists ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediaId: item.id,
        mediaType: item.type,
        title: item.title,
        coverImage: item.coverImage,
        year: item.year,
        genres: item.genres,
        score: item.score,
        matchScore: item.matchScore,
      }),
    }).catch(() => { })
    if (!exists) {
      setFeedbackToast({ msg: 'Aggiunto alla wishlist' })
      triggerTasteDelta({ action: 'wishlist_add', mediaId: item.id, mediaType: item.type, genres: item.genres })
    }
  }, [wishlistIds])

  const handleSimilar = useCallback(async (item: Recommendation) => {
    setSimilarLoadingId(item.id)
    try {
      const params = new URLSearchParams({
        title: item.title,
        type: item.type,
        genres: item.genres.slice(0, 5).join(','),
      })
      if (item.keywords?.length) params.set('keywords', item.keywords.slice(0, 8).join(','))
      const res = await fetch(`/api/recommendations/similar?${params}`)
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : (data.items || data.recommendations || [])
        setSimilarSection({ title: item.title, type: item.type, items: list })
      }
    } catch { }
    setSimilarLoadingId(null)
  }, [])

  const handleManualSimilarSearch = useCallback(async (title: string, genres: string[], keywords?: string[], type?: string) => {
    setSimilarLoadingId('__manual__')
    try {
      const params = new URLSearchParams({ title, type: type || 'all' })
      if (genres.length) params.set('genres', genres.slice(0, 6).join(','))
      if (keywords?.length) params.set('keywords', keywords.slice(0, 10).join(','))
      const res = await fetch(`/api/recommendations/similar?${params}`)
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data) ? data : (data.items || data.recommendations || [])
        setSimilarSection({ title, type: (type as MediaType) || 'movie', items: list })
      }
    } catch { }
    setSimilarLoadingId(null)
  }, [])

  const toMediaDetails = (item: Recommendation): MediaDetails => ({
    id: item.id,
    title: item.title,
    type: item.type as any,
    coverImage: item.coverImage,
    year: item.year,
    genres: item.genres,
    score: item.score,
    description: item.description,
    why: item.why,
    matchScore: item.matchScore,
    episodes: item.episodes,
    authors: item.authors,
    developers: item.developers,
    platforms: item.platforms,
    min_players: item.min_players,
    max_players: item.max_players,
    playing_time: item.playing_time,
    complexity: item.complexity,
    tags: item.tags,
    isAwardWinner: item.isAwardWinner,
    externalId: item.id,
  })

  const filteredItems = activeType === 'all' ? items : items.filter(i => i.type === activeType)
  const visibleItems = filteredItems.filter(i => !dismissedIds.has(i.id))
  const totalCount = items.length
  const discoveryCount = items.filter(i => i.isDiscovery || i.isSerendipity).length
  const socialCount = items.filter(i => i.friendWatching || i.socialBoost).length

  if (loading && !refreshing) {
    return <div className="min-h-screen bg-[var(--bg-primary)] text-white pb-24">
      <div className="mx-auto max-w-6xl px-4 pt-4 md:pt-8">
        <div className="mb-6 h-40 rounded-[30px] bg-[var(--bg-card)] skeleton" />
        {Array.from({ length: 4 }).map((_, i) => <SkeletonForYouRow key={i} />)}
      </div>
    </div>
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white pb-28">
      <PullToRefreshIndicator distance={pullDistance} refreshing={isPullRefreshing || refreshing} />
      <div ref={scrollRef} className="mx-auto max-w-6xl px-4 pt-3 md:pt-8">
        <div className="mb-6 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(135deg,rgba(230,255,61,0.09),rgba(139,92,246,0.07),rgba(20,20,27,0.92))] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] md:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.35)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
              <Sparkles size={12} />
              For You engine
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIsSwipeMode(true)} className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-bold text-zinc-200 hover:text-[var(--accent)] transition-colors">
                <Shuffle size={14} /> Swipe
              </button>
              <button onClick={() => fetchRecommendations(true)} disabled={refreshing} className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-bold text-zinc-200 hover:text-[var(--accent)] transition-colors disabled:opacity-50">
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
              </button>
              <button onClick={() => setPrefsOpen(true)} className="inline-flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-bold text-zinc-200 hover:text-[var(--accent)] transition-colors">
                <SlidersHorizontal size={14} /> Tune
              </button>
            </div>
          </div>
          <h1 className="gk-h1 mb-2">Consigli che imparano, ma non si fossilizzano.</h1>
          <p className="gk-body max-w-2xl">Match score, segnali social, serendipity controllata e feedback negativo granulare per evitare il loop dei soliti titoli.</p>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-4 md:grid-cols-4">
            <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5"><p className="font-mono-data text-[20px] font-black text-[var(--accent)] leading-none">{totalCount}</p><p className="gk-label mt-1">titoli</p></div>
            <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5"><p className="font-mono-data text-[20px] font-black text-white leading-none">{discoveryCount}</p><p className="gk-label mt-1">scoperte</p></div>
            <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5"><p className="font-mono-data text-[20px] font-black text-white leading-none">{socialCount}</p><p className="gk-label mt-1">social</p></div>
            <div className="hidden rounded-2xl bg-black/18 p-3 ring-1 ring-white/5 md:block"><p className="font-mono-data text-[20px] font-black text-white leading-none">{activeType === 'all' ? 'all' : TYPE_LABEL[activeType]}</p><p className="gk-label mt-1">filtro</p></div>
          </div>
        </div>

        <DNAWidget profile={tasteProfile} compact />

        {lowConfidence && (
          <div className="mb-6 rounded-[22px] border border-amber-500/25 bg-amber-500/8 p-4 text-sm text-amber-200">
            <div className="mb-1 flex items-center gap-2 font-black"><AlertCircle size={16} /> Profilo gusto ancora giovane</div>
            Valuta o aggiungi più media: useremo questi segnali per alzare la qualità dei consigli.
          </div>
        )}

        <div className="mb-6 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {(['all', 'anime', 'manga', 'movie', 'tv', 'game', 'boardgame'] as const).map(type => {
            const active = activeType === type
            const label = type === 'all' ? 'Tutti' : TYPE_LABEL[type]
            return (
              <button key={type} onClick={() => setActiveType(type)} className="flex-shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition-all"
                style={active ? { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#0B0B0F' } : { background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                {label}
              </button>
            )
          })}
        </div>

        <SimilarSearchBar onSearch={handleManualSimilarSearch} loading={similarLoadingId === '__manual__'} />

        {similarSection && (
          <SimilarSection
            sourceTitle={similarSection.title}
            sourceType={similarSection.type}
            items={similarSection.items}
            onFeedback={sendSwipeFeedback}
            onSimilar={handleSimilar}
            onDetail={setDetail}
            onClose={() => setSimilarSection(null)}
            dismissedIds={dismissedIds}
            similarLoadingId={similarLoadingId}
            addedIds={addedIds}
            wishlistIds={wishlistIds}
            addingIds={addingIds}
            onAdd={handleAdd}
            onWishlist={handleWishlist}
          />
        )}

        <ContinuitySection items={visibleItems} onFeedback={sendSwipeFeedback} onDetail={setDetail} dismissedIds={dismissedIds} />

        {rails.map(rail => (
          <RecommendationRailSection
            key={rail.id}
            rail={activeType === 'all' ? rail : { ...rail, items: rail.items.filter(i => i.type === activeType) }}
            onFeedback={sendSwipeFeedback}
            onSimilar={handleSimilar}
            onDetail={setDetail}
            dismissedIds={dismissedIds}
            similarLoadingId={similarLoadingId}
            addedIds={addedIds}
            wishlistIds={wishlistIds}
            addingIds={addingIds}
            onAdd={handleAdd}
            onWishlist={handleWishlist}
          />
        ))}

        {visibleItems.length === 0 && (
          <EmptyState title="Nessun consiglio visibile" subtitle="Aggiorna o modifica i gusti per generare nuovi suggerimenti." icon={<Sparkles size={32} />} action={{ label: 'Aggiorna', onClick: () => fetchRecommendations(true) }} />
        )}
      </div>

      {friendActivity.length > 0 && (
        <div className="mx-auto max-w-6xl px-4 pb-8">
          <div className="rounded-[26px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="mb-3 flex items-center gap-2"><Users size={16} className="text-[var(--accent)]" /><p className="gk-label">Dalla tua cerchia</p></div>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
              {friendActivity.map(a => (
                <Link key={`${a.userId}-${a.mediaId}`} href={`/profile/${a.username}`} className="flex w-56 flex-shrink-0 items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <Avatar src={a.avatarUrl} username={a.username} displayName={a.displayName} size={34} className="rounded-xl" />
                  <div className="min-w-0"><p className="truncate text-xs font-bold text-white">{a.displayName || a.username}</p><p className="truncate text-[11px] text-zinc-500">sta seguendo {a.mediaTitle}</p></div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {detail && (
        <MediaDetailsDrawer
          media={toMediaDetails(detail)}
          open={!!detail}
          onClose={() => setDetail(null)}
          onAdd={(m) => handleAdd(detail)}
          onWishlist={(m) => handleWishlist(detail)}
          isAdded={addedIds.has(detail.id)}
          isWishlisted={wishlistIds.has(detail.id)}
        />
      )}

      <PreferencesModal open={prefsOpen} onClose={() => setPrefsOpen(false)} onSaved={() => fetchRecommendations(true)} />

      {isSwipeMode && (
        <FullScreenSwipe
          items={visibleItems as any as SwipeItem[]}
          onClose={() => setIsSwipeMode(false)}
          sendSwipeFeedback={sendSwipeFeedback as any}
          handleWishlist={handleWishlist as any}
          userIdRef={userIdRef}
        />
      )}

      {feedbackToast && (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-1/2 z-[300] -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-bold text-white shadow-2xl">
          {feedbackToast.msg}
          {feedbackToast.undo && <button onClick={() => { feedbackToast.undo?.(); setFeedbackToast(null) }} className="ml-3 text-[var(--accent)]">Annulla</button>}
        </div>
      )}
    </div>
  )
}

function FullScreenSwipe({ items, onClose, sendSwipeFeedback, handleWishlist, userIdRef }: {
  items: SwipeItem[]
  onClose: () => void
  sendSwipeFeedback: (item: Recommendation, action: FeedbackAction, rating?: number, reason?: FeedbackReason) => void
  handleWishlist: (item: Recommendation) => void
  userIdRef: React.MutableRefObject<string | null>
}) {
  const requestMore = async (filter?: any): Promise<SwipeItem[]> => {
    const params = new URLSearchParams({ type: filter && filter !== 'all' ? filter : 'all', refresh: '1' })
    const res = await fetch(`/api/recommendations?${params}`)
    if (!res.ok) return []
    const data = await res.json()
    const list = Array.isArray(data) ? data : (data.items || data.recommendations || [])
    return list
  }

  return (
    <SwipeMode
      items={items}
      userId={userIdRef.current || undefined}
      onSeen={(item, rating) => sendSwipeFeedback(item, 'already_seen', rating ?? undefined)}
      onSkip={(item) => sendSwipeFeedback(item, 'not_interested')}
      onClose={onClose}
      onRequestMore={requestMore}
      standalone
      onUndo={(item) => {
        // opzionale: ripristina UI se necessario
      }}
      onUndoWishlist={(item) => {
        // opzionale
      }}
    />
  )
}