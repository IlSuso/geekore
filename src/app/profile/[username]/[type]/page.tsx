'use client'
// src/app/profile/[username]/[type]/page.tsx
// Pagina dedicata a un tipo di media specifico nel profilo utente.
// Es: /profile/ilsuso/movie → tutti i film di ilsuso
// Es: /profile/ilsuso/anime → tutti gli anime di ilsuso

import { useState, useEffect, useMemo, memo, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { StarRating } from '@/components/ui/StarRating'
import { SteamIcon } from '@/components/icons/SteamIcon'
import { Avatar } from '@/components/ui/Avatar'
import Link from 'next/link'
import {
  ArrowLeft, Search, Star,
  Clock, CheckCircle, X, Edit3, Loader2, Gamepad2, Tv, Bookmark, RefreshCw, RotateCcw, GripVertical,
} from 'lucide-react'
import { useLocale } from '@/lib/locale'
import { NotesModal } from '@/components/profile/NotesModal'
import { MobileMediaModal, type ModalMedia } from '@/components/profile/MobileMediaModal'
import {
  DndContext, closestCenter, DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, rectSortingStrategy,
} from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDndSensors } from '@/hooks/useDndSensors'

// ─── Tipi ────────────────────────────────────────────────────────────────────

type UserMedia = {
  id: string
  title: string
  type: string
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

type MediaTypeBadgeProps = {
  type: UserMedia['type']
  size?: 'xs' | 'sm'
}

function MediaTypeBadge({ type, size = 'xs' }: MediaTypeBadgeProps) {
  const { locale } = useLocale()
  const normalizedType = type === 'board_game' ? 'boardgame' : type
  const labels = locale === 'it'
    ? {
      movie: 'FILM',
      tv: 'SERIE TV',
      anime: 'ANIME',
      manga: 'MANGA',
      game: 'VIDEOGIOCO',
      boardgame: 'GIOCO DA TAVOLO',
    }
    : {
      movie: 'MOVIE',
      tv: 'TV SHOW',
      anime: 'ANIME',
      manga: 'MANGA',
      game: 'GAME',
      boardgame: 'BOARD GAME',
    }

  const tone = {
    movie: 'border-red-400/95 bg-red-500/90 text-white shadow-red-500/45',
    tv: 'border-violet-300/95 bg-violet-500/90 text-white shadow-violet-500/45',
    anime: 'border-sky-300/95 bg-sky-500/90 text-white shadow-sky-500/45',
    manga: 'border-pink-300/95 bg-pink-500/90 text-white shadow-pink-500/45',
    game: 'border-emerald-300/95 bg-emerald-500/90 text-white shadow-emerald-500/45',
    boardgame: 'border-orange-300/95 bg-orange-500/90 text-white shadow-orange-500/45',
  }[normalizedType as keyof typeof labels] || 'border-white/80 bg-zinc-700/95 text-white shadow-white/20'

  return (
    <span
      className={`inline-flex max-w-full shrink-0 items-center justify-center rounded-full border font-black uppercase tracking-[0.06em] text-center leading-[1.16]
        ${size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-2.5 py-[5px] text-[9px]'}
        ${tone}
        shadow-[0_8px_22px_var(--tw-shadow-color),0_0_0_1px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.32)]
        drop-shadow-[0_3px_7px_rgba(0,0,0,1)]`}
    >
      {labels[normalizedType as keyof typeof labels] || String(type).toUpperCase()}
    </span>
  )
}

function ProfileLibrarySwipeStars({
  value,
  readOnly,
  onChange,
}: {
  value: number
  readOnly: boolean
  onChange: (value: number) => void
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [localValue, setLocalValue] = useState(value)
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!dragging && hovered === null) setLocalValue(value)
  }, [value, dragging, hovered])

  const displayed = hovered ?? localValue

  const valueFromClientX = useCallback((clientX: number): number => {
    const el = containerRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    if (x < 0) return 0
    const clamped = Math.min(x, rect.width - 1)
    const starWidth = rect.width / 5
    const star = Math.min(4, Math.floor(clamped / starWidth))
    return clamped - star * starWidth < starWidth / 2 ? star + 0.5 : star + 1
  }, [])

  const commit = useCallback((next: number) => {
    if (readOnly) return
    const normalized = Math.max(0, Math.min(5, Math.round(next * 2) / 2))
    setLocalValue(normalized)
    setHovered(null)
    setDragging(false)
    onChange(normalized)
  }, [readOnly, onChange])

  return (
    <div
      ref={containerRef}
      data-no-swipe="true"
      data-interactive="true"
      role={readOnly ? 'img' : 'slider'}
      aria-label={readOnly ? `Rating ${displayed} of 5` : 'Change rating'}
      aria-valuemin={readOnly ? undefined : 0}
      aria-valuemax={readOnly ? undefined : 5}
      aria-valuenow={readOnly ? undefined : displayed}
      tabIndex={readOnly ? -1 : 0}
      className={`flex h-9 min-w-0 items-center justify-center rounded-full border border-white/10 bg-black/35 px-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${readOnly ? '' : 'cursor-pointer touch-none select-none hover:border-amber-400/35'}`}
      onClick={e => {
        e.stopPropagation()
        if (readOnly) return
        commit(valueFromClientX(e.clientX))
      }}
      onMouseMove={e => {
        if (readOnly || dragging) return
        setHovered(valueFromClientX(e.clientX))
      }}
      onMouseLeave={() => {
        if (!dragging) setHovered(null)
      }}
      onPointerDown={e => {
        e.stopPropagation()
        if (readOnly) return
        setDragging(true)
        const next = valueFromClientX(e.clientX)
        setHovered(next)
        try { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId) } catch { }
      }}
      onPointerMove={e => {
        if (readOnly || !dragging) return
        e.stopPropagation()
        setHovered(valueFromClientX(e.clientX))
      }}
      onPointerUp={e => {
        if (readOnly || !dragging) return
        e.stopPropagation()
        commit(valueFromClientX(e.clientX))
      }}
      onPointerCancel={e => {
        e.stopPropagation()
        setDragging(false)
        setHovered(null)
      }}
      onKeyDown={e => {
        if (readOnly) return
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault()
          commit((displayed || 0) - 0.5)
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault()
          commit((displayed || 0) + 0.5)
        }
      }}
    >
      {[1, 2, 3, 4, 5].map(star => {
        const full = displayed >= star
        const half = !full && displayed >= star - 0.5
        return (
          <span key={star} className="grid h-7 w-6 place-items-center">
            <span className="relative block h-[22px] w-[22px]">
              <Star
                size={22}
                className="absolute inset-0 text-white/50"
                fill="none"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              {full && (
                <Star
                  size={22}
                  className="absolute inset-0 text-amber-400"
                  fill="currentColor"
                  strokeWidth={0}
                  style={{ filter: 'drop-shadow(0 0 7px rgba(251,191,36,.85))' }}
                  aria-hidden="true"
                />
              )}
              {half && (
                <Star
                  size={22}
                  className="absolute inset-0 text-amber-400"
                  fill="currentColor"
                  strokeWidth={0}
                  style={{ clipPath: 'inset(0 50% 0 0)', filter: 'drop-shadow(0 0 7px rgba(251,191,36,.85))' }}
                  aria-hidden="true"
                />
              )}
            </span>
          </span>
        )
      })}
    </div>
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

type SortMode = 'default' | 'rating_desc' | 'rating_asc' | 'title_asc' | 'title_desc' | 'date_desc' | 'progress_desc'
type StatusFilter = 'all' | 'completed' | 'watching' | 'paused' | 'dropped' | 'wishlist'

// ─── Mapping tipo → label ─────────────────────────────────────────────────────


const PAGE_SIZE = 48


// ─── Steam cover ──────────────────────────────────────────────────────────────

function SteamCoverImg({ appid, title }: { appid?: string; title: string }) {
  const [attempt, setAttempt] = useState(0)
  const urls = appid ? [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
  ] : []

  if (!appid || attempt >= urls.length) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 gap-2">
        <Gamepad2 size={28} className="text-zinc-600" />
        <p className="text-xs text-center px-2 text-zinc-400 line-clamp-2">{title}</p>
      </div>
    )
  }

  return (
    <img
      src={urls[attempt]}
      alt={title}
      className="w-full h-full object-cover"
      onError={() => setAttempt(a => a + 1)}
    />
  )
}


// ─── SortableCard ─────────────────────────────────────────────────────────────

function SortableCard({ media, children, dragEnabled }: { media: UserMedia; children: React.ReactNode; dragEnabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: media.id, disabled: !dragEnabled })
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? 'none' : (transition || undefined),
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: dragEnabled ? 'none' : undefined,
        borderColor: isDragging ? 'var(--accent)' : undefined,
      }}
      {...attributes}
      {...(dragEnabled ? listeners : {})}
      className={`${dragEnabled ? 'cursor-grab active:cursor-grabbing' : ''} h-full rounded-[24px] ${isDragging ? 'z-50 shadow-2xl ring-2 ring-[var(--accent)]' : ''}`}
    >
      {children}
    </div>
  )
}

// ─── Card griglia ─────────────────────────────────────────────────────────────

const MediaCard = memo(function MediaCard({
  media, isOwner, onRating, onNotes, onViewNotes, onDelete, onMobileTap,
}: {
  media: UserMedia
  isOwner: boolean
  onRating?: (id: string, r: number) => void
  onNotes?: (media: UserMedia) => void
  onViewNotes?: (media: UserMedia) => void
  onStatusChange?: (id: string, status: string) => void
  onSaveProgress?: (id: string, value: number, field?: string) => void
  onMarkComplete?: (id: string) => void
  onReset?: (id: string) => void
  onEnrichEpisodes?: (id: string) => void
  enriching?: boolean
  onDelete?: (id: string) => void
  onMobileTap?: () => void
}) {
  const { locale } = useLocale()
  const hasNotes = !!media.notes?.trim()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)
  const shownRating = media.rating && media.rating > 0 ? Math.round(media.rating * 10) / 10 : 0

  const copy = locale === 'it'
    ? { note: 'Nota', noNote: 'Nota vuota' }
    : { note: 'Note', noNote: 'No note' }

  const renderCover = () => {
    if (media.is_steam) {
      return <SteamCoverImg appid={media.appid} title={media.title} />
    }

    if (media.cover_image && !imgFailed) {
      return (
        <img
          src={media.cover_image}
          alt={media.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            const img = e.target as HTMLImageElement
            if (!img.src.includes('wsrv.nl')) {
              const referer = media.cover_image!.includes('myanimelist.net')
                ? '&referer=https://myanimelist.net'
                : media.cover_image!.includes('anilist.co')
                  ? '&referer=https://anilist.co'
                  : ''
              img.src = `https://wsrv.nl/?url=${encodeURIComponent(media.cover_image!)}&w=560&output=webp${referer}`
            } else {
              setImgFailed(true)
            }
          }}
        />
      )
    }

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900 text-white">
        <Tv size={36} className="text-zinc-700 opacity-50" />
        <p className="line-clamp-3 px-4 text-center text-xs font-semibold leading-[1.22] text-zinc-400">{media.title}</p>
      </div>
    )
  }

  return (
    <div
      className="group relative flex h-[350px] flex-col overflow-hidden rounded-[24px] bg-[rgba(255,255,255,0.045)] ring-1 ring-white/[0.08] shadow-[0_18px_45px_rgba(0,0,0,0.22)] transition duration-200 hover:-translate-y-0.5 hover:bg-[rgba(255,255,255,0.062)] hover:ring-white/[0.15] sm:h-[400px] md:h-[424px]"
      onClick={() => { if (typeof window !== 'undefined' && window.innerWidth < 768) onMobileTap?.() }}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden bg-zinc-900">
        {isOwner && (
          <div className="hidden md:block absolute top-3 right-3 z-50">
            {confirmDelete ? (
              <div className="flex gap-1.5">
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}
                  onPointerDown={e => e.stopPropagation()}
                  className="rounded-full border border-white/15 bg-black/80 px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-black"
                >
                  Annulla
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onDelete?.(media.id) }}
                  onPointerDown={e => e.stopPropagation()}
                  className="rounded-full border border-red-700 bg-red-950/95 px-3 py-1.5 text-[10px] font-bold text-red-200 transition hover:bg-red-900"
                >
                  Elimina
                </button>
              </div>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
                onPointerDown={e => e.stopPropagation()}
                aria-label={`Elimina ${media.title}`}
                className="rounded-xl border border-white/20 bg-black/65 p-1.5 opacity-0 transition-all duration-200 hover:border-red-500/80 hover:bg-red-950/90 group-hover:opacity-100"
              >
                <X className="h-4 w-4 text-white transition-colors hover:text-red-300" />
              </button>
            )}
          </div>
        )}

        {renderCover()}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-black/72 via-black/24 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[46%] bg-gradient-to-t from-black/92 via-black/42 to-transparent" />

        <div className="absolute left-3 right-3 top-3 z-30 flex items-start justify-between gap-2">
          <MediaTypeBadge type={media.type as UserMedia['type']} size="xs" />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-30 p-3.5">
          <h4
            title={media.title}
            className="inline-block max-w-[94%] rounded-[16px] bg-[linear-gradient(90deg,rgba(0,0,0,0.86),rgba(0,0,0,0.68)_72%,rgba(0,0,0,0.24))] px-3 py-2.5 text-[14px] font-black leading-[1.22] text-white shadow-[0_10px_28px_rgba(0,0,0,0.72),0_0_0_1px_rgba(255,255,255,0.10)] [text-shadow:0_2px_4px_rgba(0,0,0,1)] sm:text-[15px]"
          >
            <span className="line-clamp-3 pb-[1px]">{media.title}</span>
          </h4>
        </div>
      </div>

      <div className="grid h-[52px] grid-cols-[minmax(0,1fr)_42px] items-center gap-2 border-t border-white/[0.06] bg-[rgba(8,8,12,0.94)] px-2.5">
        <ProfileLibrarySwipeStars
          value={shownRating}
          readOnly={!isOwner}
          onChange={(next) => onRating?.(media.id, next)}
        />

        <button
          type="button"
          onClick={e => {
            e.stopPropagation()
            if (isOwner) onNotes?.(media)
            else if (hasNotes) onViewNotes?.(media)
          }}
          onPointerDown={e => e.stopPropagation()}
          disabled={!isOwner && !hasNotes}
          title={hasNotes ? copy.note : copy.noNote}
          aria-label={hasNotes ? 'Open note' : 'No note'}
          className={`inline-flex h-9 w-[42px] items-center justify-center rounded-full border px-0 transition-all
            ${hasNotes
              ? 'border-[rgba(230,255,61,0.42)] bg-[rgba(230,255,61,0.16)] text-[var(--accent)] shadow-[0_0_18px_rgba(230,255,61,0.12)]'
              : 'border-white/10 bg-white/[0.035] text-white/30'
            }
            ${isOwner || hasNotes ? 'hover:border-[rgba(230,255,61,0.62)] hover:bg-[rgba(230,255,61,0.1)] hover:text-[var(--accent)]' : 'cursor-default opacity-60'}`}
        >
          <Edit3 size={15} />
        </button>
      </div>
    </div>
  )
})

// ─── Riga lista compatta ──────────────────────────────────────────────────────


const MediaRow = memo(function MediaRow({
  media, isOwner, onRating, onStatusChange, onDelete,
}: {
  media: UserMedia
  isOwner: boolean
  onRating?: (id: string, r: number) => void
  onStatusChange?: (id: string, status: string) => void
  onDelete?: (id: string) => void
}) {
  const { t } = useLocale()
  return (
    <div className="flex items-center gap-3 p-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl transition-colors group">
      <div className="w-10 h-14 bg-zinc-800 rounded-xl overflow-hidden flex-shrink-0">
        {media.is_steam ? (
          <SteamCoverImg appid={media.appid} title={media.title} />
        ) : media.cover_image ? (
          <img
            src={media.cover_image}
            alt={media.title}
            className="w-full h-full object-cover"
            onError={(e) => {
              const img = e.target as HTMLImageElement
              if (img.src.includes('wsrv.nl')) return
              const referer = media.cover_image!.includes('myanimelist.net')
                ? '&referer=https://myanimelist.net'
                : media.cover_image!.includes('anilist.co')
                ? '&referer=https://anilist.co'
                : ''
              img.src = `https://wsrv.nl/?url=${encodeURIComponent(media.cover_image!)}&w=500&output=jpg${referer}`
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700"><Tv size={20} /></div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-white truncate">{media.title}</p>
        {media.type === 'game' && (() => {
          const ach = media.achievement_data
          const hours = media.current_episode || 0
          return (
            <div className="flex items-center gap-2 mt-0.5">
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
        })()}
        {media.episodes && media.episodes > 1 && media.type !== 'game' && (
          <p className="text-xs text-zinc-500">{media.current_episode}/{media.episodes} {t.forYou.units.episodesShort}</p>
        )}
      </div>
      <StarRating
        value={media.rating || 0}
        onChange={isOwner ? (r) => onRating?.(media.id, r) : undefined}
        size={12}
        viewOnly={!isOwner}
      />
      {isOwner && (
        <select
          value={media.status || 'watching'}
          onChange={e => onStatusChange?.(media.id, e.target.value)}
          className="text-[10px] bg-transparent text-zinc-500 focus:outline-none cursor-pointer"
        >
          <option value="watching">{t.profile.statusFilters.watching}</option>
          <option value="completed">{t.profile.statusFilters.completed}</option>
          <option value="paused">{t.profile.statusFilters.paused}</option>
          <option value="dropped">{t.profile.statusFilters.dropped}</option>
          <option value="wishlist">{t.profile.statusFilters.wishlist}</option>
        </select>
      )}
      {isOwner && (
        <button onClick={() => onDelete?.(media.id)} className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all">
          <X size={14} />
        </button>
      )}
    </div>
  )
})

// ─── Pagina principale ────────────────────────────────────────────────────────

export default function ProfileTypePage() {
  const { username, type } = useParams<{ username: string; type: string }>()
  const supabase = createClient()
  const { t } = useLocale()
  const sensors = useDndSensors()
  const [mediaList, setMediaList] = useState<UserMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [isMobile, setIsMobile] = useState(false)
  const [isDragEnabled, setIsDragEnabled] = useState(false)

  const [notesOpen, setNotesOpen] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<UserMedia | null>(null)
  const [notesInput, setNotesInput] = useState('')
  const [viewingNotes, setViewingNotes] = useState<UserMedia | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set())
  const [openMobileId, setOpenMobileId] = useState<string | null>(null)

  const typeLabels = { anime: t.profile.categories.anime, manga: t.profile.categories.manga, game: t.profile.categories.games, tv: t.profile.categories.tv, movie: t.profile.categories.movies, boardgame: t.profile.categories.boardgames } as Record<string, string>
  const typeLabel = typeLabels[type] || type

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username')
        .ilike('username', username)
        .single()

      if (!profile) { setLoading(false); return }

      setProfileId(profile.id)
      setIsOwner(user?.id === profile.id)

      const { data } = await supabase
        .from('user_media_entries')
        .select('id, title, type, cover_image, current_episode, current_season, season_episodes, episodes, display_order, updated_at, is_steam, import_source, appid, rating, status, notes, genres, external_id, achievement_data')
        .eq('user_id', profile.id)
        .eq('type', type)
        .order('display_order', { ascending: false, nullsFirst: false })

      setMediaList(data || [])
      setLoading(false)
    }
    load()
  }, [username, type])

  const handleRating = async (mediaId: string, rating: number) => {
    const res = await fetch('/api/collection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mediaId, rating }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.map(m => m.id === mediaId ? { ...m, rating } : m))
  }

  const handleStatusChange = async (mediaId: string, status: string) => {
    // Special: manga chapter update encoded as "chapter:N"
    if (status.startsWith('chapter:')) {
      const chapter = parseInt(status.slice(8), 10)
      if (isNaN(chapter)) return
      const item = mediaList.find(m => m.id === mediaId)
      const update: Record<string, unknown> = { current_episode: chapter }
      if (item?.episodes && chapter >= item.episodes) {
        update.status = 'completed'
        update.completed_at = new Date().toISOString()
      } else if (item?.status === 'completed') {
        update.status = 'watching'
      }
      const res = await fetch('/api/collection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mediaId, ...update }),
      }).catch(() => null)
      if (!res?.ok) return
      setMediaList(prev => prev.map(m => m.id === mediaId ? { ...m, ...update } : m))
      return
    }
    const res = await fetch('/api/collection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mediaId, status }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.map(m => m.id === mediaId ? { ...m, status } : m))
  }

  const handleDelete = async (mediaId: string) => {
    const res = await fetch('/api/collection', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mediaId }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.filter(m => m.id !== mediaId))
  }

  const openNotes = (media: UserMedia) => {
    setSelectedMedia(media)
    setNotesInput(media.notes || '')
    setNotesOpen(true)
  }

  const saveNotes = async () => {
    if (!selectedMedia) return
    const notes = notesInput.trim()
    const res = await fetch('/api/collection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedMedia.id, notes }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.map(m => m.id === selectedMedia.id ? { ...m, notes } : m))
    setNotesOpen(false)
  }

  const handleSaveProgress = async (mediaId: string, value: number, field = 'current_episode') => {
    const update: Record<string, unknown> = { [field]: value }
    if (field === 'current_episode') {
      const item = mediaList.find(m => m.id === mediaId)
      const maxEps = item?.season_episodes?.[item.current_season || 1]?.episode_count || item?.episodes
      if (maxEps && value >= maxEps) {
        update.status = 'completed'
        update.completed_at = new Date().toISOString()
      } else if (item?.status === 'completed') {
        update.status = 'watching'
      }
    }
    const res = await fetch('/api/collection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mediaId, ...update }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.map(m => m.id === mediaId ? { ...m, ...update } as UserMedia : m))
  }

  const handleMarkComplete = async (mediaId: string) => {
    const update = { status: 'completed', completed_at: new Date().toISOString() }
    const res = await fetch('/api/collection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mediaId, ...update }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.map(m => m.id === mediaId ? { ...m, ...update } : m))
  }

  const handleReset = async (mediaId: string) => {
    const update = { status: 'watching', current_episode: 1, current_season: 1, completed_at: null }
    const res = await fetch('/api/collection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: mediaId, ...update }),
    }).catch(() => null)
    if (!res?.ok) return
    setMediaList(prev => prev.map(m => m.id === mediaId ? { ...m, ...update } as UserMedia : m))
  }

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
        setMediaList(prev => prev.map(m => m.id === id ? { ...m, ...data } : m))
      }
    } finally {
      setEnrichingIds(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  // Filtra e ordina
  const filtered = useMemo(() => {
    let list = [...mediaList]

    if (search.trim()) {
      list = list.filter(m => m.title.toLowerCase().includes(search.toLowerCase()))
    }
    if (statusFilter !== 'all') {
      list = list.filter(m => m.status === statusFilter)
    }

    list.sort((a, b) => {
      switch (sortMode) {
        case 'rating_desc': {
          const aR = a.rating ?? -1
          const bR = b.rating ?? -1
          return bR - aR
        }
        case 'rating_asc': {
          const aR = a.rating ?? 999
          const bR = b.rating ?? 999
          return aR - bR
        }
        case 'title_asc': return a.title.localeCompare(b.title)
        case 'title_desc': return b.title.localeCompare(a.title)
        case 'date_desc': return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        case 'progress_desc': return (b.current_episode || 0) - (a.current_episode || 0)
        // default: ordine manuale (display_order desc)
        default: return (b.display_order || 0) - (a.display_order || 0)
      }
    })

    return list
  }, [mediaList, search, statusFilter, sortMode])

  const onDragEnd = (event: DragEndEvent) => {
    if (!isOwner) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = filtered.findIndex(item => item.id === active.id)
    const newIndex = filtered.findIndex(item => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(filtered, oldIndex, newIndex)
    const timestamp = Date.now()
    const updatedFiltered = reordered.map((item, i) => ({
      ...item,
      display_order: timestamp - i * 10000,
    }))
    const updatedMap = new Map(updatedFiltered.map(item => [item.id, item]))
    setMediaList(prev => prev.map(item => updatedMap.get(item.id) ?? item))
    // Fire and forget — non blocca il render
    fetch('/api/collection/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: updatedFiltered.map(item => ({ id: item.id, display_order: item.display_order })) }),
    }).catch(() => {})
  }

  // Reset visibleCount quando cambiano i filtri
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search, statusFilter, sortMode])

  // IntersectionObserver per scroll infinito
  // rootMargin 600px: carica le prossime card prima che entrino nel viewport
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + PAGE_SIZE, filtered.length))
        }
      },
      { rootMargin: '600px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [filtered.length])

  // Stats rapide
  const completed = mediaList.filter(m => m.status === 'completed').length
  const avgRating = mediaList.filter(m => m.rating).length > 0
    ? (mediaList.reduce((s, m) => s + (m.rating || 0), 0) / mediaList.filter(m => m.rating).length).toFixed(1)
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  return (
    <div className="gk-profile-type-page min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] pb-24">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6 pt-8">

        {/* Back */}
        <Link
          href={`/profile/${username}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white mb-6 transition"
        >
          <ArrowLeft size={14} />
          {t.profile.backToProfileOf(username)}
        </Link>

        {/* Header */}
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <div className="mb-3">
              <MediaTypeBadge type={type} size="sm" />
            </div>
            <h1 className="text-4xl font-black tracking-tighter">{typeLabel}</h1>
            <p className="text-zinc-500 mt-1 text-sm">
              {t.profile.titlesCount(mediaList.length)}
              {completed > 0 && ` · ${t.profile.completedCount(completed)}`}
              {avgRating && ` · ${t.profile.averageRating(avgRating)}`}
            </p>
          </div>
        </div>

        {/* Controlli */}
        <div className="flex flex-col gap-3 mb-6">
          {/* Ricerca */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t.profile.searchIn(typeLabel)}
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-2xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none transition"
            />
          </div>

          {/* Filtri + drag toggle */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="flex-1 md:flex-none md:w-44 bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-2xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none transition cursor-pointer"
            >
              <option value="all">{t.profile.statusFilters.all}</option>
              <option value="completed">{t.profile.statusFilters.completed}</option>
              <option value="watching">{t.profile.statusFilters.watching}</option>
              <option value="paused">{t.profile.statusFilters.paused}</option>
              <option value="dropped">{t.profile.statusFilters.dropped}</option>
              <option value="wishlist">{t.profile.statusFilters.wishlist}</option>
            </select>

            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="flex-1 md:flex-none md:w-44 bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-2xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none transition cursor-pointer"
            >
              <option value="default">{t.profile.sortModes.default}</option>
              <option value="rating_desc">{t.profile.sortModes.ratingDesc}</option>
              <option value="rating_asc">{t.profile.sortModes.ratingAsc}</option>
              <option value="title_asc">{t.profile.sortModes.titleAsc}</option>
              <option value="title_desc">{t.profile.sortModes.titleDesc}</option>
              <option value="date_desc">{t.profile.sortModes.dateDesc}</option>
              {type === 'game' && (
                <option value="progress_desc">{t.profile.sortModes.progressDesc}</option>
              )}
            </select>

            {/* Drag toggle — mobile + owner only */}
            {isOwner && isMobile && (
              <button
                onClick={() => setIsDragEnabled(v => !v)}
                className={`ml-auto shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium border transition-all duration-200 ${
                  isDragEnabled
                    ? 'border-transparent shadow-lg'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 active:bg-zinc-800'
                }`}
                style={isDragEnabled ? { background: 'var(--accent)', color: '#0B0B0F' } : {}}
              >
                <GripVertical size={14} />
                {isDragEnabled ? t.profile.done : t.profile.reorder}
              </button>
            )}
          </div>
        </div>

        {/* Risultati */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 text-zinc-600">
            <Search size={40} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">{t.profile.noTitlesFound}</p>
            {search && <p className="text-sm mt-1">{t.profile.tryAnotherSearch}</p>}
          </div>
        ) : (() => {
            const visible = filtered.slice(0, visibleCount)
            const effectiveDragEnabled = isOwner && (isMobile ? isDragEnabled : true)
            return isOwner ? (
              <>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={visible.map(m => m.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 md:gap-5">
                      {visible.map(media => (
                        <SortableCard key={media.id} media={media} dragEnabled={effectiveDragEnabled}>
                          <MediaCard
                            media={media}
                            isOwner={isOwner}
                            onRating={handleRating}
                            onNotes={isOwner ? openNotes : undefined}
                            onViewNotes={!isOwner ? setViewingNotes : undefined}
                            onStatusChange={handleStatusChange}
                            onSaveProgress={handleSaveProgress}
                            onMarkComplete={handleMarkComplete}
                            onReset={handleReset}
                            onEnrichEpisodes={enrichEpisodeData}
                            enriching={enrichingIds.has(media.id)}
                            onDelete={handleDelete}
                            onMobileTap={isOwner ? () => setOpenMobileId(media.id) : undefined}
                          />
                        </SortableCard>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                <div ref={sentinelRef} />
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 md:gap-5">
                  {visible.map(media => (
                    <MediaCard
                      key={media.id}
                      media={media}
                      isOwner={isOwner}
                      onRating={handleRating}
                      onNotes={isOwner ? openNotes : undefined}
                      onViewNotes={!isOwner ? setViewingNotes : undefined}
                      onStatusChange={handleStatusChange}
                      onSaveProgress={handleSaveProgress}
                      onMarkComplete={handleMarkComplete}
                      onReset={handleReset}
                      onEnrichEpisodes={enrichEpisodeData}
                      enriching={enrichingIds.has(media.id)}
                      onDelete={handleDelete}
                      onMobileTap={isOwner ? () => setOpenMobileId(media.id) : undefined}
                    />
                  ))}
                </div>
                <div ref={sentinelRef} />
              </>
            )
          })()}

        {/* Contatore risultati */}
        {filtered.length > 0 && (
          <p className="text-center text-zinc-700 text-xs mt-8">
            {t.profile.resultsCounter(Math.min(visibleCount, filtered.length), filtered.length)}
            {filtered.length !== mediaList.length && ` ${t.profile.filteredCounter(filtered.length, mediaList.length)}`}
          </p>
        )}
      </div>

      {/* Mobile card modal */}
      {openMobileId && isOwner && (() => {
        const openMedia = mediaList.find(m => m.id === openMobileId)
        if (!openMedia) return null
        return (
          <MobileMediaModal
            media={openMedia as ModalMedia}
            isOwner={true}
            onClose={() => setOpenMobileId(null)}
            onRating={handleRating}
            onStatusChange={handleStatusChange}
            onSaveProgress={handleSaveProgress}
            onMarkComplete={handleMarkComplete}
            onReset={handleReset}
            onEnrichEpisodes={enrichEpisodeData}
            enriching={enrichingIds.has(openMobileId)}
            onDelete={handleDelete}
            onNotes={(m) => openNotes(m as UserMedia)}
          />
        )
      })()}

      {/* Modal note */}
      {notesOpen && selectedMedia && isOwner && (
        <NotesModal
          title={`Note — ${selectedMedia.title}`}
          value={notesInput}
          onChange={setNotesInput}
          onSave={saveNotes}
          onClose={() => setNotesOpen(false)}
          saveLabel={t.common.save}
          cancelLabel={t.media.cancel}
          placeholder={t.profile.notesPlaceholder}
        />
      )}

      {/* Read-only notes modal — for visitors */}
      {viewingNotes && (
        <NotesModal
          title={viewingNotes.title}
          value={viewingNotes.notes || ''}
          onChange={() => {}}
          onSave={() => {}}
          onClose={() => setViewingNotes(null)}
          readOnly
        />
      )}
    </div>
  )
}
