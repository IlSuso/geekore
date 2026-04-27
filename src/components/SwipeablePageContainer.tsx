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
const EDGE_DEAD_ZONE_RIGHT = 72  // bordo destro (nessuna back gesture Android)
// Dead zone sinistra = 22% viewport su Android — stessa strategia di Instagram.
const ANDROID_LEFT_DEAD_ZONE_RATIO = 0.22

const EASE_OUT  = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
const EASE_SNAP = 'cubic-bezier(0.22, 1, 0.36, 1)'

// Rilevamento piattaforma — calcolato una sola volta al caricamento del modulo.
// Su Android: la back gesture è un evento di sistema separato dal touch —
//   NON intercettiamo MAI il bordo sinistro (dead zone = 20% vp).
// Su iOS: la back gesture FA parte del touch stream (swipe interattivo) —
//   il bordo sinistro deve seguire il dito esattamente come fa Instagram.
const IS_IOS     = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
const IS_ANDROID = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)

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

  const isMain   = currentIdx !== -1
  const prevTab  = currentIdx > 0                     ? TAB_ORDER[currentIdx - 1] : null
  const nextTab  = currentIdx < TAB_ORDER.length - 1 ? TAB_ORDER[currentIdx + 1] : null

  // Declared early so useEffect below can reference it before the bottom-of-function aliases.
  const isActive = offset !== 0 || snapping

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
    document.documentElement.removeAttribute('data-swiping')
    document.documentElement.removeAttribute('data-to-swipe')
  }, [pathname])

  // Lock body scroll while a swipe is in progress. Without this, vertical
  // drift during a swipe could scroll the (potentially very tall) document,
  // which makes the fixed navbar appear to shift and reveals off-screen content.
  useEffect(() => {
    if (isActive) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isActive])

  // Clear snapping flag as soon as the CSS snap-back transition ends.
  useEffect(() => {
    const el = wrapRef.current
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

    const x = e.touches[0].clientX
    const w = vw.current || window.innerWidth
    // Android: dead zone sinistra = 20% vp → back gesture libera, noi non tocchiamo nulla.
    // iOS: il bordo sinistro è lo swipe interattivo nativo (segue il dito) → lo gestiamo noi.
    // Desktop: dead zone simmetrica fissa.
    if (IS_ANDROID) {
      const leftDeadZone = Math.round(w * ANDROID_LEFT_DEAD_ZONE_RATIO)
      if (x <= leftDeadZone || x >= w - EDGE_DEAD_ZONE_RIGHT) return
    } else if (IS_IOS) {
      // Su iOS permettiamo swipe anche dal bordo sinistro estremo (come fa Instagram).
      // Solo bordo destro escluso (nessuna back gesture lì).
      if (x >= w - EDGE_DEAD_ZONE_RIGHT) return
    } else {
      // Desktop: simmetrico
      if (x <= EDGE_DEAD_ZONE_RIGHT || x >= w - EDGE_DEAD_ZONE_RIGHT) return
    }
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
      const r = document.documentElement
      r.setAttribute('data-swiping', '')
      const toSwipe = (nextTab === '/swipe' && dx < 0) || (prevTab === '/swipe' && dx > 0)
      if (toSwipe) r.setAttribute('data-to-swipe', '')
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

    const r = document.documentElement
    r.removeAttribute('data-swiping')

    if (shouldNav && dx > 0 && prevTab) {
      setAnimate(true); setOffset(w)
      setTimeout(() => { router.replace(prevTab) }, 260)
    } else if (shouldNav && dx < 0 && nextTab) {
      setAnimate(true); setOffset(-w)
      setTimeout(() => { router.replace(nextTab) }, 260)
    } else {
      r.removeAttribute('data-to-swipe')
      setSnapping(true)
      setAnimate(true); setOffset(0)
      swipeNavBridge.notifyEnd()
    }

    isH.current        = null
    isDragging.current = false
  }, [isMain, prevTab, nextTab, router])

  const onTouchCancel = useCallback(() => {
    const wasDragging        = isDragging.current
    captured.current         = false
    gestureState.swipeActive = false
    isDragging.current       = false
    isH.current              = null
    const r = document.documentElement
    r.removeAttribute('data-swiping')
    r.removeAttribute('data-to-swipe')
    if (wasDragging) {
      setSnapping(true)
      setAnimate(true); setOffset(0)
      swipeNavBridge.notifyEnd()
    }
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

  // If a system back gesture fires (Android predictive back / iOS edge swipe)
  // while SPC has already captured a touch, abort the swipe immediately so the
  // page doesn't slide AND navigate at the same time.
  // We do NOT call stopImmediatePropagation — the popstate must still reach
  // Next.js so the system navigation completes normally.
  const abortSwipeRef = useRef<() => void>(() => {})
  abortSwipeRef.current = () => {
    if (!captured.current && !isDragging.current) return
    captured.current         = false
    isDragging.current       = false
    gestureState.swipeActive = false
    isH.current              = null
    document.documentElement.removeAttribute('data-swiping')
    document.documentElement.removeAttribute('data-to-swipe')
    setSnapping(true)
    setAnimate(true)
    setOffset(0)
    swipeNavBridge.notifyEnd()
  }
  useEffect(() => {
    const handler = () => abortSwipeRef.current()
    window.addEventListener('popstate', handler, { capture: true })
    return () => window.removeEventListener('popstate', handler, { capture: true })
  }, [])

  // Use translateX(Npx) while dragging OR while the snap-back transition is
  // playing (snapping=true). Switch to 'none' only after transitionend fires.
  // This keeps the GPU layer stable for the whole animation without permanently
  // trapping position:fixed descendants (which would break SwipeMode's inset-0).
  const translateX = isActive ? `translateX(${offset}px)` : 'none'
  const transition = animate
    ? `transform 0.28s ${offset === 0 ? EASE_SNAP : EASE_OUT}`
    : 'none'

  // Outer wrapper clips the off-screen keep-alive panels (position:absolute at
  // ±100vw) without becoming a scroll container. overflow:clip (unlike hidden)
  // does not force overflow-y to auto, so window.scrollTo / window.scrollY
  // keep working normally. Per CSS spec, content clipped by overflow:clip is
  // excluded from the ancestor's scrollable overflow, so the mobile browser
  // does not expand the layout viewport beyond device-width.
  return (
    <div style={{ overflow: 'clip', overscrollBehaviorX: 'none' }}>
      <div
        ref={wrapRef}
        style={{
          position:                 'relative',
          zIndex:                   0,
          transform:                translateX,
          transition,
          willChange:               isActive ? 'transform' : 'auto',
          ...(isActive ? {
            backfaceVisibility:       'hidden',
            WebkitBackfaceVisibility: 'hidden',
          } : {}),
          minHeight:                '100%',
        }}
      >
        {children}
      </div>
    </div>
  )
}