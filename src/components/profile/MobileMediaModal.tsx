'use client'

import { useState, useRef, useEffect } from 'react'
import { X, Edit3, CheckCircle, RotateCcw, RefreshCw, Loader2, Clock, Trash2, Sparkles } from 'lucide-react'
import { StarRating } from '@/components/ui/StarRating'
import { gestureState } from '@/hooks/gestureState'
import { androidBack } from '@/hooks/androidBack'
import { optimizeCover } from '@/lib/imageOptimizer'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'

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
        className="w-14 bg-transparent p-0 text-center text-2xl font-black text-[var(--accent)] outline-none border-b-2 border-[rgba(230,255,61,0.45)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    )
  }

  return (
    <span
      onClick={() => { setDraft(value.toString()); setEditing(true) }}
      className="cursor-text select-none font-black text-[var(--accent)] underline decoration-dotted underline-offset-4"
    >
      {value}
    </span>
  )
}

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="gk-label mb-2">{children}</p>
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

  const sheetRef = useRef<HTMLDivElement>(null)
  const handleStartY = useRef<number | null>(null)
  const handleCurrentY = useRef<number>(0)
  const handleStartX = useRef(0)
  const handleIsVertical = useRef<boolean | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const bodyRef = useRef<HTMLDivElement>(null)
  const bodyTouchStartY = useRef<number | null>(null)
  const bodyTouchStartX = useRef<number>(0)
  const bodyIsVertical = useRef<boolean | null>(null)
  const bodyDismissing = useRef<boolean>(false)

  useEffect(() => {
    gestureState.drawerActive = true
    return () => { gestureState.drawerActive = false }
  }, [])

  useEffect(() => {
    const closeModal = () => {
      setClosing(true)
      setTimeout(() => onCloseRef.current(), 240)
    }
    androidBack.push(closeModal)
    return () => androidBack.pop(closeModal)
  }, [])

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const doClose = () => {
    if (closing) return
    setClosing(true)
    setTimeout(onClose, 240)
  }

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return

    const onStart = (e: TouchEvent) => {
      const x = e.touches[0].clientX
      if (x <= 20 || x >= window.innerWidth - 20) return
      bodyTouchStartY.current = e.touches[0].clientY
      bodyTouchStartX.current = x
      bodyIsVertical.current = null
      bodyDismissing.current = false
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
          sheetRef.current.style.transform = `translateY(${Math.max(0, dy)}px)`
        }
      } else {
        bodyDismissing.current = false
        if (sheetRef.current) {
          sheetRef.current.style.transition = ''
          sheetRef.current.style.transform = ''
        }
      }
    }

    const onEnd = (e: TouchEvent) => {
      if (sheetRef.current) {
        sheetRef.current.style.transition = ''
        sheetRef.current.style.transform = ''
      }
      const dy = bodyTouchStartY.current !== null ? e.changedTouches[0].clientY - bodyTouchStartY.current : 0
      bodyTouchStartY.current = null
      bodyIsVertical.current = null
      if (bodyDismissing.current && dy > 80) doClose()
      bodyDismissing.current = false
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [])

  const onHandleTouchStart = (e: React.TouchEvent) => {
    const x = e.touches[0].clientX
    if (x <= 20 || x >= window.innerWidth - 20) return
    handleStartY.current = e.touches[0].clientY
    handleCurrentY.current = e.touches[0].clientY
    handleStartX.current = x
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
        sheetRef.current.style.transition = ''
        sheetRef.current.style.transform = ''
      }
    }
    if (!handleIsVertical.current) return
    const delta = Math.max(0, handleCurrentY.current - handleStartY.current)
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${delta}px)`
  }
  const onHandleTouchEnd = () => {
    if (sheetRef.current) {
      sheetRef.current.style.transition = ''
      sheetRef.current.style.transform = ''
    }
    const delta = handleCurrentY.current - (handleStartY.current ?? handleCurrentY.current)
    handleStartY.current = null
    handleIsVertical.current = null
    if (delta > 80) doClose()
  }

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

  const btnBase = 'flex h-12 w-12 select-none items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-2xl font-black leading-none text-[var(--accent)] transition hover:border-[rgba(230,255,61,0.45)] disabled:opacity-30'

  return (
    <div data-no-swipe className={`fixed inset-0 z-[110] flex flex-col justify-end transition-opacity duration-200 ${visible && !closing ? 'opacity-100' : 'opacity-0'}`}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={doClose} />

      <div
        ref={sheetRef}
        className={`relative z-10 flex max-h-[90vh] flex-col rounded-t-[32px] border-t border-[rgba(230,255,61,0.14)] bg-[var(--bg-primary)] shadow-[0_-24px_80px_rgba(0,0,0,0.55)] transition-transform duration-[240ms] ease-out ${visible && !closing ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div
          className="flex-shrink-0 cursor-grab touch-none pb-1 pt-3"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
          <div className="mx-auto h-1 w-11 rounded-full bg-[var(--border)]" />
        </div>

        <div
          className="flex-shrink-0 touch-none cursor-grab border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(230,255,61,0.08),rgba(139,92,246,0.055),transparent)] px-4 pb-4 pt-2"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
          <div className="flex items-start gap-3">
            <div className="h-20 w-14 flex-shrink-0 overflow-hidden rounded-2xl bg-[var(--bg-card)] ring-1 ring-white/10">
              {media.cover_image && !imgFailed ? (
                <img
                  src={optimizeCover(media.cover_image, 'profile-cover')}
                  alt={media.title}
                  className="h-full w-full object-cover"
                  loading="eager"
                  decoding="async"
                  onError={() => setImgFailed(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
                  <Sparkles size={20} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <MediaTypeBadge type={media.type} size="xs" className="flex-shrink-0" />
                {isCompleted && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    <CheckCircle size={10} /> completato
                  </span>
                )}
              </div>
              <h3 className="line-clamp-2 text-[16px] font-black leading-tight text-[var(--text-primary)]">{media.title}</h3>
              <p className="gk-mono mt-1 text-[var(--text-muted)]">quick edit</p>
            </div>
            <button
              onClick={doClose}
              onTouchStart={e => e.stopPropagation()}
              aria-label="Chiudi"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-black/20 text-[var(--text-secondary)] transition hover:text-white"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div
          ref={bodyRef}
          className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pt-4"
          style={{ paddingBottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 1rem)' }}
        >
          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <SectionLabel>Valutazione</SectionLabel>
            <StarRating
              value={media.rating || 0}
              onChange={isOwner ? r => onRating?.(media.id, r) : undefined}
              size={26}
              viewOnly={!isOwner}
            />
          </div>

          {(media.type === 'tv' || media.type === 'anime') && isOwner && (
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <SectionLabel>Stato</SectionLabel>
              <select
                value={media.status || 'watching'}
                onChange={e => onStatusChange?.(media.id, e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm font-bold text-[var(--text-primary)] outline-none transition focus:border-[rgba(230,255,61,0.45)]"
              >
                <option value="watching">In corso</option>
                <option value="completed">Completato</option>
                <option value="paused">In pausa</option>
                <option value="dropped">Abbandonato</option>
                <option value="wishlist">Wishlist</option>
              </select>
            </div>
          )}

          <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
            {media.type === 'game' ? (() => {
              const ach = media.achievement_data
              const hours = media.current_episode || 0
              return (
                <div className="space-y-3">
                  {hours > 0 && (
                    <div>
                      <SectionLabel>Ore di gioco</SectionLabel>
                      <span className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm font-bold text-[var(--text-secondary)]">
                        <Clock size={14} className="text-[var(--text-muted)]" />{hours}h
                      </span>
                    </div>
                  )}
                  {ach && ach.tot > 0 && (
                    <div>
                      <div className="mb-1.5 flex justify-between text-xs font-bold text-[var(--text-muted)]">
                        <span>Achievement</span>
                        <span className="font-mono-data text-[var(--text-secondary)]">{ach.curr}/{ach.tot}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-black/30">
                        <div className="h-full rounded-full bg-[#107c10]" style={{ width: `${Math.round((ach.curr / ach.tot) * 100)}%` }} />
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
                  <SectionLabel>Capitoli</SectionLabel>
                  {isChCompleted ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle size={18} />
                        <span className="font-bold">Completato</span>
                      </div>
                      {isOwner && (
                        <button onClick={() => onSaveProgress?.(media.id, 0)} className="rounded-xl bg-[var(--bg-secondary)] p-2 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
                          <RotateCcw size={16} />
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.max(0, current - 1))} disabled={current <= 0} className={btnBase}>−</button>}
                        <div className="flex-1 text-center text-2xl font-black">
                          {isOwner ? <InlineChapterInput value={current} max={maxCh} onSave={n => onSaveProgress?.(media.id, n)} /> : <span className="text-[var(--accent)]">{current}</span>}
                          {maxCh && <span className="text-lg text-[var(--text-muted)]"> / {maxCh}</span>}
                        </div>
                        {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.min(current + 1, maxCh ?? current + 1))} className={btnBase}>+</button>}
                      </div>
                      {maxCh && (
                        <div className="h-2 overflow-hidden rounded-full bg-black/30">
                          <div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.min(100, Math.round((current / maxCh) * 100))}%` }} />
                        </div>
                      )}
                      {isOwner && !maxCh && (
                        <button onClick={() => onEnrichEpisodes?.(media.id)} disabled={enriching} className="flex items-center gap-2 text-sm text-[var(--text-muted)] transition hover:text-[var(--accent)] disabled:opacity-50">
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
                    <SectionLabel>Episodi</SectionLabel>
                    <button onClick={() => onEnrichEpisodes?.(media.id)} disabled={enriching} className="flex items-center gap-2 text-sm text-[var(--text-muted)] transition hover:text-[var(--accent)] disabled:opacity-50">
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
                      <span className="font-bold">Completato</span>
                    </div>
                    {isOwner && (
                      <button onClick={() => onReset?.(media.id)} className="rounded-xl bg-[var(--bg-secondary)] p-2 text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
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
                      <SectionLabel>Stagione</SectionLabel>
                      <div className="flex items-center gap-3">
                        {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.max(1, currentSeasonNum - 1), 'current_season')} disabled={currentSeasonNum <= 1} className={btnBase}>−</button>}
                        <div className="flex-1 text-center text-xl font-black text-[var(--accent)]">Stagione {currentSeasonNum}</div>
                        {isOwner && <button onClick={() => { if (currentSeasonNum < maxSeasons) onSaveProgress?.(media.id, currentSeasonNum + 1, 'current_season') }} disabled={currentSeasonNum >= maxSeasons} className={btnBase}>+</button>}
                      </div>
                    </div>
                  )}
                  <div>
                    <SectionLabel>Episodio</SectionLabel>
                    <div className="flex items-center gap-3">
                      {isOwner && <button onClick={() => onSaveProgress?.(media.id, Math.max(1, media.current_episode - 1))} disabled={media.current_episode <= 1} className={btnBase}>−</button>}
                      <div className="flex-1 text-center">
                        <span className="text-2xl font-black text-[var(--accent)]">{media.current_episode}</span>
                        <span className="text-lg text-[var(--text-muted)]"> / {maxEpisodesThisSeason}</span>
                      </div>
                      {isOwner && (
                        <button onClick={() => { const next = media.current_episode + 1; if (next <= maxEpisodesThisSeason) onSaveProgress?.(media.id, next); else onMarkComplete?.(media.id, media) }} className={btnBase}>+</button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })() : <p className="gk-caption">Nessun progresso da modificare per questo media.</p>}
          </div>

          {isOwner && (
            <button
              onClick={() => onNotes?.(media)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border py-3 text-sm font-bold transition"
              style={media.notes?.trim()
                ? { borderColor: 'rgba(230,255,61,0.3)', background: 'rgba(230,255,61,0.06)', color: 'var(--accent)' }
                : { borderColor: 'var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}
            >
              <Edit3 size={15} />
              {media.notes?.trim() ? 'Modifica note' : 'Aggiungi note'}
            </button>
          )}

          {isOwner && (
            <div className="border-t border-[var(--border)] pt-3">
              {confirmDelete ? (
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-2xl border border-[var(--border)] py-3 text-sm font-bold text-[var(--text-secondary)] transition hover:text-white">
                    Annulla
                  </button>
                  <button onClick={() => { onDelete?.(media.id); doClose() }} className="flex-1 rounded-2xl border border-red-800 bg-red-900/50 py-3 text-sm font-bold text-red-300 transition">
                    Conferma rimozione
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border)] py-3 text-sm text-[var(--text-muted)] transition hover:border-red-900/50 hover:text-red-400">
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
