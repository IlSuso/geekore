'use client'
// DESTINAZIONE: src/components/for-you/SwipeMode.tsx
// v4: half-stars senza flash, categorie centrate, testo sempre visibile,
//     skip persistente su Supabase, mix consigli + opere belle (isDiscovery)

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Check, ChevronRight, Star, Gamepad2, Tv, Film, Layers, Swords, RotateCcw } from 'lucide-react'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'
import { createClient } from '@/lib/supabase/client'

// ─── Tipi ────────────────────────────────────────────────────────────────────

type SwipeMediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game'

export interface SwipeItem {
  id: string
  title: string
  type: SwipeMediaType
  coverImage?: string
  year?: number
  genres: string[]
  score?: number
  description?: string
  why?: string
  matchScore: number
  episodes?: number
  authors?: string[]
  developers?: string[]
  platforms?: string[]
  isAwardWinner?: boolean
  source?: string
  isDiscovery?: boolean // true = opera bella non per forza in linea coi gusti
}

type CategoryFilter = 'all' | SwipeMediaType

interface SwipeModeProps {
  items: SwipeItem[]
  onSeen: (item: SwipeItem, rating: number | null) => void
  onClose: () => void
  onRequestMore: (filter?: CategoryFilter) => Promise<SwipeItem[]>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<SwipeMediaType, React.ElementType> = {
  anime: Swords, manga: Layers, movie: Film, tv: Tv, game: Gamepad2,
}
const TYPE_LABEL: Record<SwipeMediaType, string> = {
  anime: 'Anime', manga: 'Manga', movie: 'Film', tv: 'Serie TV', game: 'Gioco',
}
const TYPE_COLORS: Record<SwipeMediaType, string> = {
  anime: 'from-sky-500 to-blue-600',
  manga: 'from-orange-500 to-red-500',
  movie: 'from-red-500 to-rose-600',
  tv: 'from-purple-500 to-violet-600',
  game: 'from-emerald-500 to-green-600',
}

const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'Tutti' },
  { key: 'anime', label: 'Anime' },
  { key: 'manga', label: 'Manga' },
  { key: 'movie', label: 'Film' },
  { key: 'tv', label: 'Serie TV' },
  { key: 'game', label: 'Giochi' },
]

const SWIPE_THRESHOLD = 80
const ROTATION_FACTOR = 0.08
const REFILL_THRESHOLD = 20

// Stili per visibilità garantita su qualsiasi copertina
const TEXT_SHADOW = { textShadow: '0 1px 6px rgba(0,0,0,1), 0 2px 16px rgba(0,0,0,0.9)' }
const ICON_DROP = { filter: 'drop-shadow(0 1px 4px rgba(0,0,0,1)) drop-shadow(0 0 2px rgba(0,0,0,0.8))' }

// ─── HalfStarRating ──────────────────────────────────────────────────────────
// Fix flash: onMouseMove aggiorna lo stato solo se il valore cambia realmente.
// La chiave è che setHovered usa la funzione con prev => per evitare re-render
// inutili quando si sposta il mouse all'interno della stessa "zona" della stella.

function HalfStarRating({ rating, onChange }: { rating: number | null; onChange: (r: number | null) => void }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const displayValue = hovered !== null ? hovered : (rating ?? 0)

  const computeValue = (clientX: number, el: HTMLElement, star: number): number => {
    const rect = el.getBoundingClientRect()
    const isLeft = (clientX - rect.left) < rect.width / 2
    return isLeft ? star - 0.5 : star
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map(star => {
        const full = displayValue >= star
        const half = !full && displayValue >= star - 0.5

        return (
          <button
            key={star}
            className="relative w-8 h-8 flex items-center justify-center touch-none select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            onMouseMove={e => {
              const next = computeValue(e.clientX, e.currentTarget, star)
              // Aggiorna SOLO se il valore cambia — elimina il flash giallo
              setHovered(prev => prev === next ? prev : next)
            }}
            onMouseLeave={() => setHovered(null)}
            onClick={e => {
              e.stopPropagation()
              const value = computeValue(e.clientX, e.currentTarget, star)
              onChange(rating === value ? null : value)
            }}
            onTouchStart={e => {
              e.preventDefault()
              const value = computeValue(e.touches[0].clientX, e.currentTarget, star)
              setHovered(value)
            }}
            onTouchMove={e => {
              e.preventDefault()
              // Su touch, ricalcola la stella corrente dal touch point
              const touch = e.touches[0]
              const els = document.elementsFromPoint(touch.clientX, touch.clientY)
              const starEl = els.find(el => el.hasAttribute('data-star')) as HTMLElement | undefined
              if (starEl) {
                const s = parseInt(starEl.getAttribute('data-star') || '0')
                if (s > 0) {
                  const value = computeValue(touch.clientX, starEl, s)
                  setHovered(prev => prev === value ? prev : value)
                }
              }
            }}
            onTouchEnd={e => {
              e.preventDefault()
              if (hovered !== null) onChange(rating === hovered ? null : hovered)
              setHovered(null)
            }}
            data-star={star}
          >
            {/* Base vuota */}
            <Star size={28} className="absolute text-white/25" fill="none" strokeWidth={1.5}
              style={ICON_DROP} />
            {/* Piena */}
            {full && (
              <Star size={28} className="absolute text-amber-400" fill="currentColor" strokeWidth={0}
                style={{ filter: 'drop-shadow(0 0 7px rgba(251,191,36,0.85)) drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }} />
            )}
            {/* Mezza */}
            {half && (
              <Star size={28} className="absolute text-amber-400" fill="currentColor" strokeWidth={0}
                style={{ clipPath: 'inset(0 50% 0 0)', filter: 'drop-shadow(0 0 7px rgba(251,191,36,0.85)) drop-shadow(0 1px 3px rgba(0,0,0,0.9))' }} />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── SwipeCard ────────────────────────────────────────────────────────────────

interface SwipeCardProps {
  item: SwipeItem
  isTop: boolean
  stackIndex: number
  onSwipe: (direction: 'left' | 'right', item: SwipeItem) => void
  rating: number | null
  onRatingChange: (r: number | null) => void
  onDetailOpen: (item: SwipeItem) => void
  onUndo: () => void
  canUndo: boolean
  onClose: () => void
}

function SwipeCard({
  item, isTop, stackIndex, onSwipe, rating, onRatingChange, onDetailOpen, onUndo, canUndo, onClose
}: SwipeCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const currentX = useRef(0)
  const isDragging = useRef(false)
  const [dragX, setDragX] = useState(0)
  const [isFlying, setIsFlying] = useState(false)
  const [flyDirection, setFlyDirection] = useState<'left' | 'right' | null>(null)

  const Icon = TYPE_ICONS[item.type]
  const colorClass = TYPE_COLORS[item.type]

  const triggerSwipe = useCallback((direction: 'left' | 'right') => {
    setFlyDirection(direction)
    setIsFlying(true)
    setTimeout(() => { onSwipe(direction, item) }, 340)
  }, [item, onSwipe])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isTop) return
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    isDragging.current = true
    startX.current = e.clientX
    currentX.current = 0
    cardRef.current?.setPointerCapture(e.pointerId)
  }, [isTop])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !isTop) return
    const dx = e.clientX - startX.current
    currentX.current = dx
    setDragX(dx)
  }, [isTop])

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return
    isDragging.current = false
    const dx = currentX.current
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      triggerSwipe(dx > 0 ? 'right' : 'left')
    } else {
      setDragX(0)
    }
  }, [triggerSwipe])

  const stackScale = 1 - stackIndex * 0.04
  const stackY = stackIndex * 10
  const rotation = isFlying ? (flyDirection === 'right' ? 22 : -22) : dragX * ROTATION_FACTOR
  const translateX = isFlying ? (flyDirection === 'right' ? '160%' : '-160%') : `${dragX}px`
  const cardOpacity = isFlying ? 0 : 1 - stackIndex * 0.12
  const swipeProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1)
  const showRight = dragX > 20
  const showLeft = dragX < -20

  if (stackIndex > 2) return null

  return (
    <div
      ref={cardRef}
      className={`absolute inset-0 select-none ${isTop ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
      style={{
        transform: isTop
          ? `translateX(${translateX}) rotate(${rotation}deg)`
          : `scale(${stackScale}) translateY(${stackY}px)`,
        transition: isDragging.current ? 'none' : 'transform 0.34s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.34s ease',
        opacity: cardOpacity,
        zIndex: 10 - stackIndex,
        willChange: 'transform',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="relative w-full h-full rounded-3xl overflow-hidden bg-zinc-900 shadow-2xl shadow-black/80">
        {item.coverImage ? (
          <img src={item.coverImage} alt={item.title}
            className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <Icon size={64} className="text-zinc-700" />
          </div>
        )}

        {/* Gradienti robusti — garantiscono leggibilità su copertine chiare o scure */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/5 to-black/45" />

        {/* X Chiudi — in alto a destra nella card */}
        <button
          onClick={e => { e.stopPropagation(); onClose() }}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/75 active:scale-90 transition-all z-20"
          style={ICON_DROP}
        >
          <X size={17} strokeWidth={2.5} />
        </button>

        {/* Badge tipo */}
        <div className="absolute top-3 left-3 z-10">
          <div className={`bg-gradient-to-r ${colorClass} text-white text-xs font-bold px-3 py-1 rounded-full`}
            style={ICON_DROP}>
            {TYPE_LABEL[item.type]}
          </div>
        </div>

        {/* Badge match / scoperta */}
        {!item.isDiscovery && item.matchScore >= 75 && (
          <div className="absolute top-12 left-3 z-10">
            <div className="flex items-center gap-1 bg-violet-600/90 backdrop-blur-sm text-white text-xs font-black px-2.5 py-1 rounded-full"
              style={ICON_DROP}>
              <Star size={10} fill="currentColor" />{item.matchScore}%
            </div>
          </div>
        )}
        {item.isDiscovery && (
          <div className="absolute top-12 left-3 z-10">
            <div className="flex items-center gap-1 bg-emerald-600/90 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full"
              style={ICON_DROP}>
              ✨ Scoperta
            </div>
          </div>
        )}

        {/* Swipe indicators */}
        {isTop && (
          <>
            <div
              className="absolute top-16 left-5 border-[3px] border-emerald-400 text-emerald-400 font-black text-xl px-4 py-1.5 rounded-2xl tracking-widest uppercase rotate-[-18deg] pointer-events-none z-10"
              style={{ opacity: showRight ? swipeProgress : 0, transition: 'opacity 0.08s', ...TEXT_SHADOW }}
            >Visto ✓</div>
            <div
              className="absolute top-16 right-5 border-[3px] border-red-400 text-red-400 font-black text-xl px-4 py-1.5 rounded-2xl tracking-widest uppercase rotate-[18deg] pointer-events-none z-10"
              style={{ opacity: showLeft ? swipeProgress : 0, transition: 'opacity 0.08s', ...TEXT_SHADOW }}
            >Skip ✗</div>
          </>
        )}

        {/* Contenuto in basso */}
        <div className="absolute bottom-0 left-0 right-0 p-5 pb-4 z-10">
          <h2 className="text-white font-bold text-[22px] leading-tight mb-1 line-clamp-2" style={TEXT_SHADOW}>
            {item.title}
          </h2>
          <p className="text-white/75 text-sm mb-4 flex items-center gap-2 flex-wrap" style={TEXT_SHADOW}>
            {item.year && <span>{item.year}</span>}
            {item.episodes && item.type !== 'movie' && (
              <span>{item.type === 'manga' ? `${item.episodes} cap.` : `${item.episodes} ep.`}</span>
            )}
            {item.genres.length > 0 && <span className="text-white/50">· {item.genres.slice(0, 2).join(', ')}</span>}
          </p>

          {/* Stelle — sempre nel DOM su tutte le card per evitare layout shift */}
          <div className={`flex items-center justify-center mb-4 ${!isTop ? 'opacity-0 pointer-events-none' : ''}`}>
            <HalfStarRating rating={rating} onChange={onRatingChange} />
          </div>

          {/* Azioni */}
          <div className="flex items-center justify-between">
            {/* Annulla — stile Tinder, basso sinistra */}
            <button
              onClick={e => { e.stopPropagation(); if (isTop && canUndo) onUndo() }}
              disabled={!canUndo || !isTop}
              className="flex items-center gap-1.5 px-2 py-2 rounded-xl text-white/65 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-colors"
              style={TEXT_SHADOW}
            >
              <RotateCcw size={14} style={ICON_DROP} />
              <span className="text-xs font-medium">Annulla</span>
            </button>

            {/* Skip · Info · Visto */}
            <div className="flex items-center gap-4">
              <button
                onClick={e => { e.stopPropagation(); if (isTop) triggerSwipe('left') }}
                className={`w-14 h-14 rounded-full bg-red-500/20 border-2 border-red-400/60 flex items-center justify-center text-red-400 hover:bg-red-500/35 hover:border-red-400 active:scale-90 transition-all ${!isTop ? 'opacity-0 pointer-events-none' : ''}`}
                style={ICON_DROP}
              >
                <X size={24} strokeWidth={3} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); if (isTop) onDetailOpen(item) }}
                className={`w-10 h-10 rounded-full bg-white/15 border border-white/35 flex items-center justify-center text-white/75 hover:bg-white/25 hover:text-white active:scale-90 transition-all ${!isTop ? 'opacity-0 pointer-events-none' : ''}`}
                style={ICON_DROP}
              >
                <ChevronRight size={20} strokeWidth={2.5} />
              </button>
              <button
                onClick={e => { e.stopPropagation(); if (isTop) triggerSwipe('right') }}
                className={`w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-400/60 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/35 hover:border-emerald-400 active:scale-90 transition-all ${!isTop ? 'opacity-0 pointer-events-none' : ''}`}
                style={ICON_DROP}
              >
                <Check size={24} strokeWidth={3} />
              </button>
            </div>

            {/* Spacer simmetrico */}
            <div className="w-[72px]" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── SwipeMode ────────────────────────────────────────────────────────────────

export function SwipeMode({ items: initialItems, onSeen, onClose, onRequestMore }: SwipeModeProps) {
  const supabase = createClient()
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all')
  const [queue, setQueue] = useState<SwipeItem[]>(initialItems)
  const [currentRating, setCurrentRating] = useState<number | null>(null)
  const [detailItem, setDetailItem] = useState<MediaDetails | null>(null)
  const [history, setHistory] = useState<SwipeItem[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set(initialItems.map(i => i.id)))
  const loadingRef = useRef(false)

  // Carica gli ID già skippati per non riproporli mai
  useEffect(() => {
    const loadSkipped = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('swipe_skipped')
        .select('external_id')
        .eq('user_id', user.id)
      if (data && data.length > 0) {
        const ids = new Set(data.map((r: any) => r.external_id as string))
        setSkippedIds(ids)
        setQueue(prev => prev.filter(i => !ids.has(i.id)))
      }
    }
    loadSkipped()
  }, [])

  useEffect(() => { setCurrentRating(null) }, [queue[0]?.id])

  // Coda filtrata (categoria + già skippati)
  const filteredQueue = (activeFilter === 'all'
    ? queue
    : queue.filter(i => i.type === activeFilter)
  ).filter(i => !skippedIds.has(i.id))

  const loadMore = useCallback(async (filter: CategoryFilter) => {
    if (loadingRef.current) return
    loadingRef.current = true
    setIsLoadingMore(true)
    try {
      const newItems = await onRequestMore(filter)
      const fresh = newItems.filter(i => !seenIds.has(i.id) && !skippedIds.has(i.id))
      if (fresh.length > 0) {
        setQueue(prev => [...prev, ...fresh])
        setSeenIds(prev => {
          const next = new Set(prev)
          fresh.forEach(i => next.add(i.id))
          return next
        })
      }
    } catch {}
    setIsLoadingMore(false)
    loadingRef.current = false
  }, [onRequestMore, seenIds, skippedIds])

  // Ricarica automatica quando la coda filtrata si assottiglia
  useEffect(() => {
    if (filteredQueue.length <= REFILL_THRESHOLD && !loadingRef.current) {
      loadMore(activeFilter)
    }
  }, [filteredQueue.length, activeFilter])

  const handleFilterChange = useCallback((filter: CategoryFilter) => {
    setActiveFilter(filter)
    setHistory([])
    const available = (filter === 'all' ? queue : queue.filter(i => i.type === filter))
      .filter(i => !skippedIds.has(i.id))
    if (available.length <= REFILL_THRESHOLD) {
      loadMore(filter)
    }
  }, [queue, skippedIds, loadMore])

  const persistSkip = useCallback(async (item: SwipeItem) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    supabase.from('swipe_skipped').upsert(
      { user_id: user.id, external_id: item.id, title: item.title, type: item.type },
      { onConflict: 'user_id,external_id' }
    ).then(() => {}) // fire and forget
  }, [supabase])

  const handleSwipe = useCallback((direction: 'left' | 'right', item: SwipeItem) => {
    setHistory(prev => [item, ...prev].slice(0, 10))
    setQueue(prev => prev.filter(i => i.id !== item.id))

    if (direction === 'right') {
      onSeen(item, currentRating)
    } else {
      // Skip: persiste su Supabase — non verrà mai più mostrata
      setSkippedIds(prev => new Set([...prev, item.id]))
      persistSkip(item)
    }
  }, [currentRating, onSeen, persistSkip])

  const handleUndo = useCallback(() => {
    if (!history.length) return
    const [last, ...rest] = history
    setHistory(rest)
    setQueue(prev => [last, ...prev])
    // Ripristina: rimuovi dallo skipped locale (non tocca Supabase)
    setSkippedIds(prev => {
      const next = new Set(prev)
      next.delete(last.id)
      return next
    })
  }, [history])

  const handleDetailOpen = useCallback((item: SwipeItem) => {
    setDetailItem({
      id: item.id, title: item.title, type: item.type,
      coverImage: item.coverImage, year: item.year, genres: item.genres,
      description: item.description, score: item.score, episodes: item.episodes,
      authors: item.authors, developers: item.developers, platforms: item.platforms,
      why: item.why, matchScore: item.matchScore, isAwardWinner: item.isAwardWinner,
      source: item.source,
    })
  }, [])

  return (
    <>
      <div className="fixed inset-0 bg-black flex flex-col" style={{ zIndex: 9999 }}>

        {/* Filtri categoria — centrati */}
        <div
          className="flex-shrink-0 flex justify-center px-4"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => handleFilterChange(cat.key)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  activeFilter === cat.key
                    ? 'bg-white text-black'
                    : 'bg-white/10 text-white/60 hover:bg-white/15 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Area card */}
        <div className="flex-1 flex items-center justify-center px-4 py-2 min-h-0">
          {filteredQueue.length === 0 && !isLoadingMore ? (
            <div className="text-center px-6">
              <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-violet-500/30">
                <Check size={36} className="text-white" />
              </div>
              <h2 className="text-white text-2xl font-bold mb-2">Hai finito!</h2>
              <p className="text-zinc-400 text-sm mb-8">Aggiorna i consigli per scoprire altri titoli.</p>
              <button onClick={onClose}
                className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-2xl transition-colors">
                Torna ai consigli
              </button>
            </div>
          ) : filteredQueue.length === 0 ? (
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-zinc-500 text-sm">Caricamento nuovi titoli…</p>
            </div>
          ) : (
            <div className="relative w-full max-w-sm" style={{ height: 'min(680px, 82svh)' }}>
              {filteredQueue.slice(0, 3).map((item, idx) => (
                <SwipeCard
                  key={item.id}
                  item={item}
                  isTop={idx === 0}
                  stackIndex={idx}
                  onSwipe={handleSwipe}
                  rating={idx === 0 ? currentRating : null}
                  onRatingChange={setCurrentRating}
                  onDetailOpen={handleDetailOpen}
                  onUndo={handleUndo}
                  canUndo={history.length > 0}
                  onClose={onClose}
                />
              ))}
            </div>
          )}
        </div>

        {/* Hint */}
        {filteredQueue.length > 0 && (
          <div
            className="text-center flex-shrink-0 pointer-events-none select-none"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <p className="text-zinc-700 text-xs">← Skip &nbsp;·&nbsp; Visto →</p>
          </div>
        )}
      </div>

      {detailItem && (
        <div style={{ zIndex: 10000, position: 'fixed', inset: 0 }}>
          <MediaDetailsDrawer media={detailItem} onClose={() => setDetailItem(null)} />
        </div>
      )}
    </>
  )
}