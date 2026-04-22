'use client'
// DESTINAZIONE: src/app/for-you/page.tsx
// V5: Serendipity badge + Award badge + Seasonal badge + Social boost display +
//     lowConfidence banner + Feedback granulare micro-menu + Anti-ripetizione (recommendations_shown)

import { useState, useEffect, useCallback, memo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, RefreshCw, SlidersHorizontal, Gamepad2, Tv, Film,
  Zap, Plus, Bookmark, X, Check, ChevronDown, ChevronUp, Users, Compass,
  ThumbsDown, Eye, Flame, Brain, Star, ArrowRight, Clapperboard, Swords,
  TrendingUp, Search, BookmarkCheck, Trophy, Calendar,
  MessageCircleQuestion, Tag, MonitorPlay, AlertCircle, Layers, Shuffle,
  Dices,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import { Avatar } from '@/components/ui/Avatar'
import { useLocale } from '@/lib/locale'
import { SkeletonForYouRow, SkeletonFriendsWatching } from '@/components/ui/SkeletonCard'
import { SimilarTasteFriends } from '@/components/social/SimilarTasteFriends'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '@/components/ui/ErrorState'
import { PreferencesModal } from '@/components/for-you/PreferencesModal'
import { DNAWidget } from '@/components/for-you/DNAWidget'
import type { TasteProfile } from '@/components/for-you/DNAWidget'
import { SwipeMode } from '@/components/for-you/SwipeMode'
import type { SwipeItem } from '@/components/for-you/SwipeMode'

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
  boardgame: Dices, }

const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', movie: 'Film', tv: 'Serie TV', game: 'Gioco',
  boardgame: 'Tavolo', }

const TYPE_COLORS: Record<string, string> = {
  anime: 'from-sky-500 to-blue-600',
  manga: 'from-orange-500 to-red-500',
  movie: 'from-red-500 to-rose-600',
  tv: 'from-purple-500 to-violet-600',
  game: 'from-emerald-500 to-green-600',
  boardgame: 'from-amber-500 to-yellow-600',
  }

function triggerTasteDelta(options: {
  action: 'rating' | 'status_change' | 'wishlist_add' | 'rewatch' | 'progress'
  mediaId: string; mediaType: string; genres: string[]
  rating?: number; prevRating?: number; status?: string; prevStatus?: string
}) {
  fetch('/api/taste/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) }).catch(() => {})
}

function MatchBadge({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-300 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded-full">
      <Star size={8} fill="currentColor" />{score}%
    </span>
  )
}

function ContinuityBadge({ from }: { from: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full truncate max-w-full">
      <ArrowRight size={8} />→ {from}
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
        <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
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
                  ? <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
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
              {item.continuityFrom && (
                <p className="text-[10px] text-amber-400/80 line-clamp-1">→ {item.continuityFrom}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})

const RecommendationCard = memo(function RecommendationCard({ item, onFeedback, onSimilar, onDetail, isSimilarLoading, dismissed, showDetails }: {
  item: Recommendation
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  isSimilarLoading: boolean; dismissed: boolean
  showDetails?: boolean
}) {
  const Icon = TYPE_ICONS[item.type]; const colorClass = TYPE_COLORS[item.type]
  if (dismissed) return null

  const episodeLabel = item.type === 'manga'
    ? (item.episodes ? `${item.episodes} cap.` : null)
    : (item.episodes && item.type !== 'movie' ? `${item.episodes} ep.` : null)

  return (
    <div className={`flex-shrink-0 group ${showDetails ? 'w-48' : 'w-36'}`}>
      <div
        className={`relative ${showDetails ? 'h-64' : 'h-52'} rounded-2xl overflow-hidden bg-zinc-900 mb-2 cursor-pointer`}
        onClick={() => onDetail?.(item)}
      >
        {item.coverImage
          ? <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          : <div className="w-full h-full flex items-center justify-center"><Icon size={32} className="text-zinc-700" /></div>
        }
        {/* Solo badge tipo media in alto a sinistra */}
        <div className={`absolute top-2 left-2 bg-gradient-to-r ${colorClass} text-white text-[10px] font-bold px-2 py-0.5 rounded-full`}>
          {TYPE_LABEL[item.type] || item.type.toUpperCase()}
        </div>
        {/* Pulsanti azione in basso */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'not_interested') }} title="Non mi interessa"
            className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-red-300 hover:bg-red-900/60 transition-colors">
            <ThumbsDown size={11} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'already_seen') }} title="L'ho già visto"
            className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-white hover:bg-zinc-600/60 transition-colors">
            <Eye size={11} />
          </button>
          {onSimilar && (
            <button onClick={(e) => { e.stopPropagation(); onSimilar(item) }} disabled={isSimilarLoading} title="Simili"
              className={`w-7 h-7 flex items-center justify-center rounded-full backdrop-blur-sm transition-colors ${isSimilarLoading ? 'bg-violet-900/60 text-violet-300' : 'bg-black/60 text-zinc-300 hover:text-violet-200 hover:bg-violet-900/60'}`}>
              {isSimilarLoading ? <RefreshCw size={11} className="animate-spin" /> : <Search size={11} />}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs font-semibold text-white leading-tight line-clamp-2 mb-1">{item.title}</p>
      {/* Metadati: anno · episodi · voto (sempre visibile, voto a destra dell'anno) */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        {item.year && <p className="text-[10px] text-zinc-500">{item.year}</p>}
        {item.score && (
          <span className="flex items-center gap-0.5 text-[10px] text-yellow-400 font-semibold">
            <Star size={8} fill="currentColor" />{Math.min(item.score, 5).toFixed(1)}
          </span>
        )}
        {episodeLabel && (
          <span className="text-[10px] text-zinc-500">{episodeLabel}</span>
        )}
      </div>
      {/* Badge: Sequel per continuity, % match per le card normali, niente per scoperta */}
      {item.isContinuity
        ? <ContinuityBadge from={item.continuityFrom || ''} />
        : !item.isDiscovery
        ? <MatchBadge score={item.matchScore} />
        : null
      }
    </div>
  )
})

const HeroMatchSection = memo(function HeroMatchSection({ items, onFeedback, onSimilar, onDetail, dismissedIds }: {
  items: Recommendation[]
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  dismissedIds: Set<string>
}) {
  const { t } = useLocale(); const fy = t.forYou
  const top = items
    .filter(i => i.matchScore >= 75 && !dismissedIds.has(i.id) && !i.isContinuity)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6)
  if (top.length < 2) return null

  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
          <Flame size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Match Forte</h2>
          <p className="text-xs text-zinc-500">I più compatibili con i tuoi gusti</p>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
        {top.map(item => {
          const Icon = TYPE_ICONS[item.type]; const colorClass = TYPE_COLORS[item.type]
          return (
            <div key={item.id} className="flex-shrink-0 w-44 group relative cursor-pointer" onClick={() => onDetail?.(item)}>
              <div className="relative h-64 rounded-2xl overflow-hidden bg-zinc-900 mb-2">
                {item.coverImage
                  ? <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center"><Icon size={36} className="text-zinc-700" /></div>
                }
                <div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute top-2 right-2 bg-violet-600 text-white text-[10px] font-black px-2 py-1 rounded-full flex items-center gap-1">
                  <Star size={9} fill="currentColor" />{item.matchScore}%
                </div>
                <div className={`absolute top-2 left-2 bg-gradient-to-r ${colorClass} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full`}>
                  {TYPE_LABEL[item.type]}
                </div>
                {item.creatorBoost && (
                  <div className="absolute bottom-10 left-2 right-2">
                    <span className="text-[9px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded-full border border-sky-500/30 flex items-center gap-0.5 w-fit max-w-full truncate">
                      <Clapperboard size={7} />{item.creatorBoost}
                    </span>
                  </div>
                )}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'not_interested') }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-red-300 hover:bg-red-900/60 transition-colors">
                    <ThumbsDown size={11} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'already_seen') }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-white hover:bg-zinc-600/60 transition-colors">
                    <Eye size={11} />
                  </button>
                  {onSimilar && (
                    <button onClick={(e) => { e.stopPropagation(); onSimilar(item) }}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-violet-200 hover:bg-violet-900/60 transition-colors">
                      <Search size={11} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs font-bold text-white leading-tight line-clamp-2 mb-0.5">{item.title}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {item.year && <span className="text-[10px] text-zinc-500">{item.year}</span>}
                {item.score && (
                  <span className="flex items-center gap-0.5 text-[10px] text-yellow-400 font-semibold">
                    <Star size={8} fill="currentColor" />{Math.min(item.score, 5).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})

// Sezione "Simili a X" — persiste finché l'utente non la chiude o cerca un altro simile
// Barra di ricerca "Trova titoli simili a..." — stile identico alla navbar
// Cerca in tutte le API (AniList, TMDb, IGDB) in parallelo — stesso pattern della discover
const TYPE_LABEL_SEARCH: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', movie: 'Film', tv: 'Serie TV',
  game: 'Gioco', }

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
        for (const r of parse(j).slice(0, 1)) {
          all.push({ id: r.id || r.external_id, title: r.title, type: r.type || 'anime', genres: r.genres, year: r.year, coverImage: r.coverImage || r.cover_image, keywords: r.tags })
        }
      }
      if (tmdbRes.status === 'fulfilled' && tmdbRes.value.ok) {
        const j = await tmdbRes.value.json()
        for (const r of parse(j).slice(0, 1)) {
          all.push({ id: r.id || r.external_id, title: r.title, type: r.type || 'movie', genres: r.genres, year: r.year, coverImage: r.coverImage || r.cover_image, description: r.description, keywords: r.keywords })
        }
      }
      if (igdbRes.status === 'fulfilled' && igdbRes.value.ok) {
        const j = await igdbRes.value.json()
        for (const r of parse(j).slice(0, 1)) {
          all.push({ id: r.id || r.external_id, title: r.title, type: 'game', genres: r.genres, year: r.year, coverImage: r.coverImage || r.cover_image, keywords: r.keywords })
        }
      }

      setSuggestions(all.slice(0, 4))
      setOpen(all.length > 0)
    } catch {}
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
          className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${searching || loading ? 'text-violet-400 animate-pulse' : 'text-zinc-500'}`}
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
          className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl pl-9 pr-8 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
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
                  ? <img src={s.coverImage} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-tight truncate">{s.title}</p>
                <p className="text-xs text-violet-400">
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
  { key: 'all',       label: 'Tutti' },
  { key: 'anime',     label: 'Anime' },
  { key: 'movie',     label: 'Film' },
  { key: 'tv',        label: 'Serie TV' },
  { key: 'game',      label: 'Giochi' },
  { key: 'manga',     label: 'Manga' },
]

const SimilarSection = memo(function SimilarSection({ sourceTitle, sourceType, items, onFeedback, onSimilar, onDetail, onClose, dismissedIds, similarLoadingId }: {
  sourceTitle: string
  sourceType: MediaType
  items: Recommendation[]
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  onClose: () => void
  dismissedIds: Set<string>
  similarLoadingId?: string | null
}) {
  const [visibleCount, setVisibleCount] = useState(15)
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
    setVisibleCount(15)
  }

  return (
    <div className="mb-10 rounded-3xl border border-violet-500/30 bg-violet-500/5 p-5">

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
          <Search size={15} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-white">
            Titoli simili a <span className="text-violet-300">"{sourceTitle}"</span>
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
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  isActive
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'
                }`}>
                {key !== 'all' && <span className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${TYPE_COLORS[key as MediaType]}`} />}
                {label}
                <span className={`text-[10px] ${isActive ? 'text-violet-200' : 'text-zinc-600'}`}>{count}</span>
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
            />
          ))}
          {hasMore && (
            <div className="flex-shrink-0 w-36 flex items-center justify-center">
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

// Fix 2.8: sezione separata per titoli "Scoperta" — nuovo per te
const DiscoverySection = memo(function DiscoverySection({ items, onFeedback, onSimilar, onDetail, dismissedIds }: {
  items: Recommendation[]
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  dismissedIds: Set<string>
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const visible = items.filter(i => i.isDiscovery && !dismissedIds.has(i.id))
  if (visible.length < 2) return null
  const shown = visible.slice(0, visibleCount)
  const hasMore = visible.length > visibleCount

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
          <Compass size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Esplora oltre i tuoi confini</h2>
          <p className="text-[10px] text-zinc-500">{visible.length} titoli fuori dal tuo solito — potrebbe sorprenderti</p>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-hide">
        {shown.map(item => {
          const Icon = TYPE_ICONS[item.type]
          return (
            <div key={item.id} className="flex-shrink-0 w-36 group">
              <div className="relative h-52 rounded-2xl overflow-hidden bg-zinc-900 mb-2 cursor-pointer"
                onClick={() => onDetail?.(item)}>
                {item.coverImage
                  ? <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center"><Icon size={32} className="text-zinc-700" /></div>
                }
                {/* Bordo verde — div interno per evitare clip da overflow-hidden */}
                <div className="absolute inset-0 rounded-2xl border-2 border-emerald-400 pointer-events-none z-10" />
                <div className="absolute top-2 left-2 bg-emerald-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 z-20">
                  <Compass size={8} /> Nuovo per te
                </div>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'not_interested') }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-red-300 hover:bg-red-900/60 transition-colors">
                    <ThumbsDown size={11} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onFeedback(item, 'already_seen') }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-white hover:bg-zinc-600/60 transition-colors">
                    <Eye size={11} />
                  </button>
                  {onSimilar && (
                    <button onClick={(e) => { e.stopPropagation(); onSimilar(item) }} title="Simili"
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm text-zinc-300 hover:text-violet-200 hover:bg-violet-900/60 transition-colors">
                      <Search size={11} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs font-semibold text-white leading-tight line-clamp-2 mb-0.5">{item.title}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {item.year && <span className="text-[10px] text-zinc-500">{item.year}</span>}
                {item.score && (
                  <span className="flex items-center gap-0.5 text-[10px] text-yellow-400 font-semibold">
                    <Star size={8} fill="currentColor" />{Math.min(item.score, 5).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {hasMore && (
          <div className="flex-shrink-0 w-36 flex items-center justify-center">
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

const INITIAL_VISIBLE = 15
const LOAD_MORE_STEP = 10

const RecommendationSection = memo(function RecommendationSection({ type, items, label, onFeedback, dismissedIds, onSimilar, onDetail, similarLoadingId, isPrimary }: {
  type: MediaType; items: Recommendation[]; label: string
  onAdd: (i: Recommendation) => void; onWishlist: (i: Recommendation) => void
  onFeedback: (i: Recommendation, a: FeedbackAction, reason?: FeedbackReason) => void
  dismissedIds: Set<string>
  onSimilar?: (i: Recommendation) => void
  onDetail?: (i: Recommendation) => void
  similarLoadingId?: string | null
  isPrimary?: boolean
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)  // Fix 2.13
  const Icon = TYPE_ICONS[type]; const colorClass = TYPE_COLORS[type]
  const visible = items.filter(i => !dismissedIds.has(i.id) && !i.isDiscovery)
  if (!visible.length) return null

  const shown = visible.slice(0, visibleCount)
  const hasMore = visible.length > visibleCount
  const topScore = visible[0]?.matchScore || 0

  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-8 h-8 bg-gradient-to-br ${colorClass} rounded-xl flex items-center justify-center shadow-lg`}>
          <Icon size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">{label}</h2>
          <p className="text-[10px] text-zinc-500">{visible.length} titoli</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isPrimary && (
            <span className="text-[10px] font-semibold text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-500/20 px-2 py-0.5 rounded-full">
              Il tuo tipo principale
            </span>
          )}
          {topScore >= 80 && !isPrimary && (
            <span className="text-[10px] font-semibold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
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
          />
        ))}
        {/* Fix 2.13: "Mostra altri" senza refresh */}
        {hasMore && (
          <div className="flex-shrink-0 w-36 flex items-center justify-center">
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

// Fix 2.6: Quick-reason sheet — raccoglie il motivo dopo "non mi interessa"
function QuickReasonSheet({ item, onConfirm, onDismiss }: {
  item: Recommendation
  onConfirm: (reason: FeedbackReason) => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onDismiss}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-t-3xl p-5 pb-8"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />
        <p className="text-sm font-semibold text-white mb-1">Perché non ti interessa?</p>
        <p className="text-xs text-zinc-500 mb-4 truncate">{item.title}</p>
        <div className="space-y-2">
          {([
            { reason: 'already_know' as FeedbackReason, label: 'Ho già visto / lo conosco', icon: '👁️' },
            { reason: 'not_my_genre' as FeedbackReason, label: 'Non è il mio genere', icon: '🚫' },
            { reason: 'too_similar' as FeedbackReason, label: 'Troppo simile ad altro', icon: '🔁' },
            { reason: 'bad_rec' as FeedbackReason, label: 'Consiglio non pertinente', icon: '👎' },
          ]).map(({ reason, label, icon }) => (
            <button key={reason} onClick={() => onConfirm(reason)}
              className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-sm text-zinc-200 transition-all text-left">
              <span className="text-base">{icon}</span>{label}
            </button>
          ))}
        </div>
        <button onClick={() => onConfirm(undefined)} className="w-full mt-3 text-xs text-zinc-600 hover:text-zinc-400 py-2">
          Salta
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
        <div className="w-8 h-8 bg-gradient-to-br from-fuchsia-500 to-violet-500 rounded-xl flex items-center justify-center">
          <Users size={16} className="text-white" />
        </div>
        <h2 className="text-sm font-bold text-white">Amici che guardano</h2>
        <span className="text-xs text-zinc-500 ml-auto">{items.length}</span>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
        {items.map(a => (
          <Link key={`${a.userId}-${a.mediaId}`} href={`/profile/${a.username}`} className="flex-shrink-0 w-28 group">
            <div className="relative h-40 rounded-2xl overflow-hidden bg-zinc-800 mb-2">
              {a.mediaCover
                ? <img src={a.mediaCover} alt={a.mediaTitle} className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                : <div className="w-full h-full flex items-center justify-center text-zinc-600"><Tv size={28} /></div>
              }
              <div className="absolute bottom-2 left-2 ring-2 ring-black rounded-full">
                <Avatar src={a.avatarUrl} username={a.username} displayName={a.displayName} size={24} />
              </div>
              <div className="absolute top-2 right-2 bg-black/70 text-[9px] text-zinc-300 px-1.5 py-0.5 rounded-full">{timeAgo(a.updatedAt)}</div>
            </div>
            <p className="text-[10px] font-semibold text-zinc-300 line-clamp-2 mb-0.5">{a.mediaTitle}</p>
            <p className="text-[9px] text-violet-400 truncate">@{a.username}</p>
          </Link>
        ))}
      </div>
    </div>
  )
})

// Fix 2.15: quick presets per onboarding rapido

export default function ForYouPage() {
  const supabase = createClient(); const router = useRouter()
  const { t } = useLocale(); const fy = t.forYou
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false)
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation[]>>({})
  const [tasteProfile, setTasteProfile] = useState<TasteProfile | null>(null)
  const [totalEntries, setTotalEntries] = useState(0)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set())
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [showPrefs, setShowPrefs] = useState(false)
  const [isCached, setIsCached] = useState(false)
  const [friendsActivity, setFriendsActivity] = useState<FriendActivity[]>([])
  const [friendsLoading, setFriendsLoading] = useState(true)
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set())   // Fix 2.5: loading state add
  const [reasonPending, setReasonPending] = useState<Recommendation | null>(null)  // Fix 2.6: quick-reason
  const [similarLoading, setSimilarLoading] = useState<string | null>(null)  // id del titolo in caricamento
  const [detailItem, setDetailItem] = useState<Recommendation | null>(null)  // titolo aperto nel detail modal
  const [similarSection, setSimilarSection] = useState<{ sourceTitle: string; sourceType: MediaType; items: Recommendation[] } | null>(null)
  const [showNewRecsBadge, setShowNewRecsBadge] = useState(false)  // Fix 2.10: badge nuovi consigli
  const [showSwipeMode, setShowSwipeMode] = useState(false)

  const fetchRecommendations = useCallback(async (force = false) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const res = await fetch(`/api/recommendations?type=all${force ? '&refresh=1' : ''}`)
    if (!res.ok) return
    const json = await res.json()
    const incoming = json.recommendations || {}
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
      const { data: profiles } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', uids)
      const pm: Record<string, any> = {}; profiles?.forEach(p => { pm[p.id] = p })
      const seen = new Set<string>(); const activity: FriendActivity[] = []
      for (const e of entries) {
        const key = `${e.user_id}-${e.external_id}`
        if (seen.has(key)) continue; seen.add(key)
        const p = pm[e.user_id]; if (!p) continue
        activity.push({ userId: e.user_id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url, mediaId: e.external_id, mediaTitle: e.title, mediaCover: e.cover_image, mediaType: e.type, updatedAt: e.updated_at })
      }
      setFriendsActivity(activity.slice(0, 12))

      // Fix 2.9: carica similarity score degli amici per elevare titoli ad alta affinità
      const followIds = ids
      if (followIds.length > 0) {
        const { data: simData } = await supabase
          .from('taste_similarity')
          .select('other_user_id, similarity_score')
          .eq('user_id', userId)
          .in('other_user_id', followIds)
          .gte('similarity_score', 80)
        if (simData && simData.length > 0) {
          const highSimIds = new Set(simData.map((s: any) => s.other_user_id))
          const simMap = Object.fromEntries(simData.map((s: any) => [s.other_user_id, s.similarity_score]))
          // Marca le attività degli amici ad alta sim
          setFriendsActivity(prev => prev.map(a => ({
            ...a,
            isHighSim: highSimIds.has(a.userId),
            simScore: simMap[a.userId] || 0,
          })))
        }
      }
    } catch { setFriendsActivity([]) }
    setFriendsLoading(false)
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [
        { data: entries },
        { data: wish },
      ] = await Promise.all([
        supabase.from('user_media_entries').select('external_id').eq('user_id', user.id),
        supabase.from('wishlist').select('external_id').eq('user_id', user.id),
      ])

      setAddedIds(new Set((entries || []).map((e: any) => e.external_id).filter(Boolean)))
      setWishlistIds(new Set((wish || []).map((w: any) => w.external_id).filter(Boolean)))
      setTotalEntries(entries?.length || 0)

      // 1. Prova a leggere dalla pool persistente su Supabase (fast path ~50ms)
      const poolRes = await fetch('/api/recommendations?source=pool')
      if (poolRes.ok) {
        const poolJson = await poolRes.json()
        if (poolJson.source === 'pool' && poolJson.recommendations) {
          // Pool trovata → mostra subito, nessun altro fetch automatico
          setRecommendations(poolJson.recommendations || {})
          setTasteProfile(poolJson.tasteProfile || null)
          setIsCached(true)
          setLoading(false)
          fetchFriends(user.id)
          const lastVisit = localStorage.getItem('for_you_last_visit')
          const now = Date.now()
          if (lastVisit && now - parseInt(lastVisit) > 4 * 3600000) setShowNewRecsBadge(true)
          localStorage.setItem('for_you_last_visit', String(now))
          return
        }
      }

      // 2. Pool vuota (primo accesso o dati cancellati) → calcola tutto
      const recsRes = await fetch('/api/recommendations?type=all')
      if (recsRes.ok) {
        const json = await recsRes.json()
        const incoming = json.recommendations || {}
        setRecommendations(prev => {
          const merged = { ...prev }
          for (const [type, items] of Object.entries(incoming)) {
            if (Array.isArray(items) && (items as any[]).length > 0) merged[type] = items as Recommendation[]
          }
          return merged
        })
        setTasteProfile(json.tasteProfile || null)
        setIsCached(!!json.cached)
      }

      setLoading(false)
      fetchFriends(user.id)

      const lastVisit = localStorage.getItem('for_you_last_visit')
      const now = Date.now()
      if (lastVisit && now - parseInt(lastVisit) > 4 * 3600000) setShowNewRecsBadge(true)
      localStorage.setItem('for_you_last_visit', String(now))
    }
    init()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    setShowNewRecsBadge(false)
    const { data: { user } } = await supabase.auth.getUser()
    const recsPromise = fetch('/api/recommendations?type=all&refresh=1').then(r => r.ok ? r.json() : null)
    await Promise.all([recsPromise, user ? fetchFriends(user.id) : Promise.resolve()])
    const json = await recsPromise.catch(() => null)
    if (json) {
      const incoming = json.recommendations || {}
      setRecommendations(prev => {
        const merged = { ...prev }
        for (const [type, items] of Object.entries(incoming)) {
          if (Array.isArray(items) && (items as any[]).length > 0) merged[type] = items as Recommendation[]
        }
        return merged
      })
      setTasteProfile(json.tasteProfile || null)
      setIsCached(false)
    }
    setRefreshing(false)
  }

  // Pull-to-refresh su mobile — deve stare DOPO handleRefresh
  const { distance: pullDistance, refreshing: isPulling } = usePullToRefresh({ onRefresh: handleRefresh })

  const handleAdd = useCallback(async (item: Recommendation) => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    const { error } = await supabase.from('user_media_entries').insert({
      user_id: user.id, external_id: item.id, title: item.title, type: item.type,
      cover_image: item.coverImage, genres: item.genres,
      status: item.type === 'movie' ? 'completed' : 'watching', current_episode: 1
    })
    if (!error) {
      setAddedIds(prev => new Set([...prev, item.id]))
      showToast(`"${item.title}" aggiunto`)
      await fetch('/api/recommendations/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rec_id: item.id, rec_type: item.type, rec_genres: item.genres, action: 'added' })
      })
      if (item.genres.length > 0) {
        triggerTasteDelta({ action: 'status_change', mediaId: item.id, mediaType: item.type, genres: item.genres, status: item.type === 'movie' ? 'completed' : 'watching' })
      }
    }
  }, [supabase])

  const handleWishlist = useCallback(async (item: Recommendation) => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return
    if (wishlistIds.has(item.id)) {
      await supabase.from('wishlist').delete().eq('user_id', user.id).eq('external_id', item.id)
      setWishlistIds(prev => { const s = new Set(prev); s.delete(item.id); return s })
      showToast(t.discover.wishlistRemove)
    } else {
      await supabase.from('wishlist').upsert({
        user_id: user.id, external_id: item.id, title: item.title,
        type: item.type, cover_image: item.coverImage,
        genres: item.genres || [],
        media_type: item.type,
      }, { onConflict: 'user_id,external_id' })
      setWishlistIds(prev => new Set([...prev, item.id]))
      showToast(t.discover.wishlistAdd)
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
            : /^\d+$/.test(item.id) && item.type === 'game' ? 'igdb'
            : /^\d+$/.test(item.id) && (item.type === 'movie' || item.type === 'tv' || item.type === 'anime') ? 'tmdb'
            : undefined,
    }
    setDetailItem(details as any)
  }, [])

  // searchSimilar e handleSimilar unite — searchSimilar dichiarata prima per evitare
  // problemi di closure con useCallback deps=[]
  const searchSimilar = useCallback(async (title: string, genres: string[], excludeId?: string, tags?: string[], keywords?: string[], type?: string) => {
    if (!genres.length) {
      showToast('Impossibile trovare simili: generi non disponibili')
      return
    }
    const params = new URLSearchParams({ title, genres: genres.slice(0, 5).join(',') })
    if (tags?.length) params.set('tags', tags.slice(0, 15).join(','))
    if (keywords?.length) params.set('keywords', keywords.slice(0, 15).join(','))
    if (excludeId) params.set('excludeId', excludeId)
    if (type) params.set('type', type)
    const res = await fetch(`/api/recommendations/similar?${params}`)
    if (res.ok) {
      const json = await res.json()
      const items: Recommendation[] = (json.items || []).filter((r: Recommendation) => r.id !== excludeId)
      setSimilarSection({ sourceTitle: title, sourceType: (type as MediaType) || 'movie', items })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      if (items.length === 0) showToast('Nessun risultato trovato')
    } else {
      showToast('Errore nella ricerca simili')
    }
  }, [])

  const handleSimilar = useCallback(async (item: Recommendation) => {
    if (!item.genres.length) return
    setSimilarLoading(item.id)
    showToast(`Cercando titoli simili a "${item.title}"…`)
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
    setDismissedIds(prev => new Set([...prev, item.id]))
    if (action === 'not_interested' && reason === undefined) {
      // Fix 2.6: mostra quick-reason sheet invece di dismiss diretto
      setReasonPending(item)
      showToast('Rimosso dai consigli')
      sendFeedback(item, action, undefined)  // invia subito senza reason, aggiorna se arriva
    } else {
      sendFeedback(item, action, reason)
      if (action === 'not_interested') showToast('Rimosso dai consigli')
    }
  }, [sendFeedback])

  const displayRecs = recommendations
  const allRecs = Object.values(displayRecs).flat()

  // Fix 2.9: eleva nelle sezioni i titoli guardati da amici con sim ≥80%
  const friendWatchingMap = new Map<string, string>()  // mediaId → username
  for (const a of friendsActivity) {
    if (a.isHighSim && a.mediaId && !friendWatchingMap.has(a.mediaId)) {
      friendWatchingMap.set(a.mediaId, a.displayName || a.username)
    }
  }
  // Inietta friendWatching nelle recs esistenti
  for (const recs of Object.values(displayRecs)) {
    for (const rec of recs) {
      if (friendWatchingMap.has(rec.id)) {
        rec.friendWatching = friendWatchingMap.get(rec.id)
        rec.matchScore = Math.min(100, rec.matchScore + 12)  // piccolo boost visibilità
      }
    }
  }

  const allContinuityRecs = allRecs.filter(i => i.isContinuity && !dismissedIds.has(i.id))

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
    { key: 'boardgame', label: 'Giochi da Tavolo' },
    
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

  // Card skippate nello swipe mode — escluse da swipeItems al prossimo open
  const [swipeSkippedIds, setSwipeSkippedIds] = useState<Set<string>>(new Set())

  // Swipe mode handlers
  const swipeItems: SwipeItem[] = (() => {
    const mapped = allRecs
      .filter(r =>
        ['anime', 'manga', 'movie', 'tv', 'game'].includes(r.type) &&
        !dismissedIds.has(r.id) &&
        !swipeSkippedIds.has(r.id)
      )
      .slice(0, 50)
      .map(r => ({
        id: r.id, title: r.title, type: r.type as SwipeItem['type'], isDiscovery: r.isDiscovery,
        coverImage: r.coverImage, year: r.year, genres: r.genres,
        score: r.score, description: r.description, why: r.why,
        matchScore: r.matchScore, episodes: r.episodes,
        authors: r.authors, developers: r.developers, platforms: r.platforms,
        isAwardWinner: r.isAwardWinner,
      }))
    // Interleave per tipo: round-robin tra bucket
    const buckets = new Map<string, SwipeItem[]>()
    for (const item of mapped) {
      if (!buckets.has(item.type)) buckets.set(item.type, [])
      buckets.get(item.type)!.push(item)
    }
    const result: SwipeItem[] = []
    const queues = [...buckets.values()]
    let i = 0
    while (queues.length > 0) {
      const idx = i % queues.length
      const q = queues[idx]
      result.push(q.shift()!)
      if (q.length === 0) queues.splice(idx, 1)
      else i++
    }
    return result
  })()

  // Swipe sinistra: aggiorna swipeSkippedIds in page.tsx
  // così al prossimo open di SwipeMode la card è già esclusa da swipeItems
  const handleSwipeSkip = useCallback((item: SwipeItem) => {
    setSwipeSkippedIds(prev => new Set([...prev, item.id]))
  }, [])
  // Aggiorna il campo data di ogni riga dove il titolo compare
  const removeFromPool = useCallback(async (userId: string, externalId: string) => {
    const { data: poolRows } = await supabase
      .from('recommendations_pool')
      .select('media_type, data')
      .eq('user_id', userId)
    if (!poolRows) return
    const updates = poolRows
      .map(row => {
        const filtered = (row.data as any[]).filter((r: any) => r.id !== externalId)
        if (filtered.length === (row.data as any[]).length) return null // nessuna modifica
        return { media_type: row.media_type, data: filtered }
      })
      .filter(Boolean)
    for (const upd of updates) {
      supabase.from('recommendations_pool')
        .update({ data: upd!.data })
        .eq('user_id', userId)
        .eq('media_type', upd!.media_type)
        .then(() => {})
    }
  }, [supabase])

  // Swipe destra: aggiunge al profilo + dismiss istantaneo dalla pagina Per Te
  const handleSwipeSeen = useCallback(async (item: SwipeItem, rating: number | null, skipPersist = false) => {
    // Dismiss subito (sincrono) — l'utente non la vede più nella Per Te
    setAddedIds(prev => new Set([...prev, item.id]))
    setDismissedIds(prev => new Set([...prev, item.id]))
    showToast(`"${item.title}" aggiunto${rating ? ` · ${rating}★` : ''}`)

    // ─── DEBUG HANDLESWIPESEEN ────────────────────────────────────────
    console.group(`[ForYouPage] handleSwipeSeen — "${item.title}"`)
    console.log('📦 SwipeItem ricevuto:', JSON.stringify(item, null, 2))
    console.log('⭐ Rating ricevuto:', rating)
    console.log('⏭️  skipPersist (drawer ha già scritto):', skipPersist)
    if (skipPersist) {
      console.log('✅ SKIP scrittura su user_media_entries — il Drawer ha già scritto.')
      console.log('📤 Invio solo feedback recommendation + taste delta.')
      console.groupEnd()
      // Rimuove il titolo dalla pool Supabase (anche se skipPersist)
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return
        removeFromPool(user.id, item.id)
      })
      fetch('/api/recommendations/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rec_id: item.id, rec_type: item.type, rec_genres: item.genres, action: 'added' })
      }).catch(() => {})
      if (item.genres.length > 0) {
        triggerTasteDelta({ action: 'status_change', mediaId: item.id, mediaType: item.type, genres: item.genres, status: 'completed' })
        if (rating) triggerTasteDelta({ action: 'rating', mediaId: item.id, mediaType: item.type, genres: item.genres, rating })
      }
      return
    }

    // Salva in background (solo se non skipPersist)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      console.warn('[ForYouPage] handleSwipeSeen: utente non autenticato!')
      console.groupEnd()
      return
    }
    const insertData: any = {
      user_id: user.id, external_id: item.id, title: item.title,
      type: item.type, cover_image: item.coverImage, genres: item.genres,
      status: 'completed',
    }
    if (rating !== null) insertData.rating = rating

    console.log('💾 Dati da upsertare su user_media_entries:', JSON.stringify(insertData, null, 2))

    supabase.from('user_media_entries').upsert(insertData, { onConflict: 'user_id,external_id' }).then(({ data, error }) => {
      if (error) {
        console.error('[ForYouPage] handleSwipeSeen: ERRORE upsert user_media_entries:', error)
        console.error('Codice errore:', error.code, '— Messaggio:', error.message)
        console.error('Dettagli:', error.details)
      } else {
        console.log('[ForYouPage] handleSwipeSeen: ✅ upsert OK. data:', data)
      }
      fetch('/api/recommendations/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rec_id: item.id, rec_type: item.type, rec_genres: item.genres, action: 'added' })
      }).catch(() => {})
    })
    // Rimuove dalla pool Supabase in background
    removeFromPool(user.id, item.id)
    if (item.genres.length > 0) {
      triggerTasteDelta({ action: 'status_change', mediaId: item.id, mediaType: item.type, genres: item.genres, status: 'completed' })
      if (rating) triggerTasteDelta({ action: 'rating', mediaId: item.id, mediaType: item.type, genres: item.genres, rating })
    }
    console.groupEnd()
  }, [supabase])

  // ─── Helper: mappa CategoryFilter → nome tabella Supabase ──────
  const getQueueTable = (filter: string) => {
    const map: Record<string, string> = {
      all: 'swipe_queue_all',
      anime: 'swipe_queue_anime',
      manga: 'swipe_queue_manga',
      movie: 'swipe_queue_movie',
      tv: 'swipe_queue_tv',
      game: 'swipe_queue_game',
      boardgame: 'swipe_queue_boardgame',
    }
    return map[filter] ?? 'swipe_queue_all'
  }

  // ─── Helper: converte row Supabase → SwipeItem ──────────────────
  const rowToSwipeItem = (row: any): SwipeItem => ({
    id: row.external_id,
    title: row.title,
    type: row.type as SwipeItem['type'],
    coverImage: row.cover_image,
    year: row.year,
    genres: row.genres || [],
    score: row.score,
    description: row.description,
    why: row.why,
    matchScore: row.match_score || 0,
    episodes: row.episodes,
    authors: row.authors,
    developers: row.developers,
    platforms: row.platforms,
    isAwardWinner: row.is_award_winner,
    isDiscovery: row.is_discovery,
    source: row.source,
  })

  // ─── Helper: converte SwipeItem/Recommendation → row Supabase ───
  const toQueueRow = (r: any, userId: string) => ({
    user_id: userId,
    external_id: r.id,
    title: r.title,
    type: r.type,
    cover_image: r.coverImage || r.cover_image,
    year: r.year,
    genres: r.genres || [],
    score: r.score ?? null,
    description: r.description ?? null,
    why: r.why ?? null,
    match_score: r.matchScore || 0,
    episodes: r.episodes ?? null,
    authors: r.authors || [],
    developers: r.developers || [],
    platforms: r.platforms || [],
    is_award_winner: r.isAwardWinner || false,
    is_discovery: r.isDiscovery || false,
    source: r.source ?? null,
  })

  // Ricarica nuove card quando SwipeMode chiede refill
  // Ora usa le tabelle swipe_queue_* su Supabase:
  // 1. Legge le card già presenti in tabella (evita ricarichi inutili)
  // 2. Se <50 card, chiama /api/recommendations per rinfoltire
  // 3. Filtra le card già in swipe_skipped
  // 4. Upserta le nuove card nella tabella corretta
  const handleSwipeRequestMore = useCallback(async (filter: string = 'all'): Promise<SwipeItem[]> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const table = getQueueTable(filter)
    const TARGET = 50
    const REFILL_TRIGGER = 20

    // 1. Leggi skipped per questo utente
    const { data: skippedRows } = await supabase
      .from('swipe_skipped')
      .select('external_id')
      .eq('user_id', user.id)
    const skippedSet = new Set((skippedRows || []).map((r: any) => r.external_id as string))

    // 2. Leggi card già in coda su Supabase (quelle non ancora viste)
    const { data: queueRows } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', user.id)
      .order('inserted_at', { ascending: true })
    const existingRows = (queueRows || []).filter((r: any) => !skippedSet.has(r.external_id))
    const existingIds = new Set(existingRows.map((r: any) => r.external_id as string))

    // 3. Se ho già abbastanza card, ritorna quelle esistenti
    if (existingRows.length >= REFILL_TRIGGER) {
      return existingRows.map(rowToSwipeItem)
    }

    // 4. Rinfoltisci: chiama /api/recommendations
    try {
      const apiFilter = filter === 'all' ? 'all' : filter
      const res = await fetch(`/api/recommendations?type=${apiFilter}&refresh=1`)
      if (!res.ok) return existingRows.map(rowToSwipeItem)
      const json = await res.json()

      let freshRecs: any[] = []
      if (filter === 'all') {
        freshRecs = (Object.values(json.recommendations || {}) as any[][]).flat()
      } else {
        // Per filtro specifico prende solo quel tipo, con fallback su tutti
        const typed = (json.recommendations?.[filter] || []) as any[]
        if (typed.length > 0) {
          freshRecs = typed
        } else {
          // fallback: prende tutti ma filtra per tipo
          freshRecs = (Object.values(json.recommendations || {}) as any[][])
            .flat()
            .filter((r: any) => r.type === filter)
        }
      }

      // Filtra: no skipped, no già in coda, solo tipi validi
      const validTypes = ['anime', 'manga', 'movie', 'tv', 'game']
      const newRecs = freshRecs
        .filter((r: any) =>
          validTypes.includes(r.type) &&
          !skippedSet.has(r.id) &&
          !existingIds.has(r.id)
        )
        .slice(0, TARGET - existingRows.length)

      // Upserta nuove card in tabella
      if (newRecs.length > 0) {
        const rows = newRecs.map((r: any) => toQueueRow(r, user.id))
        await supabase.from(table).upsert(rows, { onConflict: 'user_id,external_id' })
      }

      // Ritorna tutto: esistenti + nuove
      const allItems: SwipeItem[] = [
        ...existingRows.map(rowToSwipeItem),
        ...newRecs.map((r: any) => ({
          id: r.id, title: r.title, type: r.type as SwipeItem['type'],
          coverImage: r.coverImage, year: r.year, genres: r.genres || [],
          score: r.score, description: r.description, why: r.why,
          matchScore: r.matchScore || 0, episodes: r.episodes,
          authors: r.authors, developers: r.developers,
          platforms: r.platforms, isAwardWinner: r.isAwardWinner,
          isDiscovery: r.isDiscovery, source: r.source,
        }))
      ]
      return allItems
    } catch {
      return existingRows.map(rowToSwipeItem)
    }
  }, [supabase])

  // Pre-popola tutte le swipe_queue_* con i titoli già in memoria al momento dell'apertura
  const initSwipeQueues = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const validTypes = ['anime', 'manga', 'movie', 'tv', 'game']
    const { data: skippedRows } = await supabase.from('swipe_skipped').select('external_id').eq('user_id', user.id)
    const skippedSet = new Set((skippedRows || []).map((r: any) => r.external_id as string))
    const allRecs: Recommendation[] = Object.values(recommendations).flat()
    const candidates = allRecs.filter(r =>
      validTypes.includes(r.type) && !dismissedIds.has(r.id) && !skippedSet.has(r.id)
    ).slice(0, 50)
    if (!candidates.length) return
    const makeRow = (r: Recommendation, userId: string) => ({
      user_id: userId,
      external_id: r.id, title: r.title, type: r.type,
      cover_image: r.coverImage, year: r.year, genres: r.genres || [],
      score: r.score ?? null, description: r.description ?? null, why: r.why ?? null,
      match_score: r.matchScore || 0, episodes: r.episodes ?? null,
      authors: (r as any).authors || [], developers: (r as any).developers || [],
      platforms: (r as any).platforms || [],
      is_award_winner: r.isAwardWinner || false, is_discovery: r.isDiscovery || false,
    })
    const rows = candidates.map(r => makeRow(r, user.id))
    await supabase.from('swipe_queue_all').upsert(rows, { onConflict: 'user_id,external_id' })
    for (const type of validTypes) {
      const typed = rows.filter(r => r.type === type)
      if (typed.length > 0) {
        await supabase.from(`swipe_queue_${type}`).upsert(typed, { onConflict: 'user_id,external_id' })
      }
    }
  }, [supabase, recommendations, dismissedIds])

  const handleOpenSwipeMode = useCallback(() => {
    setShowSwipeMode(true)
    initSwipeQueues().catch(() => {})
  }, [initSwipeQueues])

  if (loading) return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-2 md:pt-8 pb-28 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6">
        <div className="mb-10 animate-pulse">
          <div className="h-10 w-48 bg-zinc-800 rounded-2xl mb-3" />
          <div className="h-5 w-80 bg-zinc-900 rounded-xl" />
        </div>
        <SkeletonFriendsWatching />
        {[1, 2, 3].map(i => <SkeletonForYouRow key={i} />)}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white">
      <PullToRefreshIndicator distance={pullDistance} refreshing={isPulling} />
      <div className="pt-2 md:pt-8 pb-24 max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6">

        {/* Action bar */}
        <div className="flex items-center gap-3 mb-6">
          {/* Swipe — hero a sinistra */}
          {swipeItems.length > 0 ? (
            <button onClick={handleOpenSwipeMode}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 rounded-2xl text-sm font-bold text-white transition-all shadow-lg shadow-violet-900/40 tracking-wide">
              <Shuffle size={15} />
              Swipe
            </button>
          ) : (
            <div className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900/60 border border-zinc-800 rounded-2xl opacity-40 cursor-not-allowed">
              <Shuffle size={15} className="text-zinc-500" />
              <span className="text-sm font-bold text-zinc-500 tracking-wide">Swipe</span>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Bottoni secondari */}
          <button onClick={() => setShowPrefs(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-2xl text-sm font-medium text-zinc-300 transition-all">
            <SlidersHorizontal size={15} />
            <span className="hidden sm:inline">{fy.preferences}</span>
          </button>
          <div className="relative">
            <button onClick={handleRefresh} disabled={refreshing}
              className="w-10 h-10 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 disabled:opacity-50 rounded-2xl text-zinc-300 transition-all">
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
            {showNewRecsBadge && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-fuchsia-500 rounded-full border-2 border-black animate-pulse" />
            )}
          </div>
        </div>

        {!hasEnoughData ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Sparkles size={28} className="text-zinc-600" />
            </div>
            <h2 className="text-xl font-bold text-white mb-3">{fy.title}</h2>
            <p className="text-zinc-400 max-w-md mx-auto mb-8">{fy.emptyState}</p>
            <Link href="/discover" className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-semibold px-3 sm:px-4 md:px-3 sm:px-4 md:px-6 py-3 rounded-2xl">
              <Zap size={18} />{fy.emptyStateCta}
            </Link>
          </div>
        ) : (
          <>
            {totalEntries < 15 && <LowConfidenceBanner totalEntries={totalEntries} />}
            {tasteProfile && <DNAWidget tasteProfile={tasteProfile} totalEntries={totalEntries} />}
            {/* Barra ricerca libera "Trova simili a..." */}
            <SimilarSearchBar
              onSearch={(title, genres, keywords, type) => searchSimilar(title, genres, undefined, undefined, keywords, type)}
              loading={!!similarLoading}
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
              />
            )}
            {allRecs.length >= 2 && (
              <HeroMatchSection
                key={`hero-${allRecs.length}`}
                items={allRecs}
                onFeedback={handleFeedback}
                onSimilar={handleSimilar}
                onDetail={handleDetail}
                dismissedIds={dismissedIds}
              />
            )}
            {friendsLoading ? <SkeletonFriendsWatching /> : <FriendsWatchingSection items={friendsActivity} />}
            <SimilarTasteFriends />


            <DiscoverySection
              key={`discovery-${Object.keys(recommendations).join('-')}-${allRecs.length}`}
              items={allRecs}
              onFeedback={handleFeedback}
              onSimilar={handleSimilar}
              onDetail={handleDetail}
              dismissedIds={dismissedIds}
            />

            {SECTIONS.map(({ key, label }) => {
              const items = displayRecs[key] || []
              const allItems = items
                .filter(i => !i.isContinuity && !i.isDiscovery && !dismissedIds.has(i.id))
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
                />
              )
            })}

            {SECTIONS.every(({ key }) => {
              const items = (displayRecs[key] || []).filter(i => !i.isContinuity && !i.isDiscovery && !dismissedIds.has(i.id))
              return !items.length
            }) && (
              <div className="text-center py-20">
                <p className="text-zinc-400">{fy.sectionEmpty}</p>
                <button onClick={handleRefresh} className="mt-4 text-violet-400 text-sm hover:underline">{fy.refresh}</button>
              </div>
            )}
          </>
        )}
      </div>
      {showPrefs && <PreferencesModal onClose={() => setShowPrefs(false)} onSaved={handleRefresh} />}
      {/* Swipe mode */}
      {showSwipeMode && (
        <SwipeMode
          items={swipeItems}
          onSeen={handleSwipeSeen}
          onSkip={handleSwipeSkip}
          onRequestMore={handleSwipeRequestMore}
          onClose={() => setShowSwipeMode(false)}
        />
      )}
      {/* Drawer dettaglio titolo — stesso del Discover */}
      {detailItem && (
        <MediaDetailsDrawer
          media={detailItem as any}
          onClose={() => setDetailItem(null)}
          onAdd={(media) => {
            setAddedIds(prev => new Set([...prev, media.id]))
            setDetailItem(null)
            showToast(t.discover.added)
          }}
        />
      )}
      {/* Fix 2.6: quick-reason sheet */}
      {reasonPending && (
        <QuickReasonSheet
          item={reasonPending}
          onConfirm={(reason) => {
            if (reason !== undefined) sendFeedback(reasonPending, 'not_interested', reason)
            setReasonPending(null)
          }}
          onDismiss={() => setReasonPending(null)}
        />
      )}
    </div>
  )
}