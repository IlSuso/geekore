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

// Restituisce true se il touch parte da una zona esplicitamente marcata come
// zona di page-swipe (data-page-swipe-zone). In questo caso il gesto viene
// sempre trattato come navigazione tra pagine, ignorando data-no-swipe.
function isInPageSwipeZone(target: EventTarget | null): boolean {
  let node = target as HTMLElement | null
  while (node && node.tagName !== 'BODY') {
    if (node.dataset && 'pageSwipeZone' in node.dataset) return true
    node = node.parentElement
  }
  return false
}

// Restituisce true solo se il touch è dentro un elemento scrollabile orizzontalmente
// CHE ha ancora spazio per scorrere nella direzione del gesto (dx>0 = verso destra = scroll a sx).
// Se l'elemento è a fine corsa nella direzione del gesto, restituisce false:
// il gesto viene "passato" al page-swipe (scroll chaining, come iOS/Android nativi).
function isInsideHorizontalScroller(target: EventTarget | null, dx: number): boolean {
  let node = target as HTMLElement | null
  while (node && node.tagName !== 'BODY') {
    if (node.dataset && 'noSwipe' in node.dataset) return true
    const ox = window.getComputedStyle(node).overflowX
    if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth) {
      const { scrollLeft, scrollWidth, clientWidth } = node
      const atStart = scrollLeft <= 0
      const atEnd   = scrollLeft + clientWidth >= scrollWidth - 1
      // dx > 0 = dito verso destra = si sta scrollando verso sinistra (scrollLeft decresce)
      // dx < 0 = dito verso sinistra = si sta scrollando verso destra (scrollLeft aumenta)
      const blocksSwipe = dx > 0 ? !atStart : !atEnd
      if (blocksSwipe) return true
      // A fine corsa nella direzione del gesto: lascia passare al page-swipe
    }
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
  const touchTarget   = useRef<EventTarget | null>(null)
  const inSwipeZone  = useRef(false)

  // offset e animate sono gestiti direttamente sul DOM durante il drag
  // per evitare re-render React ad ogni pixel — zero lag durante lo swipe.
  const offsetRef      = useRef(0)
  const animateRef     = useRef(false)
  const [snapping,     setSnapping]     = useState(false)

  // isFixedPage: true quando il tab corrente usa position:fixed inset-0 (es. SwipeMode).
  // In quel caso NON applichiamo transform al wrapper — romperebbe il contesto
  // di position:fixed dei figli. Il movimento degli adjacent panel è già gestito
  // da KeepAliveTabShell tramite swipeNavBridge (translateX sui panel stessi).
  const isFixedPageRef = useRef(false)

  const applyTransform = useCallback((px: number, withAnim: boolean, easing?: string) => {
    if (isFixedPageRef.current) return // no transform su pagine fixed inset-0
    const el = wrapRef.current
    if (!el) return
    offsetRef.current  = px
    animateRef.current = withAnim
    el.style.transform  = (px !== 0 || withAnim) ? `translateX(${px}px)` : 'none'
    el.style.transition = withAnim ? `transform 0.28s ${easing ?? EASE_OUT}` : 'none'
    el.style.willChange = (px !== 0 || withAnim) ? 'transform' : 'auto'
    if (withAnim) {
      el.style.backfaceVisibility = 'hidden'
    } else if (px === 0) {
      el.style.backfaceVisibility = ''
    }
  }, [])

  const currentIdx = TAB_ORDER.findIndex(t => {
    if (t === '/profile/me') return pathname.startsWith('/profile/')
    if (t === '/home')       return pathname === '/home' || pathname === '/'
    return pathname === t
  })

  const isMain   = currentIdx !== -1
  const prevTab  = currentIdx > 0                     ? TAB_ORDER[currentIdx - 1] : null
  const nextTab  = currentIdx < TAB_ORDER.length - 1 ? TAB_ORDER[currentIdx + 1] : null

  // Aggiorna isFixedPageRef: /swipe usa SwipeMode con fixed inset-0.
  // Il transform sul wrapper romperebbe position:fixed dei figli.
  isFixedPageRef.current = pathname === '/swipe'

  // Declared early so useEffect below can reference it before the bottom-of-function aliases.
  // isActive è true durante la transizione CSS di snap-back (gestita da snapping).
  // Durante il drag il body scroll è bloccato da gestureState.swipeActive in onTouchMove.
  const isActive = snapping

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
    inSwipeZone.current      = false
    applyTransform(0, false)
    setSnapping(false)
    document.documentElement.removeAttribute('data-swiping')
    document.documentElement.removeAttribute('data-to-swipe')
  }, [pathname])

  // Lock body scroll durante lo snap-back (transizione CSS finale).
  // Durante il drag il body scroll è già bloccato da e.preventDefault() in onTouchMove.
  useEffect(() => {
    if (snapping) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [snapping])

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
    // Il check scroll-chaining viene fatto in onTouchMove quando
    // la direzione (dx) è nota. Qui salviamo solo il target.
    // Eccezione: data-page-swipe-zone forza sempre il page-swipe.
    captured.current       = true
    touchTarget.current    = e.target
    inSwipeZone.current    = isInPageSwipeZone(e.target)
    touchStartX.current = x
    touchStartY.current = e.touches[0].clientY
    touchStartT.current = performance.now()
    lastDeltaX.current  = 0
    isH.current         = null
    isDragging.current  = false
  }, [isMain, applyTransform])

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!captured.current || !isMain || gestureState.pullActive) return

    const dx = e.touches[0].clientX - touchStartX.current
    const dy = e.touches[0].clientY - touchStartY.current

    // ── Determina direzione al primo frame con movimento sufficiente ──────────
    if (isH.current === null) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return
      isH.current = Math.abs(dx) > Math.abs(dy) * 1.4
      if (!isH.current) return // gesto verticale → non intercettare
    }

    // ── Scroll chaining ────────────────────────────────────────────────────────
    // data-page-swipe-zone: zona franca — il page-swipe ha sempre precedenza,
    // ignora qualsiasi scroller nidificato.
    // Altrimenti: se l'elemento ha ancora spazio per scorrere nella direzione
    // del drag → lascia fare scroll nativo e ricontrolla al frame successivo.
    if (isH.current === true && !inSwipeZone.current && isInsideHorizontalScroller(touchTarget.current, dx)) {
      isH.current = null // non ancora deciso: ricontrolla al prossimo frame
      return
    }

    // ── Avvia page-swipe (prima volta che isH===true e scroller non blocca) ──
    if (isH.current === true && !isDragging.current) {
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

    if (dx > 0 && !prevTab) { applyTransform(Math.pow(dx, 0.6) * 0.5, false); return }
    if (dx < 0 && !nextTab) { applyTransform(-Math.pow(-dx, 0.6) * 0.5, false); return }
    applyTransform(dx, false)
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
      applyTransform(w, true, EASE_OUT)
      // isFixedPage: nessuna animazione slide → naviga subito, altrimenti aspetta la transizione
      setTimeout(() => { router.replace(prevTab) }, isFixedPageRef.current ? 0 : 260)
    } else if (shouldNav && dx < 0 && nextTab) {
      applyTransform(-w, true, EASE_OUT)
      setTimeout(() => { router.replace(nextTab) }, isFixedPageRef.current ? 0 : 260)
    } else {
      r.removeAttribute('data-to-swipe')
      setSnapping(true)
      applyTransform(0, true, EASE_SNAP)
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
      applyTransform(0, true, EASE_SNAP)
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
    applyTransform(0, true, EASE_SNAP)
    swipeNavBridge.notifyEnd()
  }
  useEffect(() => {
    const handler = () => abortSwipeRef.current()
    window.addEventListener('popstate', handler, { capture: true })
    return () => window.removeEventListener('popstate', handler, { capture: true })
  }, [])

  // Il transform è applicato direttamente sul DOM da applyTransform() durante il drag.
  // React gestisce solo il wrapper esterno (clip) e l'elemento ref.
  // snapping=true mantiene il layer GPU attivo fino al termine della transizione CSS.
  return (
    <div style={{ overflow: 'clip', overscrollBehaviorX: 'none' }}>
      <div
        ref={wrapRef}
        style={{
          position:  'relative',
          zIndex:    0,
          minHeight: '100%',
        }}
      >
        {children}
      </div>
    </div>
  )
}