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
  ArrowLeft, Search,
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

const TYPE_LABELS: Record<string, string> = {
  anime: 'Anime',
  manga: 'Manga',
  game: 'Videogiochi',
  tv: 'Serie TV',
  movie: 'Film',
  boardgame: 'Giochi da Tavolo',
}

const PAGE_SIZE = 48

const TYPE_COLORS: Record<string, string> = {
  anime: 'bg-sky-500',
  manga: 'bg-orange-500',
  game: 'bg-green-500',
  tv: 'bg-purple-500',
  movie: 'bg-red-500',
  boardgame: 'bg-amber-500',
}

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
      }}
      {...attributes}
      {...(dragEnabled ? listeners : {})}
      className={`${dragEnabled ? 'cursor-grab active:cursor-grabbing' : ''} rounded-3xl overflow-hidden h-full ${
        isDragging
          ? 'border-2 border-violet-500 shadow-2xl z-50'
          : 'border border-zinc-800 hover:border-violet-500/50 hover:shadow-xl'
      }`}
    >
      {children}
    </div>
  )
}

// ─── Card griglia ─────────────────────────────────────────────────────────────

const MediaCard = memo(function MediaCard({
  media, isOwner, onRating, onNotes, onViewNotes, onStatusChange, onSaveProgress, onMarkComplete, onReset, onEnrichEpisodes, enriching, onDelete, onMobileTap,
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
  const hasNotes = !!media.notes?.trim()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  return (
    <div
      className="group relative bg-zinc-950 rounded-3xl overflow-hidden flex flex-col h-full"
      onClick={() => { if (typeof window !== 'undefined' && window.innerWidth < 768) onMobileTap?.() }}
    >
      {/* Cover */}
      <div className="relative h-64 bg-zinc-900 flex-shrink-0 overflow-hidden">
        {/* Badge tipo */}
        <div className={`absolute bottom-3 left-3 z-20 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white tracking-wide ${TYPE_COLORS[media.type] || 'bg-zinc-700'}`}>
          {TYPE_LABELS[media.type] || media.type}
        </div>
        {/* Delete — hidden on mobile (in modal instead) */}
        {isOwner && (
          <div className="hidden md:block absolute top-3 right-3 z-30">
            {confirmDelete ? (
              <div className="flex gap-1">
                <button onClick={e => { e.stopPropagation(); setConfirmDelete(false) }} onPointerDown={e => e.stopPropagation()} className="px-2 py-1 text-[10px] bg-zinc-900/95 border border-zinc-600 rounded-full">Annulla</button>
                <button onClick={e => { e.stopPropagation(); onDelete?.(media.id) }} onPointerDown={e => e.stopPropagation()} className="px-2 py-1 text-[10px] bg-red-900/95 border border-red-700 text-red-300 rounded-full">Elimina</button>
              </div>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
                onPointerDown={e => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 bg-black/50 hover:bg-red-950/80 border border-white/10 hover:border-red-500/60 p-1.5 rounded-xl transition-all"
              >
                <X size={14} className="text-white" />
              </button>
            )}
          </div>
        )}
        {/* Notes icon — only shown when notes exist; owner=edit, visitor=read-only */}
        {hasNotes && (
          <button
            onClick={e => { e.stopPropagation(); isOwner ? onNotes?.(media) : onViewNotes?.(media) }}
            aria-label="Note"
            className={`absolute bottom-3 right-3 z-20 p-1.5 rounded-lg border bg-violet-600 border-violet-500 text-white transition-all ${isOwner ? 'hidden md:flex' : 'flex'}`}
          >
            <Edit3 size={11} />
          </button>
        )}
        <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-black/70 to-transparent z-10 pointer-events-none" />
        {/* Cover image */}
        {media.is_steam ? (
          <SteamCoverImg appid={media.appid} title={media.title} />
        ) : media.cover_image && !imgFailed ? (
          <img
            src={media.cover_image}
            alt={media.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-800">
            <Tv size={36} className="text-zinc-700 opacity-40" />
          </div>
        )}
      </div>

      {/* ── Mobile: static read-only info ────────────────────────────────── */}
      <div className="md:hidden flex flex-col flex-1 px-4 pt-3 pb-4 gap-1.5">
        <h4 className="font-semibold text-sm leading-snug text-white line-clamp-2">{media.title}</h4>
        <StarRating value={media.rating || 0} viewOnly size={13} />
        <div className="flex-1 min-h-0" />
        <div className="text-[11px] text-zinc-400">
          {media.type === 'game' && (media.current_episode || 0) > 0 && (
            <span className="inline-flex items-center gap-1 bg-zinc-800/60 px-2 py-0.5 rounded-full">
              <Clock size={10} className="text-zinc-500" />{media.current_episode}h
            </span>
          )}
          {media.type === 'manga' && (() => {
            const maxCh = media.episodes && media.episodes > 1 ? media.episodes : undefined
            const current = media.current_episode || 0
            if (maxCh && current >= maxCh) return null
            return <span className="text-zinc-500">Cap. <span className="text-emerald-400 font-semibold">{current}</span>{maxCh ? <span className="text-zinc-600"> / {maxCh}</span> : null}</span>
          })()}
          {(media.type === 'tv' || media.type === 'anime') && (() => {
            const isCompleted = media.status === 'completed'
            const hasEpData = !!(media.episodes && media.episodes > 1)
            const csn = media.current_season || 1
            const maxEps = media.season_episodes?.[csn]?.episode_count || media.episodes || 0
            if (isCompleted) return null
            if (hasEpData) return <span className="text-zinc-500">{media.season_episodes ? `S${csn} · ` : ''}Ep. <span className="text-emerald-400 font-semibold">{media.current_episode}</span><span className="text-zinc-600"> / {maxEps}</span></span>
            return null
          })()}
        </div>
      </div>

      {/* ── Desktop: full interactive info ────────────────────────────────── */}
      <div className="hidden md:flex flex-col flex-1 px-4 pt-3 pb-4 gap-2">
        <h4 className="font-semibold text-sm leading-snug text-white line-clamp-2">{media.title}</h4>

        {/* Stars */}
        <div onPointerDown={isOwner ? e => e.stopPropagation() : undefined}>
          <StarRating
            value={media.rating || 0}
            onChange={isOwner ? (r) => onRating?.(media.id, r) : undefined}
            size={14}
            viewOnly={!isOwner}
          />
        </div>

        {/* Status — select/badge solo per tv/anime */}
        {(media.type === 'tv' || media.type === 'anime') && (
          isOwner ? (
            <select
              value={media.status || 'watching'}
              onChange={e => onStatusChange?.(media.id, e.target.value)}
              onPointerDown={e => e.stopPropagation()}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-zinc-900 border-zinc-800 text-zinc-400 focus:outline-none focus:border-violet-500 transition cursor-pointer appearance-none w-fit"
            >
              <option value="watching">In corso</option>
              <option value="completed">Completato</option>
              <option value="paused">In pausa</option>
              <option value="dropped">Abbandonato</option>
              <option value="wishlist">Wishlist</option>
            </select>
          ) : (
            media.status && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit bg-zinc-800 text-zinc-400">
                {media.status === 'completed' ? 'Completato'
                  : media.status === 'watching' ? 'In corso'
                  : media.status === 'paused' ? 'In pausa'
                  : media.status === 'dropped' ? 'Abbandonato'
                  : media.status === 'wishlist' ? 'Wishlist'
                  : media.status}
              </span>
            )
          )
        )}

        {/* Spacer */}
        <div className="flex-1 min-h-0" />

        {/* Progress area */}
        {media.type === 'game' ? (() => {
          const ach = media.achievement_data
          const hours = media.current_episode || 0
          return (
            <div className="space-y-1.5">
              {hours > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded-full">
                  <Clock size={10} className="text-zinc-500 flex-shrink-0" />
                  {hours}h
                </span>
              )}
              {ach && ach.tot > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Achievement</span>
                    <span className="font-mono text-zinc-400">{ach.curr}/{ach.tot}</span>
                  </div>
                  <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#107c10] rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((ach.curr / ach.tot) * 100)}%` }}
                    />
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
                    <button onClick={() => onStatusChange?.(media.id, 'chapter:0')} onPointerDown={e => e.stopPropagation()} className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors" title="Ricomincia">
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
                      <button onClick={() => onStatusChange?.(media.id, `chapter:${Math.max(0, current - 1)}`)} onPointerDown={e => e.stopPropagation()} disabled={current <= 0} className="w-6 h-6 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 text-sm font-bold disabled:opacity-30">−</button>
                    )}
                    <div className="flex-1 text-[11px] font-semibold flex items-center justify-center gap-0.5">
                      <span className="text-zinc-500 text-[10px] mr-0.5">Cap.</span>
                      {isOwner ? (
                        <>
                          <InlineChapterInput value={current} max={maxCh} onSave={n => onStatusChange?.(media.id, `chapter:${n}`)} />
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
                        onClick={() => onStatusChange?.(media.id, `chapter:${current + 1}`)}
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
                    <button onClick={() => onEnrichEpisodes?.(media.id)} onPointerDown={e => e.stopPropagation()} disabled={enriching} className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-violet-400 transition-colors disabled:opacity-50">
                      {enriching ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                      {enriching ? 'Recupero…' : 'Recupera totale'}
                    </button>
                  )}
                </>
              )}
            </div>
          )
        })() : (() => {
          if (media.type !== 'tv' && media.type !== 'anime') return null
          const hasEpisodeData = !!(media.episodes && media.episodes > 1)
          const isCompleted = media.status === 'completed'
          const hasSeasonData = !!(media.season_episodes && Object.keys(media.season_episodes).length > 0)
          const currentSeasonNum = media.current_season || 1
          const maxSeasons = hasSeasonData ? Object.keys(media.season_episodes!).length : 1
          const maxEpisodesThisSeason = hasSeasonData
            ? (media.season_episodes![currentSeasonNum]?.episode_count || media.episodes || 1)
            : (media.episodes || 1)
          const totalEps = media.episodes || 1
          const totalProgress = Math.min(100, Math.round((media.current_episode / totalEps) * 100))

          if (!hasEpisodeData) {
            return isOwner ? (
              <button
                onClick={() => onEnrichEpisodes?.(media.id)}
                onPointerDown={e => e.stopPropagation()}
                disabled={enriching}
                className="flex items-center gap-1 text-[10px] text-zinc-600 hover:text-violet-400 transition-colors disabled:opacity-50"
              >
                {enriching ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                {enriching ? 'Recupero…' : 'Recupera episodi'}
              </button>
            ) : null
          }

          if (isCompleted) {
            return isOwner ? (
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
          }

          return (
            <div className="space-y-1.5">
              {hasSeasonData && (
                <div className="flex items-center justify-between gap-1">
                  {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.max(1, currentSeasonNum - 1), 'current_season')} onPointerDown={e => e.stopPropagation()} disabled={currentSeasonNum <= 1} className="w-6 h-6 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 text-sm font-bold disabled:opacity-30">−</button>}
                  <div className="flex-1 text-emerald-400 text-[11px] font-semibold flex items-center justify-center">Stagione {currentSeasonNum}</div>
                  {isOwner && <button onClick={() => { if (currentSeasonNum < maxSeasons) onSaveProgress?.(media.id, currentSeasonNum + 1, 'current_season') }} onPointerDown={e => e.stopPropagation()} disabled={currentSeasonNum >= maxSeasons} className="w-6 h-6 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 text-sm font-bold disabled:opacity-30">+</button>}
                </div>
              )}
              <div className="flex items-center justify-between gap-1">
                {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.max(1, media.current_episode - 1))} onPointerDown={e => e.stopPropagation()} disabled={media.current_episode <= 1} className="w-6 h-6 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 text-sm font-bold disabled:opacity-30">−</button>}
                <div className="flex-1 text-[11px] font-semibold flex items-center justify-center gap-0.5">
                  <span className="text-emerald-400">Ep. {media.current_episode}</span>
                  <span className="text-zinc-600">/{maxEpisodesThisSeason}</span>
                </div>
                {isOwner && <button onClick={() => { const next = media.current_episode + 1; next <= maxEpisodesThisSeason ? onSaveProgress?.(media.id, next) : onMarkComplete?.(media.id) }} onPointerDown={e => e.stopPropagation()} className="w-6 h-6 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 text-sm font-bold">+</button>}
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-300 rounded-full" style={{ width: `${totalProgress}%` }} />
              </div>
            </div>
          )
        })()}
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
          <p className="text-xs text-zinc-500">{media.current_episode}/{media.episodes} ep.</p>
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
          <option value="watching">In corso</option>
          <option value="completed">Completato</option>
          <option value="paused">Pausa</option>
          <option value="dropped">Abbandonato</option>
          <option value="wishlist">Wishlist</option>
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

  const typeLabel = TYPE_LABELS[type] || type

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
        .select('*')
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
    supabase.rpc('update_display_orders', {
      updates: updatedFiltered.map(item => ({ id: item.id, display_order: item.display_order }))
    }).then(({ error }) => {
      if (error && process.env.NODE_ENV === 'development') {
        console.error('[DragEnd] rpc error:', error)
      }
    })
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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-violet-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <div className="max-w-screen-2xl mx-auto px-3 sm:px-4 md:px-6 pt-8">

        {/* Back */}
        <Link
          href={`/profile/${username}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white mb-6 transition"
        >
          <ArrowLeft size={14} />
          Profilo di @{username}
        </Link>

        {/* Header */}
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold text-white mb-3 ${TYPE_COLORS[type] || 'bg-zinc-700'}`}>
              {typeLabel}
            </div>
            <h1 className="text-4xl font-black tracking-tighter">{typeLabel}</h1>
            <p className="text-zinc-500 mt-1 text-sm">
              {mediaList.length} titoli
              {completed > 0 && ` · ${completed} completati`}
              {avgRating && ` · voto medio ${avgRating}`}
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
              placeholder={`Cerca in ${typeLabel}...`}
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none transition"
            />
          </div>

          {/* Filtri + drag toggle */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="flex-1 md:flex-none md:w-44 bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none transition cursor-pointer"
            >
              <option value="all">Tutti gli stati</option>
              <option value="completed">Completati</option>
              <option value="watching">In corso</option>
              <option value="paused">In pausa</option>
              <option value="dropped">Abbandonati</option>
              <option value="wishlist">Wishlist</option>
            </select>

            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="flex-1 md:flex-none md:w-44 bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none transition cursor-pointer"
            >
              <option value="default">Ordine personalizzato</option>
              <option value="rating_desc">Voto (↓)</option>
              <option value="rating_asc">Voto (↑)</option>
              <option value="title_asc">Titolo (A-Z)</option>
              <option value="title_desc">Titolo (Z-A)</option>
              <option value="date_desc">Aggiunto di recente</option>
              {type === 'game' && (
                <option value="progress_desc">Ore (↓)</option>
              )}
            </select>

            {/* Drag toggle — mobile + owner only */}
            {isOwner && isMobile && (
              <button
                onClick={() => setIsDragEnabled(v => !v)}
                className={`ml-auto shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium border transition-all duration-200 ${
                  isDragEnabled
                    ? 'bg-violet-600 border-violet-500 text-white shadow-lg shadow-violet-500/20'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 active:bg-zinc-800'
                }`}
              >
                <GripVertical size={14} />
                {isDragEnabled ? 'Fine' : 'Riordina'}
              </button>
            )}
          </div>
        </div>

        {/* Risultati */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 text-zinc-600">
            <Search size={40} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Nessun titolo trovato</p>
            {search && <p className="text-sm mt-1">Prova con un altro termine di ricerca</p>}
          </div>
        ) : (() => {
            const visible = filtered.slice(0, visibleCount)
            const effectiveDragEnabled = isOwner && (isMobile ? isDragEnabled : true)
            return isOwner ? (
              <>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={visible.map(m => m.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
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
            {Math.min(visibleCount, filtered.length)} di {filtered.length} {filtered.length === 1 ? 'titolo' : 'titoli'}
            {filtered.length !== mediaList.length && ` (filtrati su ${mediaList.length} totali)`}
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
