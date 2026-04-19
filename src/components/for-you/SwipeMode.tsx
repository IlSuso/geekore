'use client'
// DESTINAZIONE: src/components/for-you/SwipeMode.tsx
// v2: overlay opaco totale, card infinite (ricarica a 20 rimaste),
//     swipe sinistra = neutro (nessun effetto), no contatore card,
//     swipe destra → dismissed istantaneo nella pagina Per Te

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Check, ChevronRight, Star, Gamepad2, Tv, Film, Layers, Swords, RotateCcw } from 'lucide-react'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'

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
}

interface SwipeModeProps {
  items: SwipeItem[]
  onSeen: (item: SwipeItem, rating: number | null) => void
  onClose: () => void
  onRequestMore: () => Promise<SwipeItem[]>
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

const SWIPE_THRESHOLD = 80
const ROTATION_FACTOR = 0.08
const REFILL_THRESHOLD = 20

// ─── StarRatingInline ─────────────────────────────────────────────────────────

function StarRatingInline({ rating, onChange }: { rating: number | null; onChange: (r: number | null) => void }) {
  const [hovered, setHovered] = useState<number | null>(null)
  return (
    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map(star => {
        const active = hovered !== null ? star <= hovered : rating !== null ? star <= rating : false
        return (
          <button
            key={star}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            onTouchStart={e => { e.preventDefault(); setHovered(star) }}
            onTouchEnd={() => setHovered(null)}
            onClick={() => onChange(rating === star ? null : star)}
            className="transition-transform active:scale-125 touch-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Star
              size={30}
              className={`transition-all duration-150 ${active ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]' : 'text-white/25'}`}
              fill={active ? 'currentColor' : 'none'}
              strokeWidth={active ? 0 : 1.5}
            />
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
}

function SwipeCard({ item, isTop, stackIndex, onSwipe, rating, onRatingChange, onDetailOpen }: SwipeCardProps) {
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

  const stackScale = 1 - stackIndex * 0.045
  const stackY = stackIndex * 12
  const rotation = isFlying ? (flyDirection === 'right' ? 22 : -22) : dragX * ROTATION_FACTOR
  const translateX = isFlying ? (flyDirection === 'right' ? '160%' : '-160%') : `${dragX}px`
  const cardOpacity = isFlying ? 0 : isTop ? 1 : 1 - stackIndex * 0.18
  const swipeProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1)
  const showRight = dragX > 20
  const showLeft = dragX < -20

  if (!isTop && stackIndex > 2) return null

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
          <img src={item.coverImage} alt={item.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <Icon size={64} className="text-zinc-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/10 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent" />

        {/* Badges */}
        <div className="absolute top-4 left-4 pointer-events-none">
          <div className={`bg-gradient-to-r ${colorClass} text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg`}>
            {TYPE_LABEL[item.type]}
          </div>
        </div>
        {item.matchScore >= 75 && (
          <div className="absolute top-4 right-4 pointer-events-none">
            <div className="flex items-center gap-1 bg-violet-600/90 backdrop-blur-sm text-white text-xs font-black px-2.5 py-1 rounded-full shadow-lg">
              <Star size={10} fill="currentColor" />{item.matchScore}%
            </div>
          </div>
        )}

        {/* Swipe indicators */}
        {isTop && (
          <>
            <div
              className="absolute top-14 left-5 border-[3px] border-emerald-400 text-emerald-400 font-black text-xl px-4 py-1.5 rounded-2xl tracking-widest uppercase rotate-[-18deg] pointer-events-none"
              style={{ opacity: showRight ? swipeProgress : 0, transition: 'opacity 0.08s' }}
            >Visto ✓</div>
            <div
              className="absolute top-14 right-5 border-[3px] border-red-400 text-red-400 font-black text-xl px-4 py-1.5 rounded-2xl tracking-widest uppercase rotate-[18deg] pointer-events-none"
              style={{ opacity: showLeft ? swipeProgress : 0, transition: 'opacity 0.08s' }}
            >Skip ✗</div>
          </>
        )}

        {/* Bottom content */}
        <div className="absolute bottom-0 left-0 right-0 p-5 pb-5">
          <h2 className="text-white font-bold text-[22px] leading-tight mb-1 drop-shadow-lg line-clamp-2">{item.title}</h2>
          <p className="text-white/55 text-sm mb-5 flex items-center gap-2 flex-wrap">
            {item.year && <span>{item.year}</span>}
            {item.episodes && item.type !== 'movie' && (
              <span>{item.type === 'manga' ? `${item.episodes} cap.` : `${item.episodes} ep.`}</span>
            )}
            {item.genres.length > 0 && <span className="text-white/35">· {item.genres.slice(0, 2).join(', ')}</span>}
          </p>
          {isTop && (
            <div className="flex items-center justify-center mb-5">
              <StarRatingInline rating={rating} onChange={onRatingChange} />
            </div>
          )}
          {isTop && (
            <div className="flex items-center justify-center gap-5">
              <button onClick={e => { e.stopPropagation(); triggerSwipe('left') }}
                className="w-16 h-16 rounded-full bg-red-500/15 border-2 border-red-400/50 flex items-center justify-center text-red-400 hover:bg-red-500/30 hover:border-red-400 active:scale-90 transition-all shadow-lg">
                <X size={28} strokeWidth={3} />
              </button>
              <button onClick={e => { e.stopPropagation(); onDetailOpen(item) }}
                className="w-11 h-11 rounded-full bg-white/10 border border-white/25 flex items-center justify-center text-white/60 hover:bg-white/20 hover:text-white active:scale-90 transition-all">
                <ChevronRight size={20} strokeWidth={2.5} />
              </button>
              <button onClick={e => { e.stopPropagation(); triggerSwipe('right') }}
                className="w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-400/50 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-400 active:scale-90 transition-all shadow-lg">
                <Check size={28} strokeWidth={3} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── SwipeMode ────────────────────────────────────────────────────────────────

export function SwipeMode({ items: initialItems, onSeen, onClose, onRequestMore }: SwipeModeProps) {
  const [queue, setQueue] = useState<SwipeItem[]>(initialItems)
  const [currentRating, setCurrentRating] = useState<number | null>(null)
  const [detailItem, setDetailItem] = useState<MediaDetails | null>(null)
  const [history, setHistory] = useState<SwipeItem[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set(initialItems.map(i => i.id)))
  const loadingRef = useRef(false)

  useEffect(() => { setCurrentRating(null) }, [queue[0]?.id])

  // Ricarica automatica a ≤ REFILL_THRESHOLD card rimaste
  useEffect(() => {
    if (queue.length <= REFILL_THRESHOLD && !loadingRef.current) {
      loadingRef.current = true
      setIsLoadingMore(true)
      onRequestMore().then(newItems => {
        const fresh = newItems.filter(i => !seenIds.has(i.id))
        if (fresh.length > 0) {
          setQueue(prev => [...prev, ...fresh])
          setSeenIds(prev => {
            const next = new Set(prev)
            fresh.forEach(i => next.add(i.id))
            return next
          })
        }
        setIsLoadingMore(false)
        loadingRef.current = false
      }).catch(() => {
        setIsLoadingMore(false)
        loadingRef.current = false
      })
    }
  }, [queue.length, onRequestMore, seenIds])

  const handleSwipe = useCallback((direction: 'left' | 'right', item: SwipeItem) => {
    setHistory(prev => [item, ...prev].slice(0, 10))
    setQueue(prev => prev.slice(1))
    if (direction === 'right') {
      onSeen(item, currentRating)
    }
    // Sinistra: nessun effetto negativo, solo avanza la coda
  }, [currentRating, onSeen])

  const handleUndo = useCallback(() => {
    if (!history.length) return
    const [last, ...rest] = history
    setHistory(rest)
    setQueue(prev => [last, ...prev])
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
      {/* Overlay nero totale — z-[9999] copre tutto compresa la navbar */}
      <div className="fixed inset-0 bg-black flex flex-col" style={{ zIndex: 9999 }}>

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <button
            onClick={handleUndo}
            disabled={!history.length}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-zinc-400 hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-colors"
          >
            <RotateCcw size={15} />
            <span className="text-xs font-medium">Annulla</span>
          </button>

          {/* Solo titolo, niente contatore */}
          <p className="text-white font-bold text-base tracking-tight">Swipe</p>

          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <X size={16} />
            <span className="text-xs font-medium">Chiudi</span>
          </button>
        </div>

        {/* Barra caricamento sottile */}
        <div className="h-0.5 mx-5 mb-1 flex-shrink-0">
          {isLoadingMore && (
            <div className="h-full bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full animate-pulse w-full" />
            </div>
          )}
        </div>

        {/* Area card */}
        <div className="flex-1 flex items-center justify-center px-5 pb-2 min-h-0">
          {queue.length === 0 && !isLoadingMore ? (
            <div className="text-center px-6">
              <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-violet-500/30">
                <Check size={36} className="text-white" />
              </div>
              <h2 className="text-white text-2xl font-bold mb-2">Hai finito!</h2>
              <p className="text-zinc-400 text-sm mb-8">Aggiorna i consigli per scoprire altri titoli.</p>
              <button onClick={onClose} className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-2xl transition-colors">
                Torna ai consigli
              </button>
            </div>
          ) : queue.length === 0 ? (
            <div className="text-center">
              <div className="w-12 h-12 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-zinc-500 text-sm">Caricamento nuovi titoli…</p>
            </div>
          ) : (
            <div className="relative w-full max-w-sm" style={{ height: 'min(530px, 74svh)' }}>
              {queue.slice(0, 3).map((item, idx) => (
                <SwipeCard
                  key={item.id}
                  item={item}
                  isTop={idx === 0}
                  stackIndex={idx}
                  onSwipe={handleSwipe}
                  rating={idx === 0 ? currentRating : null}
                  onRatingChange={setCurrentRating}
                  onDetailOpen={handleDetailOpen}
                />
              ))}
            </div>
          )}
        </div>

        {/* Hint */}
        {queue.length > 0 && (
          <div
            className="text-center flex-shrink-0 pointer-events-none select-none"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            <p className="text-zinc-700 text-xs">← Skip &nbsp;·&nbsp; Visto →</p>
          </div>
        )}
      </div>

      {/* Drawer dettagli (z ancora più alto) */}
      {detailItem && (
        <div style={{ zIndex: 10000, position: 'fixed', inset: 0 }}>
          <MediaDetailsDrawer media={detailItem} onClose={() => setDetailItem(null)} />
        </div>
      )}
    </>
  )
}