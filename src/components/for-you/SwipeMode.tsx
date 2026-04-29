'use client'
// DESTINAZIONE: src/components/for-you/SwipeMode.tsx
// v9 — fix definitivi:
//   1. RATING: SwipeMode NON scrive più su user_media_entries (doppia scrittura eliminata).
//              Il rating viene letto dal ref e passato a onSeen → handleSwipeSeen in page.tsx
//              che è l'UNICO punto di scrittura. Zero race condition.
//   2. FLASH:  queue parte con initialItems già puliti (filtro skipped asincrono in background).
//              Le card sono visibili SUBITO. La pulizia skipped avviene silenziosamente.
//   3. RESET RATING: il rating si azzera quando cambia la card in cima, MA solo DOPO
//              che handleSwipe ha già letto il valore dal ref.

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Check, ChevronRight, Star, Gamepad2, Tv, Film, Layers, Swords, RotateCcw, Dices, Bookmark } from 'lucide-react'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'
import { createClient } from '@/lib/supabase/client'
import { profileInvalidateBridge } from '@/hooks/profileInvalidateBridge'
import { gestureState } from '@/hooks/gestureState'
import { swipeNavBridge } from '@/hooks/swipeNavBridge'

import { useTabActive } from '@/context/TabActiveContext'
import { optimizeCover } from '@/lib/imageOptimizer'

type SwipeMediaType = 'anime' | 'manga' | 'movie' | 'tv' | 'game' | 'boardgame'

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
  isDiscovery?: boolean
}

type CategoryFilter = 'all' | SwipeMediaType

interface SwipeModeProps {
  items: SwipeItem[]
  userId?: string
  onSeen: (item: SwipeItem, rating: number | null, skipPersist?: boolean) => void
  onSkip: (item: SwipeItem) => void
  onClose: () => void
  onRequestMore: (filter?: CategoryFilter) => Promise<SwipeItem[]>
  standalone?: boolean
  isOnboarding?: boolean
  onOnboardingComplete?: () => void
  onUndo?: (item: SwipeItem) => void
  onUndoWishlist?: (item: SwipeItem) => void
}

const TYPE_ICONS: Record<SwipeMediaType, React.ElementType> = {
  anime: Swords, manga: Layers, movie: Film, tv: Tv, game: Gamepad2,
  boardgame: Dices,
}
const TYPE_LABEL: Record<SwipeMediaType, string> = {
  anime: 'Anime', manga: 'Manga', movie: 'Film', tv: 'Serie TV', game: 'Videogioco',
  boardgame: 'Gioco da Tavolo',
}
const TYPE_COLORS: Record<SwipeMediaType, string> = {
  anime:     'from-sky-500 to-blue-600',
  manga:     'from-orange-500 to-red-500',
  movie:     'from-red-500 to-rose-600',
  tv:        'from-purple-500 to-violet-600',
  game:      'from-emerald-500 to-green-600',
  boardgame: 'from-amber-500 to-yellow-600',
}
const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: 'all',       label: 'Tutti' },
  { key: 'anime',     label: 'Anime' },
  { key: 'manga',     label: 'Manga' },
  { key: 'movie',     label: 'Film' },
  { key: 'tv',        label: 'Serie TV' },
  { key: 'game',      label: 'Videogiochi' },
  { key: 'boardgame', label: 'Giochi da Tavolo' },
]

const SWIPE_THRESHOLD = 80
const ROTATION_FACTOR = 0.08
const REFILL_THRESHOLD = 25
const PRELOAD_TARGET = 50
const TEXT_SHADOW = { textShadow: '0 1px 10px rgba(0,0,0,1), 0 2px 24px rgba(0,0,0,1), 0 4px 48px rgba(0,0,0,0.9)' }
const ICON_DROP = { filter: 'drop-shadow(0 1px 6px rgba(0,0,0,1)) drop-shadow(0 0 3px rgba(0,0,0,1))' }

// Interleave by type — pure fn, stable, never reorders existing items at render time.
// Only called at write-time (initial state + loadMore) so card positions never jump.
function interleaveByType(items: SwipeItem[]): SwipeItem[] {
  const buckets = new Map<string, SwipeItem[]>()
  for (const item of items) {
    if (!buckets.has(item.type)) buckets.set(item.type, [])
    buckets.get(item.type)!.push(item)
  }
  const cols = Array.from(buckets.values())
  const out: SwipeItem[] = []
  const max = Math.max(0, ...cols.map(c => c.length))
  for (let i = 0; i < max; i++) {
    for (const col of cols) { if (i < col.length) out.push(col[i]) }
  }
  return out
}

// ─── LoadingScreen ─────────────────────────────────────────────────────────────

function LoadingScreen({ message = 'Caricamento nuovi titoli' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-7 px-8 text-center"
      style={{ animation: 'sw-enter 0.45s cubic-bezier(0.22,1,0.36,1) both' }}>
      <style>{`
        @keyframes sw-enter { from{opacity:0;transform:scale(0.96) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes sw-arc   { to{transform:rotate(360deg)} }
        @keyframes sw-logo  { 0%,100%{opacity:0.75;transform:scale(0.97)} 50%{opacity:1;transform:scale(1)} }
        @keyframes sw-shine { 0%,100%{opacity:0} 40%,60%{opacity:1} }
      `}</style>

      {/* Arc spinner + logo */}
      <div className="relative w-[88px] h-[88px] flex items-center justify-center">
        {/* Soft glow backdrop */}
        <div className="absolute inset-3 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)' }} />
        {/* Single arc — calm, 1.4s */}
        <svg className="absolute inset-0 w-full h-full -rotate-90"
          style={{ animation: 'sw-arc 1.4s linear infinite' }} viewBox="0 0 88 88">
          <defs>
            <linearGradient id="swG" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0" />
              <stop offset="60%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
          </defs>
          {/* Track */}
          <circle cx="44" cy="44" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          {/* Arc */}
          <circle cx="44" cy="44" r="38" fill="none" stroke="url(#swG)" strokeWidth="3"
            strokeLinecap="round" strokeDasharray="155 84" />
        </svg>
        {/* Logo — gentle breathing */}
        <img src="/icons/apple-touch-icon.png" alt="Geekore"
          className="relative z-10 w-11 h-11 rounded-2xl"
          style={{ animation: 'sw-logo 2.2s ease-in-out infinite', objectFit: 'cover' }} />
      </div>

      {/* Text */}
      <div className="space-y-1.5">
        <p className="text-white/85 font-medium text-[15px] tracking-tight">{message}</p>
        <p className="text-zinc-600 text-[12px]">Stiamo preparando le card per te</p>
      </div>
    </div>
  )
}

// ─── HalfStarRating ────────────────────────────────────────────────────────────

function HalfStarRating({ rating, onChange }: { rating: number | null; onChange: (r: number | null) => void }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const displayValue = hovered !== null ? hovered : (rating ?? 0)

  const valueFromClientX = useCallback((clientX: number): number => {
    const el = containerRef.current; if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width - 1))
    const starWidth = rect.width / 5
    const star = Math.min(4, Math.floor(x / starWidth))
    return (x - star * starWidth) < starWidth / 2 ? star + 0.5 : star + 1
  }, [])

  return (
    <div ref={containerRef} className="flex items-center cursor-pointer touch-none select-none"
      onMouseMove={e => setHovered(valueFromClientX(e.clientX))}
      onMouseLeave={() => setHovered(null)}
      onClick={e => { e.stopPropagation(); const v = valueFromClientX(e.clientX); onChange(rating === v ? null : v) }}
      onTouchStart={e => { e.preventDefault(); setHovered(valueFromClientX(e.touches[0].clientX)) }}
      onTouchMove={e => { e.preventDefault(); setHovered(valueFromClientX(e.touches[0].clientX)) }}
      onTouchEnd={e => { e.preventDefault(); if (hovered !== null) onChange(rating === hovered ? null : hovered); setHovered(null) }}
    >
      {[1,2,3,4,5].map(star => {
        const full = displayValue >= star
        const half = !full && displayValue >= star - 0.5
        return (
          <div key={star} className="flex items-center justify-center" style={{ width: 36, height: 36 }}>
            <div className="relative" style={{ width: 28, height: 28 }}>
              <Star size={28} className="absolute inset-0 text-white/50" fill="none" strokeWidth={1.5} style={ICON_DROP} />
              {full && <Star size={28} className="absolute inset-0 text-amber-400" fill="currentColor" strokeWidth={0}
                style={{ filter: 'drop-shadow(0 0 7px rgba(251,191,36,.85))' }} />}
              {half && <Star size={28} className="absolute inset-0 text-amber-400" fill="currentColor" strokeWidth={0}
                style={{ clipPath: 'inset(0 50% 0 0)', filter: 'drop-shadow(0 0 7px rgba(251,191,36,.85))' }} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── SwipeCard ─────────────────────────────────────────────────────────────────

interface SwipeCardProps {
  item: SwipeItem; isTop: boolean; stackIndex: number
  onSwipe: (dir: 'left'|'right', item: SwipeItem) => void
  rating: number|null; onRatingChange: (r: number|null) => void
  onDetailOpen: (item: SwipeItem) => void
  onUndo: () => void; canUndo: boolean; onClose: () => void
  onWishlist: (item: SwipeItem) => void
  hideClose?: boolean
  panelActive?: boolean
  starsRef?: React.RefObject<HTMLDivElement | null>
  // Gesture controllate dall'esterno dal container unico
  dragX?: number
  isFlying?: boolean
  flyDir?: 'left' | 'right' | 'down' | null
}

function SwipeCard({ item, isTop, stackIndex, onSwipe, rating, onRatingChange, onDetailOpen, onUndo, canUndo, onClose, onWishlist, hideClose, panelActive = true, starsRef, dragX = 0, isFlying = false, flyDir = null }: SwipeCardProps) {
  const Icon = TYPE_ICONS[item.type]

  const triggerSwipe = useCallback((dir: 'left'|'right') => {
    onSwipe(dir, item)
  }, [item, onSwipe])

  const triggerWishlist = useCallback(() => {
    onWishlist(item)
  }, [item, onWishlist])

  if (stackIndex > 2) return null

  const stackScale = 1 - stackIndex * 0.04
  const stackY = stackIndex * 10
  const rotation = isFlying
    ? (flyDir === 'down' ? 0 : flyDir === 'right' ? 22 : -22)
    : dragX * ROTATION_FACTOR
  const translateX = isFlying
    ? (flyDir === 'right' ? '160%' : flyDir === 'left' ? '-160%' : '0')
    : `${dragX}px`
  const translateY = isFlying && flyDir === 'down' ? '160%' : '0'
  const swipeProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1)

  return (
    <div
      className={`absolute inset-0 select-none ${isTop ? 'cursor-grab' : 'pointer-events-none'}`}
      style={{
        transform: isTop
          ? `translateX(${translateX}) translateY(${translateY}) rotate(${rotation}deg)`
          : `scale(${stackScale}) translateY(${stackY}px)`,
        transition: isFlying || dragX !== 0 ? 'none' : 'transform .34s cubic-bezier(.25,.46,.45,.94), opacity .34s ease',
        opacity: isFlying ? 0 : 1 - stackIndex * 0.12,
        zIndex: 10 - stackIndex,
        willChange: isTop && dragX !== 0 ? 'transform' : 'auto',
      }}
    >
      <div className="relative w-full h-full rounded-3xl overflow-hidden bg-zinc-900 shadow-2xl shadow-black/80">
        {item.coverImage
          ? <img src={optimizeCover(item.coverImage, 'swipe-card')} alt={item.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} loading="eager" decoding="async" />
          : <div className="absolute inset-0 flex items-center justify-center bg-zinc-900"><Icon size={64} className="text-zinc-700" /></div>
        }
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #000 0%, rgba(0,0,0,0.93) 18%, rgba(0,0,0,0.65) 36%, rgba(0,0,0,0.2) 58%, rgba(0,0,0,0.42) 100%)' }} />

        {!hideClose && (
          <button onClick={e => { e.stopPropagation(); onClose() }}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/70 flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-all z-20" style={ICON_DROP}>
            <X size={17} strokeWidth={2.5} />
          </button>
        )}

        <div className="absolute top-3 left-3 z-10">
          <div className={`bg-gradient-to-r ${TYPE_COLORS[item.type]} text-white text-xs font-bold px-3 py-1 rounded-full`} style={ICON_DROP}>
            {TYPE_LABEL[item.type]}
          </div>
        </div>

        {!item.isDiscovery && item.matchScore >= 75 && item.matchScore <= 100 && (
          <div className="absolute top-12 left-3 z-10">
            <div className="flex items-center gap-1 bg-violet-700 text-white text-xs font-black px-2.5 py-1 rounded-full" style={ICON_DROP}>
              <Star size={10} fill="currentColor" />{item.matchScore}%
            </div>
          </div>
        )}
        {item.isDiscovery && (
          <div className="absolute top-12 left-3 z-10">
            <div className="flex items-center gap-1 bg-emerald-700 text-white text-xs font-bold px-2.5 py-1 rounded-full" style={ICON_DROP}>
              ✨ Scoperta
            </div>
          </div>
        )}

        {isTop && (
          <>
            <div className="absolute top-16 left-5 border-[3px] border-emerald-400 text-emerald-400 font-black text-xl px-4 py-1.5 rounded-2xl tracking-widest uppercase rotate-[-18deg] pointer-events-none z-10"
              style={{ opacity: dragX > 20 ? swipeProgress : 0, transition: 'opacity .08s', ...TEXT_SHADOW }}>Visto ✓</div>
            <div className="absolute top-16 right-5 border-[3px] border-red-400 text-red-400 font-black text-xl px-4 py-1.5 rounded-2xl tracking-widest uppercase rotate-[18deg] pointer-events-none z-10"
              style={{ opacity: dragX < -20 ? swipeProgress : 0, transition: 'opacity .08s', ...TEXT_SHADOW }}>Skip ✗</div>
          </>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-5 pb-4 z-10">
          <h2 className="text-white font-bold text-[22px] leading-tight mb-1 line-clamp-2" style={TEXT_SHADOW}>{item.title}</h2>
          <p className="text-white/75 text-sm mb-4 flex items-center gap-2 flex-wrap" style={TEXT_SHADOW}>
            {item.year && <span>{item.year}</span>}
            {item.episodes && item.type !== 'movie' && <span>{item.type === 'manga' ? `${item.episodes} cap.` : `${item.episodes} ep.`}</span>}
            {item.genres.length > 0 && <span className="text-white/50">· {item.genres.slice(0,2).join(', ')}</span>}
          </p>
          <div ref={isTop ? starsRef : undefined} data-stars="true" className={`flex items-center justify-center mb-4 ${!isTop ? 'opacity-0 pointer-events-none' : ''}`}>
            <div className="bg-black/80 rounded-2xl px-2 py-1 ring-1 ring-white/10">
              <HalfStarRating rating={rating} onChange={onRatingChange} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button onClick={e => { e.stopPropagation(); if (isTop && canUndo) onUndo() }} disabled={!canUndo || !isTop}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-black/75 border border-white/25 text-white/85 hover:bg-black/90 hover:border-white/45 hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-all">
              <RotateCcw size={17} style={ICON_DROP} />
            </button>
            <div className="flex items-center gap-4">
              <button onClick={e => { e.stopPropagation(); if (isTop) triggerSwipe('left') }}
                className={`w-14 h-14 rounded-full bg-black/75 border-2 border-red-400/90 flex items-center justify-center text-red-400 hover:bg-red-500/30 hover:border-red-400 active:scale-90 transition-all ${!isTop ? 'opacity-0 pointer-events-none' : ''}`} style={ICON_DROP}>
                <X size={24} strokeWidth={3} />
              </button>
              <button onClick={e => { e.stopPropagation(); if (isTop) onDetailOpen(item) }}
                className={`w-10 h-10 rounded-full bg-black/75 border border-white/50 flex items-center justify-center text-white/90 hover:bg-black/90 hover:text-white active:scale-90 transition-all ${!isTop ? 'opacity-0 pointer-events-none' : ''}`} style={ICON_DROP}>
                <ChevronRight size={20} strokeWidth={2.5} />
              </button>
              <button onClick={e => { e.stopPropagation(); if (isTop) triggerSwipe('right') }}
                className={`w-14 h-14 rounded-full bg-black/75 border-2 border-emerald-400/90 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/30 hover:border-emerald-400 active:scale-90 transition-all ${!isTop ? 'opacity-0 pointer-events-none' : ''}`} style={ICON_DROP}>
                <Check size={24} strokeWidth={3} />
              </button>
            </div>
            <button onClick={e => { e.stopPropagation(); if (isTop && !isFlying) triggerWishlist() }} disabled={!isTop || isFlying}
              className="w-11 h-11 flex items-center justify-center rounded-full bg-black/75 border border-white/25 text-white/85 hover:bg-black/90 hover:border-white/45 hover:text-white disabled:opacity-35 disabled:pointer-events-none active:scale-90 transition-all">
              <Bookmark size={17} fill="none" style={ICON_DROP} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── Gesture system ────────────────────────────────────────────────────────────
// Un unico container gestisce TUTTI i touch della swipe page.
// La card non ha listener propri — è puramente visiva.
// Il container decide in onTouchStart se il touch è nella "fascia page-swipe"
// (sotto il bordo inferiore del box stelline) o nella "zona card" (sopra).
// Le due zone sono mutualmente esclusive: mai in conflitto.

type GestureZone = 'card' | 'page' | 'button' | null

interface GestureState {
  zone: GestureZone
  startX: number
  startY: number
  currentX: number
  decided: boolean
  isDragging: boolean
}

function useSwipeGestures(
  containerRef: React.RefObject<HTMLDivElement | null>,
  starsRef: React.RefObject<HTMLDivElement | null>,
  isActive: boolean,
  standalone: boolean,
  onCardSwipe: (dx: number) => void,
  onCardRelease: (dx: number) => void,
) {
  const gs = useRef<GestureState>({
    zone: null, startX: 0, startY: 0, currentX: 0, decided: false, isDragging: false
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el || !isActive) return

    const getStarsBottom = (): number => {
      if (!starsRef.current) return window.innerHeight
      return starsRef.current.getBoundingClientRect().bottom
    }

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      const target = e.target as HTMLElement
      const clientY = t.clientY
      const starsBottom = getStarsBottom()

      if (target.closest('[data-stars]')) {
        // Stelline: non intercettare mai
        gs.current = { zone: null, startX: 0, startY: 0, currentX: 0, decided: false, isDragging: false }
        return
      }

      if (target.closest('button')) {
        // Bottone nella fascia (sotto le stelline): salva posizione.
        // In onMove decideremo se è un tap (lascia il click) o uno swipe di pagina.
        gs.current = { zone: 'button', startX: t.clientX, startY: clientY, currentX: 0, decided: false, isDragging: false }
        return
      }

      if (standalone && clientY > starsBottom) {
        gs.current = { zone: 'page', startX: t.clientX, startY: clientY, currentX: 0, decided: false, isDragging: false }
      } else {
        gs.current = { zone: 'card', startX: t.clientX, startY: clientY, currentX: 0, decided: false, isDragging: false }
      }
    }

    const onMove = (e: TouchEvent) => {
      const g = gs.current
      if (g.zone === null) return

      // Touch partito su un bottone: aspetta di capire se è swipe o tap
      if (g.zone === 'button') {
        if (g.decided) return  // già deciso: lascia fare
        const dx = e.touches[0].clientX - g.startX
        const dy = e.touches[0].clientY - g.startY
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return  // soglia più alta per i bottoni
        g.decided = true
        if (Math.abs(dx) > Math.abs(dy) * 1.2 && standalone) {
          // Swipe orizzontale partito da un bottone → page swipe
          g.zone = 'page'
          gestureState.pageSwipeZone = true
        }
        // Se verticale o non abbastanza orizzontale → lascia il click, zone resta 'button'
        return
      }

      const t = e.touches[0]
      const dx = t.clientX - g.startX
      const dy = t.clientY - g.startY

      if (!g.decided) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
        g.decided = true
        const isHoriz = Math.abs(dx) > Math.abs(dy) * 1.2
        if (g.zone === 'page') {
          if (isHoriz) {
            gestureState.pageSwipeZone = true
          } else {
            g.zone = null  // gesto verticale nella fascia: ignora
          }
          return
        }
        // zona card
        if (isHoriz) {
          g.isDragging = true
        } else {
          g.zone = null  // gesto verticale sulla card: lascia scroll nativo
        }
      }

      if (g.zone === 'card' && g.isDragging) {
        g.currentX = dx
        onCardSwipe(dx)
        if (e.cancelable) e.preventDefault()
      }
    }

    const onEnd = (e: TouchEvent) => {
      const g = gs.current
      if (g.zone === 'card' && g.isDragging) {
        onCardRelease(g.currentX)
      } else if (g.zone === 'page' && gestureState.pageSwipeZone) {
        // Il page-swipe viene gestito da SwipeablePageContainer via use-gesture,
        // ma su iOS/Android il touchend può non arrivare a use-gesture se intercettato qui.
        // Forziamo lo snap-back via bridge con la velocity del dito.
        // use-gesture probabilmente chiamerà anche lui notifySnap(0,...) — è idempotente.
        const touch = e.changedTouches[0]
        const dx = touch ? touch.clientX - g.startX : 0
        const dt = 16 // approx ms dell'ultimo frame
        const vx = dx !== 0 ? (dx / dt) * 0.001 : 0 // px/ms, piccolo per sicurezza
        // Solo snap-back: se use-gesture ha già navigato, questo è no-op perché il bridge
        // non ha bridgeStarted se notifySnap è già stato chiamato.
        // Usiamo setTimeout 0 per lasciare a use-gesture la priorità se lo riceve.
        setTimeout(() => {
          if (gestureState.swipeActive === false) {
            swipeNavBridge.notifySnap(0, vx, 0)
            swipeNavBridge.notifyEnd()
          }
        }, 0)
      }
      gestureState.pageSwipeZone = false
      gs.current = { zone: null, startX: 0, startY: 0, currentX: 0, decided: false, isDragging: false }
    }

    el.addEventListener('touchstart',  onStart,  { passive: true })
    el.addEventListener('touchmove',   onMove,   { passive: false })
    el.addEventListener('touchend',    onEnd,    { passive: true })
    el.addEventListener('touchcancel', onEnd,    { passive: true })
    return () => {
      el.removeEventListener('touchstart',  onStart)
      el.removeEventListener('touchmove',   onMove)
      el.removeEventListener('touchend',    onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [isActive, standalone, onCardSwipe, onCardRelease, containerRef, starsRef])
}


// ─── SwipeMode ─────────────────────────────────────────────────────────────────

export function SwipeMode({ items: initialItems, userId: userIdProp, onSeen, onSkip, onClose, onRequestMore, standalone = false, isOnboarding = false, onOnboardingComplete, onUndo: onUndoCallback, onUndoWishlist }: SwipeModeProps) {
  const supabase = createClient()
  const isTabActive = useTabActive()
  // userId risolto una sola volta al mount — evita getUser() ad ogni swipe/skip
  const userIdRef = useRef<string | null>(userIdProp ?? null)
  useEffect(() => {
    if (userIdRef.current) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) userIdRef.current = user.id
    })
  }, []) // eslint-disable-line
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all')

  // RATING: ref aggiornato in sincronia con lo stato — la closure del setTimeout
  // legge SEMPRE il valore corrente senza rischio di stale closure.
  const currentRatingRef = useRef<number | null>(null)
  const [currentRating, setCurrentRating] = useState<number | null>(null)
  const setRating = useCallback((r: number | null) => {
    currentRatingRef.current = r
    setCurrentRating(r)
  }, [])

  // La queue parte già interleaved — l'ordine non cambia mai a runtime, solo in append.
  const [queue, setQueue] = useState<SwipeItem[]>(() => interleaveByType(initialItems))
  const [seenIds] = useState<Set<string>>(() => new Set(initialItems.map(i => i.id)))
  const seenIdsRef = useRef(seenIds)

  const [detailItem, setDetailItem] = useState<MediaDetails | null>(null)
  const [history, setHistory] = useState<SwipeItem[]>([])
  // Traccia quali item nello storico erano stati aggiunti alla wishlist
  const wishlistHistoryRef = useRef<Set<string>>(new Set())
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const skippedIdsRef = useRef<Set<string>>(new Set())
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
  const loadingRef = useRef(false)
  const categoryQueues = useRef<Partial<Record<CategoryFilter, SwipeItem[]>>>({})
  const categoryLoading = useRef<Partial<Record<CategoryFilter, boolean>>>({})

  // Carica skipped in background
  useEffect(() => {
    const load = async () => {
      if (!userIdRef.current) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        userIdRef.current = user.id
      }
      const { data } = await supabase.from('swipe_skipped').select('external_id').eq('user_id', userIdRef.current)
      if (data?.length) {
        const ids = new Set(data.map((r: any) => r.external_id as string))
        skippedIdsRef.current = ids
        setSkippedIds(ids)
      }
    }
    load()
  }, []) // eslint-disable-line

  // filteredQueue: 'all' uses queue directly (already interleaved at write-time).
  // Category filters just slice — no reordering.
  const filteredQueue = activeFilter === 'all'
    ? queue
    : queue.filter(i => i.type === activeFilter)

  // Reset rating quando cambia la card in cima
  // IMPORTANTE: il reset aggiorna sia lo stato che il ref, ma handleSwipe
  // legge il ref PRIMA che questo effect si esegua (la lettura avviene
  // nel corpo di handleSwipe, non in una callback asincrona)
  const prevTopIdRef = useRef<string | undefined>(undefined)
  const topId = filteredQueue[0]?.id
  useEffect(() => {
    if (topId !== prevTopIdRef.current) {
      prevTopIdRef.current = topId
      setRating(null)
    }
  }, [topId, setRating])

  // preloadCategory declared before loadMore so loadMore can call it as a fast-path replenish.
  const preloadCategory = useCallback(async (filter: CategoryFilter) => {
    if (categoryLoading.current[filter]) return
    if ((categoryQueues.current[filter]?.length ?? 0) >= PRELOAD_TARGET) return
    categoryLoading.current[filter] = true
    try {
      const items = await onRequestMore(filter)
      const skipped = skippedIdsRef.current
      const fresh = items.filter(i => !skipped.has(i.id))
      const existing = categoryQueues.current[filter] || []
      const existingIds = new Set(existing.map(i => i.id))
      categoryQueues.current[filter] = [...existing, ...fresh.filter(i => !existingIds.has(i.id))].slice(0, PRELOAD_TARGET)
    } catch {}
    categoryLoading.current[filter] = false
  }, [onRequestMore])

  const loadMore = useCallback(async (filter: CategoryFilter) => {
    if (loadingRef.current) return
    loadingRef.current = true

    // ── Fast path: use preloaded cache — no loading screen, instant ──────────
    const cached = categoryQueues.current[filter] || []
    const skipped = skippedIdsRef.current
    const seen = seenIdsRef.current
    const cachedFresh = cached.filter(i => !seen.has(i.id) && !skipped.has(i.id))
    if (cachedFresh.length >= 10) {
      setQueue(prev => {
        const existingIds = new Set(prev.map(i => i.id))
        const newItems = cachedFresh.filter(i => !existingIds.has(i.id))
        return [...prev, ...(filter === 'all' ? interleaveByType(newItems) : newItems)]
      })
      cachedFresh.forEach(i => seen.add(i.id))
      categoryQueues.current[filter] = []
      loadingRef.current = false
      // Replenish the cache in background for next refill
      preloadCategory(filter)
      return
    }

    // ── Slow path: fetch from network ─────────────────────────────────────────
    setIsLoadingMore(true)
    try {
      const items = await onRequestMore(filter)
      const fresh = items.filter(i => !seen.has(i.id) && !skipped.has(i.id))
      if (fresh.length) {
        setQueue(prev => [...prev, ...(filter === 'all' ? interleaveByType(fresh) : fresh)])
        fresh.forEach(i => seen.add(i.id))
      } else {
        // Tutti già visti: svuota seenIds e riprova
        seen.clear()
        const retryItems = await onRequestMore(filter)
        const retryFresh = retryItems.filter(i => !skipped.has(i.id))
        if (retryFresh.length) {
          setQueue(prev => [...prev, ...(filter === 'all' ? interleaveByType(retryFresh) : retryFresh)])
          retryFresh.forEach(i => seen.add(i.id))
        }
      }
    } catch {}
    setIsLoadingMore(false); loadingRef.current = false
  }, [onRequestMore, preloadCategory])

  // Preload all categories (including 'all') 1.5 s after mount so the cache
  // is ready before the user exhausts the initial deck.
  useEffect(() => {
    const cats: CategoryFilter[] = ['all', 'anime', 'manga', 'movie', 'tv', 'game']
    cats.forEach((cat, i) => setTimeout(() => preloadCategory(cat), 1500 + i * 300))
  }, []) // eslint-disable-line

  useEffect(() => {
    if (filteredQueue.length <= REFILL_THRESHOLD && !loadingRef.current) loadMore(activeFilter)
  }, [filteredQueue.length, activeFilter]) // eslint-disable-line

  const handleFilterChange = useCallback((filter: CategoryFilter) => {
    setActiveFilter(filter); setHistory([])
    const preloaded = categoryQueues.current[filter]
    if (preloaded?.length) {
      const skipped = skippedIdsRef.current
      setQueue(prev => {
        const existingIds = new Set(prev.map(i => i.id))
        const newItems = preloaded.filter(i => !existingIds.has(i.id) && !skipped.has(i.id))
        return [...prev, ...(filter === 'all' ? interleaveByType(newItems) : newItems)]
      })
      preloaded.forEach(i => seenIdsRef.current.add(i.id))
      categoryQueues.current[filter] = []
      setTimeout(() => preloadCategory(filter), 500)
    }
    const avail = (filter === 'all' ? queue : queue.filter(i => i.type === filter)).filter(i => !skippedIdsRef.current.has(i.id))
    if (avail.length <= REFILL_THRESHOLD) loadMore(filter)
  }, [queue, loadMore, preloadCategory])

  const persistSkipped = useCallback((item: SwipeItem) => {
    const uid = userIdRef.current
    if (!uid) return
    supabase.from('swipe_skipped').upsert(
      { user_id: uid, external_id: item.id, title: item.title, type: item.type },
      { onConflict: 'user_id,external_id' }
    ).then(() => {})
    supabase.from('swipe_queue_all').delete().eq('user_id', uid).eq('external_id', item.id).then(() => {})
    supabase.from(`swipe_queue_${item.type}`).delete().eq('user_id', uid).eq('external_id', item.id).then(() => {})
  }, [supabase])

  const removeSkip = useCallback((item: SwipeItem) => {
    const uid = userIdRef.current
    if (!uid) return
    supabase.from('swipe_skipped').delete().eq('user_id', uid).eq('external_id', item.id).then(() => {})
  }, [supabase])

  const handleSwipe = useCallback((dir: 'left' | 'right', item: SwipeItem, skipPersist = false) => {
    // Legge il rating DAL REF nel corpo sincrono della funzione —
    // prima che qualsiasi setState/useEffect possa azzerarlo.
    const ratingAtSwipeTime = currentRatingRef.current

    setHistory(prev => [item, ...prev].slice(0, 10))
    setQueue(prev => prev.filter(i => i.id !== item.id))
    setSkippedIds(prev => { const n = new Set(prev); n.add(item.id); return n })
    skippedIdsRef.current.add(item.id)

    // In onboarding gli skippati vengono gestiti in batch dal parent (OnboardingPage)
    // → non chiamiamo persistSkipped per evitare scritture real-time su swipe_skipped
    if (!isOnboarding) {
      persistSkipped(item)
    }

    if (dir === 'right') {

      onSeen(item, ratingAtSwipeTime, skipPersist)
    } else {
      onSkip(item)
    }
  }, [onSeen, onSkip, persistSkipped, isOnboarding])

  const handleUndo = useCallback(() => {
    if (!history.length) return
    const [last, ...rest] = history
    setHistory(rest)
    setQueue(prev => [last, ...prev])
    setSkippedIds(prev => { const n = new Set(prev); n.delete(last.id); return n })
    skippedIdsRef.current.delete(last.id)
    // Revert wishlist se l'item era stato messo in wishlist
    const wasWishlisted = wishlistHistoryRef.current.has(last.id)
    if (wasWishlisted) {
      wishlistHistoryRef.current.delete(last.id)
      // Revert wishlist su Supabase (per swipe normale)
      if (!isOnboarding) {
        const uid = userIdRef.current
        if (uid) supabase.from('wishlist').delete().eq('user_id', uid).eq('external_id', last.id).then(() => {})
      }
      // Notifica il parent (per onboarding)
      onUndoWishlist?.(last)
    }
    if (!isOnboarding) removeSkip(last)
    // Notifica il parent dell'undo (usato dall'onboarding per rimuovere da acceptedItemsRef)
    onUndoCallback?.(last)
  }, [history, removeSkip, isOnboarding, supabase, onUndoCallback, onUndoWishlist])

  const handleWishlist = useCallback((item: SwipeItem) => {
    // Behaves like a skip: removes from queue, adds to history, persists skip
    wishlistHistoryRef.current.add(item.id)
    handleSwipe('left', item)
    const uid = userIdRef.current
    if (uid) supabase.from('wishlist').upsert({
        user_id: uid,
        external_id: item.id,
        title: item.title,
        type: item.type,
        cover_image: item.coverImage,
      }, { onConflict: 'user_id,external_id' }).then(() => {})
  }, [handleSwipe, supabase])

  const handleDetailOpen = useCallback((item: SwipeItem) => {
    setDetailItem({
      id: item.id, title: item.title, type: item.type, coverImage: item.coverImage,
      year: item.year, genres: item.genres, description: item.description, score: item.score,
      episodes: item.episodes, authors: item.authors, developers: item.developers,
      platforms: item.platforms, why: item.why, matchScore: item.matchScore,
      isAwardWinner: item.isAwardWinner, source: item.source,
    })
  }, [])

  // Swipe-pagina mobile: listener su document, nessun overlay sui bottoni
  // ── Gesture state per la card top ───────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement | null>(null)
  const starsRef = useRef<HTMLDivElement | null>(null)
  const [cardDragX, setCardDragX] = useState(0)
  const [cardFlying, setCardFlying] = useState(false)
  const [cardFlyDir, setCardFlyDir] = useState<'left'|'right'|'down'|null>(null)
  const topItem = filteredQueue[0]

  const handleCardSwipe = useCallback((dx: number) => {
    setCardDragX(dx)
  }, [])

  const handleCardRelease = useCallback((dx: number) => {
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      const dir = dx > 0 ? 'right' : 'left'
      setCardFlyDir(dir)
      setCardFlying(true)
      setTimeout(() => {
        if (topItem) handleSwipe(dir, topItem)
        setCardDragX(0)
        setCardFlying(false)
        setCardFlyDir(null)
      }, 340)
    } else {
      setCardDragX(0)
    }
  }, [topItem, handleSwipe])

  useSwipeGestures(containerRef, starsRef, isTabActive, standalone, handleCardSwipe, handleCardRelease)

  const topCoverImage = filteredQueue[0]?.coverImage

  const containerClass = standalone
    ? 'fixed inset-0 bg-black flex flex-col overflow-hidden'
    : 'fixed inset-0 bg-black flex flex-col'
  const containerStyle = standalone ? {} : { zIndex: 9999 }
  return (
    <>
      <div className={containerClass} style={containerStyle}>

        {(standalone || isOnboarding) && (
          <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden>
            <div className="absolute inset-0 bg-gradient-to-br from-violet-950/60 via-black to-zinc-900" />
          </div>
        )}

        {/* Filtri categoria */}
        <div
          className="relative z-10 flex-shrink-0 flex justify-center px-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
        >
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide w-full">
            {CATEGORIES.map(cat => (
              <button key={cat.key} onClick={() => handleFilterChange(cat.key)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  activeFilter === cat.key ? 'bg-white text-black' : 'bg-white/10 text-white/60 hover:bg-white/15 hover:text-white'
                }`}>
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Area card — flex-1 min-h-0 si adatta automaticamente tra filtri e spacer */}
        <div
          ref={containerRef}
          className="relative z-10 flex-1 flex items-center justify-center px-4 min-h-0 py-2"
        >
          {filteredQueue.length === 0 ? (
            <LoadingScreen message={isLoadingMore ? 'Caricamento nuovi titoli' : 'Preparazione in corso'} />
          ) : (
            <div
              data-no-swipe=""
              className="relative self-stretch"
              style={{ maxWidth: 'min(420px, 92vw)', width: '100%', margin: '0 auto' }}
            >
              {filteredQueue.slice(0, 3).map((item, idx) => (
                <SwipeCard key={item.id} item={item} isTop={idx === 0} stackIndex={idx}
                  onSwipe={handleSwipe}
                  rating={idx === 0 ? currentRating : null}
                  onRatingChange={setRating}
                  onDetailOpen={handleDetailOpen}
                  onUndo={handleUndo} canUndo={history.length > 0}
                  onWishlist={handleWishlist}
                  onClose={isOnboarding && onOnboardingComplete ? onOnboardingComplete : onClose}
                  hideClose={standalone}
                  panelActive={isTabActive}
                  starsRef={idx === 0 ? starsRef : undefined}
                  dragX={idx === 0 ? cardDragX : 0}
                  isFlying={idx === 0 ? cardFlying : false}
                  flyDir={idx === 0 ? cardFlyDir : null}
                />
              ))}
            </div>
          )}
        </div>

        {/* Hint desktop */}
        {filteredQueue.length > 0 && (
          <div className="relative z-10 text-center flex-shrink-0 select-none hidden md:block pb-3">
            <p className="text-zinc-600 text-xs pointer-events-none">← Skip  ·  Visto →</p>
          </div>
        )}

        {/* Spacer navbar mobile — esatto spazio sotto la card per non andare sotto la navbar */}
        {standalone && (
          <div
            className="flex-shrink-0 md:hidden"
            style={{ height: 'calc(49px + env(safe-area-inset-bottom, 0px))' }}
          />
        )}
      </div>


      {detailItem && (
        <div style={{ zIndex: 10000, position: 'fixed', inset: 0 }}>
          <MediaDetailsDrawer
            media={detailItem}
            onClose={() => setDetailItem(null)}
            onAdd={(media) => {
              // Dal drawer usa il ref — stessa logica di handleSwipe
              const ratingAtAcceptTime = currentRatingRef.current
              const swipeItem: SwipeItem = queue.find(i => i.id === media.id) ?? {
                id: media.id, title: media.title, type: media.type as SwipeMediaType,
                coverImage: (media as any).coverImage, year: (media as any).year,
                genres: (media as any).genres || [], score: (media as any).score,
                description: (media as any).description, why: (media as any).why,
                matchScore: (media as any).matchScore || 0, episodes: (media as any).episodes,
                authors: (media as any).authors, developers: (media as any).developers,
                platforms: (media as any).platforms, isAwardWinner: (media as any).isAwardWinner,
              }

              // ─── DEBUG: Drawer → onAdd ───────────────────────────────────

              setDetailItem(null)
              // Aggiorna il ref col rating corrente prima di chiamare handleSwipe
              currentRatingRef.current = ratingAtAcceptTime
              // skipPersist=true: il Drawer ha già scritto su user_media_entries,
              // handleSwipeSeen NON deve fare un secondo upsert
              handleSwipe('right', swipeItem, true)
              profileInvalidateBridge.invalidate()
            }}
          />
        </div>
      )}
    </>
  )
}