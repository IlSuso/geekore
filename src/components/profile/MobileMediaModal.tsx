'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Edit3, CheckCircle, RotateCcw, RefreshCw, Loader2, Clock, Trash2 } from 'lucide-react'
import { StarRating } from '@/components/ui/StarRating'
import { gestureState } from '@/hooks/gestureState'
import { androidBack } from '@/hooks/androidBack'
import { optimizeCover } from '@/lib/imageOptimizer'

// ─── InlineChapterInput ───────────────────────────────────────────────────────

function InlineChapterInput({ value, max, onSave }: { value: number; max?: number; onSave: (n: number) => void }) {
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
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') setEditing(false)
        }}
        className="bg-transparent outline-none w-14 text-emerald-400 text-2xl font-bold p-0 text-center border-b-2 border-emerald-400/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    )
  }

  return (
    <span
      onClick={() => { setDraft(value.toString()); setEditing(true) }}
      className="text-emerald-400 font-bold cursor-text underline decoration-dotted underline-offset-2 select-none"
    >
      {value}
    </span>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModalMedia = {
  id: string
  title: string
  title_en?: string
  type: string
  cover_image?: string
  current_episode: number
  current_season?: number
  season_episodes?: Record<number, { episode_count: number }>
  episodes?: number
  notes?: string
  rating?: number
  status?: string
  is_steam?: boolean
  appid?: string
  achievement_data?: { curr: number; tot: number; gs_curr: number; gs_tot: number } | null
}

// ─── Component ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  anime: 'bg-sky-500', manga: 'bg-orange-500', game: 'bg-green-500',
  tv: 'bg-purple-500', movie: 'bg-red-500', board_game: 'bg-amber-500', boardgame: 'bg-amber-500',
}
const TYPE_LABELS: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Gioco', tv: 'Serie TV',
  movie: 'Film', board_game: 'Board Game', boardgame: 'Board Game',
}

export function MobileMediaModal({
  media, isOwner, onClose, onRating, onStatusChange, onSaveProgress,
  onMarkComplete, onReset, onEnrichEpisodes, enriching, onDelete, onNotes,
}: {
  media: ModalMedia
  isOwner: boolean
  onClose: () => void
  onRating?: (id: string, r: number) => void
  onStatusChange?: (id: string, status: string) => void
  onSaveProgress?: (id: string, val: number, field?: 'current_episode' | 'current_season') => void | Promise<void>
  onMarkComplete?: (id: string, media: ModalMedia) => void | Promise<void>
  onReset?: (id: string) => void
  onEnrichEpisodes?: (id: string) => void
  enriching?: boolean
  onDelete?: (id: string) => void
  onNotes?: (media: ModalMedia) => void
}) {
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [imgFailed, setImgFailed] = useState(false)

  const sheetRef           = useRef<HTMLDivElement>(null)
  const handleStartY       = useRef<number | null>(null)
  const handleCurrentY     = useRef<number>(0)
  const handleStartX       = useRef(0)
  const handleIsVertical   = useRef<boolean | null>(null)
  const onCloseRef            = useRef(onClose)
  onCloseRef.current          = onClose

  // Scroll-body swipe-to-dismiss refs
  const bodyRef            = useRef<HTMLDivElement>(null)
  const bodyTouchStartY    = useRef<number | null>(null)
  const bodyTouchStartX    = useRef<number>(0)
  const bodyIsVertical     = useRef<boolean | null>(null)
  const bodyDismissing     = useRef<boolean>(false)

  useEffect(() => {
    gestureState.drawerActive = true
    return () => { gestureState.drawerActive = false }
  }, [])

  // Registra la callback di chiusura nel sistema androidBack (Capacitor).
  useEffect(() => {
    const closeModal = () => {
      setClosing(true)
      setTimeout(() => onCloseRef.current(), 240)
    }
    androidBack.push(closeModal)
    return () => androidBack.pop(closeModal)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Slide-up entry
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const doClose = () => {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, 240)
  }

  // Swipe-down on scrollable body — native listeners with passive:false
  // so preventDefault() can block the browser scroll bounce.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return

    const onStart = (e: TouchEvent) => {
      const x = e.touches[0].clientX
      if (x <= 20 || x >= window.innerWidth - 20) return
      bodyTouchStartY.current = e.touches[0].clientY
      bodyTouchStartX.current = x
      bodyIsVertical.current  = null
      bodyDismissing.current  = false
    }

    const onMove = (e: TouchEvent) => {
      if (bodyTouchStartY.current === null) return
      const dy = e.touches[0].clientY - bodyTouchStartY.current
      const dx = Math.abs(e.touches[0].clientX - bodyTouchStartX.current)
      if (bodyIsVertical.current === null) {
        if (Math.abs(dy) < 6 && dx < 6) return
        bodyIsVertical.current = Math.abs(dy) > dx
      }
      if (!bodyIsVertical.current) return
      if (dy > 0 && el.scrollTop <= 0) {
        if (e.cancelable) e.preventDefault()
        bodyDismissing.current = true
        if (sheetRef.current) {
          sheetRef.current.style.transition = 'none'
          sheetRef.current.style.transform  = `translateY(${Math.max(0, dy)}px)`
        }
      } else {
        bodyDismissing.current = false
        if (sheetRef.current) {
          sheetRef.current.style.transition = ''
          sheetRef.current.style.transform  = ''
        }
      }
    }

    const onEnd = (e: TouchEvent) => {
      if (sheetRef.current) {
        sheetRef.current.style.transition = ''
        sheetRef.current.style.transform  = ''
      }
      const dy = bodyTouchStartY.current !== null
        ? e.changedTouches[0].clientY - bodyTouchStartY.current
        : 0
      bodyTouchStartY.current = null
      bodyIsVertical.current  = null
      if (bodyDismissing.current && dy > 80) doClose()
      bodyDismissing.current = false
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove',  onMove,  { passive: false })
    el.addEventListener('touchend',   onEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove',  onMove)
      el.removeEventListener('touchend',   onEnd)
    }
  }, []) // eslint-disable-line

  // Drag-handle swipe-down to dismiss — only responds to primarily vertical gestures.
  const onHandleTouchStart = (e: React.TouchEvent) => {
    // Edge zone reserved for Android/iOS system gestures — don't activate
    const x = e.touches[0].clientX
    if (x <= 20 || x >= window.innerWidth - 20) return
    handleStartY.current     = e.touches[0].clientY
    handleCurrentY.current   = e.touches[0].clientY
    handleStartX.current     = x
    handleIsVertical.current = null
    if (sheetRef.current) sheetRef.current.style.transition = 'none'
  }
  const onHandleTouchMove = (e: React.TouchEvent) => {
    if (handleStartY.current === null) return
    handleCurrentY.current = e.touches[0].clientY
    if (handleIsVertical.current === null) {
      const dx = Math.abs(e.touches[0].clientX - handleStartX.current)
      const dy = Math.abs(handleCurrentY.current - handleStartY.current)
      if (dx < 6 && dy < 6) return
      handleIsVertical.current = dy > dx
      if (!handleIsVertical.current && sheetRef.current) {
        // Horizontal gesture — restore transition so close animation stays smooth.
        sheetRef.current.style.transition = ''
        sheetRef.current.style.transform  = ''
      }
    }
    if (!handleIsVertical.current) return
    const delta = Math.max(0, handleCurrentY.current - handleStartY.current)
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${delta}px)`
  }
  const onHandleTouchEnd = () => {
    if (sheetRef.current) {
      sheetRef.current.style.transition = ''
      sheetRef.current.style.transform  = ''
    }
    const delta = handleCurrentY.current - (handleStartY.current ?? handleCurrentY.current)
    handleStartY.current     = null
    handleIsVertical.current = null
    if (delta > 80) doClose()
  }

  // Episode logic
  const hasSeasonData = !!(media.season_episodes && Object.keys(media.season_episodes).length > 0)
  const hasEpisodeData = !!(media.episodes && media.episodes > 1)
  const currentSeasonNum = media.current_season || 1
  const maxEpisodesThisSeason = media.season_episodes?.[currentSeasonNum]?.episode_count || media.episodes || 0
  const maxSeasons = hasSeasonData && media.season_episodes
    ? Math.max(...Object.keys(media.season_episodes).map(Number)) : 1
  const isCompleted = media.status === 'completed' || (
    hasEpisodeData && media.current_episode >= maxEpisodesThisSeason &&
    (!hasSeasonData || currentSeasonNum >= maxSeasons)
  )

  const btnBase = 'w-12 h-12 flex items-center justify-center leading-none select-none bg-zinc-800 border border-zinc-700 hover:border-emerald-500/50 rounded-2xl text-emerald-400 text-2xl font-bold transition disabled:opacity-30'

  return (
    <div data-no-swipe className={`fixed inset-0 z-[110] flex flex-col justify-end transition-opacity duration-200 ${visible && !closing ? 'opacity-100' : 'opacity-0'}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={doClose} />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`relative z-10 bg-zinc-900 rounded-t-3xl max-h-[90vh] flex flex-col transition-transform duration-[240ms] ease-out ${visible && !closing ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* Drag handle */}
        <div
          className="flex-shrink-0 pt-3 pb-1 touch-none cursor-grab"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
          <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto" />
        </div>

        {/* Header: title + type badge + close — draggable to dismiss */}
        <div
          className="flex-shrink-0 flex items-center gap-3 px-4 py-3 touch-none cursor-grab"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
          <span className={`text-[10px] font-bold text-white px-2.5 py-1 rounded-full flex-shrink-0 ${TYPE_COLORS[media.type] || 'bg-zinc-700'}`}>
            {TYPE_LABELS[media.type] || media.type}
          </span>
          <h3 className="flex-1 min-w-0 font-bold text-white text-[15px] leading-snug line-clamp-2">{media.title}</h3>
          <button
            onClick={doClose}
            onTouchStart={e => e.stopPropagation()}
            aria-label="Chiudi"
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-800 text-zinc-500 hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div
          ref={bodyRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 space-y-5"
          style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 1rem)' }}
        >

          {/* Cover */}
          {(media.cover_image && !imgFailed) && (
            <div className="flex justify-center">
              <div className="w-32 rounded-2xl overflow-hidden bg-zinc-800 flex-shrink-0" style={{ aspectRatio: '2/3' }}>
                <img
                  src={optimizeCover(media.cover_image, 'profile-cover')}
                  alt={media.title}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                  onError={() => setImgFailed(true)}
                />
              </div>
            </div>
          )}

          {/* Stars */}
          <div>
            <p className="text-xs text-zinc-500 mb-2 font-medium">Valutazione</p>
            <StarRating
              value={media.rating || 0}
              onChange={isOwner ? r => onRating?.(media.id, r) : undefined}
              size={26}
              viewOnly={!isOwner}
            />
          </div>

          {/* Status — tv/anime only */}
          {(media.type === 'tv' || media.type === 'anime') && isOwner && (
            <div>
              <p className="text-xs text-zinc-500 mb-2 font-medium">Stato</p>
              <select
                value={media.status || 'watching'}
                onChange={e => onStatusChange?.(media.id, e.target.value)}
                className="w-full text-sm font-medium px-4 py-3 rounded-2xl border bg-zinc-800 border-zinc-700 text-white focus:outline-none focus:border-zinc-600 transition cursor-pointer appearance-none"
              >
                <option value="watching">In corso</option>
                <option value="completed">Completato</option>
                <option value="paused">In pausa</option>
                <option value="dropped">Abbandonato</option>
                <option value="wishlist">Wishlist</option>
              </select>
            </div>
          )}

          {/* Progress */}
          {media.type === 'game' ? (() => {
            const ach = media.achievement_data
            const hours = media.current_episode || 0
            return (
              <div className="space-y-3">
                {hours > 0 && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-2 font-medium">Ore di gioco</p>
                    <span className="inline-flex items-center gap-2 text-sm text-zinc-300 bg-zinc-800 px-3 py-2 rounded-2xl">
                      <Clock size={14} className="text-zinc-500" />{hours}h
                    </span>
                  </div>
                )}
                {ach && ach.tot > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-zinc-500 mb-1.5 font-medium">
                      <span>Achievement</span>
                      <span className="font-mono text-zinc-400">{ach.curr}/{ach.tot}</span>
                    </div>
                    <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-[#107c10] rounded-full" style={{ width: `${Math.round((ach.curr / ach.tot) * 100)}%` }} />
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
              <div className="space-y-3">
                <p className="text-xs text-zinc-500 font-medium">Capitoli</p>
                {isChCompleted ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400">
                      <CheckCircle size={18} />
                      <span className="font-semibold">Completato</span>
                    </div>
                    {isOwner && (
                      <button onClick={() => onSaveProgress?.(media.id, 0)} className="p-2 text-zinc-500 hover:text-zinc-300 rounded-xl bg-zinc-800 transition">
                        <RotateCcw size={16} />
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      {isOwner && (
                        <button onClick={() => onSaveProgress?.(media.id, Math.max(0, current - 1))} disabled={current <= 0} className={btnBase}>−</button>
                      )}
                      <div className="flex-1 text-center text-2xl font-bold">
                        {isOwner
                          ? <InlineChapterInput value={current} max={maxCh} onSave={n => onSaveProgress?.(media.id, n)} />
                          : <span className="text-emerald-400">{current}</span>
                        }
                        {maxCh && <span className="text-zinc-400 text-lg"> / {maxCh}</span>}
                      </div>
                      {isOwner && (
                        <button onClick={() => onSaveProgress?.(media.id, Math.min(current + 1, maxCh ?? current + 1))} className={btnBase}>+</button>
                      )}
                    </div>
                    {maxCh && (
                      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((current / maxCh) * 100))}%` }} />
                      </div>
                    )}
                    {isOwner && !maxCh && (
                      <button onClick={() => onEnrichEpisodes?.(media.id)} disabled={enriching} className="flex items-center gap-2 text-sm text-zinc-500 hover:text-[var(--accent)] transition disabled:opacity-50">
                        {enriching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        {enriching ? 'Recupero…' : 'Recupera totale capitoli'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })() : (media.type === 'tv' || media.type === 'anime') ? (() => {
            if (!hasEpisodeData) {
              return isOwner ? (
                <div>
                  <p className="text-xs text-zinc-500 mb-2 font-medium">Episodi</p>
                  <button onClick={() => onEnrichEpisodes?.(media.id)} disabled={enriching} className="flex items-center gap-2 text-sm text-zinc-500 hover:text-[var(--accent)] transition disabled:opacity-50">
                    {enriching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {enriching ? 'Recupero…' : 'Recupera dati episodi'}
                  </button>
                </div>
              ) : null
            }
            if (isCompleted) {
              return (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle size={18} />
                    <span className="font-semibold">Completato</span>
                  </div>
                  {isOwner && (
                    <button onClick={() => onReset?.(media.id)} className="p-2 text-zinc-500 hover:text-zinc-300 rounded-xl bg-zinc-800 transition">
                      <RotateCcw size={16} />
                    </button>
                  )}
                </div>
              )
            }
            return (
              <div className="space-y-4">
                {hasSeasonData && (
                  <div>
                    <p className="text-xs text-zinc-500 mb-2 font-medium">Stagione</p>
                    <div className="flex items-center gap-3">
                      {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.max(1, currentSeasonNum - 1), 'current_season')} disabled={currentSeasonNum <= 1} className={btnBase}>−</button>}
                      <div className="flex-1 text-center text-emerald-400 text-xl font-bold">Stagione {currentSeasonNum}</div>
                      {isOwner && <button onClick={() => { if (currentSeasonNum < maxSeasons) onSaveProgress?.(media.id, currentSeasonNum + 1, 'current_season') }} disabled={currentSeasonNum >= maxSeasons} className={btnBase}>+</button>}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs text-zinc-500 mb-2 font-medium">Episodio</p>
                  <div className="flex items-center gap-3">
                    {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.max(1, media.current_episode - 1))} disabled={media.current_episode <= 1} className={btnBase}>−</button>}
                    <div className="flex-1 text-center">
                      <span className="text-2xl font-bold text-emerald-400">{media.current_episode}</span>
                      <span className="text-zinc-600 text-lg"> / {maxEpisodesThisSeason}</span>
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => {
                          const next = media.current_episode + 1
                          if (next <= maxEpisodesThisSeason) onSaveProgress?.(media.id, next)
                          else onMarkComplete?.(media.id, media)
                        }}
                        className={btnBase}
                      >+</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })() : null}

          {/* Notes */}
          {isOwner && (
            <button
              onClick={() => onNotes?.(media)}
              className={`w-full py-3 rounded-2xl border text-sm flex items-center justify-center gap-2 transition font-medium ${
                media.notes?.trim()
                  ? ''
                  : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
              style={media.notes?.trim() ? { borderColor: 'rgba(230,255,61,0.3)', background: 'rgba(230,255,61,0.06)', color: 'var(--accent)' } : {}}
            >
              <Edit3 size={15} />
              {media.notes?.trim() ? 'Modifica note' : 'Aggiungi note'}
            </button>
          )}

          {/* Delete — separated, unambiguous */}
          {isOwner && (
            <div className="pt-1 border-t border-zinc-800">
              {confirmDelete ? (
                <div className="flex gap-2 pt-3">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-3 rounded-2xl border border-zinc-700 text-sm text-zinc-400 font-medium transition"
                  >
                    Annulla
                  </button>
                  <button
                    onClick={() => { onDelete?.(media.id); doClose() }}
                    className="flex-1 py-3 rounded-2xl bg-red-900/60 border border-red-800 text-sm text-red-300 font-medium transition"
                  >
                    Conferma rimozione
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-3 mt-3 rounded-2xl border border-zinc-800 text-sm text-zinc-600 hover:text-red-400 hover:border-red-900/40 transition flex items-center justify-center gap-2"
                >
                  <Trash2 size={14} />
                  Rimuovi dalla libreria
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}