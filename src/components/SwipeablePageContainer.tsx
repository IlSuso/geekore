'use client'
// SwipeablePageContainer.tsx
// Swipe identico a Instagram:
// - Le pagine si muovono in sincronia 1:1 con il dito
// - Snap verso la pagina target se supera soglia, altrimenti torna indietro
// - Curve di animazione identiche (cubic-bezier di iOS)
// - Overflow clip per nascondere i bordi
// - Mutex con pull-to-refresh
//
// FIX swipe conflict: se il touch parte dentro un elemento con scroll
// orizzontale (overflow-x: auto/scroll) o con [data-no-swipe], il
// page-switch NON si attiva — l'elemento interno possiede il gesto.

import { usePathname, useRouter } from 'next/navigation'
import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react'
import { gestureState } from '@/hooks/gestureState'

const TAB_ORDER = ['/feed', '/discover', '/for-you', '/trending', '/profile/me']
const CONFIRM_THRESHOLD = 120  // px — alzato per evitare conflitti con gesture OS
const VELOCITY_THRESHOLD = 0.35 // px/ms
const EDGE_DEAD_ZONE = 28       // px dai bordi: riservato alle gesture OS (back swipe)

// Ease identico a iOS spring navigation
const EASE_OUT  = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
const EASE_SNAP = 'cubic-bezier(0.22, 1, 0.36, 1)'  // spring-ish snap back

// Ritorna true se il target (o un suo antenato) è un elemento che gestisce
// lo scroll orizzontale in modo nativo — in quel caso non attiviamo il
// page-switch perché l'elemento si aspetta di ricevere il gesto.
function isInsideHorizontalScroller(target: EventTarget | null): boolean {
  let node = target as HTMLElement | null
  while (node && node.tagName !== 'BODY') {
    // Opt-out esplicito via attributo data
    if (node.dataset && 'noSwipe' in node.dataset) return true
    const ox = window.getComputedStyle(node).overflowX
    if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth) return true
    node = node.parentElement
  }
  return false
}

export function SwipeablePageContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const wrapRef = useRef<HTMLDivElement>(null)

  const touchStartX   = useRef(0)
  const touchStartY   = useRef(0)
  const touchStartT   = useRef(0)
  const lastDeltaX    = useRef(0)
  const isH           = useRef<boolean | null>(null)
  const vw            = useRef(0)
  const isDragging    = useRef(false)
  // true solo se onTouchStart ha accettato il touch (non era in un carousel)
  const captured      = useRef(false)

  const [offset, setOffset] = useState(0)
  const [animate, setAnimate] = useState(false)

  const currentIdx = TAB_ORDER.findIndex(t => {
    if (t === '/profile/me') return pathname.startsWith('/profile/')
    if (t === '/feed')       return pathname === '/feed' || pathname === '/'
    return pathname === t
  })

  const isMain  = currentIdx !== -1
  const prevTab = currentIdx > 0 ? TAB_ORDER[currentIdx - 1] : null
  const nextTab = currentIdx < TAB_ORDER.length - 1 ? TAB_ORDER[currentIdx + 1] : null

  useEffect(() => {
    vw.current = window.innerWidth
    const fn = () => { vw.current = window.innerWidth }
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => {
    captured.current    = false
    isDragging.current  = false
    gestureState.swipeActive = false
    setAnimate(false)
    setOffset(0)
  }, [pathname])

  const onTouchStart = useCallback((e: TouchEvent) => {
    captured.current = false  // reset ad ogni nuovo touch
    if (!isMain) return
    if (gestureState.pullActive) return

    const x = e.touches[0].clientX
    if (x <= EDGE_DEAD_ZONE || x >= (vw.current || window.innerWidth) - EDGE_DEAD_ZONE) return

    // Se il touch parte dentro un carousel/scroller orizzontale,
    // lasciamo che sia quell'elemento a gestire il gesto.
    if (isInsideHorizontalScroller(e.target)) return

    // Touch accettato: inizializziamo il tracking
    captured.current    = true
    touchStartX.current = x
    touchStartY.current = e.touches[0].clientY
    touchStartT.current = performance.now()
    lastDeltaX.current  = 0
    isH.current         = null
    isDragging.current  = false
    setAnimate(false)
  }, [isMain])

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!captured.current) return  // touch non preso in carico → ignora
    if (!isMain) return
    if (gestureState.pullActive) return

    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current

    if (isH.current === null) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      isH.current = Math.abs(dx) > Math.abs(dy) * 1.4
      if (!isH.current) return
    }
    if (!isH.current) return

    e.preventDefault()
    isDragging.current = true
    gestureState.swipeActive = true
    lastDeltaX.current = dx

    if (dx > 0 && !prevTab) { setOffset(Math.pow(dx, 0.6) * 0.5); return }
    if (dx < 0 && !nextTab) { setOffset(-Math.pow(-dx, 0.6) * 0.5); return }

    setOffset(dx)
  }, [isMain, prevTab, nextTab])

  const onTouchEnd = useCallback(() => {
    gestureState.swipeActive = false

    if (!captured.current || !isMain || !isDragging.current) {
      captured.current   = false
      setAnimate(true); setOffset(0)
      isH.current        = null
      isDragging.current = false
      return
    }

    captured.current = false

    const dx       = lastDeltaX.current
    const elapsed  = Math.max(performance.now() - touchStartT.current, 1)
    const velocity = Math.abs(dx) / elapsed
    const w        = vw.current || window.innerWidth

    const shouldNav = Math.abs(dx) > CONFIRM_THRESHOLD || velocity > VELOCITY_THRESHOLD

    if (shouldNav && dx > 0 && prevTab) {
      setAnimate(true)
      setOffset(w)
      setTimeout(() => { router.push(prevTab) }, 260)
    } else if (shouldNav && dx < 0 && nextTab) {
      setAnimate(true)
      setOffset(-w)
      setTimeout(() => { router.push(nextTab) }, 260)
    } else {
      setAnimate(true)
      setOffset(0)
    }

    isH.current        = null
    isDragging.current = false
  }, [isMain, prevTab, nextTab, router])

  const onTouchCancel = useCallback(() => {
    captured.current         = false
    gestureState.swipeActive = false
    isDragging.current       = false
    isH.current              = null
    setAnimate(true)
    setOffset(0)
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    el.addEventListener('touchstart',  onTouchStart,  { passive: true })
    el.addEventListener('touchmove',   onTouchMove,   { passive: false })
    el.addEventListener('touchend',    onTouchEnd,    { passive: true })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart',  onTouchStart)
      el.removeEventListener('touchmove',   onTouchMove)
      el.removeEventListener('touchend',    onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [onTouchStart, onTouchMove, onTouchEnd, onTouchCancel])

  const translateX = offset !== 0 ? `translateX(${offset}px)` : 'none'
  const transition = animate
    ? `transform 0.28s ${offset === 0 ? EASE_SNAP : EASE_OUT}`
    : 'none'

  return (
    <div
      ref={wrapRef}
      style={{
        transform:                translateX,
        transition,
        willChange:               offset !== 0 ? 'transform' : 'auto',
        backfaceVisibility:       'hidden',
        WebkitBackfaceVisibility: 'hidden',
        minHeight:                '100%',
        overflow:                 isMain && offset !== 0 ? 'hidden' : undefined,
      }}
    >
      {children}
    </div>
  )
}
