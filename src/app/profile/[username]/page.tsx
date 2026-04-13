'use client'

import { logActivity } from '@/lib/activity'
import { Trash2, Copy, Check, Search as SearchIcon, SlidersHorizontal, ArrowUpDown, List, Grid3X3, ChevronRight, Download, X as XIcon } from 'lucide-react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle, Clock, X, RotateCw, RotateCcw, Edit3, RefreshCw,
} from 'lucide-react'
import { SteamIcon } from '@/components/icons/SteamIcon'
import { StarRating } from '@/components/ui/StarRating'
import { Spinner } from '@/components/ui/Spinner'
import { showToast } from '@/components/ui/Toast'
import { FollowButton } from '@/components/profile/follow-button'
import { TasteSimilarityBadge } from '@/components/social/TasteSimilarityBadge'
import { ProfileComments } from '@/components/profile/ProfileComments'
import { Avatar, getLocalAvatarSvg } from '@/components/ui/Avatar'
import {
  DndContext, closestCenter,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, rectSortingStrategy,
} from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDndSensors } from '@/hooks/useDndSensors'
import { useCsrf } from '@/hooks/useCsrf'
import Link from 'next/link'
import { useLocale } from '@/lib/locale'
import { ProfileStatsPanel } from '@/components/profile/ProfileStatsPanel'
import { AniListImport } from '@/components/import/AniListImport'
import { MALImport } from '@/components/import/MALImport'
import { LetterboxdImport } from '@/components/import/LetterboxdImport'
import { XboxImport } from '@/components/import/XboxImport'
import { SteamImport } from '@/components/import/SteamImport'
import { ProfileActivityFeed } from '@/components/profile/ProfileActivityFeed'
import { NotesModal } from '@/components/profile/NotesModal'
import { DeleteAccountModal } from '@/components/profile/DeleteAccountModal'

// ─── Types ───────────────────────────────────────────────────────────────────

type UserMedia = {
  id: string
  title: string
  type: 'anime' | 'tv' | 'movie' | 'game' | 'manga' | 'boardgame'
  cover_image?: string
  current_episode: number
  current_season?: number
  season_episodes?: Record<number, { episode_count: number }>
  episodes?: number
  display_order?: number
  updated_at: string
  is_steam?: boolean
  import_source?: string | null
  appid?: string
  notes?: string
  rating?: number
  status?: string
  genres?: string[]
}

type Profile = {
  id: string
  username: string
  display_name?: string
  avatar_url?: string
  bio?: string
}

type SortMode = 'default' | 'rating_desc' | 'title_asc' | 'title_desc' | 'progress_desc' | 'date_desc'
type ViewMode = 'grid' | 'compact'
type ProfileTab = 'collection' | 'activity' | 'comments'

// ─── Steam cover with fallbacks ──────────────────────────────────────────────

function getSteamCover(appid: string | undefined, cover_image?: string): string | undefined {
  if (!appid) return cover_image
  // Try library portrait first, fallback to header, then capsule
  return cover_image || undefined
}

function SteamCoverImg({ appid, title, className }: { appid?: string; title: string; className?: string }) {
  const [attempt, setAttempt] = useState(0)
  const urls = appid ? [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`,
  ] : []

  if (!appid || attempt >= urls.length) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center bg-zinc-800 text-white gap-2 ${className}`}>
        <span className="text-4xl">🎮</span>
        <p className="text-xs font-medium text-center px-3 text-zinc-400 line-clamp-2">{title}</p>
      </div>
    )
  }

  return (
    <img
      src={urls[attempt]}
      alt={title}
      className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${className}`}
      onError={() => setAttempt(a => a + 1)}
    />
  )
}


// ─── SortableBox ─────────────────────────────────────────────────────────────

function SortableBox({ media, children }: { media: UserMedia; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: media.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition: transition || 'transform 50ms ease' }}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing rounded-3xl overflow-hidden h-[520px] flex flex-col transition-all duration-200 ${
        isDragging
          ? 'border-2 border-violet-500 shadow-2xl scale-[1.02] z-50'
          : 'border border-zinc-800 hover:border-violet-500/50 hover:shadow-xl'
      }`}
    >
      {children}
    </div>
  )
}

// ─── MediaCard ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  anime: 'bg-sky-500',
  manga: 'bg-orange-500',
  game: 'bg-green-500',
  tv: 'bg-purple-500',
  movie: 'bg-red-500',
  boardgame: 'bg-yellow-500',
}

function MediaCard({
  media, isOwner, deletingId,
  onDelete, onDeleteRequest, onDeleteCancel, onRating, onNotes, onSaveProgress, onMarkComplete, onReset, onStatusChange,
}: {
  media: UserMedia
  isOwner: boolean
  deletingId?: string | null
  onDelete?: (id: string) => void
  onDeleteRequest?: (id: string) => void
  onDeleteCancel?: () => void
  onRating?: (id: string, r: number) => void
  onNotes?: (media: UserMedia) => void
  onSaveProgress?: (id: string, val: number, field?: 'current_episode' | 'current_season') => void
  onMarkComplete?: (id: string, media: UserMedia) => void
  onReset?: (id: string) => void
  onStatusChange?: (id: string, status: string) => void
}) {
  const { t } = useLocale()
  const m = t.media
  const [imgFailed, setImgFailed] = useState(false)

  const isConfirmingDelete = deletingId === media.id
  const hasSeasonData = !!media.season_episodes && Object.keys(media.season_episodes).length > 0
  const hasEpisodeData = !!(media.episodes && media.episodes > 1)
  const currentSeasonNum = media.current_season || 1
  const maxEpisodesThisSeason = media.season_episodes?.[currentSeasonNum]?.episode_count || media.episodes || 0
  const maxSeasons = hasSeasonData && media.season_episodes
    ? Math.max(...Object.keys(media.season_episodes).map(Number)) : 1

  const isCompleted = media.status === 'completed' || (
    hasEpisodeData &&
    media.current_episode >= maxEpisodesThisSeason &&
    (!hasSeasonData || currentSeasonNum >= maxSeasons)
  )

  let totalProgress = 0
  if (hasSeasonData && media.season_episodes) {
    const totalEp = Object.values(media.season_episodes).reduce((s, v) => s + (v.episode_count || 0), 0)
    let done = media.current_episode
    for (let s = 1; s < currentSeasonNum; s++) done += media.season_episodes[s]?.episode_count || 0
    totalProgress = totalEp > 0 ? Math.min(Math.round((done / totalEp) * 100), 100) : 0
  } else if (hasEpisodeData && maxEpisodesThisSeason > 0) {
    totalProgress = Math.min(Math.round((media.current_episode / maxEpisodesThisSeason) * 100), 100)
  }

  const rating = media.rating || 0
  const hasNotes = !!media.notes?.trim()

  const statusBadge: Record<string, { label: string; cls: string }> = {
    completed: { label: '✓ Completato', cls: 'bg-emerald-500/20 text-emerald-400' },
    paused:    { label: '⏸ In pausa',   cls: 'bg-yellow-500/20 text-yellow-400' },
    dropped:   { label: '✗ Abbandonato',cls: 'bg-red-500/20 text-red-400' },
    watching:  { label: '▶ In corso',   cls: 'bg-zinc-700/40 text-zinc-400' },
  }

  // Cover rendering
  const renderCover = () => {
    if (media.is_steam) {
      return <SteamCoverImg appid={media.appid} title={media.title} />
    }
    if (media.cover_image && !imgFailed) {
      return (
        <img
          src={media.cover_image}
          alt={media.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            const img = e.target as HTMLImageElement
            if (!img.src.includes('wsrv.nl')) {
              const referer = media.cover_image!.includes('myanimelist.net')
                ? '&referer=https://myanimelist.net'
                : media.cover_image!.includes('anilist.co')
                ? '&referer=https://anilist.co'
                : ''
              img.src = `https://wsrv.nl/?url=${encodeURIComponent(media.cover_image!)}&w=500&output=jpg${referer}`
            } else {
              setImgFailed(true)
            }
          }}
        />
      )
    }
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 text-white gap-2">
        <span className="text-5xl">📺</span>
        <p className="text-xs font-medium text-center px-4 text-zinc-400 line-clamp-2">{media.title}</p>
      </div>
    )
  }

  return (
    <div className="group relative bg-zinc-950 rounded-3xl overflow-hidden h-full flex flex-col">
      {/* Cover */}
      <div className="relative h-60 bg-zinc-900 flex-shrink-0 overflow-hidden">
        {isOwner && isConfirmingDelete && (
          <div className="absolute top-3 right-3 z-30 flex gap-1.5">
            <button onClick={() => onDeleteCancel?.()} className="px-3 py-1.5 text-xs font-medium bg-zinc-900/95 border border-zinc-600 rounded-full hover:bg-zinc-800 transition">{m.cancel}</button>
            <button onClick={() => onDelete?.(media.id)} className="px-3 py-1.5 text-xs font-medium bg-red-900/95 border border-red-700 text-red-300 rounded-full hover:bg-red-800 transition">{m.delete}</button>
          </div>
        )}
        {isOwner && !isConfirmingDelete && (
          <button
            onClick={() => onDeleteRequest?.(media.id)}
            aria-label={`Elimina ${media.title}`}
            className="absolute top-3 right-3 z-30 opacity-30 group-hover:opacity-100 bg-black/50 hover:bg-red-950/80 border border-white/10 hover:border-red-500/60 p-1.5 rounded-xl transition-all duration-200"
          >
            <X className="w-4 h-4 text-white group-hover:text-red-400 transition-colors" />
          </button>
        )}
        <div className="absolute bottom-0 inset-x-0 h-14 bg-gradient-to-t from-black/70 to-transparent z-10 pointer-events-none" />
        <div className={`absolute bottom-3 left-3 z-20 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white tracking-wide ${TYPE_COLORS[media.type] || 'bg-zinc-700'}`}>
          {(m.typeLabels as Record<string, string>)[media.type] || media.type}
        </div>
        {renderCover()}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 px-4 pt-3 pb-4 gap-2">
        <h4 className="font-semibold line-clamp-2 text-sm leading-snug text-white">{media.title}</h4>
        <div className="flex items-center gap-2">
          <StarRating
            value={rating}
            onChange={isOwner ? (r) => onRating?.(media.id, r) : undefined}
            size={15}
            viewOnly={!isOwner}
          />
          {isOwner && (
            <button
              onClick={() => onNotes?.(media)}
              className={`ml-auto p-1.5 rounded-lg border transition-all ${
                hasNotes
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-zinc-900 border-zinc-800 hover:border-violet-500/60 text-zinc-600 hover:text-violet-400'
              }`}
            >
              <Edit3 size={13} />
            </button>
          )}
        </div>

        {isOwner ? (
          <div className="flex">
            <select
              value={media.status || 'watching'}
              onChange={e => onStatusChange?.(media.id, e.target.value)}
              onClick={e => e.stopPropagation()}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-zinc-900 border-zinc-800 text-zinc-400 focus:outline-none focus:border-violet-500 transition cursor-pointer appearance-none"
            >
              <option value="watching">▶ In corso</option>
              <option value="completed">✓ Completato</option>
              <option value="paused">⏸ In pausa</option>
              <option value="dropped">✗ Abbandonato</option>
            </select>
          </div>
        ) : (
          (() => {
            const badge = statusBadge[media.status || 'watching']
            return badge ? (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${badge.cls}`}>
                {badge.label}
              </span>
            ) : null
          })()
        )}

        <div className="mt-auto pt-1">
          {media.type === 'boardgame' ? (
            <div className="flex items-center justify-between">
              <p className="text-emerald-400 text-sm flex items-center gap-1.5">
                <Clock size={14} /> {m.gamesPlayed(media.current_episode)}
              </p>
              {isOwner && (
                <div className="flex gap-1">
                  <button onClick={() => onSaveProgress?.(media.id, Math.max(0, media.current_episode - 1))} disabled={media.current_episode <= 0} className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold disabled:opacity-30">−</button>
                  <button onClick={() => onSaveProgress?.(media.id, media.current_episode + 1)} className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold">+</button>
                </div>
              )}
            </div>
          ) : media.type === 'game' ? (
            <p className="text-emerald-400 text-sm flex items-center justify-center gap-1.5">
              <Clock size={14} /> {m.hoursPlayed(media.current_episode)}
            </p>
          ) : hasEpisodeData ? (
            isCompleted ? (
              isOwner ? (
                <div className="flex items-center justify-between">
                  <span className="text-emerald-400 text-xs font-medium flex items-center gap-1"><CheckCircle size={12} /> {m.completed}</span>
                  <button onClick={() => onReset?.(media.id)} className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors" title="Ripristina"><RotateCcw size={18} /></button>
                </div>
              ) : (
                <span className="text-emerald-400 text-xs font-medium flex items-center gap-1"><CheckCircle size={12} /> {m.completed}</span>
              )
            ) : (
              <div className="space-y-4">
                {hasSeasonData && (
                  <div className="flex items-center justify-between gap-2">
                    {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.max(1, currentSeasonNum - 1), 'current_season')} disabled={currentSeasonNum <= 1} className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold disabled:opacity-30">−</button>}
                    <div className="flex-1 text-emerald-400 text-sm flex items-center justify-center">{m.season(currentSeasonNum)}</div>
                    {isOwner && <button onClick={() => { if (currentSeasonNum + 1 <= maxSeasons) onSaveProgress?.(media.id, currentSeasonNum + 1, 'current_season') }} disabled={currentSeasonNum >= maxSeasons} className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold disabled:opacity-30">+</button>}
                  </div>
                )}
                <div className="flex items-center justify-between gap-3">
                  {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.max(1, media.current_episode - 1))} disabled={media.current_episode <= 1} className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold disabled:opacity-30">−</button>}
                  <div className="flex-1 text-emerald-400 text-sm flex items-center justify-center gap-1.5">
                    <span>{m.ep(media.current_episode)}</span>
                    <span className="text-zinc-500">/ {maxEpisodesThisSeason}</span>
                  </div>
                  {isOwner && <button onClick={() => { const next = media.current_episode + 1; next <= maxEpisodesThisSeason ? onSaveProgress?.(media.id, next) : onMarkComplete?.(media.id, media) }} className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold">+</button>}
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all duration-300 rounded-full" style={{ width: `${totalProgress}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">{m.progress(totalProgress)}</span>
                  {isOwner && <button onClick={() => onMarkComplete?.(media.id, media)} className="p-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"><CheckCircle size={20} /></button>}
                </div>
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─── StatsPanel ───────────────────────────────────────────────────────────────


// ─── ActivityFeed ─────────────────────────────────────────────────────────────


// ─── CopyProfileLink ─────────────────────────────────────────────────────────

function CopyProfileLink({ username }: { username: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`https://geekore.it/profile/${username}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }
  return (
    <button onClick={handleCopy} title="Copia link profilo" className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium border transition-all ${copied ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Link copiato!' : 'Copia link'}
    </button>
  )
}

// ─── CollectionControls ───────────────────────────────────────────────────────

function CollectionControls({
  search, onSearch, sort, onSort, view, onView, statusFilter, onStatusFilter,
}: {
  search: string; onSearch: (v: string) => void
  sort: SortMode; onSort: (v: SortMode) => void
  view: ViewMode; onView: (v: ViewMode) => void
  statusFilter: string; onStatusFilter: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Cerca..."
          className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl pl-8 pr-8 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
        />
        {search && (
          <button onClick={() => onSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Status filter */}
      <select
        value={statusFilter}
        onChange={e => onStatusFilter(e.target.value)}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-violet-500 transition-colors appearance-none"
      >
        <option value="all">Tutti gli stati</option>
        <option value="watching">In corso</option>
        <option value="completed">Completati</option>
        <option value="paused">In pausa</option>
        <option value="dropped">Abbandonati</option>
      </select>

      {/* Sort */}
      <select
        value={sort}
        onChange={e => onSort(e.target.value as SortMode)}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-violet-500 transition-colors appearance-none"
      >
        <option value="default">Ordine default</option>
        <option value="rating_desc">Voto (↓)</option>
        <option value="title_asc">Titolo (A-Z)</option>
        <option value="title_desc">Titolo (Z-A)</option>
        <option value="progress_desc">Progresso (↓)</option>
        <option value="date_desc">Aggiunto recentemente</option>
      </select>

      {/* View toggle */}
      <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-1 ml-auto">
        <button onClick={() => onView('grid')} className={`p-1.5 rounded-lg transition-colors ${view === 'grid' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
          <Grid3X3 size={14} />
        </button>
        <button onClick={() => onView('compact')} className={`p-1.5 rounded-lg transition-colors ${view === 'compact' ? 'bg-violet-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
          <List size={14} />
        </button>
      </div>
    </div>
  )
}

// ─── CompactMediaRow ──────────────────────────────────────────────────────────

function CompactMediaRow({ media, isOwner, onDelete, onRating, onSaveProgress, onStatusChange }: {
  media: UserMedia; isOwner: boolean
  onDelete?: (id: string) => void
  onRating?: (id: string, r: number) => void
  onSaveProgress?: (id: string, val: number) => void
  onStatusChange?: (id: string, status: string) => void
}) {
  const { t } = useLocale()
  const hasEpisodes = !!(media.episodes && media.episodes > 1)
  const maxEp = media.episodes || 0
  const [rowImgFailed, setRowImgFailed] = useState(false)

  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors group">
      {/* Cover mini */}
      <div className="w-10 h-14 bg-zinc-800 rounded-xl overflow-hidden flex-shrink-0">
        {media.is_steam ? (
          <SteamCoverImg appid={media.appid} title={media.title} />
        ) : media.cover_image && !rowImgFailed ? (
          <img
            src={media.cover_image}
            alt={media.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              const img = e.target as HTMLImageElement
              if (!img.src.includes('wsrv.nl')) {
                const referer = media.cover_image!.includes('myanimelist.net')
                  ? '&referer=https://myanimelist.net'
                  : media.cover_image!.includes('anilist.co')
                  ? '&referer=https://anilist.co'
                  : ''
                img.src = `https://wsrv.nl/?url=${encodeURIComponent(media.cover_image!)}&w=500&output=jpg${referer}`
              } else {
                setRowImgFailed(true)
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">📺</div>
        )}
      </div>

      {/* Title + type */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-white truncate">{media.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white ${TYPE_COLORS[media.type] || 'bg-zinc-700'}`}>
            {media.type.toUpperCase()}
          </span>
          {isOwner && (
            <select value={media.status || 'watching'} onChange={e => onStatusChange?.(media.id, e.target.value)} className="text-[10px] bg-transparent text-zinc-500 focus:outline-none cursor-pointer">
              <option value="watching">▶ In corso</option>
              <option value="completed">✓ Completato</option>
              <option value="paused">⏸ Pausa</option>
              <option value="dropped">✗ Abbandonato</option>
            </select>
          )}
        </div>
      </div>

      {/* Progress / hours */}
      <div className="text-right flex-shrink-0">
        {media.type === 'game' ? (
          <p className="text-xs text-emerald-400">{media.current_episode}h</p>
        ) : media.type === 'boardgame' ? (
          <p className="text-xs text-emerald-400">{media.current_episode} partite</p>
        ) : hasEpisodes ? (
          <div className="flex items-center gap-1">
            {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.max(1, media.current_episode - 1))} className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-emerald-400">−</button>}
            <span className="text-xs text-emerald-400 min-w-[60px] text-center">{media.current_episode}/{maxEp}</span>
            {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.min(maxEp, media.current_episode + 1))} className="w-5 h-5 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-emerald-400">+</button>}
          </div>
        ) : null}
      </div>

      {/* Rating */}
      <div className="flex-shrink-0">
        <StarRating value={media.rating || 0} onChange={isOwner ? (r) => onRating?.(media.id, r) : undefined} size={12} viewOnly={!isOwner} />
      </div>

      {/* Delete */}
      {isOwner && (
        <button onClick={() => onDelete?.(media.id)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all flex-shrink-0">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const supabase = createClient()
  const { t } = useLocale()
  const sensors = useDndSensors()
  const { csrfFetch } = useCsrf()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [steamAccount, setSteamAccount] = useState<any>(null)
  const [mediaList, setMediaList] = useState<UserMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [importingGames, setImportingGames] = useState(false)
  const [reorderingGames, setReorderingGames] = useState(false)
  const [steamMessage, setSteamMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)
  const [steamProgressMsg, setSteamProgressMsg] = useState<string | null>(null)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedMedia, setSelectedMedia] = useState<UserMedia | null>(null)
  const [notesInput, setNotesInput] = useState('')
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  // New state
  const [activeTab, setActiveTab] = useState<ProfileTab>('collection')
  const [collectionSearch, setCollectionSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [importPlatform, setImportPlatform] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [statusFilter, setStatusFilter] = useState('all')

  const RATING_SORTED_TYPES = new Set(['movie', 'manga', 'tv'])

  const sortMediaList = (list: UserMedia[]) =>
    [...list].sort((a, b) => {
      if (a.type === 'game' && b.type !== 'game') return -1
      if (b.type === 'game' && a.type !== 'game') return 1
      if (a.type === 'game' && b.type === 'game') return (b.current_episode || 0) - (a.current_episode || 0)
      // Per movie/manga/tv: ordina per rating desc, con senza-voto in fondo
      // Se display_order è stato modificato manualmente (diverso tra due item dello stesso tipo),
      // lo usiamo come override rispettando la scelta dell'utente
      if (RATING_SORTED_TYPES.has(a.type) && a.type === b.type) {
        const aOrder = a.display_order || 0
        const bOrder = b.display_order || 0
        // Se hanno display_order diversi (drag manuale), rispetta quello
        if (aOrder !== bOrder) return bOrder - aOrder
        // Altrimenti ordina per rating: con voto prima, senza voto dopo
        const aRating = a.rating ?? -1
        const bRating = b.rating ?? -1
        return bRating - aRating
      }
      return (b.display_order || 0) - (a.display_order || 0)
    })

  const refreshMedia = async (userId: string) => {
    const { data, error } = await supabase.from('user_media_entries').select('*').eq('user_id', userId)
    if (error) { console.error('[Profile] Errore refresh media:', error); return }
    if (data) setMediaList(sortMediaList(data))
  }

  const importSteamGames = async () => {
    if (!steamAccount?.steam_id64 || !currentUserId || importingGames) return
    setImportingGames(true)
    setSteamMessage(null)
    setSteamProgressMsg(null)

    try {
      const res = await fetch(`/api/steam/games?steamid=${steamAccount.steam_id64}`)

      if (!res.ok) {
        try {
          const data = await res.json()
          if (res.status === 429 && data.cached) { setSteamMessage({ text: data.error, type: 'error' }); return }
          setSteamMessage({ text: data.error || t.toasts.steamNoGames, type: 'error' })
        } catch { setSteamMessage({ text: t.toasts.steamNoGames, type: 'error' }) }
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            if (event.type === 'progress') {
              setSteamProgressMsg(event.message)
            } else if (event.type === 'done') {
              setSteamProgressMsg(null)
              if (!event.success || !event.count) {
                setSteamMessage({ text: t.toasts.steamNoGames, type: 'error' })
              } else {
                await refreshMedia(currentUserId)
                const cpMsg = event.core_power != null ? ` Core Power: ${event.core_power}.` : ''
                setSteamMessage({ text: `${t.toasts.steamImported(event.count)}${cpMsg}`, type: 'success' })
              }
            } else if (event.type === 'error') {
              setSteamProgressMsg(null)
              setSteamMessage({ text: event.message || t.toasts.steamNoGames, type: 'error' })
            }
          } catch {}
        }
      }
    } catch {
      setSteamMessage({ text: t.toasts.steamNoGames, type: 'error' })
    } finally {
      setImportingGames(false)
      setSteamProgressMsg(null)
    }
  }

  const reorderGamesByHours = async () => {
    if (!currentUserId || reorderingGames) return
    setReorderingGames(true)
    try {
      const { data, error } = await supabase.from('user_media_entries').select('*').eq('user_id', currentUserId).eq('type', 'game')
      if (error) { if (process.env.NODE_ENV === 'development') console.error('[Profile] Errore reorder games:', error); return }
      if (!data?.length) return
      const sorted = [...data].sort((a, b) => (b.current_episode || 0) - (a.current_episode || 0))
      const updates = sorted.map((g, i) => ({ id: g.id, display_order: Date.now() - i * 10000 }))
      await supabase.from('user_media_entries').upsert(updates)
      await refreshMedia(currentUserId)
    } finally { setReorderingGames(false) }
  }

  const handleDelete = async (id: string) => {
    if (!isOwner) return
    await supabase.from('user_media_entries').delete().eq('id', id)
    setMediaList(prev => prev.filter(item => item.id !== id))
    setDeletingId(null)
    showToast(t.toasts.deleted)
  }

  const markAsCompleted = async (id: string, media: UserMedia) => {
    if (!isOwner) return
    let update: any = {}
    if (media.season_episodes) {
      const maxS = Math.max(...Object.keys(media.season_episodes).map(Number))
      update = { current_season: maxS, current_episode: media.season_episodes[maxS]?.episode_count || 1, status: 'completed' }
    } else if (media.episodes) {
      update = { current_episode: media.episodes, status: 'completed' }
    } else {
      update = { current_episode: 1, status: 'completed' }
    }
    await supabase.from('user_media_entries').update(update).eq('id', id)
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...update } : item))
    showToast(t.toasts.completed)
    await logActivity({ type: 'media_completed', media_id: media.id, media_title: media.title, media_type: media.type, media_cover: media.cover_image })
  }

  const resetProgress = async (id: string) => {
    if (!isOwner) return
    const update = { current_season: 1, current_episode: 1, status: 'watching' }
    await supabase.from('user_media_entries').update(update).eq('id', id)
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...update } : item))
    showToast(t.toasts.progressReset)
  }

  const saveProgress = async (id: string, val: number, field: 'current_episode' | 'current_season' = 'current_episode') => {
    if (!isOwner) return
    const update = field === 'current_season' ? { current_season: val, current_episode: 1 } : { current_episode: val }
    await supabase.from('user_media_entries').update(update).eq('id', id)
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...update } : item))
    showToast(t.toasts.progressSaved)
  }

  const setRating = async (mediaId: string, rating: number) => {
    if (!isOwner) return
    const item = mediaList.find(m => m.id === mediaId)
    await supabase.from('user_media_entries').update({ rating }).eq('id', mediaId)
    setMediaList(prev => sortMediaList(prev.map(item => item.id === mediaId ? { ...item, rating } : item)))
    showToast(t.toasts.ratingSaved)
    if (item) await logActivity({ type: 'rating_given', media_id: item.id, media_title: item.title, media_type: item.type, media_cover: item.cover_image, rating_value: rating })
  }

  const openNotesModal = (media: UserMedia) => {
    if (!isOwner) return
    setSelectedMedia(media)
    setNotesInput(media.notes || '')
    setIsNotesModalOpen(true)
  }

  const saveNotes = async () => {
    if (!selectedMedia || !isOwner) return
    await supabase.from('user_media_entries').update({ notes: notesInput.trim() }).eq('id', selectedMedia.id)
    setMediaList(prev => prev.map(item => item.id === selectedMedia.id ? { ...item, notes: notesInput.trim() } : item))
    setIsNotesModalOpen(false)
    setSelectedMedia(null)
    showToast(t.toasts.notesSaved)
  }

  const changeStatus = async (id: string, status: string) => {
    if (!isOwner) return
    await supabase.from('user_media_entries').update({ status }).eq('id', id)
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, status } : item))
    if (status === 'completed') {
      const item = mediaList.find(m => m.id === id)
      if (item) await logActivity({ type: 'media_completed', media_id: item.id, media_title: item.title, media_type: item.type, media_cover: item.cover_image })
    }
  }

  const deleteAccount = async () => {
    if (!isOwner) return
    // S1: usa csrfFetch che allega X-CSRF-Token automaticamente
    const res = await csrfFetch('/api/user/delete', { method: 'DELETE' })
    if (res.ok) {
      await supabase.auth.signOut()
      window.location.href = '/'
    } else {
      showToast('Errore nella cancellazione. Riprova.', 'error')
    }
  }

  const onDragEnd = async (event: DragEndEvent) => {
    if (!isOwner) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = mediaList.findIndex(item => item.id === active.id)
    const newIndex = mediaList.findIndex(item => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const newList = arrayMove(mediaList, oldIndex, newIndex).map((item, i) => ({
      ...item, display_order: Date.now() - i * 10000,
    }))
    setMediaList(newList)
    await supabase.from('user_media_entries').upsert(newList.map(item => ({ id: item.id, display_order: item.display_order })))
  }

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) {
        if (process.env.NODE_ENV === 'development') console.error('[Profile] Errore autenticazione:', authError)
        setLoading(false)
        return
      }
      setCurrentUserId(user?.id || null)

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .ilike('username', username)
        .single()

      if (profileError || !profileData) { setLoading(false); return }
      setProfile(profileData)

      const ownerCheck = !!user && user.id === profileData.id
      setIsOwner(ownerCheck)

      const [steamResult, mediaResult, fwersResult, fwingResult, followResult] = await Promise.all([
        ownerCheck ? supabase.from('steam_accounts').select('*').eq('user_id', user!.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        supabase.from('user_media_entries').select('*').eq('user_id', profileData.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileData.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profileData.id),
        (user && !ownerCheck) ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', profileData.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ])

      if (ownerCheck) setSteamAccount(steamResult.data)
      if (mediaResult.error) {
        if (process.env.NODE_ENV === 'development') console.error('[Profile] Errore caricamento media:', mediaResult.error)
      } else if (mediaResult.data) {
        setMediaList(sortMediaList(mediaResult.data))
      }
      setFollowersCount(fwersResult.count || 0)
      setFollowingCount(fwingResult.count || 0)
      if (user && !ownerCheck) setIsFollowing(!!followResult.data)
      setLoading(false)
    }
    fetchData()
  }, [username])

  useEffect(() => {
    if (!steamMessage) return
    const timer = setTimeout(() => setSteamMessage(null), 5000)
    return () => clearTimeout(timer)
  }, [steamMessage])

  if (loading) return <Spinner />
  if (!profile) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">{t.profile.notFound}</div>

  const cats = t.profile.categories

  // Apply filters + sort
  const filteredList = mediaList.filter(m => {
    const matchSearch = !collectionSearch.trim() || m.title.toLowerCase().includes(collectionSearch.toLowerCase().trim())
    const matchStatus = statusFilter === 'all' || m.status === statusFilter
    return matchSearch && matchStatus
  })

  const sortedList = [...filteredList].sort((a, b) => {
    switch (sortMode) {
      case 'rating_desc': return (b.rating || 0) - (a.rating || 0)
      case 'title_asc': return a.title.localeCompare(b.title)
      case 'title_desc': return b.title.localeCompare(a.title)
      case 'progress_desc': return (b.current_episode || 0) - (a.current_episode || 0)
      case 'date_desc': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      default: return 0 // keep original sort
    }
  })

  const grouped = sortedList.reduce((acc: Record<string, UserMedia[]>, item) => {
    let cat: string
    if (item.type === 'game') cat = cats.games
    else if (item.type === 'manga') cat = cats.manga
    else if (item.type === 'anime') cat = cats.anime
    else if (item.type === 'tv') cat = cats.tv
    else if (item.type === 'movie') cat = cats.movies
    else if (item.type === 'boardgame') cat = cats.boardgames
    else cat = cats.other
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const categoryOrder = [cats.games, cats.anime, cats.tv, cats.manga, cats.movies, cats.boardgames, cats.other]
  // Mappa label categoria → slug URL per la pagina dedicata
  const categoryToType: Record<string, string> = {
    [cats.games]: 'game',
    [cats.anime]: 'anime',
    [cats.tv]: 'tv',
    [cats.manga]: 'manga',
    [cats.movies]: 'movie',
    [cats.boardgames]: 'boardgame',
  }
  const orderedCategories = categoryOrder.filter(cat => grouped[cat]?.length > 0)

  const TABS: { id: ProfileTab; label: string; count?: number }[] = [
    { id: 'collection', label: 'Collezione', count: mediaList.length },
    { id: 'activity', label: 'Attività' },
    { id: 'comments', label: 'Bacheca' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
      <div className="pt-8 max-w-screen-2xl mx-auto px-6">

        {/* Header profilo */}
        <div className="flex justify-between items-start mb-10">
          {/* Spazio sinistro bilanciamento */}
          <div className="w-12 hidden lg:block" />

          <div className="flex flex-col items-center flex-1">
            <div className="w-36 h-36 border-4 border-zinc-700 mb-6 rounded-full overflow-hidden">
              <Avatar
                src={profile.avatar_url}
                username={profile.username}
                displayName={profile.display_name}
                size={144}
                className="w-full h-full"
              />
            </div>
            <h1 className="text-5xl font-bold tracking-tighter mb-2">{profile.display_name || profile.username}</h1>
            <p className="text-xl text-zinc-400">@{profile.username}</p>
            {profile.bio && <p className="text-zinc-500 mt-3 text-center max-w-md">{profile.bio}</p>}

            <div className="flex items-center gap-6 mt-5">
              <div className="text-center">
                <p className="text-xl font-bold">{followersCount}</p>
                <p className="text-xs text-zinc-500 uppercase tracking-widest">{t.profile.follower}</p>
              </div>
              <div className="w-px h-8 bg-zinc-800" />
              <div className="text-center">
                <p className="text-xl font-bold">{followingCount}</p>
                <p className="text-xs text-zinc-500 uppercase tracking-widest">{t.profile.following}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
              {isOwner ? (
                <>
                  <Link href="/profile/edit">
                    <button data-testid="btn-edit-profile" className="px-8 py-3 bg-white text-black font-semibold rounded-full hover:bg-zinc-200 transition-all">
                      {t.profile.editProfile}
                    </button>
                  </Link>
                  <CopyProfileLink username={profile.username} />
                </>
              ) : (
                <>
                  {currentUserId && profile && (
                    <FollowButton targetId={profile.id} currentUserId={currentUserId} isFollowingInitial={isFollowing}
                      onFollowChange={(nowFollowing) => setFollowersCount(prev => nowFollowing ? prev + 1 : Math.max(0, prev - 1))} />
                  )}
                  <TasteSimilarityBadge targetUserId={profile.id} />
                  <CopyProfileLink username={profile.username} />
                </>
              )}
            </div>

            {isOwner && (
              <button onClick={() => setShowDeleteModal(true)} className="mt-3 text-xs text-zinc-600 hover:text-red-400 transition-colors flex items-center gap-1">
                <Trash2 size={12} /> Elimina account
              </button>
            )}

            {/* Riga import piattaforme — orizzontale, solo owner */}
            {isOwner && (
              <div className="flex items-center gap-2 mt-5">
                <span className="text-[10px] text-zinc-600 mr-1">Importa da</span>

                {/* Steam */}
                <button
                  onClick={() => setImportPlatform('steam')}
                  title={steamAccount ? 'Steam (connesso) — clicca per importare' : 'Connetti Steam'}
                  className={`w-8 h-8 rounded-full overflow-hidden border transition-all hover:scale-110 ${steamAccount ? 'border-[#66C0F4]/40 hover:border-[#66C0F4]' : 'border-zinc-700 hover:border-[#66C0F4]/60 opacity-50 hover:opacity-100'}`}
                >
                  <SteamIcon size={32} />
                </button>

                {/* AniList */}
                <button onClick={() => setImportPlatform('anilist')} title="Importa da AniList"
                  className="w-8 h-8 rounded-full overflow-hidden border border-zinc-700 hover:border-[#02a9ff]/60 transition-all hover:scale-110">
                  <svg viewBox="0 0 512 512" width="32" height="32">
                    <rect width="512" height="512" fill="#1e2630"/>
                    <path d="M321.92 323.27V136.6c0-10.698-5.887-16.602-16.558-16.602h-36.433c-10.672 0-16.561 5.904-16.561 16.602v88.651c0 2.497 23.996 14.089 24.623 16.541 18.282 71.61 3.972 128.92-13.359 131.6 28.337 1.405 31.455 15.064 10.348 5.731 3.229-38.209 15.828-38.134 52.049-1.406.31.317 7.427 15.282 7.87 15.282h85.545c10.672 0 16.558-5.9 16.558-16.6v-36.524c0-10.698-5.886-16.602-16.558-16.602z" fill="#02a9ff"/>
                    <path d="M170.68 120 74.999 393h74.338l16.192-47.222h80.96L262.315 393h73.968l-95.314-273zm11.776 165.28 23.183-75.629 25.393 75.629z" fill="#fefefe"/>
                  </svg>
                </button>

                {/* MAL */}
                <button onClick={() => setImportPlatform('mal')} title="Importa da MyAnimeList"
                  className="w-8 h-8 rounded-full overflow-hidden border border-zinc-700 hover:border-[#2e51a2]/80 transition-all hover:scale-110">
                  <svg viewBox="0 0 256 256" width="32" height="32">
                    <rect width="256" height="256" fill="#2e51a2"/>
                    <path fill="#ffffff" d="m 30.638616,88.40918 v 68.70703 h 17.759766 v -41.91016 l 15.470703,19.77344 16.67825,-19.77344 v 41.91016 H 98.307101 V 88.40918 H 80.547335 L 63.869085,109.82324 48.398382,88.40918 Z"/>
                    <path fill="#ffffff" d="m 182.49799,88.40918 v 68.70703 h 39.07974 l 3.78365,-14.65739 H 200.25775 V 88.40918 Z"/>
                    <path fill="#ffffff" d="m 149.65186,88.40918 c -21.64279,0 -35.06651,10.210974 -39.36914,25.39258 -4.19953,14.81779 0.34128,34.3715 10.28711,53.78906 l 14.85742,-10.47461 c 0,0 -7.06411,-9.21728 -8.39453,-23.03516 h 21.98437 v 23.03516 h 19.73438 v -51.67969 h -19.73438 v 14.9668 H 130.8003 c 1.71696,-11.1972 8.295,-17.30859 15.46875,-17.30859 h 25.8164 l -5.12304,-14.68555 z"/>
                  </svg>
                </button>

                {/* Letterboxd — tre cerchi sovrapposti ufficiali */}
                <button onClick={() => setImportPlatform('letterboxd')} title="Importa da Letterboxd"
                  className="w-8 h-8 rounded-full overflow-hidden border border-zinc-700 hover:border-zinc-500 transition-all hover:scale-110">
                  <svg viewBox="0 0 40 40" width="32" height="32">
                    <rect width="40" height="40" fill="#1a1a1a"/>
                    <ellipse cx="11" cy="20" rx="9" ry="9" fill="#ff8000"/>
                    <ellipse cx="20" cy="20" rx="9" ry="9" fill="#00e054"/>
                    <ellipse cx="29" cy="20" rx="9" ry="9" fill="#40bcf4"/>
                    <ellipse cx="15.5" cy="20" rx="4.5" ry="9" fill="#ffffff" fillOpacity="0.9"/>
                    <ellipse cx="24.5" cy="20" rx="4.5" ry="9" fill="#ffffff" fillOpacity="0.9"/>
                  </svg>
                </button>

                {/* Xbox */}
                <button onClick={() => setImportPlatform('xbox')} title="Importa da Xbox"
                  className="w-8 h-8 rounded-full overflow-hidden border border-zinc-700 hover:border-[#107c10]/60 transition-all hover:scale-110 bg-black flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 88 88">
                    <path fill="#107c10" d="M39.73 86.91c-6.628-.635-13.338-3.015-19.102-6.776-4.83-3.15-5.92-4.447-5.92-7.032 0-5.193 5.71-14.29 15.48-24.658 5.547-5.89 13.275-12.79 14.11-12.604 1.626.363 14.616 13.034 19.48 19 7.69 9.43 11.224 17.154 9.428 20.597-1.365 2.617-9.837 7.733-16.06 9.698-5.13 1.62-11.867 2.306-17.416 1.775zM8.184 67.703c-4.014-6.158-6.042-12.22-7.02-20.988-.324-2.895-.21-4.55.733-10.494 1.173-7.4 5.39-15.97 10.46-21.24 2.158-2.24 2.35-2.3 4.982-1.41 3.19 1.08 6.6 3.436 11.89 8.22l3.09 2.794-1.69 2.07c-7.828 9.61-16.09 23.24-19.2 31.67-1.69 4.58-2.37 9.18-1.64 11.095.49 1.294.04.812-1.61-1.714zm70.453 1.047c.397-1.936-.105-5.49-1.28-9.076-2.545-7.765-11.054-22.21-18.867-32.032l-2.46-3.092 2.662-2.443c3.474-3.19 5.886-5.1 8.49-6.723 2.053-1.28 4.988-2.413 6.25-2.413.777 0 3.516 2.85 5.726 5.95 3.424 4.8 5.942 10.63 7.218 16.69.825 3.92.894 12.3.133 16.21-.63 3.208-1.95 7.366-3.23 10.187-.97 2.113-3.36 6.218-4.41 7.554-.54.687-.54.686-.24-.796zM40.44 11.505C36.834 9.675 31.272 7.71 28.2 7.18c-1.076-.185-2.913-.29-4.08-.23-2.536.128-2.423-.004 1.643-1.925 3.38-1.597 6.2-2.536 10.03-3.34C40.098.78 48.193.77 52.43 1.663c4.575.965 9.964 2.97 13 4.84l.904.554-2.07-.104C60.148 6.745 54.15 8.408 47.71 11.54c-1.942.946-3.63 1.7-3.754 1.68-.123-.024-1.706-.795-3.52-1.715z"/>
                  </svg>
                </button>
              </div>
            )}
          </div>


          {/* Pallini import — orizzontali sotto i bottoni, solo per owner */}
          {isOwner ? (
            <div className="hidden lg:block w-12" />
          ) : (
            <div className="hidden lg:block w-12" />
          )}
        </div>



        {/* Stats */}
        {mediaList.length > 0 && <ProfileStatsPanel mediaList={mediaList} />}

        {/* ── TABS ─────────────────────────────────────────────────── */}
        <div className="flex border-b border-zinc-800 mb-8">
          {TABS.map(tab => (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-violet-500 text-violet-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-violet-500/20 text-violet-300' : 'bg-zinc-800 text-zinc-500'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── TAB: COLLECTION ─────────────────────────────────────── */}
        {activeTab === 'collection' && (
          <>
            {mediaList.length === 0 ? (
              <div className="text-center py-20 text-zinc-500">{isOwner ? t.profile.emptyOwner : t.profile.emptyOther}</div>
            ) : (
              <>
                {mediaList.length > 3 && (
                  <CollectionControls
                    search={collectionSearch} onSearch={setCollectionSearch}
                    sort={sortMode} onSort={setSortMode}
                    view={viewMode} onView={setViewMode}
                    statusFilter={statusFilter} onStatusFilter={setStatusFilter}
                  />
                )}

                {sortedList.length === 0 ? (
                  <div className="text-center py-16 text-zinc-500">
                    <SearchIcon size={36} className="mx-auto mb-3 opacity-30" />
                    <p>Nessun titolo trovato</p>
                  </div>
                ) : viewMode === 'compact' ? (
                  // Compact list view
                  <div className="space-y-2">
                    {orderedCategories.map(category => (
                      <div key={category} className="mb-8">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-semibold">{category}</h3>
                          <span className="text-xs text-zinc-500">{grouped[category].length}</span>
                        </div>
                        <div className="space-y-1.5">
                          {grouped[category].map(media => (
                            <CompactMediaRow
                              key={media.id}
                              media={media}
                              isOwner={isOwner}
                              onDelete={handleDelete}
                              onRating={setRating}
                              onSaveProgress={saveProgress}
                              onStatusChange={changeStatus}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Grid view (default) — mostra 5 card per categoria + "Vedi tutti"
                  orderedCategories.map((category) => {
                    const items = grouped[category]
                    const preview = items.slice(0, 6)
                    const hasMore = items.length > 6
                    return (
                      <div key={category} className="mb-16">
                        <div className="flex items-center justify-between mb-6">
                          <h3 className="text-2xl font-semibold">{category}</h3>
                          <div className="flex items-center gap-3">
                            <p className="text-zinc-500">{t.profile.elements(items.length)}</p>
                            {hasMore && (
                              <Link
                                href={`/profile/${profile.username}/${categoryToType[category] || category}`}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-700 hover:border-violet-500/50 rounded-xl text-xs text-zinc-400 hover:text-violet-400 transition-all"
                              >
                                Vedi tutti <ChevronRight size={13} />
                              </Link>
                            )}
                          </div>
                        </div>
                        {isOwner ? (
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                            <SortableContext items={preview.map(m => m.id)} strategy={rectSortingStrategy}>
                              <div className="flex gap-4 items-stretch">
                                {preview.map((media) => (
                                  <div key={media.id} className="w-52 flex-shrink-0">
                                    <SortableBox media={media}>
                                      <MediaCard media={media} isOwner={true} deletingId={deletingId}
                                        onDelete={handleDelete} onDeleteRequest={setDeletingId} onDeleteCancel={() => setDeletingId(null)}
                                        onRating={setRating} onNotes={openNotesModal} onSaveProgress={saveProgress}
                                        onMarkComplete={markAsCompleted} onReset={resetProgress} onStatusChange={changeStatus} />
                                    </SortableBox>
                                  </div>
                                ))}
                                {hasMore && (
                                  <Link
                                    href={`/profile/${profile.username}/${categoryToType[category] || category}`}
                                    className="flex-shrink-0 w-14 border border-dashed border-zinc-700 hover:border-violet-500/50 rounded-3xl h-[520px] flex flex-col items-center justify-center gap-1.5 text-zinc-500 hover:text-violet-400 transition-all group"
                                  >
                                    <ChevronRight size={16} />
                                    <span className="text-xs font-semibold">+{items.length - 6}</span>
                                  </Link>
                                )}
                              </div>
                            </SortableContext>
                          </DndContext>
                        ) : (
                          <div className="flex gap-4 items-stretch">
                            {preview.map((media) => (
                              <div key={media.id} className="w-52 flex-shrink-0 border border-zinc-800 rounded-3xl overflow-hidden h-[520px] flex flex-col">
                                <MediaCard media={media} isOwner={false} onStatusChange={changeStatus} />
                              </div>
                            ))}
                            {hasMore && (
                              <Link
                                href={`/profile/${profile.username}/${categoryToType[category] || category}`}
                                className="flex-shrink-0 w-14 border border-dashed border-zinc-700 hover:border-violet-500/50 rounded-3xl h-[520px] flex flex-col items-center justify-center gap-1.5 text-zinc-500 hover:text-violet-400 transition-all group"
                              >
                                <ChevronRight size={16} />
                                <span className="text-xs font-semibold">+{items.length - 6}</span>
                              </Link>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </>
            )}
          </>
        )}

        {/* ── TAB: ACTIVITY ───────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div>
            <h3 className="text-xl font-semibold mb-5">Attività recente</h3>
            <ProfileActivityFeed userId={profile.id} />
          </div>
        )}

        {/* ── TAB: COMMENTS ───────────────────────────────────────── */}
        {activeTab === 'comments' && profile && (
          <ProfileComments profileId={profile.id} profileUsername={profile.username} isOwner={isOwner} />
        )}
      </div>

      {/* Modal Note */}
      {isNotesModalOpen && selectedMedia && isOwner && (
        <NotesModal
          title={t.profile.notesTitle(selectedMedia.title)}
          value={notesInput}
          onChange={(val) => { setNotesInput(val) }}
          onSave={saveNotes}
          onClose={() => setIsNotesModalOpen(false)}
          saveLabel={t.common.save}
          cancelLabel={t.media.cancel}
          placeholder={t.profile.notesPlaceholder}
        />
      )}

      {/* Modal Cancellazione Account */}
      {showDeleteModal && isOwner && (
        <DeleteAccountModal
          onConfirm={deleteAccount}
          onClose={() => setShowDeleteModal(false)}
        />
      )}

      {/* Modal Importa piattaforma specifica */}
      {importPlatform && isOwner && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
          onClick={() => setImportPlatform(null)}
        >
          <div
            className="bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
              <h2 className="text-base font-bold">
                {importPlatform === 'anilist' && 'Importa da AniList'}
                {importPlatform === 'mal' && 'Importa da MyAnimeList'}
                {importPlatform === 'letterboxd' && 'Importa da Letterboxd'}
                {importPlatform === 'xbox' && 'Importa da Xbox'}
                {importPlatform === 'steam' && 'Importa da Steam'}
              </h2>
              <button onClick={() => setImportPlatform(null)} className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition">
                <XIcon size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {importPlatform === 'anilist' && <AniListImport />}
              {importPlatform === 'mal' && <MALImport />}
              {importPlatform === 'letterboxd' && <LetterboxdImport />}
              {importPlatform === 'xbox' && <XboxImport />}
              {importPlatform === 'steam' && <SteamImport onImportDone={() => { if (currentUserId) refreshMedia(currentUserId) }} />}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}