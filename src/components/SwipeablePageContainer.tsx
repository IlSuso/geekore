'use client'
// SwipeablePageContainer — Instagram-style horizontal page transitions.
//
// Come funziona:
//   - La pagina corrente (wrapRef) viene traslata direttamente via DOM (no React state)
//     durante il gesto, garantendo 0 lag rispetto alle pagine adiacenti.
//   - KeepAliveTabShell riceve gli aggiornamenti tramite swipeNavBridge e sposta
//     le pagine adiacenti (position:fixed) in sincronia → effetto side-by-side.
//   - Rimosso lo sfondo nero: al suo posto si vedono le pagine reali.
//
// Conflict management (invariato):
//   1. EDGE_DEAD_ZONE = 44px (gesture zone Samsung/iOS)
//   2. isInsideHorizontalScroller: non ruba gesti da carousel
//   3. gestureState.drawerActive: page-switch disabilitato se drawer aperto
//   4. captured ref: solo touch accettati da onTouchStart vengono processati

import { usePathname, useRouter } from 'next/navigation'
import { useRef, useCallback, useEffect, type ReactNode } from 'react'
import { gestureState } from '@/hooks/gestureState'
import { swipeNavBridge } from '@/hooks/swipeNavBridge'

export const TAB_ORDER = ['/feed', '/discover', '/for-you', '/swipe', '/profile/me']

const CONFIRM_THRESHOLD  = 120   // px
const VELOCITY_THRESHOLD = 0.35  // px/ms
const EDGE_DEAD_ZONE     = 44    // px — copre gesture zone Samsung/iOS

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

function tabIdx(pathname: string): number {
  return TAB_ORDER.findIndex(t => {
    if (t === '/profile/me') return pathname.startsWith('/profile/')
    if (t === '/feed')       return pathname === '/feed' || pathname === '/'
    return pathname === t
  })
}

export function SwipeablePageContainer({ children }: { children: ReactNode }) {
  const pathname   = usePathname()
  const router     = useRouter()
  const wrapRef    = useRef<HTMLDivElement>(null)

  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const touchStartT = useRef(0)
  const lastDeltaX  = useRef(0)
  const isH         = useRef<boolean | null>(null)
  const vw          = useRef(0)
  const isDragging  = useRef(false)
  const captured    = useRef(false)

  const currentIdx = tabIdx(pathname)
  const isMain  = currentIdx !== -1
  const prevTab = currentIdx > 0                       ? TAB_ORDER[currentIdx - 1] : null
  const nextTab = currentIdx < TAB_ORDER.length - 1   ? TAB_ORDER[currentIdx + 1] : null

  // Keep refs so callbacks always see fresh values without stale closures
  const isMainRef   = useRef(isMain)
  const prevTabRef  = useRef(prevTab)
  const nextTabRef  = useRef(nextTab)
  const idxRef      = useRef(currentIdx)
  useEffect(() => {
    isMainRef.current  = isMain
    prevTabRef.current = prevTab
    nextTabRef.current = nextTab
    idxRef.current     = currentIdx
  })

  const setWrap = useCallback((x: number, transition = 'none') => {
    const el = wrapRef.current; if (!el) return
    el.style.transition = transition
    el.style.transform  = x === 0 ? 'none' : `translateX(${x}px)`
  }, [])

  useEffect(() => {
    vw.current = window.innerWidth
    const fn = () => { vw.current = window.innerWidth }
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // Reset on route change
  useEffect(() => {
    captured.current         = false
    isDragging.current       = false
    gestureState.swipeActive = false
    setWrap(0)
    swipeNavBridge.update(0, currentIdx, false)
  }, [pathname]) // eslint-disable-line

  const onTouchStart = useCallback((e: TouchEvent) => {
    captured.current = false
    if (!isMainRef.current)    return
    if (gestureState.pullActive)   return
    if (gestureState.drawerActive) return

    const x = e.touches[0].clientX
    const w = vw.current || window.innerWidth
    if (x <= EDGE_DEAD_ZONE || x >= w - EDGE_DEAD_ZONE) return
    if (isInsideHorizontalScroller(e.target)) return

    captured.current    = true
    touchStartX.current = x
    touchStartY.current = e.touches[0].clientY
    touchStartT.current = performance.now()
    lastDeltaX.current  = 0
    isH.current         = null
    isDragging.current  = false
  }, [])

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!captured.current || !isMainRef.current || gestureState.pullActive) return

    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current

    if (isH.current === null) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      isH.current = Math.abs(dx) > Math.abs(dy) * 1.4
      if (!isH.current) return
    }
    if (!isH.current) return

    e.preventDefault()
    isDragging.current       = true
    gestureState.swipeActive = true
    lastDeltaX.current       = dx

    const p = prevTabRef.current; const n = nextTabRef.current
    let effectiveDx = dx
    if (dx > 0 && !p) effectiveDx =  Math.pow(dx, 0.6) * 0.5
    if (dx < 0 && !n) effectiveDx = -Math.pow(-dx, 0.6) * 0.5

    setWrap(effectiveDx)
    swipeNavBridge.update(effectiveDx, idxRef.current, false)
  }, [setWrap])

  const onTouchEnd = useCallback(() => {
    gestureState.swipeActive = false

    if (!captured.current || !isMainRef.current || !isDragging.current) {
      captured.current   = false
      setWrap(0, `transform 0.28s ${EASE_SNAP}`)
      swipeNavBridge.update(0, idxRef.current, true)
      isH.current        = null
      isDragging.current = false
      return
    }

    captured.current = false
    isH.current      = null
    isDragging.current = false

    const dx       = lastDeltaX.current
    const elapsed  = Math.max(performance.now() - touchStartT.current, 1)
    const velocity = Math.abs(dx) / elapsed
    const w        = vw.current || window.innerWidth
    const shouldNav = Math.abs(dx) > CONFIRM_THRESHOLD || velocity > VELOCITY_THRESHOLD
    const p = prevTabRef.current; const n = nextTabRef.current; const idx = idxRef.current

    if (shouldNav && dx > 0 && p) {
      setWrap(w, `transform 0.28s ${EASE_SNAP}`)
      swipeNavBridge.update(w, idx, true)
      setTimeout(() => { router.push(p) }, 260)
    } else if (shouldNav && dx < 0 && n) {
      setWrap(-w, `transform 0.28s ${EASE_SNAP}`)
      swipeNavBridge.update(-w, idx, true)
      setTimeout(() => { router.push(n) }, 260)
    } else {
      setWrap(0, `transform 0.28s ${EASE_SNAP}`)
      swipeNavBridge.update(0, idx, true)
    }
  }, [setWrap, router])

  const onTouchCancel = useCallback(() => {
    captured.current         = false
    gestureState.swipeActive = false
    isDragging.current       = false
    isH.current              = null
    setWrap(0, `transform 0.28s ${EASE_SNAP}`)
    swipeNavBridge.update(0, idxRef.current, true)
  }, [setWrap])

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

  return (
    <div ref={wrapRef} style={{ minHeight: '100%', willChange: 'transform' }}>
      {children}
    </div>
  )
}
