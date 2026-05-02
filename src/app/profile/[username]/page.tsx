'use client'

import { logActivity } from '@/lib/activity'
import { profileInvalidateBridge } from '@/hooks/profileInvalidateBridge'
import { Copy, Check, Search as SearchIcon, SlidersHorizontal, ArrowUpDown, ChevronRight, Download, X as XIcon, Gamepad2, Tv, Film, BarChart2, Users, TrendingUp, GripVertical, List } from 'lucide-react'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { gestureState } from '@/hooks/gestureState'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle, Clock, X, RotateCw, RotateCcw, Edit3, RefreshCw, Settings, Bookmark, Loader2, Sparkles,
} from 'lucide-react'
import { SteamIcon } from '@/components/icons/SteamIcon'
import { StarRating } from '@/components/ui/StarRating'
import { MobileMediaModal, type ModalMedia } from '@/components/profile/MobileMediaModal'
import { Spinner } from '@/components/ui/Spinner'
import { UserBadge } from '@/components/ui/UserBadge'
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
import { BGGImport } from '@/components/import/BGGImport'
import { ProfileActivityFeed } from '@/components/profile/ProfileActivityFeed'
import { NotesModal } from '@/components/profile/NotesModal'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { PullToRefreshIndicator } from '@/components/ui/ErrorState'
import { optimizeCover } from '@/lib/imageOptimizer'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'

// ─── Cache ───────────────────────────────────────────────────────────────────

type ProfileCacheEntry = {
  profile: { id: string; username: string; display_name?: string; avatar_url?: string; bio?: string; badge?: string | null }
  mediaList: any[]
  steamAccount: any
  followersCount: number
  followingCount: number
  ts: number
}
const profileCache: Record<string, ProfileCacheEntry> = {}
const PROFILE_CACHE_TTL = 5 * 60 * 1000 // 5 minuti

// ─── Types ───────────────────────────────────────────────────────────────────

type UserMedia = {
  id: string
  title: string
  title_en?: string  // titolo inglese per switch lingua real-time
  type: 'anime' | 'tv' | 'movie' | 'game' | 'manga'
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
  external_id?: string
  achievement_data?: { curr: number; tot: number; gs_curr: number; gs_tot: number } | null
}

type Profile = {
  id: string
  username: string
  display_name?: string
  avatar_url?: string
  bio?: string
  badge?: string | null
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
        <Gamepad2 size={32} className="text-zinc-600" />
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


// ─── InlineChapterInput ───────────────────────────────────────────────────────

function InlineChapterInput({ value, max, onSave }: {
  value: number
  max?: number
  onSave: (n: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const committed = useRef(false)

  const commit = () => {
    if (committed.current) return
    committed.current = true
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n >= 0 && (!max || n <= max)) onSave(n)
    setEditing(false)
    setTimeout(() => { committed.current = false }, 100)
  }

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        value={draft}
        min={0}
        max={max}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit() }
          if (e.key === 'Escape') { e.stopPropagation(); setEditing(false) }
        }}
        onPointerDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        className="bg-transparent outline-none w-10 text-emerald-400 text-[11px] font-semibold p-0 text-center border-b border-emerald-400/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    )
  }

  return (
    <span
      onClick={() => { setDraft(value.toString()); setEditing(true) }}
      onPointerDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      className="text-emerald-400 font-semibold cursor-text hover:underline decoration-dotted underline-offset-2 select-none"
    >
      {value}
    </span>
  )
}

// ─── SortableBox ─────────────────────────────────────────────────────────────

function SortableBox({ media, children, disabled }: { media: UserMedia; children: React.ReactNode; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: media.id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? 'none' : (transition || undefined),
        userSelect: 'none',
        WebkitUserSelect: 'none',
        borderColor: isDragging ? 'var(--accent)' : undefined,
      }}
      {...attributes}
      {...(disabled ? {} : listeners)}
      className={`${disabled ? '' : 'cursor-grab active:cursor-grabbing'} rounded-3xl overflow-hidden min-h-[340px] sm:min-h-[380px] md:min-h-[420px] h-full flex flex-col ${isDragging
          ? 'border-2 shadow-2xl scale-[1.02] z-50'
          : 'border border-zinc-800 md:hover:border-zinc-600 md:hover:shadow-xl'
        }`}
    >
      {children}
    </div>
  )
}

// ─── MediaCard ────────────────────────────────────────────────────────────────


function MediaCard({
  media, isOwner, deletingId,
  onDelete, onDeleteRequest, onDeleteCancel, onRating, onNotes, onViewNotes, onSaveProgress, onMarkComplete, onReset, onStatusChange, onEnrichEpisodes, enriching, onMobileTap,
}: {
  media: UserMedia
  isOwner: boolean
  deletingId?: string | null
  onDelete?: (id: string) => void
  onDeleteRequest?: (id: string) => void
  onDeleteCancel?: () => void
  onRating?: (id: string, r: number) => void
  onNotes?: (media: UserMedia) => void
  onViewNotes?: (media: UserMedia) => void
  onSaveProgress?: (id: string, val: number, field?: 'current_episode' | 'current_season') => void
  onMarkComplete?: (id: string, media: UserMedia) => void
  onReset?: (id: string) => void
  onStatusChange?: (id: string, status: string) => void
  onEnrichEpisodes?: (id: string) => void
  enriching?: boolean
  onMobileTap?: () => void
}) {
  const { t, locale } = useLocale()
  const router = useRouter()
  const m = t.media
  const [imgFailed, setImgFailed] = useState(false)
  const displayTitle = locale === 'en' && media.title_en ? media.title_en : media.title

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

  const statusBadge: Record<string, { label: string; cls: string; style?: React.CSSProperties }> = {
    completed: { label: 'Completato', cls: '', style: { background: 'rgba(230,255,61,0.12)', color: 'var(--accent)', border: '1px solid rgba(230,255,61,0.3)' } },
    paused: { label: 'In pausa', cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/40' },
    dropped: { label: 'Abbandonato', cls: 'bg-red-500/20 text-red-300 border border-red-500/40' },
    watching: { label: 'In corso', cls: 'bg-sky-500/20 text-sky-300 border border-sky-500/40' },
  }

  // Cover rendering
  const renderCover = () => {
    if (media.is_steam) {
      return <SteamCoverImg appid={media.appid} title={displayTitle} />
    }
    if (media.cover_image && !imgFailed) {
      return (
        <img
          src={optimizeCover(media.cover_image, 'profile-cover')}
          alt={displayTitle}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            const img = e.target as HTMLImageElement
            if (!img.src.includes('wsrv.nl')) {
              const referer = media.cover_image!.includes('myanimelist.net')
                ? '&referer=https://myanimelist.net'
                : media.cover_image!.includes('anilist.co')
                  ? '&referer=https://anilist.co'
                  : ''
              img.src = `https://wsrv.nl/?url=${encodeURIComponent(media.cover_image!)}&w=500&output=webp${referer}`
            } else {
              setImgFailed(true)
            }
          }}
        />
      )
    }
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 text-white gap-2">
        <Tv size={36} className="text-zinc-600" />
        <p className="text-xs font-medium text-center px-4 text-zinc-400 line-clamp-2">{displayTitle}</p>
      </div>
    )
  }

  return (
    <div
      className="group relative bg-zinc-950 rounded-3xl overflow-hidden h-full flex flex-col"
      onClick={() => { if (typeof window !== 'undefined' && window.innerWidth < 768) onMobileTap?.() }}
    >
      {/* Cover */}
      <div className="relative h-56 bg-zinc-900 flex-shrink-0 overflow-hidden">
        {/* Delete — hidden on mobile (in modal instead) */}
        {isOwner && isConfirmingDelete && (
          <div className="hidden md:flex absolute top-3 right-3 z-30 gap-1.5">
            <button onClick={e => { e.stopPropagation(); onDeleteCancel?.() }} className="px-3 py-1.5 text-xs font-medium bg-zinc-900/95 border border-zinc-600 rounded-full hover:bg-zinc-800 transition">{m.cancel}</button>
            <button onClick={e => { e.stopPropagation(); onDelete?.(media.id) }} className="px-3 py-1.5 text-xs font-medium bg-red-900/95 border border-red-700 text-red-300 rounded-full hover:bg-red-800 transition">{m.delete}</button>
          </div>
        )}
        {isOwner && !isConfirmingDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDeleteRequest?.(media.id) }}
            aria-label={`Elimina ${media.title}`}
            className="hidden md:flex absolute top-3 right-3 z-30 opacity-0 group-hover:opacity-100 bg-black/70 hover:bg-red-950/90 border border-white/20 hover:border-red-500/80 p-1.5 rounded-xl transition-all duration-200"
          >
            <X className="w-4 h-4 text-white hover:text-red-300 transition-colors" />
          </button>
        )}
        {/* Notes icon — owner: always visible on desktop (dimmed if empty, full if has notes)
                       visitor: only when notes exist */}
        {(isOwner || hasNotes) && (
          <button
            onClick={e => { e.stopPropagation(); isOwner ? onNotes?.(media) : onViewNotes?.(media) }}
            aria-label="Note"
            className={`absolute bottom-3 right-3 z-20 p-1.5 rounded-lg border text-white transition-all duration-200 hidden md:flex
              ${hasNotes
                ? 'border-transparent opacity-100'
                : 'opacity-0 group-hover:opacity-100 bg-black/70 hover:bg-black/90 border-white/20'
              }`}
            style={hasNotes ? { background: 'var(--accent)', color: '#0B0B0F' } : {}}
          >
            <Edit3 size={11} />
          </button>
        )}
        <div className="absolute bottom-0 inset-x-0 h-14 bg-gradient-to-t from-black/70 to-transparent z-10 pointer-events-none" />
        <div className="absolute bottom-3 left-3 z-20">
          <MediaTypeBadge type={media.type} size="xs" />
        </div>
        {renderCover()}
      </div>

      {/* ── Mobile: static read-only info (tap card to open modal) ─────────── */}
      <div className="md:hidden flex flex-col flex-1 px-3 pt-2.5 pb-3 gap-1.5">
        <h4 className="font-semibold line-clamp-2 text-[13px] leading-snug text-white">{displayTitle}</h4>
        <StarRating value={rating} viewOnly size={13} />
        {/* Static progress */}
        <div className="flex-1 min-h-0" />
        <div className="text-[11px] text-zinc-400 space-y-1.5">
          {media.type === 'game' && (() => {
            const ach = media.achievement_data
            const hours = media.current_episode || 0
            return (
              <div className="space-y-1.5">
                {hours > 0 && (
                  <span className="inline-flex items-center gap-1 bg-zinc-800/60 px-2 py-0.5 rounded-full">
                    <Clock size={10} className="text-zinc-500" />{m.hoursPlayed(hours)}
                  </span>
                )}
                {ach && ach.tot > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span>Achievement</span>
                      <span className="font-mono text-zinc-400">{ach.curr}/{ach.tot}</span>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-[#107c10] rounded-full" style={{ width: `${Math.round((ach.curr / ach.tot) * 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
          {media.type === 'manga' && (() => {
            const maxCh = media.episodes && media.episodes > 1 ? media.episodes : undefined
            const current = media.current_episode || 0
            return isCompleted || (maxCh && current >= maxCh) ? null : (
              <div className="space-y-1.5">
                <span className="text-zinc-500">
                  Cap. <span className="text-emerald-400 font-semibold font-mono">{current}</span>
                  {maxCh ? <span className="text-zinc-600"> / {maxCh}</span> : null}
                </span>
                {maxCh && (
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, Math.round((current / maxCh) * 100))}%` }} />
                  </div>
                )}
              </div>
            )
          })()}
          {(media.type === 'tv' || media.type === 'anime') && (
            isCompleted ? null : hasEpisodeData ? (
              <div className="space-y-1.5">
                <span className="text-zinc-500">
                  {hasSeasonData && <span className="text-zinc-500">{m.season(currentSeasonNum)} · </span>}
                  Ep. <span className="text-emerald-400 font-semibold font-mono">{media.current_episode}</span>
                  <span className="text-zinc-600"> / {maxEpisodesThisSeason}</span>
                </span>
                {maxEpisodesThisSeason > 0 && (
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${totalProgress}%` }} />
                  </div>
                )}
              </div>
            ) : null
          )}
        </div>
      </div>

      {/* ── Desktop: full interactive info ────────────────────────────────── */}
      <div className="hidden md:flex flex-col flex-1 px-3 pt-2.5 pb-3 gap-1.5">
        <h4 className="font-semibold line-clamp-2 text-[13px] leading-snug text-white">{displayTitle}</h4>

        {/* Stars */}
        <div onPointerDown={isOwner ? e => e.stopPropagation() : undefined}>
          <StarRating
            value={rating}
            onChange={isOwner ? (r) => onRating?.(media.id, r) : undefined}
            size={14}
            viewOnly={!isOwner}
          />
        </div>

        {/* Status row */}
        <div className="flex items-center gap-1.5">
          {(media.type === 'tv' || media.type === 'anime') && (
            isOwner ? (
              <select
                value={media.status || 'watching'}
                onChange={e => onStatusChange?.(media.id, e.target.value)}
                onClick={e => e.stopPropagation()}
                onPointerDown={e => e.stopPropagation()}
                className="flex-1 min-w-0 text-[10px] font-semibold px-2 py-1 rounded-full border bg-zinc-900 border-zinc-800 text-zinc-400 focus:outline-none focus:border-zinc-600 transition cursor-pointer appearance-none"
              >
                <option value="watching">In corso</option>
                <option value="completed">Completato</option>
                <option value="paused">In pausa</option>
                <option value="dropped">Abbandonato</option>
              </select>
            ) : (
              (() => {
                const badge = statusBadge[media.status || 'watching']
                return badge ? (
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${badge.cls}`} style={badge.style}>{badge.label}</span>
                ) : null
              })()
            )
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1 min-h-0" />

        {/* Progress area */}
        <div>
          {media.type === 'game' ? (() => {
            const ach = media.achievement_data
            const hours = media.current_episode || 0
            return (
              <div className="space-y-1.5">
                {hours > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded-full">
                    <Clock size={10} className="text-zinc-500 flex-shrink-0" />
                    {m.hoursPlayed(hours)}
                  </span>
                )}
                {ach && ach.tot > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span>Achievement</span>
                      <span className="font-mono text-zinc-400">{ach.curr}/{ach.tot}</span>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-[#107c10] rounded-full transition-all duration-300" style={{ width: `${Math.round((ach.curr / ach.tot) * 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>
            )
          })() : media.type === 'manga' ? (() => {
            const maxCh = media.episodes && media.episodes > 1 ? media.episodes : undefined
            const current = media.current_episode || 0
            const isChCompleted = !!maxCh && current >= maxCh
            return (
              <div className="space-y-1.5" onPointerDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
                {isChCompleted ? (
                  isOwner ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-emerald-400">
                        <CheckCircle size={12} />
                        <span className="text-[11px] font-semibold">Completato</span>
                      </div>
                      <button onClick={() => onReset?.(media.id)} onPointerDown={e => e.stopPropagation()} className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors" title="Ricomincia">
                        <RotateCcw size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle size={12} />
                      <span className="text-[11px] font-semibold">Completato</span>
                    </div>
                  )
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-1">
                      {isOwner && (
                        <button onClick={() => onSaveProgress?.(media.id, Math.max(0, current - 1))} onPointerDown={e => e.stopPropagation()} disabled={current <= 0} className="w-6 h-6 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 text-sm font-bold disabled:opacity-30">−</button>
                      )}
                      <div className="flex-1 text-[11px] font-semibold flex items-center justify-center gap-0.5">
                        <span className="text-zinc-500 text-[10px] mr-0.5">Cap.</span>
                        {isOwner ? (
                          <>
                            <InlineChapterInput value={current} max={maxCh} onSave={n => onSaveProgress?.(media.id, n)} />
                            {maxCh && <span className="text-zinc-600">/{maxCh}</span>}
                          </>
                        ) : (
                          <>
                            <span className="text-emerald-400">{current}</span>
                            {maxCh && <span className="text-zinc-600">/{maxCh}</span>}
                          </>
                        )}
                      </div>
                      {isOwner && (
                        <button
                          onClick={() => { const next = current + 1; (maxCh && next > maxCh) ? onMarkComplete?.(media.id, media) : onSaveProgress?.(media.id, next) }}
                          onPointerDown={e => e.stopPropagation()}
                          className="w-6 h-6 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 text-sm font-bold"
                        >+</button>
                      )}
                    </div>
                    {maxCh && (
                      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-300 rounded-full" style={{ width: `${Math.min(100, Math.round((current / maxCh) * 100))}%` }} />
                      </div>
                    )}
                    {isOwner && !maxCh && (
                      <button onClick={() => onEnrichEpisodes?.(media.id)} onPointerDown={e => e.stopPropagation()} disabled={enriching} className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-[var(--accent)] transition-colors disabled:opacity-50">
                        {enriching ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                        {enriching ? 'Recupero…' : 'Recupera totale'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })() : hasEpisodeData ? (
            isCompleted ? (
              isOwner ? (
                <div className="flex items-center justify-end">
                  <button onClick={() => onReset?.(media.id)} onPointerDown={e => e.stopPropagation()} className="p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors" title="Ripristina progresso">
                    <RotateCcw size={15} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle size={13} />
                  <span className="text-[11px] font-semibold">Completato</span>
                </div>
              )
            ) : (
              <div className="space-y-1.5">
                {hasSeasonData && (
                  <div className="flex items-center justify-between gap-1">
                    {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.max(1, currentSeasonNum - 1), 'current_season')} onPointerDown={e => e.stopPropagation()} disabled={currentSeasonNum <= 1} className="w-6 h-6 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 text-sm font-bold disabled:opacity-30">−</button>}
                    <div className="flex-1 text-emerald-400 text-[11px] font-semibold flex items-center justify-center">{m.season(currentSeasonNum)}</div>
                    {isOwner && <button onClick={() => { if (currentSeasonNum + 1 <= maxSeasons) onSaveProgress?.(media.id, currentSeasonNum + 1, 'current_season') }} onPointerDown={e => e.stopPropagation()} disabled={currentSeasonNum >= maxSeasons} className="w-6 h-6 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 text-sm font-bold disabled:opacity-30">+</button>}
                  </div>
                )}
                <div className="flex items-center justify-between gap-1">
                  {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.max(1, media.current_episode - 1))} onPointerDown={e => e.stopPropagation()} disabled={media.current_episode <= 1} className="w-6 h-6 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 text-sm font-bold disabled:opacity-30">−</button>}
                  <div className="flex-1 text-[11px] font-semibold flex items-center justify-center gap-0.5">
                    <span className="text-emerald-400">{m.ep(media.current_episode)}</span>
                    <span className="text-zinc-600">/{maxEpisodesThisSeason}</span>
                  </div>
                  {isOwner && <button onClick={() => { const next = media.current_episode + 1; next <= maxEpisodesThisSeason ? onSaveProgress?.(media.id, next) : onMarkComplete?.(media.id, media) }} onPointerDown={e => e.stopPropagation()} className="w-6 h-6 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 text-sm font-bold">+</button>}
                </div>
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all duration-300 rounded-full" style={{ width: `${totalProgress}%` }} />
                </div>
              </div>
            )
          ) : (media.type === 'tv' || media.type === 'anime') && isOwner ? (
            <button
              onClick={() => onEnrichEpisodes?.(media.id)}
              onPointerDown={e => e.stopPropagation()}
              disabled={enriching}
              className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-[var(--accent)] transition-colors disabled:opacity-50"
            >
              {enriching ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
              {enriching ? 'Recupero…' : 'Recupera episodi'}
            </button>
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
    } catch { }
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
  search, onSearch, sort, onSort, statusFilter, onStatusFilter,
}: {
  search: string; onSearch: (v: string) => void
  sort: SortMode; onSort: (v: SortMode) => void
  statusFilter: string; onStatusFilter: (v: string) => void
}) {
  return (
    <div className="mb-6 rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <div className="mb-3 flex items-center gap-2">
        <SlidersHorizontal size={14} className="text-[var(--accent)]" />
        <p className="gk-label">Collection controls</p>
      </div>

      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <SearchIcon size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Cerca nella collezione…"
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] py-2.5 pl-9 pr-8 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
          />
          {search && (
            <button onClick={() => onSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <X size={13} />
            </button>
          )}
        </div>

        <select
          value={statusFilter}
          onChange={e => onStatusFilter(e.target.value)}
          className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5 text-xs font-bold text-[var(--text-secondary)] outline-none transition-colors focus:border-[rgba(230,255,61,0.45)] md:w-40"
        >
          <option value="all">Tutti</option>
          <option value="watching">In corso</option>
          <option value="completed">Completati</option>
          <option value="paused">In pausa</option>
          <option value="dropped">Abbandonati</option>
        </select>

        <select
          value={sort}
          onChange={e => onSort(e.target.value as SortMode)}
          className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5 text-xs font-bold text-[var(--text-secondary)] outline-none transition-colors focus:border-[rgba(230,255,61,0.45)] md:w-40"
        >
          <option value="default">Default</option>
          <option value="rating_desc">Voto ↓</option>
          <option value="title_asc">A → Z</option>
          <option value="title_desc">Z → A</option>
          <option value="progress_desc">Progresso ↓</option>
          <option value="date_desc">Recenti</option>
        </select>
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
  const { t, locale } = useLocale()
  const hasEpisodes = !!(media.episodes && media.episodes > 1)
  const maxEp = media.episodes || 0
  const [rowImgFailed, setRowImgFailed] = useState(false)
  const displayTitle = locale === 'en' && media.title_en ? media.title_en : media.title

  return (
    <div className="group flex items-center gap-3 rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)]">
      {/* Cover mini */}
      <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
        {media.is_steam ? (
          <SteamCoverImg appid={media.appid} title={displayTitle} />
        ) : media.cover_image && !rowImgFailed ? (
          <img
            src={optimizeCover(media.cover_image, 'profile-grid')}
            alt={displayTitle}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const img = e.target as HTMLImageElement
              if (!img.src.includes('wsrv.nl')) {
                const referer = media.cover_image!.includes('myanimelist.net')
                  ? '&referer=https://myanimelist.net'
                  : media.cover_image!.includes('anilist.co')
                    ? '&referer=https://anilist.co'
                    : ''
                img.src = `https://wsrv.nl/?url=${encodeURIComponent(media.cover_image!)}&w=220&output=webp${referer}`
              } else {
                setRowImgFailed(true)
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700"><Tv size={20} /></div>
        )}
      </div>

      {/* Title + type */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-bold text-[var(--text-primary)]">{displayTitle}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <MediaTypeBadge type={media.type} size="xs" />
          {isOwner && (
            <select value={media.status || 'watching'} onChange={e => onStatusChange?.(media.id, e.target.value)} className="bg-transparent text-[10px] text-[var(--text-muted)] outline-none cursor-pointer">
              <option value="watching">In corso</option>
              <option value="completed">Completato</option>
              <option value="paused">Pausa</option>
              <option value="dropped">Abbandonato</option>
            </select>
          )}
        </div>
      </div>

      {/* Progress / hours */}
      <div className="text-right flex-shrink-0">
        {media.type === 'game' ? (() => {
          const ach = media.achievement_data
          const hours = media.current_episode || 0
          return (
            <div className="flex flex-col items-end gap-1">
              {hours > 0 && <p className="text-xs text-emerald-400">{hours}h</p>}
              {ach && ach.tot > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-500 font-mono">{ach.curr}/{ach.tot}</span>
                  <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className="h-full bg-[#107c10] rounded-full" style={{ width: `${Math.round((ach.curr / ach.tot) * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
          )
        })() : hasEpisodes ? (
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

export default function ProfilePage({ usernameOverride }: { usernameOverride?: string } = {}) {
  const params = useParams<{ username: string }>()
  const pathname = usePathname()
  const username = usernameOverride || params.username
  const supabase = createClient()
  const { t, locale } = useLocale()
  const sensors = useDndSensors()
  const { csrfFetch } = useCsrf()

  const cp = (() => {
    const entry = profileCache[username]
    if (!entry) return null
    // Invalida la cache se più vecchia di 5 minuti
    if (Date.now() - entry.ts > PROFILE_CACHE_TTL) {
      delete profileCache[username]
      return null
    }
    return entry
  })()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(cp?.profile ?? null)
  const [steamAccount, setSteamAccount] = useState<any>(cp?.steamAccount ?? null)
  const [mediaList, setMediaList] = useState<UserMedia[]>(cp?.mediaList ?? [])
  const [loading, setLoading] = useState(!cp)
  const [importingGames, setImportingGames] = useState(false)
  const [reorderingGames, setReorderingGames] = useState(false)
  const [steamMessage, setSteamMessage] = useState<{ text: string; type: 'error' | 'success' } | null>(null)
  const [steamProgressMsg, setSteamProgressMsg] = useState<string | null>(null)
  const [followersCount, setFollowersCount] = useState(cp?.followersCount ?? 0)
  const [followingCount, setFollowingCount] = useState(cp?.followingCount ?? 0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedMedia, setSelectedMedia] = useState<UserMedia | null>(null)
  const [notesInput, setNotesInput] = useState('')
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false)
  const [openMobileId, setOpenMobileId] = useState<string | null>(null)
  const [viewingNotes, setViewingNotes] = useState<UserMedia | null>(null)
  const [isDraggingAny, setIsDraggingAny] = useState(false)

  const router = useRouter()

  // Pull-to-refresh su mobile — ricarica tutto il profilo
  const fetchProfileData = useCallback(async () => {
    const silent = !!profileCache[username]
    if (!silent) setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUserId(user?.id || null)

    // 'me' arrives when swiping to the profile tab before the /profile/me
    // server redirect resolves. Query by user ID so auth + isOwner work correctly.
    const profileQuery = username === 'me'
      ? supabase.from('profiles').select('id, username, display_name, avatar_url, bio, badge').eq('id', user?.id ?? '').single()
      : supabase.from('profiles').select('id, username, display_name, avatar_url, bio, badge').ilike('username', username).single()

    const { data: profileData, error: profileError } = await profileQuery

    if (profileError || !profileData) { setLoading(false); return }
    setProfile(profileData)

    const ownerCheck = !!user && user.id === profileData.id
    setIsOwner(ownerCheck)

    const [steamResult, mediaResult, fwersResult, fwingResult, followResult] = await Promise.all([
      ownerCheck ? supabase.from('steam_accounts').select('steam_id64, steam_username, avatar_url, created_at, games, last_synced').eq('user_id', user!.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      supabase.from('user_media_entries').select('id, title, title_en, type, cover_image, current_episode, current_season, season_episodes, episodes, display_order, updated_at, is_steam, import_source, appid, rating, status, genres, external_id').eq('user_id', profileData.id).order('display_order', { ascending: false, nullsFirst: false }).limit(10000),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', profileData.id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', profileData.id),
      (user && !ownerCheck) ? supabase.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', profileData.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ])

    const sortedMedia = sortMediaList(mediaResult.data || [])
    if (ownerCheck) setSteamAccount(steamResult.data)
    if (mediaResult.data) setMediaList(sortedMedia)
    setFollowersCount(fwersResult.count || 0)
    setFollowingCount(fwingResult.count || 0)
    if (user && !ownerCheck) setIsFollowing(!!followResult.data)

    const entry = {
      profile: profileData, mediaList: sortedMedia,
      steamAccount: ownerCheck ? steamResult.data : null,
      followersCount: fwersResult.count || 0, followingCount: fwingResult.count || 0,
      ts: Date.now(),
    }
    profileCache[username] = entry
    // Also pre-warm the cache under the real username so the re-render after
    // the /profile/me → /profile/realUsername redirect is instant (no spinner).
    if (username === 'me') profileCache[profileData.username] = entry
    setLoading(false)
  }, [username])

  const handleProfileRefresh = useCallback(async () => {
    await fetchProfileData()
  }, [fetchProfileData])

  const { distance: pullDistance, refreshing: isPullRefreshing } = usePullToRefresh({
    onRefresh: handleProfileRefresh,
    enabled: pathname.startsWith('/profile/'),
  })
  // New state
  const [activeTab, setActiveTab] = useState<ProfileTab>('collection')
  const [collectionSearch, setCollectionSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [importPlatform, setImportPlatform] = useState<string | null>(null)
  useEffect(() => {
    gestureState.drawerActive = importPlatform !== null
    return () => { gestureState.drawerActive = false }
  }, [importPlatform])

  // Close the modal when user navigates away from the profile tab (keep-alive).
  useEffect(() => {
    if (!pathname.startsWith('/profile/')) {
      setOpenMobileId(null)
    }
  }, [pathname])

  const [statusFilter, setStatusFilter] = useState('all')
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const sortMediaList = (list: UserMedia[]) =>
    [...list].sort((a, b) => {
      // Categorie diverse: giochi sempre prima
      if (a.type === 'game' && b.type !== 'game') return -1
      if (b.type === 'game' && a.type !== 'game') return 1
      // Stesso tipo: usa sempre display_order desc (impostato al momento
      // dell'import/aggiunta in base a ore/rating, poi aggiornato dal drag manuale)
      return (b.display_order || 0) - (a.display_order || 0)
    })

  const refreshMedia = async (userId: string) => {
    const { data, error } = await supabase.from('user_media_entries').select('id, title, title_en, type, cover_image, current_episode, current_season, season_episodes, episodes, display_order, updated_at, is_steam, import_source, appid, rating, status, genres, external_id').eq('user_id', userId).order('display_order', { ascending: false, nullsFirst: false }).limit(10000)
    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Profile] Errore refresh media:', error)
      }
      return
    }
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
          } catch { }
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
      const { data, error } = await supabase.from('user_media_entries').select('id, type, current_episode, display_order').eq('user_id', currentUserId).eq('type', 'game')
      if (error) { if (process.env.NODE_ENV === 'development') console.error('[Profile] Errore reorder games:', error); return }
      if (!data?.length) return
      const sorted = [...data].sort((a, b) => (b.current_episode || 0) - (a.current_episode || 0))
      const updates = sorted.map((g, i) => ({ id: g.id, display_order: Date.now() - i * 10000 }))
      await fetch('/api/collection/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: updates.map(u => ({ id: u.id, display_order: u.display_order })) }),
      })
      await refreshMedia(currentUserId)
    } finally { setReorderingGames(false) }
  }

  const handleDelete = async (id: string) => {
    if (!isOwner) return
    const res = await fetch('/api/collection', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.filter(item => item.id !== id))
    setDeletingId(null)
  }

  const markAsCompleted = async (id: string, media: UserMedia) => {
    if (!isOwner) return
    let update: any = { status: 'completed', completed_at: new Date().toISOString() }
    if (media.season_episodes) {
      const maxS = Math.max(...Object.keys(media.season_episodes).map(Number))
      update = {
        ...update,
        current_season: maxS,
        current_episode: media.season_episodes[maxS]?.episode_count || 1,
      }
    } else if (media.episodes && media.episodes > 1) {
      // Solo per media con episodi multipli (anime, serie)
      update = { ...update, current_episode: media.episodes }
    }
    // Film, game: solo status+completed_at, niente current_episode sentinella
    const res = await fetch('/api/collection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...update }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...update } : item))
    await logActivity({ type: 'media_completed', media_id: media.id, media_title: media.title, media_type: media.type, media_cover: media.cover_image })
  }

  const resetProgress = async (id: string) => {
    if (!isOwner) return
    const update = { current_season: 1, current_episode: 1, status: 'watching' }
    const res = await fetch('/api/collection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...update }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...update } : item))
  }

  const saveProgress = async (id: string, val: number, field: 'current_episode' | 'current_season' = 'current_episode') => {
    if (!isOwner) return
    const item = mediaList.find(m => m.id === id)
    const base = field === 'current_season' ? { current_season: val, current_episode: 1 } : { current_episode: val }
    const update: Record<string, unknown> = { ...base }
    // Auto-complete when reaching the last episode/chapter
    if (field === 'current_episode') {
      const isManga = item?.type === 'manga'
      const isTvAnime = item?.type === 'tv' || item?.type === 'anime'
      if (isManga && item?.episodes && val >= item.episodes) {
        update.status = 'completed'
        update.completed_at = new Date().toISOString()
      } else if (isManga && item?.status === 'completed') {
        update.status = 'watching'
      } else if (isTvAnime) {
        const maxEps = item?.season_episodes?.[item.current_season || 1]?.episode_count || item?.episodes
        if (maxEps && val >= maxEps) {
          update.status = 'completed'
          update.completed_at = new Date().toISOString()
        } else if (item?.status === 'completed') {
          update.status = 'watching'
        }
      }
    }
    const res = await fetch('/api/collection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...update }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.map(m => m.id === id ? { ...m, ...update } : m))
  }

  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set())

  const enrichEpisodeData = async (id: string) => {
    if (!isOwner || enrichingIds.has(id)) return
    setEnrichingIds(prev => new Set(prev).add(id))
    try {
      const res = await fetch('/api/media/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_media_id: id }),
      })
      if (res.ok) {
        const data = await res.json()
        setMediaList(prev => prev.map(m =>
          m.id === id
            ? { ...m, ...(data.episodes ? { episodes: data.episodes } : {}), ...(data.season_episodes ? { season_episodes: data.season_episodes } : {}) }
            : m
        ))
      }
    } catch { /* silent fail */ }
    setEnrichingIds(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const setRating = async (mediaId: string, rating: number) => {
    if (!isOwner) return
    const item = mediaList.find(m => m.id === mediaId)
    const res = await fetch('/api/collection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mediaId, rating }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => sortMediaList(prev.map(item => item.id === mediaId ? { ...item, rating } : item)))
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
    const notes = notesInput.trim()
    const res = await fetch('/api/collection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedMedia.id, notes }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.map(item => item.id === selectedMedia.id ? { ...item, notes } : item))
    setIsNotesModalOpen(false)
    setSelectedMedia(null)
  }

  const changeStatus = async (id: string, status: string) => {
    if (!isOwner) return
    const res = await fetch('/api/collection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, status } : item))
    if (status === 'completed') {
      const item = mediaList.find(m => m.id === id)
      if (item) await logActivity({ type: 'media_completed', media_id: item.id, media_title: item.title, media_type: item.type, media_cover: item.cover_image })
    }
  }


  useEffect(() => {
    fetchProfileData()
  }, [fetchProfileData])

  // Quando un titolo viene aggiunto da Discover / ForYou / Swipe,
  // il bridge segnala che il profilo va ricaricato silenziosamente.
  // La cache viene invalidata così fetchProfileData fa una vera fetch.
  useEffect(() => {
    if (!isOwner) return
    profileInvalidateBridge.register(() => {
      delete profileCache[username]
      fetchProfileData()
    })
    return () => profileInvalidateBridge.unregister()
  }, [isOwner, username, fetchProfileData])

  useEffect(() => {
    if (!steamMessage) return
    const timer = setTimeout(() => setSteamMessage(null), 5000)
    return () => clearTimeout(timer)
  }, [steamMessage])

  // ── Taste DNA — top generi estratti dalla media list ──────────────────────
  // IMPORTANTE: useMemo deve stare PRIMA dei return condizionali (regola degli hooks)
  const topGenres = useMemo(() => {
    const freq: Record<string, number> = {}
    mediaList.forEach(m => {
      const gs: string[] = Array.isArray(m.genres) ? m.genres : []
      gs.forEach(g => { if (g) freq[g] = (freq[g] || 0) + 1 })
    })
    return Object.entries(freq)
      .sort(([, a], [, b]) => b - a)
      .map(([g]) => g)
  }, [mediaList])

  if (loading) return <Spinner />
  if (!profile) return <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center text-white">{t.profile.notFound}</div>

  const cats = t.profile.categories

  // Apply filters + sort

  const filteredList = mediaList.filter(m => {
    const searchLower = collectionSearch.toLowerCase().trim()
    const matchSearch = !collectionSearch.trim() ||
      m.title.toLowerCase().includes(searchLower) ||
      (m.title_en && m.title_en.toLowerCase().includes(searchLower))
    const matchStatus = statusFilter === 'all' || m.status === statusFilter
    return matchSearch && matchStatus
  })

  const sortedList = [...filteredList].sort((a, b) => {
    switch (sortMode) {
      case 'rating_desc': return (b.rating || 0) - (a.rating || 0)
      case 'title_asc': {
        const aT = locale === 'en' && a.title_en ? a.title_en : a.title
        const bT = locale === 'en' && b.title_en ? b.title_en : b.title
        return aT.localeCompare(bT)
      }
      case 'title_desc': {
        const aT = locale === 'en' && a.title_en ? a.title_en : a.title
        const bT = locale === 'en' && b.title_en ? b.title_en : b.title
        return bT.localeCompare(aT)
      }
      case 'progress_desc': return (b.current_episode || 0) - (a.current_episode || 0)
      case 'date_desc': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      default: return (b.display_order || 0) - (a.display_order || 0)
    }
  })

  const onDragEnd = (event: DragEndEvent) => {
    setIsDraggingAny(false)
    if (!isOwner) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sortedList.findIndex(item => item.id === active.id)
    const newIndex = sortedList.findIndex(item => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(sortedList, oldIndex, newIndex)
    const timestamp = Date.now()
    const updatedSorted = reordered.map((item, i) => ({
      ...item,
      display_order: timestamp - i * 10000,
    }))
    const updatedMap = new Map(updatedSorted.map(item => [item.id, item]))
    setMediaList(prev => prev.map(item => updatedMap.get(item.id) ?? item))
    // Fire and forget — non blocca il render
    fetch('/api/collection/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: updatedSorted.map(item => ({ id: item.id, display_order: item.display_order })) }),
    }).catch(() => { })
  }

  const grouped = sortedList.reduce((acc: Record<string, UserMedia[]>, item) => {
    let cat: string
    if (item.type === 'game') cat = cats.games
    else if (item.type === 'manga') cat = cats.manga
    else if (item.type === 'anime') cat = cats.anime
    else if (item.type === 'tv') cat = cats.tv
    else if (item.type === 'movie') cat = cats.movies
    else if (item.type === 'board_game' || item.type === 'boardgame') cat = cats.boardgames
    else cat = cats.other
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const categoryOrder = [cats.games, cats.boardgames, cats.anime, cats.tv, cats.manga, cats.movies, cats.other]
  const categoryToType: Record<string, string> = {
    [cats.games]: 'game',
    [cats.boardgames]: 'boardgame',
    [cats.anime]: 'anime',
    [cats.tv]: 'tv',
    [cats.manga]: 'manga',
    [cats.movies]: 'movie',
  }
  const orderedCategories = categoryOrder.filter(cat => grouped[cat]?.length > 0)

  const TABS: { id: ProfileTab; label: string; count?: number }[] = [
    { id: 'collection', label: 'Collezione', count: mediaList.length },
    { id: 'activity', label: 'Attività' },
    { id: 'comments', label: 'Bacheca' },
  ]

  const ratedMedia = mediaList.filter(item => item.rating && item.rating > 0)
  const avgProfileRating = ratedMedia.length > 0
    ? (ratedMedia.reduce((sum, item) => sum + (item.rating || 0), 0) / ratedMedia.length).toFixed(1)
    : '—'
  const completedCount = mediaList.filter(item => item.status === 'completed').length
  const inProgressCount = mediaList.filter(item => item.status === 'watching' || item.status === 'reading' || item.status === 'playing').length
  const profileTopGenre = topGenres[0] || 'in costruzione'
  const profileDisplayName = profile.display_name || profile.username

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] pb-24 md:pb-20">
      <PullToRefreshIndicator distance={pullDistance} refreshing={isPullRefreshing} />
      <div className="pt-4 md:pt-8 max-w-screen-2xl mx-auto px-4 md:px-6">

        {/* ── Profile hero — media identity hub ── */}
        <section className="mb-6 overflow-hidden rounded-[34px] border border-[rgba(230,255,61,0.18)] bg-[linear-gradient(135deg,rgba(230,255,61,0.09),rgba(139,92,246,0.07),rgba(20,20,27,0.94))] p-4 shadow-[0_22px_70px_rgba(0,0,0,0.28)] md:mb-8 md:p-6">
          <div className="mb-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="flex min-w-0 flex-col items-center gap-4 text-center md:flex-row md:text-left">
              <div className="relative flex-shrink-0">
                <div className="h-24 w-24 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.22)] bg-[var(--bg-card)] p-1 shadow-[0_0_44px_rgba(230,255,61,0.10)] md:h-32 md:w-32">
                  <Avatar
                    src={profile.avatar_url}
                    username={profile.username}
                    displayName={profile.display_name}
                    size={128}
                    className="h-full w-full rounded-[26px]"
                  />
                </div>
                <div className="absolute -bottom-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-[rgba(230,255,61,0.35)] bg-black/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[var(--accent)] backdrop-blur">
                  <Sparkles size={10} />
                  Profile
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.35)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
                  <Sparkles size={12} />
                  Media identity
                </div>
                <h1 className="mb-1 text-2xl font-black tracking-[-0.03em] text-[var(--text-primary)] md:text-4xl">
                  <UserBadge badge={profile.badge} displayName={profileDisplayName} className="text-2xl font-black md:text-4xl" />
                </h1>
                <p className="gk-mono mb-3 text-[var(--text-muted)]">@{profile.username}</p>
                {profile.bio ? (
                  <p className="mx-auto max-w-xl text-sm leading-relaxed text-[var(--text-secondary)] md:mx-0">
                    {profile.bio}
                  </p>
                ) : (
                  <p className="mx-auto max-w-xl text-sm leading-relaxed text-[var(--text-muted)] md:mx-0">
                    {isOwner ? 'Aggiungi una bio per raccontare il tuo universo media.' : 'Questo profilo sta ancora costruendo la propria identità.'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-end">
              {isOwner ? (
                <>
                  <Link href="/settings/profile">
                    <button
                      data-testid="btn-edit-profile"
                      className="inline-flex h-10 items-center gap-2 rounded-2xl border border-[rgba(230,255,61,0.28)] bg-[rgba(230,255,61,0.10)] px-4 text-sm font-black text-[var(--accent)] transition-all hover:border-[rgba(230,255,61,0.45)] hover:bg-[rgba(230,255,61,0.14)]"
                    >
                      <Settings size={15} />
                      {t.profile.editProfile}
                    </button>
                  </Link>
                  <CopyProfileLink username={profile.username} />
                </>
              ) : (
                <>
                  {currentUserId && profile && (
                    <FollowButton
                      targetId={profile.id}
                      currentUserId={currentUserId}
                      isFollowingInitial={isFollowing}
                      onFollowChange={(nowFollowing) => setFollowersCount(prev => nowFollowing ? prev + 1 : Math.max(0, prev - 1))}
                    />
                  )}
                  <TasteSimilarityBadge targetUserId={profile.id} />
                  <CopyProfileLink username={profile.username} />
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-4 md:grid-cols-6">
            <div className="rounded-2xl bg-black/20 p-3 ring-1 ring-white/5">
              <p className="font-mono-data text-[20px] font-black leading-none text-[var(--accent)]">{mediaList.length}</p>
              <p className="gk-label mt-1">media</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-3 ring-1 ring-white/5">
              <p className="font-mono-data text-[20px] font-black leading-none text-[var(--text-primary)]">{followersCount}</p>
              <p className="gk-label mt-1">{t.profile.follower}</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-3 ring-1 ring-white/5">
              <p className="font-mono-data text-[20px] font-black leading-none text-[var(--text-primary)]">{followingCount}</p>
              <p className="gk-label mt-1">{t.profile.following}</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-3 ring-1 ring-white/5">
              <p className="font-mono-data text-[20px] font-black leading-none text-[var(--text-primary)]">{completedCount}</p>
              <p className="gk-label mt-1">completati</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-3 ring-1 ring-white/5">
              <p className="font-mono-data text-[20px] font-black leading-none text-[var(--text-primary)]">{avgProfileRating}</p>
              <p className="gk-label mt-1">rating</p>
            </div>
            <div className="rounded-2xl bg-black/20 p-3 ring-1 ring-white/5">
              <p className="line-clamp-1 font-mono-data text-[16px] font-black leading-none text-[var(--text-primary)]">{profileTopGenre}</p>
              <p className="gk-label mt-1">top genre</p>
            </div>
          </div>

          {topGenres.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-white/5 pt-4 md:justify-start">
              {topGenres.slice(0, 8).map((genre, i) => (
                <span
                  key={genre}
                  className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-bold"
                  style={{ background: 'rgba(230,255,61,0.06)', borderColor: 'rgba(230,255,61,0.2)', color: 'rgba(230,255,61,0.85)' }}
                >
                  {genre}
                  {i === 0 && <span className="font-mono-data text-[10px] opacity-60">#1</span>}
                </span>
              ))}
              {topGenres.length > 8 && (
                <span className="rounded-full border border-[var(--border)] bg-black/20 px-3 py-1.5 text-[11px] font-bold text-[var(--text-muted)]">
                  +{topGenres.length - 8}
                </span>
              )}
            </div>
          )}

          {isOwner && (
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-white/5 pt-4 md:justify-start">
              {([
                { key: 'steam', label: steamAccount ? 'Steam connesso' : 'Steam', icon: <SteamIcon size={18} /> },
                { key: 'anilist', label: 'AniList', icon: <Tv size={15} /> },
                { key: 'mal', label: 'MAL', icon: <Tv size={15} /> },
                { key: 'letterboxd', label: 'Letterboxd', icon: <Film size={15} /> },
                { key: 'xbox', label: 'Xbox', icon: <Gamepad2 size={15} /> },
                { key: 'bgg', label: 'BGG', icon: <List size={15} /> },
              ] as const).map(item => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setImportPlatform(item.key)}
                  className="inline-flex h-9 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-secondary)] transition-all hover:border-[rgba(230,255,61,0.32)] hover:text-[var(--text-primary)]"
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </section>



        {/* Quick links — owner tools */}
        {isOwner && (
          <div className="flex items-center gap-2 mb-5 -mx-4 px-4 overflow-x-auto scrollbar-hide md:mx-0 md:px-0">
            {([
              { href: '/wishlist', icon: <Bookmark size={14} style={{ color: 'var(--accent)' }} />, label: 'Wishlist' },
              { href: '/lists', icon: <List size={14} className="text-cyan-400" />, label: 'Liste' },
              { href: '/stats', icon: <BarChart2 size={14} className="text-zinc-400" />, label: 'Statistiche' },
              { href: '/trending', icon: <TrendingUp size={14} className="text-orange-400" />, label: 'Trending' },
              { href: '/community', icon: <Users size={14} style={{ color: 'var(--accent)' }} />, label: 'Community' },
            ] as const).map(item => (
              <Link key={item.href} href={item.href}
                className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)] transition-all hover:border-[rgba(230,255,61,0.28)] hover:text-[var(--text-primary)]">
                {item.icon}{item.label}
              </Link>
            ))}
          </div>
        )}

        {/* Stats */}
        {mediaList.length > 0 && <ProfileStatsPanel mediaList={mediaList} />}

        {/* ── TABS ─────────────────────────────────────────────────── */}
        <div className="mb-6 flex gap-2 overflow-x-auto rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] p-1.5 scrollbar-hide md:mb-8">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                data-testid={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-black transition-all"
                style={isActive
                  ? { background: 'var(--accent)', color: '#0B0B0F' }
                  : { color: 'var(--text-secondary)' }}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    className="font-mono-data rounded-full px-1.5 py-0.5 text-[10px] font-black"
                    style={isActive ? { background: 'rgba(11,11,15,0.14)', color: '#0B0B0F' } : { background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── TAB: COLLECTION ─────────────────────────────────────── */}
        {activeTab === 'collection' && (
          <>
            {mediaList.length === 0 ? (
              <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-16 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                  <Bookmark size={28} className="text-[var(--text-muted)]" />
                </div>
                <p className="gk-headline mb-1 text-[var(--text-primary)]">{isOwner ? 'La tua collezione è vuota' : 'Nessun media pubblico'}</p>
                <p className="gk-body mx-auto mb-5 max-w-sm">{isOwner ? t.profile.emptyOwner : t.profile.emptyOther}</p>
                {isOwner && (
                  <Link href="/discover" className="inline-flex h-10 items-center justify-center rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[#0B0B0F] transition-transform hover:scale-[1.02]">
                    Apri Discover
                  </Link>
                )}
              </div>
            ) : (
              <>
                {mediaList.length > 3 && (
                  <CollectionControls
                    search={collectionSearch} onSearch={setCollectionSearch}
                    sort={sortMode} onSort={setSortMode}
                    statusFilter={statusFilter} onStatusFilter={setStatusFilter}
                  />
                )}

                {sortedList.length === 0 ? (
                  <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-14 text-center">
                    <SearchIcon size={36} className="mx-auto mb-3 text-[var(--text-muted)]" />
                    <p className="gk-headline mb-1 text-[var(--text-primary)]">Nessun titolo trovato</p>
                    <p className="gk-body mx-auto mb-5 max-w-sm">Prova a modificare ricerca, filtro o ordinamento.</p>
                    <button
                      type="button"
                      onClick={() => { setCollectionSearch(''); setStatusFilter('all'); setSortMode('default') }}
                      className="inline-flex h-10 items-center justify-center rounded-2xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                    >
                      Cancella filtri
                    </button>
                  </div>
                ) : (
                  // Grid view — mostra 5 card per categoria + "Vedi tutti"
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => setIsDraggingAny(true)} onDragEnd={onDragEnd}>
                    {orderedCategories.map((category) => {
                      const items = grouped[category]
                      const preview = items.slice(0, 6)
                      const hasMore = items.length > 6
                      return (
                        <div key={category} className="mb-10 md:mb-14">
                          <div className="mb-4 flex items-center justify-between gap-4 md:mb-5">
                            <div className="min-w-0">
                              <p className="gk-label mb-1">Collection rail</p>
                              <h3 className="truncate text-lg font-black tracking-[-0.02em] text-[var(--text-primary)] md:text-2xl">{category}</h3>
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-3">
                              <p className="gk-mono text-[var(--text-muted)]">{t.profile.elements(items.length)}</p>
                              {hasMore && (
                                <Link
                                  href={`/profile/${profile.username}/${categoryToType[category] || category}`}
                                  className="flex items-center gap-1.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition-all hover:border-[rgba(230,255,61,0.28)] hover:text-[var(--accent)]"
                                >
                                  Vedi tutti <ChevronRight size={13} />
                                </Link>
                              )}
                            </div>
                          </div>
                          {isOwner ? (
                            <SortableContext items={preview.map(m => m.id)} strategy={rectSortingStrategy}>
                              <div className={`flex gap-3 md:gap-4 items-stretch overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide `}>
                                {preview.map((media) => (
                                  <div key={media.id} className="w-40 sm:w-48 md:w-52 flex-shrink-0">
                                    <SortableBox media={media} disabled={isMobile}>
                                      <MediaCard media={media} isOwner={true} deletingId={deletingId}
                                        onDelete={handleDelete} onDeleteRequest={setDeletingId} onDeleteCancel={() => setDeletingId(null)}
                                        onRating={setRating} onNotes={openNotesModal} onSaveProgress={saveProgress}
                                        onMarkComplete={markAsCompleted} onReset={resetProgress} onStatusChange={changeStatus}
                                        onEnrichEpisodes={enrichEpisodeData} enriching={enrichingIds.has(media.id)}
                                        onMobileTap={() => setOpenMobileId(media.id)} />
                                    </SortableBox>
                                  </div>
                                ))}
                                {hasMore && (
                                  <Link
                                    href={`/profile/${profile.username}/${categoryToType[category] || category}`}
                                    className="group flex min-h-[340px] w-12 flex-shrink-0 flex-col items-center justify-center gap-1.5 rounded-3xl border border-dashed border-[var(--border)] text-[var(--text-muted)] transition-all hover:border-[rgba(230,255,61,0.34)] hover:text-[var(--accent)] sm:min-h-[380px] md:min-h-[420px] md:w-14"
                                  >
                                    <ChevronRight size={16} />
                                    <span className="text-xs font-semibold">+{items.length - 6}</span>
                                  </Link>
                                )}
                              </div>
                            </SortableContext>
                          ) : (
                            <div className="flex gap-3 md:gap-4 items-stretch overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
                              {preview.map((media) => (
                                <div key={media.id} className="w-40 sm:w-48 md:w-52 flex-shrink-0 border border-zinc-800 rounded-3xl overflow-hidden min-h-[340px] sm:min-h-[380px] md:min-h-[420px] flex flex-col">
                                  <MediaCard media={media} isOwner={false} onStatusChange={changeStatus} onViewNotes={setViewingNotes} />
                                </div>
                              ))}
                              {hasMore && (
                                <Link
                                  href={`/profile/${profile.username}/${categoryToType[category] || category}`}
                                  className="group flex min-h-[340px] w-12 flex-shrink-0 flex-col items-center justify-center gap-1.5 rounded-3xl border border-dashed border-[var(--border)] text-[var(--text-muted)] transition-all hover:border-[rgba(230,255,61,0.34)] hover:text-[var(--accent)] sm:min-h-[380px] md:min-h-[420px] md:w-14"
                                >
                                  <ChevronRight size={16} />
                                  <span className="text-xs font-semibold">+{items.length - 6}</span>
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </DndContext>
                )}
              </>
            )}
          </>
        )}

        {/* ── TAB: ACTIVITY ───────────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] p-4 md:p-5">
            <div className="mb-5">
              <p className="gk-label mb-1">Activity log</p>
              <h3 className="text-xl font-black text-[var(--text-primary)]">Attività recente</h3>
              <p className="gk-body mt-1 max-w-xl">Aggiornamenti, progressi e segnali pubblici legati alla libreria.</p>
            </div>
            <ProfileActivityFeed userId={profile.id} />
          </div>
        )}

        {/* ── TAB: COMMENTS ───────────────────────────────────────── */}
        {activeTab === 'comments' && profile && (
          <ProfileComments profileId={profile.id} profileUsername={profile.username} isOwner={isOwner} />
        )}
      </div>

      {/* Mobile card modal (bottom sheet) */}
      {openMobileId && isOwner && (() => {
        const openMedia = mediaList.find(m => m.id === openMobileId)
        if (!openMedia) return null
        return (
          <MobileMediaModal
            media={openMedia as ModalMedia}
            isOwner={true}
            onClose={() => setOpenMobileId(null)}
            onRating={setRating}
            onStatusChange={changeStatus}
            onSaveProgress={saveProgress}
            onMarkComplete={(id, m) => markAsCompleted(id, m as UserMedia)}
            onReset={resetProgress}
            onEnrichEpisodes={enrichEpisodeData}
            enriching={enrichingIds.has(openMobileId)}
            onDelete={handleDelete}
            onNotes={(m) => openNotesModal(m as UserMedia)}
          />
        )
      })()}

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

      {/* Read-only notes modal — for visitors viewing another user's notes */}
      {viewingNotes && (
        <NotesModal
          title={viewingNotes.title}
          value={viewingNotes.notes || ''}
          onChange={() => { }}
          onSave={() => { }}
          onClose={() => setViewingNotes(null)}
          readOnly
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
              <div className="flex items-center gap-3">
                {importPlatform === 'steam' && (
                  <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0"><SteamIcon size={32} /></div>
                )}
                {importPlatform === 'anilist' && (
                  <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0">
                    <svg viewBox="0 0 512 512" width="32" height="32"><rect width="512" height="512" fill="#1e2630" /><path d="M321.92 323.27V136.6c0-10.698-5.887-16.602-16.558-16.602h-36.433c-10.672 0-16.561 5.904-16.561 16.602v88.651c0 2.497 23.996 14.089 24.623 16.541 18.282 71.61 3.972 128.92-13.359 131.6 28.337 1.405 31.455 15.064 10.348 5.731 3.229-38.209 15.828-38.134 52.049-1.406.31.317 7.427 15.282 7.87 15.282h85.545c10.672 0 16.558-5.9 16.558-16.6v-36.524c0-10.698-5.886-16.602-16.558-16.602z" fill="#02a9ff" /><path d="M170.68 120 74.999 393h74.338l16.192-47.222h80.96L262.315 393h73.968l-95.314-273zm11.776 165.28 23.183-75.629 25.393 75.629z" fill="#fefefe" /></svg>
                  </div>
                )}
                {importPlatform === 'mal' && (
                  <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0">
                    <svg viewBox="0 0 256 256" width="32" height="32"><rect width="256" height="256" fill="#2e51a2" /><path fill="#ffffff" d="m 30.638616,88.40918 v 68.70703 h 17.759766 v -41.91016 l 15.470703,19.77344 16.67825,-19.77344 v 41.91016 H 98.307101 V 88.40918 H 80.547335 L 63.869085,109.82324 48.398382,88.40918 Z" /><path fill="#ffffff" d="m 182.49799,88.40918 v 68.70703 h 39.07974 l 3.78365,-14.65739 H 200.25775 V 88.40918 Z" /><path fill="#ffffff" d="m 149.65186,88.40918 c -21.64279,0 -35.06651,10.210974 -39.36914,25.39258 -4.19953,14.81779 0.34128,34.3715 10.28711,53.78906 l 14.85742,-10.47461 c 0,0 -7.06411,-9.21728 -8.39453,-23.03516 h 21.98437 v 23.03516 h 19.73438 v -51.67969 h -19.73438 v 14.9668 H 130.8003 c 1.71696,-11.1972 8.295,-17.30859 15.46875,-17.30859 h 25.8164 l -5.12304,-14.68555 z" /></svg>
                  </div>
                )}
                {importPlatform === 'letterboxd' && (
                  <div className="w-8 h-8 rounded-xl overflow-hidden flex-shrink-0">
                    <svg viewBox="0 0 40 40" width="32" height="32"><rect width="40" height="40" fill="#1a1a1a" /><ellipse cx="11" cy="20" rx="9" ry="9" fill="#ff8000" /><ellipse cx="20" cy="20" rx="9" ry="9" fill="#00e054" /><ellipse cx="29" cy="20" rx="9" ry="9" fill="#40bcf4" /><ellipse cx="15.5" cy="20" rx="4.5" ry="9" fill="#ffffff" fillOpacity="0.9" /><ellipse cx="24.5" cy="20" rx="4.5" ry="9" fill="#ffffff" fillOpacity="0.9" /></svg>
                  </div>
                )}
                {importPlatform === 'xbox' && (
                  <div className="w-8 h-8 rounded-xl bg-black overflow-hidden flex items-center justify-center flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 88 88"><path fill="#107c10" d="M39.73 86.91c-6.628-.635-13.338-3.015-19.102-6.776-4.83-3.15-5.92-4.447-5.92-7.032 0-5.193 5.71-14.29 15.48-24.658 5.547-5.89 13.275-12.79 14.11-12.604 1.626.363 14.616 13.034 19.48 19 7.69 9.43 11.224 17.154 9.428 20.597-1.365 2.617-9.837 7.733-16.06 9.698-5.13 1.62-11.867 2.306-17.416 1.775zM8.184 67.703c-4.014-6.158-6.042-12.22-7.02-20.988-.324-2.895-.21-4.55.733-10.494 1.173-7.4 5.39-15.97 10.46-21.24 2.158-2.24 2.35-2.3 4.982-1.41 3.19 1.08 6.6 3.436 11.89 8.22l3.09 2.794-1.69 2.07c-7.828 9.61-16.09 23.24-19.2 31.67-1.69 4.58-2.37 9.18-1.64 11.095.49 1.294.04.812-1.61-1.714zm70.453 1.047c.397-1.936-.105-5.49-1.28-9.076-2.545-7.765-11.054-22.21-18.867-32.032l-2.46-3.092 2.662-2.443c3.474-3.19 5.886-5.1 8.49-6.723 2.053-1.28 4.988-2.413 6.25-2.413.777 0 3.516 2.85 5.726 5.95 3.424 4.8 5.942 10.63 7.218 16.69.825 3.92.894 12.3.133 16.21-.63 3.208-1.95 7.366-3.23 10.187-.97 2.113-3.36 6.218-4.41 7.554-.54.687-.54.686-.24-.796zM40.44 11.505C36.834 9.675 31.272 7.71 28.2 7.18c-1.076-.185-2.913-.29-4.08-.23-2.536.128-2.423-.004 1.643-1.925 3.38-1.597 6.2-2.536 10.03-3.34C40.098.78 48.193.77 52.43 1.663c4.575.965 9.964 2.97 13 4.84l.904.554-2.07-.104C60.148 6.745 54.15 8.408 47.71 11.54c-1.942.946-3.63 1.7-3.754 1.68-.123-.024-1.706-.795-3.52-1.715z" /></svg>
                  </div>
                )}
                <h2 className="text-base font-bold">
                  {importPlatform === 'anilist' && 'Importa da AniList'}
                  {importPlatform === 'mal' && 'Importa da MyAnimeList'}
                  {importPlatform === 'letterboxd' && 'Importa da Letterboxd'}
                  {importPlatform === 'xbox' && 'Importa da Xbox'}
                  {importPlatform === 'steam' && 'Importa da Steam'}
                  {importPlatform === 'bgg' && 'Importa da BoardGameGeek'}
                </h2>
              </div>
              <button onClick={() => setImportPlatform(null)} className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition">
                <XIcon size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {importPlatform === 'anilist' && <AniListImport />}
              {importPlatform === 'mal' && <MALImport />}
              {importPlatform === 'letterboxd' && <LetterboxdImport />}
              {importPlatform === 'xbox' && <XboxImport />}
              {importPlatform === 'steam' && <SteamImport onImportDone={async () => { if (currentUserId) { await new Promise(r => setTimeout(r, 800)); refreshMedia(currentUserId) } }} />}
              {importPlatform === 'bgg' && <BGGImport onImportDone={async () => { if (currentUserId) { await new Promise(r => setTimeout(r, 800)); refreshMedia(currentUserId) } }} />}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
