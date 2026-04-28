'use client'
// SwipeablePageContainer — swipe orizzontale tra tab.
//
// SOLUZIONE DEFINITIVA:
//   - @use-gesture/react gestisce tutto il touch (velocity, axis-lock, swipe detection)
//   - I panel si muovono via DOM diretto (zero React re-render durante il drag)
//   - window.history.replaceState() aggiorna l'URL SENZA passare per Next.js router
//     → zero cicli di navigazione, zero conflitti con usePathname(), zero glitch
//   - setActiveTab() è la SOLA fonte di verità per il panel visibile
//
// PERCHÉ window.history.replaceState invece di router.replace():
//   router.replace() triggera l'intero ciclo Next.js App Router:
//   prefetch → render → reconciliation → usePathname aggiorna → re-render.
//   Con i panel sempre nel DOM (KeepAliveTabShell) questo causa flash e conflitti.
//   window.history.replaceState è una chiamata browser pura: aggiorna solo l'URL bar,
//   Next.js NON viene notificato, zero overhead.

import { usePathname } from 'next/navigation'
import { useRef, useEffect, type ReactNode } from 'react'
import { useDrag } from '@use-gesture/react'
import { gestureState } from '@/hooks/gestureState'
import { swipeNavBridge } from '@/hooks/swipeNavBridge'
import { useActiveTab, pathnameToTab } from '@/context/ActiveTabContext'

export const TAB_ORDER = ['/home', '/discover', '/for-you', '/swipe', '/profile/me']

// Soglia distanza: 30% viewport per confermare navigazione
const THRESHOLD = 0.30
const DURATION  = 280
const EASE      = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
const EASE_SNAP = 'cubic-bezier(0.22, 1, 0.36, 1)'
const EDGE      = 20  // dead zone bordi per gesture di sistema

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
  const wrapRef = useRef<HTMLDivElement>(null)

  const currentIdx = TAB_ORDER.findIndex(t => {
    if (t === '/profile/me') return pathname.startsWith('/profile/')
    if (t === '/home')       return pathname === '/home' || pathname === '/'
    return pathname === t
  })
  const isMain  = currentIdx !== -1
  const prevTab = currentIdx > 0                     ? TAB_ORDER[currentIdx - 1] : null
  const nextTab = currentIdx < TAB_ORDER.length - 1 ? TAB_ORDER[currentIdx + 1] : null

  // Ref stabili — letti dai callback senza stale closure
  const prevTabRef    = useRef(prevTab)
  const nextTabRef    = useRef(nextTab)
  const currentIdxRef = useRef(currentIdx)
  prevTabRef.current    = prevTab
  nextTabRef.current    = nextTab
  currentIdxRef.current = currentIdx

  // Tracking stato touch interno (non come state React — zero re-render)
  const startXRef    = useRef(0)
  const axisLockedRef = useRef<'h' | 'v' | null>(null)
  const bridgeStarted = useRef(false)

  const bind = useDrag(
    ({ first, last, active, movement: [mx], direction: [dx], velocity: [vx], xy: [x], event, cancel, memo }) => {
      if (!isMain) return memo

      // Blocca se altri gesti sono attivi
      if (gestureState.pullActive || gestureState.drawerActive) {
        cancel()
        return memo
      }

      // Dead zone bordi schermo
      if (first) {
        const w = window.innerWidth
        if (x <= EDGE || x >= w - EDGE) { cancel(); return memo }
        startXRef.current    = x
        axisLockedRef.current = null
        bridgeStarted.current = false
        return memo
      }

      // Cedi a scroller orizzontali interni
      if (!gestureState.pageSwipeZone && isHorizontalScroller(event?.target ?? null, mx)) {
        cancel()
        return memo
      }

      const w  = window.innerWidth
      const absX = Math.abs(mx)

      if (active) {
        // Durante il drag: muovi panel via DOM
        gestureState.swipeActive = true

        if (!bridgeStarted.current) {
          bridgeStarted.current = true
          swipeNavBridge.notifyStart(
            prevTabRef.current ? TAB_ORDER.indexOf(prevTabRef.current) : null,
            nextTabRef.current ? TAB_ORDER.indexOf(nextTabRef.current) : null,
          )
        }

        // Resistenza ai bordi (primo/ultimo tab)
        if (mx > 0 && !prevTabRef.current) {
          swipeNavBridge.notifyDrag(Math.pow(mx, 0.6) * 0.4)
          return memo
        }
        if (mx < 0 && !nextTabRef.current) {
          swipeNavBridge.notifyDrag(-Math.pow(-mx, 0.6) * 0.4)
          return memo
        }

        swipeNavBridge.notifyDrag(mx)
        return memo
      }

      // Al rilascio (last === true):
      gestureState.swipeActive = false

      if (!bridgeStarted.current) return memo

      // Naviga se: spostamento > 30% viewport OPPURE velocity alta (swipe veloce)
      const shouldNav = absX > w * THRESHOLD || Math.abs(vx) > 0.5

      if (shouldNav && mx > 0 && prevTabRef.current) {
        const dest = prevTabRef.current
        const tab  = pathnameToTab(dest)
        if (tab) setActiveTab(tab)
        swipeNavBridge.notifySnap(w, EASE, DURATION)
        // ↓ window.history: aggiorna URL senza toccare Next.js router
        window.history.replaceState(null, '', dest)
      } else if (shouldNav && mx < 0 && nextTabRef.current) {
        const dest = nextTabRef.current
        const tab  = pathnameToTab(dest)
        if (tab) setActiveTab(tab)
        swipeNavBridge.notifySnap(-w, EASE, DURATION)
        window.history.replaceState(null, '', dest)
      } else {
        // Snap-back
        swipeNavBridge.notifySnap(0, EASE_SNAP, DURATION)
        swipeNavBridge.notifyEnd()
      }

      bridgeStarted.current = false
      return memo
    },
    {
      axis: 'x',              // use-gesture gestisce il lock asse automaticamente
      filterTaps: true,       // ignora tap
      pointer: { touch: true },
      threshold: 4,           // pixel di deadzone prima di registrare il drag
      from: () => [0, 0],
      eventOptions: { passive: false },
    }
  )

  return (
    <div
      ref={wrapRef}
      {...bind()}
      style={{ minHeight: '100dvh', touchAction: 'pan-y' }}
    >
      {children}
    </div>
  )
}
