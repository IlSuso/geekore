'use client'

import { logActivity } from '@/lib/activity'
import { Trash2, Copy, Check, Search as SearchIcon, SlidersHorizontal, ArrowUpDown, List, Grid3X3 } from 'lucide-react'
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
import Link from 'next/link'
import { useLocale } from '@/lib/locale'

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
    if (media.cover_image) {
      return (
        <img
          src={media.cover_image}
          alt={media.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            const img = e.target as HTMLImageElement
            img.onerror = null
            img.style.display = 'none'
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
        {media.is_steam && (
          <div className="absolute top-3 left-3 z-20 bg-[#1b2838]/90 backdrop-blur-sm p-1.5 rounded-xl border border-[#66C0F4]/30 shadow-lg">
            <SteamIcon size={15} className="text-[#66C0F4]" />
          </div>
        )}
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

function StatsPanel({ mediaList }: { mediaList: UserMedia[] }) {
  const stats = useMemo(() => {
    const byType = (t: string) => mediaList.filter(m => m.type === t)
    const steamHours = byType('game').filter(m => m.is_steam).reduce((s, m) => s + (m.current_episode || 0), 0)
    const animeEps = byType('anime').reduce((s, m) => s + (m.current_episode || 0), 0)
    const mangaChapters = byType('manga').reduce((s, m) => s + (m.current_episode || 0), 0)
    const rated = mediaList.filter(m => m.rating && m.rating > 0)
    const avgRating = rated.length > 0 ? (rated.reduce((s, m) => s + (m.rating || 0), 0) / rated.length).toFixed(1) : null
    const genreCount: Record<string, number> = {}
    for (const item of mediaList) for (const g of (item.genres || [])) genreCount[g] = (genreCount[g] || 0) + 1
    const topGenres = Object.entries(genreCount).sort(([,a],[,b]) => b-a).slice(0, 5).map(([g]) => g)
    return {
      anime: byType('anime').length, tv: byType('tv').length, manga: byType('manga').length,
      games: byType('game').length, movies: byType('movie').length, boards: byType('boardgame').length,
      steamHours, animeHours: Math.round(animeEps * 24 / 60), mangaChapters,
      avgRating, topGenres, total: mediaList.length,
    }
  }, [mediaList])

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 mb-10">
      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-4">Statistiche</h3>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
        {[
          { label: 'Anime', value: stats.anime, color: 'text-sky-400' },
          { label: 'Serie TV', value: stats.tv, color: 'text-purple-400' },
          { label: 'Manga', value: stats.manga, color: 'text-orange-400' },
          { label: 'Giochi', value: stats.games, color: 'text-green-400' },
          { label: 'Film', value: stats.movies, color: 'text-red-400' },
          { label: 'Board', value: stats.boards, color: 'text-yellow-400' },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-violet-400">{stats.steamHours}h</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Ore Steam</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-sky-400">~{stats.animeHours}h</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Ore anime</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-orange-400">{stats.mangaChapters}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Cap. manga</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-yellow-400">{stats.avgRating ? `★ ${stats.avgRating}` : '—'}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Voto medio</p>
        </div>
      </div>
      {stats.topGenres.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Generi più seguiti</p>
          <div className="flex flex-wrap gap-1.5">
            {stats.topGenres.map(g => (
              <span key={g} className="text-[10px] bg-violet-500/15 text-violet-300 px-2.5 py-1 rounded-full font-medium border border-violet-500/20">{g}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ActivityFeed ─────────────────────────────────────────────────────────────

function ActivityFeed({ userId }: { userId: string }) {
  const [activities, setActivities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/activity?userId=${userId}&limit=10`)
      .then(r => r.json())
      .then(data => { setActivities(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [userId])

  const typeLabel = (type: string) => {
    const map: Record<string, string> = {
      media_added: 'ha aggiunto', media_completed: 'ha completato',
      media_dropped: 'ha abbandonato', rating_given: 'ha votato',
      steam_imported: 'ha importato giochi da Steam',
    }
    return map[type] || 'ha aggiornato'
  }

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 2) return 'adesso'
    if (mins < 60) return `${mins}m fa`
    if (hours < 24) return `${hours}h fa`
    if (days < 7) return `${days}g fa`
    return new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  }

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-zinc-900 rounded-2xl animate-pulse" />)}</div>
  if (activities.length === 0) return <div className="text-center py-12 text-zinc-600 text-sm">Nessuna attività recente</div>

  return (
    <div className="space-y-2">
      {activities.map(a => (
        <div key={a.id} className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors">
          {a.media_cover ? <img src={a.media_cover} alt={a.media_title} className="w-10 h-14 object-cover rounded-xl flex-shrink-0" /> : <div className="w-10 h-14 bg-zinc-800 rounded-xl flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-300 leading-snug">
              <span className="text-zinc-500">{typeLabel(a.type)}</span>
              {a.media_title && <span className="font-semibold text-white ml-1">"{a.media_title}"</span>}
              {a.rating_value && <span className="text-yellow-400 ml-1">{'★'.repeat(Math.round(a.rating_value))}</span>}
            </p>
            <p className="text-xs text-zinc-600 mt-0.5">{timeAgo(a.created_at)}</p>
          </div>
          {a.media_type && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLORS[a.media_type] ? TYPE_COLORS[a.media_type].replace('bg-', 'bg-').replace('500', '500/20') + ' ' + TYPE_COLORS[a.media_type].replace('bg-', 'text-').replace('500', '400') : 'bg-zinc-700 text-zinc-400'}`}>
              {a.media_type.toUpperCase()}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

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

  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors group">
      {/* Cover mini */}
      <div className="w-10 h-14 bg-zinc-800 rounded-xl overflow-hidden flex-shrink-0">
        {media.is_steam ? (
          <SteamCoverImg appid={media.appid} title={media.title} />
        ) : media.cover_image ? (
          <img src={media.cover_image} alt={media.title} className="w-full h-full object-cover" />
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

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [steamAccount, setSteamAccount] = useState<any>(null)
  const [mediaList, setMediaList] = useState<UserMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [importingGames, setImportingGames] = useState(false)
  const [reorderingGames, setReorderingGames] = useState(false)
  const [steamMessage, setSteamMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedMedia, setSelectedMedia] = useState<UserMedia | null>(null)
  const [notesInput, setNotesInput] = useState('')
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  // New state
  const [activeTab, setActiveTab] = useState<ProfileTab>('collection')
  const [collectionSearch, setCollectionSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [statusFilter, setStatusFilter] = useState('all')

  const sortMediaList = (list: UserMedia[]) =>
    [...list].sort((a, b) => {
      if (a.type === 'game' && b.type !== 'game') return -1
      if (b.type === 'game' && a.type !== 'game') return 1
      if (a.type === 'game' && b.type === 'game') return (b.current_episode || 0) - (a.current_episode || 0)
      return (b.display_order || 0) - (a.display_order || 0)
    })

  const refreshMedia = async (userId: string) => {
    const { data } = await supabase.from('user_media_entries').select('*').eq('user_id', userId)
    if (data) setMediaList(sortMediaList(data))
  }

  const importSteamGames = async () => {
    if (!steamAccount?.steam_id64 || !currentUserId || importingGames) return
    setImportingGames(true)
    setSteamMessage(null)
    try {
      const res = await fetch(`/api/steam/games?steamid=${steamAccount.steam_id64}`)
      const data = await res.json()
      if (res.status === 429 && data.cached) { setSteamMessage({ text: data.error, type: 'error' }); return }
      if (!data.success || !data.games?.length) { setSteamMessage({ text: t.toasts.steamNoGames, type: 'error' }); return }
      await refreshMedia(currentUserId)
      const cpMsg = data.core_power != null ? ` Core Power: ${data.core_power}.` : ''
      setSteamMessage({ text: `${t.toasts.steamImported(data.games.length)}${cpMsg}`, type: 'success' })
    } finally { setImportingGames(false) }
  }

  const reorderGamesByHours = async () => {
    if (!currentUserId || reorderingGames) return
    setReorderingGames(true)
    try {
      const { data } = await supabase.from('user_media_entries').select('*').eq('user_id', currentUserId).eq('type', 'game')
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
    setMediaList(prev => prev.map(item => item.id === mediaId ? { ...item, rating } : item))
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
    if (deleteConfirmText !== 'elimina' || !isOwner) return
    setDeletingAccount(true)
    const res = await fetch('/api/user/delete', { method: 'DELETE' })
    if (res.ok) {
      await supabase.auth.signOut()
      window.location.href = '/'
    } else {
      showToast('Errore nella cancellazione. Riprova.', 'error')
      setDeletingAccount(false)
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
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)

      const { data: profileData } = await supabase.from('profiles').select('id, username, display_name, avatar_url, bio').ilike('username', username).single()
      if (!profileData) { setLoading(false); return }
      setProfile(profileData)

      const ownerCheck = !!user && user.id === profileData.id
      setIsOwner(ownerCheck)

      const [steamResult, mediaResult, fwersResult, fwingResult, followResult] = await Promise.all([
        ownerCheck ? supabase.from('steam_accounts').select('*').eq('user_id', user!.id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('user_media_entries').select('*').eq('user_id', profileData.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileData.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profileData.id),
        (user && !ownerCheck) ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', profileData.id).maybeSingle() : Promise.resolve({ data: null }),
      ])

      if (ownerCheck) setSteamAccount(steamResult.data)
      if (mediaResult.data) setMediaList(sortMediaList(mediaResult.data))
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
  const orderedCategories = categoryOrder.filter(cat => grouped[cat]?.length > 0)

  const TABS: { id: ProfileTab; label: string; count?: number }[] = [
    { id: 'collection', label: 'Collezione', count: mediaList.length },
    { id: 'activity', label: 'Attività' },
    { id: 'comments', label: 'Bacheca' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
      <div className="pt-8 max-w-6xl mx-auto px-6">

        {/* Header profilo */}
        <div className="flex justify-between items-start mb-10">
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
                    <button className="px-8 py-3 bg-white text-black font-semibold rounded-full hover:bg-zinc-200 transition-all">
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
                  <CopyProfileLink username={profile.username} />
                </>
              )}
            </div>

            {isOwner && (
              <button onClick={() => setShowDeleteModal(true)} className="mt-3 text-xs text-zinc-600 hover:text-red-400 transition-colors flex items-center gap-1">
                <Trash2 size={12} /> Elimina account
              </button>
            )}
          </div>
        </div>

        {/* Steam section (owner only) */}
        {isOwner && (
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 mb-12">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <SteamIcon size={32} className="text-[#66C0F4]" />
                <h2 className="text-2xl font-semibold">{t.steam.accountTitle}</h2>
              </div>
              {steamAccount ? (
                <div className="text-green-400 flex items-center gap-2"><CheckCircle size={20} /> {t.steam.connected}</div>
              ) : (
                <div className="text-amber-400 text-sm">{t.steam.notConnected}</div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              {steamAccount ? (
                <>
                  <button onClick={importSteamGames} disabled={importingGames} className="flex-1 flex items-center justify-center gap-3 bg-[#1B2838] hover:bg-[#2a475e] border border-[#66C0F4] py-4 rounded-2xl font-medium transition disabled:opacity-50">
                    <RefreshCw size={20} className={importingGames ? 'animate-spin' : ''} />
                    {importingGames ? t.steam.updating : t.steam.updateBtn}
                  </button>
                  <button onClick={reorderGamesByHours} disabled={reorderingGames} className="flex-1 flex items-center justify-center gap-3 bg-zinc-900 hover:bg-zinc-800 border border-violet-500/50 hover:border-violet-500 py-4 rounded-2xl font-medium transition disabled:opacity-50">
                    <RotateCw size={20} className={reorderingGames ? 'animate-spin' : ''} />
                    {reorderingGames ? t.steam.reordering : t.steam.reorderBtn}
                  </button>
                </>
              ) : (
                <a href="/api/steam/connect" className="flex-1 flex items-center justify-center gap-3 bg-[#1B2838] hover:bg-[#2a475e] border border-[#66C0F4] py-4 rounded-2xl font-medium transition">
                  <SteamIcon size={20} /> {t.steam.connectBtn}
                </a>
              )}
            </div>
            {steamMessage && (
              <div className={`mt-4 px-5 py-3 rounded-2xl text-sm font-medium ${steamMessage.type === 'error' ? 'bg-red-950/50 border border-red-800 text-red-400' : 'bg-emerald-950/50 border border-emerald-800 text-emerald-400'}`}>
                {steamMessage.text}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        {mediaList.length > 0 && <StatsPanel mediaList={mediaList} />}

        {/* ── TABS ─────────────────────────────────────────────────── */}
        <div className="flex border-b border-zinc-800 mb-8">
          {TABS.map(tab => (
            <button
              key={tab.id}
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
                  // Grid view (default)
                  orderedCategories.map((category) => (
                    <div key={category} className="mb-16">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-2xl font-semibold">{category}</h3>
                        <p className="text-zinc-500">{t.profile.elements(grouped[category].length)}</p>
                      </div>
                      {isOwner ? (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                          <SortableContext items={grouped[category].map(m => m.id)} strategy={rectSortingStrategy}>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                              {grouped[category].map((media) => (
                                <SortableBox key={media.id} media={media}>
                                  <MediaCard media={media} isOwner={true} deletingId={deletingId}
                                    onDelete={handleDelete} onDeleteRequest={setDeletingId} onDeleteCancel={() => setDeletingId(null)}
                                    onRating={setRating} onNotes={openNotesModal} onSaveProgress={saveProgress}
                                    onMarkComplete={markAsCompleted} onReset={resetProgress} onStatusChange={changeStatus} />
                                </SortableBox>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                          {grouped[category].map((media) => (
                            <div key={media.id} className="border border-zinc-800 rounded-3xl overflow-hidden h-[520px] flex flex-col">
                              <MediaCard media={media} isOwner={false} onStatusChange={changeStatus} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            )}
          </>
        )}

        {/* ── TAB: ACTIVITY ───────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div>
            <h3 className="text-xl font-semibold mb-5">Attività recente</h3>
            <ActivityFeed userId={profile.id} />
          </div>
        )}

        {/* ── TAB: COMMENTS ───────────────────────────────────────── */}
        {activeTab === 'comments' && profile && (
          <ProfileComments profileId={profile.id} profileUsername={profile.username} isOwner={isOwner} />
        )}
      </div>

      {/* Modal Note */}
      {isNotesModalOpen && selectedMedia && isOwner && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]">
          <div className="bg-zinc-900 rounded-3xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-xl font-semibold">{t.profile.notesTitle(selectedMedia.title)}</h3>
              <button onClick={() => setIsNotesModalOpen(false)} className="text-zinc-400 hover:text-white"><X size={24} /></button>
            </div>
            <div className="p-6">
              <textarea value={notesInput} onChange={(e) => setNotesInput(e.target.value)} placeholder={t.profile.notesPlaceholder}
                className="w-full h-40 bg-zinc-800 border border-zinc-700 rounded-2xl p-4 text-white resize-y focus:outline-none focus:border-violet-500" />
            </div>
            <div className="p-6 border-t border-zinc-800 flex gap-3">
              <button onClick={() => setIsNotesModalOpen(false)} className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition">{t.media.cancel}</button>
              <button onClick={saveNotes} className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl transition font-medium">{t.common.save}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cancellazione Account */}
      {showDeleteModal && isOwner && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[70] p-4">
          <div className="bg-zinc-900 border border-red-900/50 rounded-3xl max-w-md w-full p-8">
            <div className="w-14 h-14 bg-red-950 border border-red-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Trash2 size={28} className="text-red-400" />
            </div>
            <h3 className="text-2xl font-bold text-white text-center mb-2">Elimina account</h3>
            <p className="text-zinc-400 text-center text-sm mb-6">
              Questa azione è <strong className="text-red-400">irreversibile</strong>. Tutti i tuoi dati verranno cancellati permanentemente.
            </p>
            <div className="mb-6">
              <label className="block text-sm text-zinc-500 mb-2">
                Scrivi <span className="text-red-400 font-mono font-bold">elimina</span> per confermare
              </label>
              <input type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder="elimina"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-5 py-3 text-white focus:outline-none focus:border-red-500 transition" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteConfirmText('') }} className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition font-medium">Annulla</button>
              <button onClick={deleteAccount} disabled={deleteConfirmText !== 'elimina' || deletingAccount}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-30 rounded-2xl transition font-medium text-white">
                {deletingAccount ? 'Eliminazione...' : 'Elimina definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}