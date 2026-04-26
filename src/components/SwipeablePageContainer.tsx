'use client'
// SwipeablePageContainer — swipe orizzontale tra i tab principali.
//
// Uguale all'originale eccetto:
//   - TAB_ORDER aggiornato: /swipe al posto di /trending (allineato al mobile nav)
//   - Rimosso lo sfondo scuro (il body è già nero)
//
// Gestione conflitti:
//   1. EDGE_DEAD_ZONE = 44px (gesture zone Samsung/iOS)
//   2. isInsideHorizontalScroller: non ruba gesti da carousel
//   3. gestureState.drawerActive: page-switch disabilitato se drawer aperto
//   4. captured ref: solo touch accettati da onTouchStart

import { usePathname, useRouter } from 'next/navigation'
import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react'
import { gestureState } from '@/hooks/gestureState'
import { swipeNavBridge } from '@/hooks/swipeNavBridge'

export const TAB_ORDER = ['/home', '/discover', '/for-you', '/swipe', '/profile/me']

const CONFIRM_THRESHOLD  = 120   // px
const VELOCITY_THRESHOLD = 0.35  // px/ms
const EDGE_DEAD_ZONE     = 44
const EDGE_DEAD_ZONE_Y_BOTTOM = 24  // FIX 10: home indicator + navbar area

const EASE_OUT  = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
const EASE_SNAP = 'cubic-bezier(0.22, 1, 0.36, 1)'

function isInsideHorizontalScroller(target: EventTarget | null): boolean {
  let node = target as HTMLElement | null
  while (node && node.tagName !== 'BODY') {
    if (node.dataset && 'noSwipe' in node.dataset) return true
    const ox = window.getComputedStyle(node).overflowX
    if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth) return true
    node = node.parentElement
  }
  return false
}

export function SwipeablePageContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const wrapRef  = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const touchStartT = useRef(0)
  const lastDeltaX  = useRef(0)
  const isH         = useRef<boolean | null>(null)
  const vw          = useRef(0)
  const isDragging  = useRef(false)
  const captured    = useRef(false)

  const [offset,       setOffset]       = useState(0)
  const [animate,      setAnimate]      = useState(false)
  // True while the snap-back CSS transition is playing — keeps the GPU layer
  // alive and the stacking context stable until the animation is fully done.
  const [snapping,     setSnapping]     = useState(false)

  const currentIdx = TAB_ORDER.findIndex(t => {
    if (t === '/profile/me') return pathname.startsWith('/profile/')
    if (t === '/home')       return pathname === '/home' || pathname === '/'
    return pathname === t
  })

  const isMain  = currentIdx !== -1
  const prevTab = currentIdx > 0                     ? TAB_ORDER[currentIdx - 1] : null
  const nextTab = currentIdx < TAB_ORDER.length - 1 ? TAB_ORDER[currentIdx + 1] : null

  useEffect(() => {
    vw.current = window.innerWidth
    const fn = () => { vw.current = window.innerWidth }
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  useEffect(() => {
    captured.current         = false
    isDragging.current       = false
    gestureState.swipeActive = false
    setAnimate(false)
    setOffset(0)
    setSnapping(false)
  }, [pathname])

  // Clear snapping flag as soon as the CSS snap-back transition ends.
  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const onEnd = () => setSnapping(false)
    el.addEventListener('transitionend', onEnd)
    return () => el.removeEventListener('transitionend', onEnd)
  }, [])

  const onTouchStart = useCallback((e: TouchEvent) => {
    captured.current = false
    if (!isMain) return
    if (gestureState.pullActive)   return
    if (gestureState.drawerActive) return
    // FIX 9: defense in depth — controlla anche il DOM per drawer aperti
    if (document.querySelector('[data-drawer-open="true"]')) return

    const x = e.touches[0].clientX
    const y = e.touches[0].clientY
    const w = vw.current || window.innerWidth
    const h = window.innerHeight
    if (x <= EDGE_DEAD_ZONE || x >= w - EDGE_DEAD_ZONE) return
    // FIX 10: dead zone Y bottom — evita conflitti con home indicator / navbar
    if (y >= h - EDGE_DEAD_ZONE_Y_BOTTOM) return
    if (isInsideHorizontalScroller(e.target)) return

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
    if (!captured.current || !isMain || gestureState.pullActive) return

    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current

    if (isH.current === null) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      isH.current = Math.abs(dx) > Math.abs(dy) * 1.4
      if (!isH.current) return
      swipeNavBridge.notifyStart(
        prevTab ? TAB_ORDER.indexOf(prevTab) : null,
        nextTab ? TAB_ORDER.indexOf(nextTab) : null,
      )
    }
    if (!isH.current) return

    e.preventDefault()
    isDragging.current       = true
    gestureState.swipeActive = true
    lastDeltaX.current       = dx

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
      setAnimate(true); setOffset(w)
      setTimeout(() => { router.push(prevTab) }, 260)
    } else if (shouldNav && dx < 0 && nextTab) {
      setAnimate(true); setOffset(-w)
      setTimeout(() => { router.push(nextTab) }, 260)
    } else {
      setSnapping(true)
      setAnimate(true); setOffset(0)
      swipeNavBridge.notifyEnd()
    }

    isH.current        = null
    isDragging.current = false
  }, [isMain, prevTab, nextTab, router])

  const onTouchCancel = useCallback(() => {
    captured.current         = false
    gestureState.swipeActive = false
    isDragging.current       = false
    isH.current              = null
    setSnapping(true)
    setAnimate(true); setOffset(0)
    swipeNavBridge.notifyEnd()
  }, [])

  useEffect(() => {
    const el = wrapRef.current; if (!el) return
    el.addEventListener('touchstart',  onTouchStart,  { passive: true  })
    el.addEventListener('touchmove',   onTouchMove,   { passive: false })
    el.addEventListener('touchend',    onTouchEnd,    { passive: true  })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true  })
    return () => {
      el.removeEventListener('touchstart',  onTouchStart)
      el.removeEventListener('touchmove',   onTouchMove)
      el.removeEventListener('touchend',    onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [onTouchStart, onTouchMove, onTouchEnd, onTouchCancel])

  // Use translateX(Npx) while dragging OR while the snap-back transition is
  // playing (snapping=true). Switch to 'none' only after transitionend fires.
  // This keeps the GPU layer stable for the whole animation without permanently
  // trapping position:fixed descendants (which would break SwipeMode's inset-0).
  const isActive   = offset !== 0 || snapping
  const translateX = isActive ? `translateX(${offset}px)` : 'none'
  const transition = animate
    ? `transform 0.28s ${offset === 0 ? EASE_SNAP : EASE_OUT}`
    : 'none'

  // FIX 2: outer wrapper senza transform (non crea containing block per i fixed),
  // inner wrapper con transform (contiene solo il contenuto scrollabile).
  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        zIndex: 0,
        minHeight: '100%',
        // nessun transform qui — il containing block dei fixed discendenti
        // resta il viewport
      }}
    >
      <div
        ref={innerRef}
        style={{
          transform: translateX,
          transition,
          willChange: isActive ? 'transform' : 'auto',
          ...(isActive ? {
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          } : {}),
          minHeight: '100%',
        }}
      >
        {children}
      </div>
    </div>
  )
}
