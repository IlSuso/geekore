'use client'
// SwipeablePageContainer — swipe orizzontale tra tab.
//
// ARCHITETTURA 2026 con Motion (motion/react):
//   - useMotionValue per x — aggiorna il DOM direttamente, ZERO re-render React
//   - animate() da Motion per snap/snap-back con spring fisica vera
//   - La spring usa la velocity del pollice al rilascio → feel nativo iOS/Android
//   - window.history.replaceState() per URL — non tocca Next.js router
//   - @use-gesture/react per il tracking touch (axis-lock, edge detection, ecc.)
//
// PERCHÉ Motion invece di CSS transition:
//   CSS transition ha durata fissa → non conosce la velocità del dito → si sente "meccanico".
//   Motion spring incorpora velocity → più swippi veloce, più veloce finisce → feel nativo.
//   useMotionValue bypassa completamente React render loop → 60fps garantito.

import { usePathname } from 'next/navigation'
import { useRef, useEffect, type ReactNode } from 'react'
import { useMotionValue, animate } from 'motion/react'
import { useDrag } from '@use-gesture/react'
import { gestureState } from '@/hooks/gestureState'
import { swipeNavBridge } from '@/hooks/swipeNavBridge'
import { useActiveTab, pathnameToTab } from '@/context/ActiveTabContext'

export const TAB_ORDER = ['/home', '/discover', '/for-you', '/swipe', '/profile/me']

// Soglia distanza: 40% viewport per confermare navigazione (allineato a iOS)
// Oppure swipe veloce: vx > 0.5 px/ms con spostamento minimo 30px
const THRESHOLD     = 0.40
const VEL_THRESHOLD = 0.5   // px/ms — use-gesture vx è già in px/ms
const MIN_DIST_VEL  = 30    // px minimi anche con velocity alta (evita trigger accidentali)
const EDGE          = 20    // dead zone bordi schermo per gesture di sistema

// Spring parameters — calibrati per feel nativo iOS/Android:
//   stiffness alta = risposta immediata, damping alto = nessun rimbalzo
//   restDelta/restSpeed = si ferma presto (no micro-oscillazioni percepibili)
const SPRING_NAV = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 40,
  mass: 1,
  restDelta: 0.5,
  restSpeed: 0.5,
}
// Snap-back più morbido (torna alla posizione originale)
const SPRING_BACK = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 35,
  mass: 1,
  restDelta: 0.5,
  restSpeed: 0.5,
}

function isHorizontalScroller(target: EventTarget | null, dx: number): boolean {
  let node = target as HTMLElement | null
  while (node && node.tagName !== 'BODY') {
    if (node.dataset && 'noSwipe' in node.dataset) return true
    const ox = window.getComputedStyle(node).overflowX
    if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth) {
      const { scrollLeft, scrollWidth, clientWidth } = node
      const atStart = scrollLeft <= 0
      const atEnd   = scrollLeft + clientWidth >= scrollWidth - 1
      if (dx > 0 ? !atStart : !atEnd) return true
    }
    node = node.parentElement
  }
  return false
}

export function SwipeablePageContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { setActiveTab } = useActiveTab()

  const currentIdx = TAB_ORDER.findIndex(t => {
    if (t === '/profile/me') return pathname.startsWith('/profile/')
    if (t === '/home')       return pathname === '/home'
    return pathname === t
  })
  const isMain  = currentIdx !== -1
  const prevTab = currentIdx > 0                    ? TAB_ORDER[currentIdx - 1] : null
  const nextTab = currentIdx < TAB_ORDER.length - 1 ? TAB_ORDER[currentIdx + 1] : null

  const prevTabRef    = useRef(prevTab)
  const nextTabRef    = useRef(nextTab)
  const currentIdxRef = useRef(currentIdx)
  prevTabRef.current    = prevTab
  nextTabRef.current    = nextTab
  currentIdxRef.current = currentIdx

  const bridgeStarted = useRef(false)
  // Flag: true se SwipeMode ha già gestito il release via notifyResolve.
  // Evita che useDrag processi di nuovo lo stesso touchend con dati sbagliati (mx≈0).
  const resolvedRef = useRef(false)

  // Motion values per i 3 panel (current, left, right) — DOM diretto, zero re-render
  // Il bridge di KeepAliveTabShell muove i panel via ref DOM diretto,
  // quindi qui gestiamo solo la notifica al bridge, non i panel direttamente.
  // La struttura rimane identica: swipeNavBridge.notifyDrag(dx) → KeepAliveTabShell muove i DOM.

  // onResolve: chiamato da SwipeMode al touchend della zona page.
  // Contiene la stessa logica navigate/snap-back di useDrag.last,
  // ma con dx/vx passati da SwipeMode (che ha tracciato il touch direttamente).
  useEffect(() => {
    const handleResolve = (dx: number, vx: number) => {
      if (!bridgeStarted.current) return
      resolvedRef.current = true  // segnala a useDrag di non processare questo touchend
      const w    = window.innerWidth
      const absX = Math.abs(dx)
      const shouldNav = absX > w * THRESHOLD || (Math.abs(vx) > VEL_THRESHOLD && absX > MIN_DIST_VEL)

      if (shouldNav && dx > 0 && prevTabRef.current) {
        const dest = prevTabRef.current
        const tab  = pathnameToTab(dest)
        if (tab) setActiveTab(tab)
        swipeNavBridge.notifySnap(w, vx, 0)
        window.history.replaceState(null, '', dest)
      } else if (shouldNav && dx < 0 && nextTabRef.current) {
        const dest = nextTabRef.current
        const tab  = pathnameToTab(dest)
        if (tab) setActiveTab(tab)
        swipeNavBridge.notifySnap(-w, vx, 0)
        window.history.replaceState(null, '', dest)
      } else {
        swipeNavBridge.notifySnap(0, vx, 0)
        swipeNavBridge.notifyEnd()
      }
      bridgeStarted.current = false
      gestureState.swipeActive = false
    }

    // Registra onResolve — non sovrascrive start/end/drag/snap già registrati da KeepAliveTabShell.
    // Usiamo un riferimento separato per non interferire con la registrazione del shell.
    swipeNavBridge._resolve = handleResolve

    return () => { swipeNavBridge._resolve = null }
  }, [setActiveTab]) // eslint-disable-line

  const bind = useDrag(
    ({ first, last, active, movement: [mx, my], velocity: [vx], xy: [x], event, cancel, memo }) => {
      if (!isMain) return memo

      // Blocca se altri gesti sono attivi
      if (gestureState.pullActive || gestureState.drawerActive) {
        cancel()
        return memo
      }

      // Dead zone bordi schermo (gesture di sistema iOS/Android)
      if (first) {
        const w = window.innerWidth
        if (x <= EDGE || x >= w - EDGE) { cancel(); return memo }
        bridgeStarted.current = false
        resolvedRef.current   = false
        // memo = { locked: null } — lock direzionale non ancora determinato
        return { locked: null }
      }

      // Lock direzionale: decidi la direzione dominante al primo movimento significativo
      // Evita swipe accidentali durante scroll verticale
      const memoState = (memo ?? { locked: null }) as { locked: 'x' | 'y' | null }
      if (memoState.locked === null) {
        const absX2 = Math.abs(mx)
        const absY2 = Math.abs(my)
        if (absX2 < 6 && absY2 < 6) return memoState // troppo poco per decidere
        if (absY2 > absX2 * 0.8) {
          // Prevalentemente verticale → cancella swipe
          cancel()
          return { locked: 'y' }
        }
        memoState.locked = 'x'
      }

      // Se abbiamo già lockato sul verticale, non fare nulla
      if (memoState.locked === 'y') return memoState

      // Cedi a scroller orizzontali interni
      if (!gestureState.pageSwipeZone && isHorizontalScroller(event?.target ?? null, mx)) {
        cancel()
        return memoState
      }

      const w    = window.innerWidth
      const absX = Math.abs(mx)

      if (active) {
        gestureState.swipeActive = true

        if (!bridgeStarted.current) {
          bridgeStarted.current = true
          swipeNavBridge.notifyStart(
            prevTabRef.current ? TAB_ORDER.indexOf(prevTabRef.current) : null,
            nextTabRef.current ? TAB_ORDER.indexOf(nextTabRef.current) : null,
          )
        }

        // Resistenza elastica ai bordi (primo/ultimo tab)
        if (mx > 0 && !prevTabRef.current) {
          swipeNavBridge.notifyDrag(Math.pow(mx, 0.55) * 0.35)
          return memoState
        }
        if (mx < 0 && !nextTabRef.current) {
          swipeNavBridge.notifyDrag(-Math.pow(-mx, 0.55) * 0.35)
          return memoState
        }

        swipeNavBridge.notifyDrag(mx)
        return memoState
      }

      // Rilascio (last === true)
      gestureState.swipeActive = false
      // Se SwipeMode ha già gestito questo release via notifyResolve, saltiamo.
      if (resolvedRef.current) { resolvedRef.current = false; return memoState }
      if (!bridgeStarted.current) return memoState

      // Naviga se: spostamento > soglia OPPURE swipe veloce abbastanza con distanza minima
      // vx da use-gesture è in px/ms
      const shouldNav = absX > w * THRESHOLD || (Math.abs(vx) > VEL_THRESHOLD && absX > MIN_DIST_VEL)

      if (shouldNav && mx > 0 && prevTabRef.current) {
        const dest = prevTabRef.current
        const tab  = pathnameToTab(dest)
        if (tab) setActiveTab(tab)
        // Passa velocity al bridge — KeepAliveTabShell la usa per la spring
        swipeNavBridge.notifySnap(w, vx, 0) // terzo param: 0 = usa spring (non durata fissa)
        window.history.replaceState(null, '', dest)
      } else if (shouldNav && mx < 0 && nextTabRef.current) {
        const dest = nextTabRef.current
        const tab  = pathnameToTab(dest)
        if (tab) setActiveTab(tab)
        swipeNavBridge.notifySnap(-w, vx, 0)
        window.history.replaceState(null, '', dest)
      } else {
        // Snap-back con spring
        swipeNavBridge.notifySnap(0, vx, 0)
        swipeNavBridge.notifyEnd()
      }

      bridgeStarted.current = false
      return memoState
    },
    {
      // Rimuoviamo axis:'x' — gestiamo il lock direzionale manualmente
      // per avere pieno controllo: blocca lo swipe se prevalentemente verticale
      filterTaps: true,
      pointer: { touch: true },
      threshold: 4,
      from: () => [0, 0],
      eventOptions: { passive: false },
    }
  )



  return (
    <div
      {...bind()}
      style={{ minHeight: '100dvh', touchAction: 'pan-y' }}
    >
      {children}
    </div>
  )
}