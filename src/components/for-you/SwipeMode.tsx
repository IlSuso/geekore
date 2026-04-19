'use client'
// DESTINAZIONE: src/components/for-you/SwipeMode.tsx
// v6: loading schermata raffinata, swipe destra persiste su DB (non ricompare),
//     voto salvato immediatamente su user_media_entries

import { useState, useRef, useCallback, useEffect } from 'react'
import { X, Check, ChevronRight, Star, Gamepad2, Tv, Film, Layers, Swords, RotateCcw, Sparkles } from 'lucide-react'
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer'
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer'
import { createClient } from '@/lib/supabase/client'

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
  isDiscovery?: boolean
}

type CategoryFilter = 'all' | SwipeMediaType

interface SwipeModeProps {
  items: SwipeItem[]
  onSeen: (item: SwipeItem, rating: number | null) => void
  onClose: () => void
  onRequestMore: (filter?: CategoryFilter) => Promise<SwipeItem[]>
}

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
const TEXT_SHADOW = { textShadow: '0 1px 6px rgba(0,0,0,1), 0 2px 16px rgba(0,0,0,0.9)' }
const ICON_DROP = { filter: 'drop-shadow(0 1px 4px rgba(0,0,0,1)) drop-shadow(0 0 2px rgba(0,0,0,0.8))' }

// ─── LoadingScreen ────────────────────────────────────────────────────────────

function LoadingScreen({ message = 'Caricamento nuovi titoli' }: { message?: string }) {
  const [dots, setDots] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setDots(d => (d + 1) % 4), 500)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8 text-center">
      <style>{`
        @keyframes sw-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes sw-pulse { 0%,100% { opacity:.35; transform:scale(1); } 50% { opacity:.75; transform:scale(1.18); } }
        @keyframes sw-bar { from { transform:scaleY(.3); opacity:.35; } to { transform:scaleY(1); opacity:1; } }
      `}</style>

      <div className="relative flex items-center justify-center">
        <div className="absolute w-32 h-32 rounded-full bg-gradient-to-br from-violet-600/25 to-fuchsia-600/25 blur-2xl"
          style={{ animation: 'sw-pulse 2s ease-in-out infinite' }} />
        <div className="absolute w-24 h-24 rounded-full border-[2.5px] border-transparent"
          style={{
            background: 'linear-gradient(black,black) padding-box, linear-gradient(135deg,#7c3aed,#d946ef,#7c3aed) border-box',
            animation: 'sw-spin 1.8s linear infinite',
          }} />
        <div className="absolute w-14 h-14 rounded-full border-2 border-transparent opacity-50"
          style={{
            background: 'linear-gradient(black,black) padding-box, linear-gradient(225deg,#818cf8,#c084fc,#818cf8) border-box',
            animation: 'sw-spin 1.1s linear infinite reverse',
          }} />
        <div className="relative z-10 w-12 h-12 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-2xl shadow-violet-900/50">
          <Sparkles size={22} className="text-white" />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-white font-semibold text-base">
          {message}<span className="inline-block w-5 text-left">{'.'.repeat(dots)}</span>
        </p>
        <p className="text-zinc-600 text-xs">Sto cercando i titoli migliori per te</p>
      </div>

      <div className="flex gap-1.5 items-end" style={{ height: 28 }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} className="w-1 rounded-full bg-gradient-to-t from-violet-600 to-fuchsia-400"
            style={{ height: 20, animation: `sw-bar 1.1s ease-in-out ${i*0.15}s infinite alternate` }} />
        ))}
      </div>
    </div>
  )
}

// ─── HalfStarRating ──────────────────────────────────────────────────────────

function HalfStarRating({ rating, onChange }: { rating: number | null; onChange: (r: number | null) => void }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const displayValue = hovered !== null ? hovered : (rating ?? 0)

  const valueFromClientX = useCallback((clientX: number): number => {
    const el = containerRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width - 1))
    const starWidth = rect.width / 5
    const star = Math.min(4, Math.floor(x / starWidth))
    const within = x - star * starWidth
    return within < starWidth / 2 ? star + 0.5 : star + 1
  }, [])

  return (
    <div ref={containerRef} className="flex items-center cursor-pointer touch-none select-none" style={{ gap: 0 }}
      onMouseMove={e => { const n = valueFromClientX(e.clientX); setHovered(p => p === n ? p : n) }}
      onMouseLeave={() => setHovered(null)}
      onClick={e => { e.stopPropagation(); const v = valueFromClientX(e.clientX); onChange(rating === v ? null : v) }}
      onTouchStart={e => { e.preventDefault(); setHovered(valueFromClientX(e.touches[0].clientX)) }}
      onTouchMove={e => { e.preventDefault(); const n = valueFromClientX(e.touches[0].clientX); setHovered(p => p === n ? p : n) }}
      onTouchEnd={e => { e.preventDefault(); if (hovered !== null) onChange(rating === hovered ? null : hovered); setHovered(null) }}
    >
      {[1,2,3,4,5].map(star => {
        const full = displayValue >= star
        const half = !full && displayValue >= star - 0.5
        return (
          <div key={star} className="flex items-center justify-center" style={{ width: 36, height: 36 }}>
            <div className="relative" style={{ width: 28, height: 28 }}>
              <Star size={28} className="absolute inset-0 text-white/25" fill="none" strokeWidth={1.5} style={ICON_DROP} />
              {full && <Star size={28} className="absolute inset-0 text-amber-400" fill="currentColor" strokeWidth={0}
                style={{ filter: 'drop-shadow(0 0 7px rgba(251,191,36,.85)) drop-shadow(0 1px 3px rgba(0,0,0,.9))' }} />}
              {half && <Star size={28} className="absolute inset-0 text-amber-400" fill="currentColor" strokeWidth={0}
                style={{ clipPath:'inset(0 50% 0 0)', filter:'drop-shadow(0 0 7px rgba(251,191,36,.85)) drop-shadow(0 1px 3px rgba(0,0,0,.9))' }} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── SwipeCard ────────────────────────────────────────────────────────────────

interface SwipeCardProps {
  item: SwipeItem; isTop: boolean; stackIndex: number
  onSwipe: (dir: 'left'|'right', item: SwipeItem) => void
  rating: number|null; onRatingChange: (r: number|null) => void
  onDetailOpen: (item: SwipeItem) => void
  onUndo: () => void; canUndo: boolean; onClose: () => void
}

function SwipeCard({ item, isTop, stackIndex, onSwipe, rating, onRatingChange, onDetailOpen, onUndo, canUndo, onClose }: SwipeCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0); const currentX = useRef(0); const isDragging = useRef(false)
  const [dragX, setDragX] = useState(0)
  const [isFlying, setIsFlying] = useState(false)
  const [flyDir, setFlyDir] = useState<'left'|'right'|null>(null)

  const Icon = TYPE_ICONS[item.type]
  const colorClass = TYPE_COLORS[item.type]

  const triggerSwipe = useCallback((dir: 'left'|'right') => {
    setFlyDir(dir); setIsFlying(true)
    setTimeout(() => onSwipe(dir, item), 340)
  }, [item, onSwipe])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isTop) return
    if ((e.target as HTMLElement).closest('button,[data-stars]')) return
    isDragging.current = true; startX.current = e.clientX; currentX.current = 0
    cardRef.current?.setPointerCapture(e.pointerId)
  }, [isTop])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !isTop) return
    const dx = e.clientX - startX.current; currentX.current = dx; setDragX(dx)
  }, [isTop])

  const handlePointerUp = useCallback(() => {
    if (!isDragging.current) return; isDragging.current = false
    const dx = currentX.current
    if (Math.abs(dx) > SWIPE_THRESHOLD) triggerSwipe(dx > 0 ? 'right' : 'left')
    else setDragX(0)
  }, [triggerSwipe])

  const stackScale = 1 - stackIndex * 0.04
  const stackY = stackIndex * 10
  const rotation = isFlying ? (flyDir === 'right' ? 22 : -22) : dragX * ROTATION_FACTOR
  const translateX = isFlying ? (flyDir === 'right' ? '160%' : '-160%') : `${dragX}px`
  const cardOpacity = isFlying ? 0 : 1 - stackIndex * 0.12
  const swipeProgress = Math.min(Math.abs(dragX) / SWIPE_THRESHOLD, 1)

  if (stackIndex > 2) return null

  return (
    <div ref={cardRef}
      className={`absolute inset-0 select-none ${isTop ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
      style={{
        transform: isTop ? `translateX(${translateX}) rotate(${rotation}deg)` : `scale(${stackScale}) translateY(${stackY}px)`,
        transition: isDragging.current ? 'none' : 'transform .34s cubic-bezier(.25,.46,.45,.94), opacity .34s ease',
        opacity: cardOpacity, zIndex: 10 - stackIndex, willChange: 'transform',
      }}
      onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
    >
      <div className="relative w-full h-full rounded-3xl overflow-hidden bg-zinc-900 shadow-2xl shadow-black/80">
        {item.coverImage
          ? <img src={item.coverImage} alt={item.title} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
          : <div className="absolute inset-0 flex items-center justify-center bg-zinc-900"><Icon size={64} className="text-zinc-700" /></div>
        }
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/5 to-black/45" />

        {/* X chiudi */}
        <button onClick={e => { e.stopPropagation(); onClose() }}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-all z-20"
          style={ICON_DROP}>
          <X size={17} strokeWidth={2.5} />
        </button>

        {/* Badge tipo */}
        <div className="absolute top-3 left-3 z-10">
          <div className={`bg-gradient-to-r ${colorClass} text-white text-xs font-bold px-3 py-1 rounded-full`} style={ICON_DROP}>
            {TYPE_LABEL[item.type]}
          </div>
        </div>

        {/* Match / scoperta */}
        {!item.isDiscovery && item.matchScore >= 75 && (
          <div className="absolute top-12 left-3 z-10">
            <div className="flex items-center gap-1 bg-violet-600/90 backdrop-blur-sm text-white text-xs font-black px-2.5 py-1 rounded-full" style={ICON_DROP}>
              <Star size={10} fill="currentColor" />{item.matchScore}%
            </div>
          </div>
        )}
        {item.isDiscovery && (
          <div className="absolute top-12 left-3 z-10">
            <div className="flex items-center gap-1 bg-emerald-600/90 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full" style={ICON_DROP}>
              ✨ Scoperta
            </div>
          </div>
        )}

        {/* Swipe indicators */}
        {isTop && (
          <>
            <div className="absolute top-16 left-5 border-[3px] border-emerald-400 text-emerald-400 font-black text-xl px-4 py-1.5 rounded-2xl tracking-widest uppercase rotate-[-18deg] pointer-events-none z-10"
              style={{ opacity: dragX > 20 ? swipeProgress : 0, transition: 'opacity .08s', ...TEXT_SHADOW }}>
              Visto ✓
            </div>
            <div className="absolute top-16 right-5 border-[3px] border-red-400 text-red-400 font-black text-xl px-4 py-1.5 rounded-2xl tracking-widest uppercase rotate-[18deg] pointer-events-none z-10"
              style={{ opacity: dragX < -20 ? swipeProgress : 0, transition: 'opacity .08s', ...TEXT_SHADOW }}>
              Skip ✗
            </div>
          </>
        )}

        {/* Contenuto basso */}
        <div className="absolute bottom-0 left-0 right-0 p-5 pb-4 z-10">
          <h2 className="text-white font-bold text-[22px] leading-tight mb-1 line-clamp-2" style={TEXT_SHADOW}>
            {item.title}
          </h2>
          <p className="text-white/75 text-sm mb-4 flex items-center gap-2 flex-wrap" style={TEXT_SHADOW}>
            {item.year && <span>{item.year}</span>}
            {item.episodes && item.type !== 'movie' && (
              <span>{item.type === 'manga' ? `${item.episodes} cap.` : `${item.episodes} ep.`}</span>
            )}
            {item.genres.length > 0 && <span className="text-white/50">· {item.genres.slice(0,2).join(', ')}</span>}
          </p>

          <div data-stars="true" className={`flex items-center justify-center mb-4 ${!isTop ? 'opacity-0 pointer-events-none' : ''}`}>
            <HalfStarRating rating={rating} onChange={onRatingChange} />
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={e => { e.stopPropagation(); if (isTop && canUndo) onUndo() }}
              disabled={!canUndo || !isTop}
              className="flex items-center gap-1.5 px-2 py-2 rounded-xl text-white/65 hover:text-white disabled:opacity-20 disabled:pointer-events-none transition-colors"
              style={TEXT_SHADOW}
            >
              <RotateCcw size={14} style={ICON_DROP} />
              <span className="text-xs font-medium">Annulla</span>
            </button>

            <div className="flex items-center gap-4">
              <button onClick={e => { e.stopPropagation(); if (isTop) triggerSwipe('left') }}
                className={`w-14 h-14 rounded-full bg-red-500/20 border-2 border-red-400/60 flex items-center justify-center text-red-400 hover:bg-red-500/35 hover:border-red-400 active:scale-90 transition-all ${!isTop ? 'opacity-0 pointer-events-none' : ''}`}
                style={ICON_DROP}>
                <X size={24} strokeWidth={3} />
              </button>
              <button onClick={e => { e.stopPropagation(); if (isTop) onDetailOpen(item) }}
                className={`w-10 h-10 rounded-full bg-white/15 border border-white/35 flex items-center justify-center text-white/75 hover:bg-white/25 hover:text-white active:scale-90 transition-all ${!isTop ? 'opacity-0 pointer-events-none' : ''}`}
                style={ICON_DROP}>
                <ChevronRight size={20} strokeWidth={2.5} />
              </button>
              <button onClick={e => { e.stopPropagation(); if (isTop) triggerSwipe('right') }}
                className={`w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-400/60 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/35 hover:border-emerald-400 active:scale-90 transition-all ${!isTop ? 'opacity-0 pointer-events-none' : ''}`}
                style={ICON_DROP}>
                <Check size={24} strokeWidth={3} />
              </button>
            </div>
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
  const [queue, setQueue] = useState<SwipeItem[]>([])
  const [skippedReady, setSkippedReady] = useState(false)
  const [currentRating, setCurrentRating] = useState<number | null>(null)
  const [detailItem, setDetailItem] = useState<MediaDetails | null>(null)
  const [history, setHistory] = useState<SwipeItem[]>([])
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set(initialItems.map(i => i.id)))
  const loadingRef = useRef(false)

  // Carica skipped prima di mostrare card — evita flash riapertura
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('swipe_skipped').select('external_id').eq('user_id', user.id)
        const ids = new Set((data || []).map((r: any) => r.external_id as string))
        setSkippedIds(ids)
        setQueue(initialItems.filter(i => !ids.has(i.id)))
      } else {
        setQueue(initialItems)
      }
      setSkippedReady(true)
    }
    load()
  }, []) // eslint-disable-line

  useEffect(() => { setCurrentRating(null) }, [queue[0]?.id])

  const filteredQueue = (activeFilter === 'all' ? queue : queue.filter(i => i.type === activeFilter))
    .filter(i => !skippedIds.has(i.id))

  const loadMore = useCallback(async (filter: CategoryFilter) => {
    if (loadingRef.current) return
    loadingRef.current = true; setIsLoadingMore(true)
    try {
      const items = await onRequestMore(filter)
      const fresh = items.filter(i => !seenIds.has(i.id) && !skippedIds.has(i.id))
      if (fresh.length) {
        setQueue(prev => [...prev, ...fresh])
        setSeenIds(prev => { const n = new Set(prev); fresh.forEach(i => n.add(i.id)); return n })
      }
    } catch {}
    setIsLoadingMore(false); loadingRef.current = false
  }, [onRequestMore, seenIds, skippedIds])

  useEffect(() => {
    if (skippedReady && filteredQueue.length <= REFILL_THRESHOLD && !loadingRef.current) loadMore(activeFilter)
  }, [filteredQueue.length, activeFilter, skippedReady])

  const handleFilterChange = useCallback((filter: CategoryFilter) => {
    setActiveFilter(filter); setHistory([])
    const avail = (filter === 'all' ? queue : queue.filter(i => i.type === filter)).filter(i => !skippedIds.has(i.id))
    if (avail.length <= REFILL_THRESHOLD) loadMore(filter)
  }, [queue, skippedIds, loadMore])

  const persistToDb = useCallback((table: string, payload: Record<string, any>) => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      ;(supabase.from(table) as any).upsert({ user_id: user.id, ...payload }, { onConflict: 'user_id,external_id' }).then(() => {})
    })
  }, [supabase])

  const removeSkip = useCallback((item: SwipeItem) => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('swipe_skipped').delete().eq('user_id', user.id).eq('external_id', item.id).then(() => {})
    })
  }, [supabase])

  const handleSwipe = useCallback((dir: 'left' | 'right', item: SwipeItem) => {
    setHistory(prev => [item, ...prev].slice(0, 10))
    setQueue(prev => prev.filter(i => i.id !== item.id))
    setSkippedIds(prev => new Set([...prev, item.id]))

    if (dir === 'right') {
      // Visto: aggiunge al profilo con voto + non ricompare in swipe
      const entry: Record<string, any> = {
        external_id: item.id, title: item.title, type: item.type,
        cover_image: item.coverImage, genres: item.genres || [],
        status: 'completed', updated_at: new Date().toISOString(),
      }
      if (currentRating !== null) entry.user_rating = currentRating
      persistToDb('user_media_entries', entry)
      persistToDb('swipe_skipped', { external_id: item.id, title: item.title, type: item.type })
      onSeen(item, currentRating)
    } else {
      // Skip: solo swipe_skipped, nessun effetto sul profilo
      persistToDb('swipe_skipped', { external_id: item.id, title: item.title, type: item.type })
    }
  }, [currentRating, onSeen, persistToDb])

  const handleUndo = useCallback(() => {
    if (!history.length) return
    const [last, ...rest] = history
    setHistory(rest)
    setQueue(prev => [last, ...prev])
    setSkippedIds(prev => { const n = new Set(prev); n.delete(last.id); return n })
    removeSkip(last)
  }, [history, removeSkip])

  const handleDetailOpen = useCallback((item: SwipeItem) => {
    setDetailItem({
      id: item.id, title: item.title, type: item.type, coverImage: item.coverImage,
      year: item.year, genres: item.genres, description: item.description, score: item.score,
      episodes: item.episodes, authors: item.authors, developers: item.developers,
      platforms: item.platforms, why: item.why, matchScore: item.matchScore,
      isAwardWinner: item.isAwardWinner, source: item.source,
    })
  }, [])

  // Spinner iniziale (evita flash card sessione precedente)
  if (!skippedReady) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center" style={{ zIndex: 9999 }}>
        <LoadingScreen message="Preparazione in corso" />
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black flex flex-col" style={{ zIndex: 9999 }}>

        {/* Filtri categoria centrati */}
        <div className="flex-shrink-0 flex justify-center px-4"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
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

        {/* Area card */}
        <div className="flex-1 flex items-center justify-center px-4 py-2 min-h-0">
          {filteredQueue.length === 0 && isLoadingMore ? (
            <LoadingScreen />
          ) : filteredQueue.length === 0 ? (
            <div className="text-center px-6">
              <div className="w-20 h-20 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-violet-500/30">
                <Check size={36} className="text-white" />
              </div>
              <h2 className="text-white text-2xl font-bold mb-2">Hai finito!</h2>
              <p className="text-zinc-400 text-sm mb-8">Hai visto tutti i titoli disponibili per ora.</p>
              <button onClick={onClose}
                className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-2xl transition-colors">
                Torna ai consigli
              </button>
            </div>
          ) : (
            <div className="relative w-full max-w-sm" style={{ height: 'min(680px, 82svh)' }}>
              {filteredQueue.slice(0, 3).map((item, idx) => (
                <SwipeCard key={item.id} item={item} isTop={idx === 0} stackIndex={idx}
                  onSwipe={handleSwipe}
                  rating={idx === 0 ? currentRating : null}
                  onRatingChange={setCurrentRating}
                  onDetailOpen={handleDetailOpen}
                  onUndo={handleUndo} canUndo={history.length > 0} onClose={onClose}
                />
              ))}
            </div>
          )}
        </div>

        {filteredQueue.length > 0 && (
          <div className="text-center flex-shrink-0 pointer-events-none select-none"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
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