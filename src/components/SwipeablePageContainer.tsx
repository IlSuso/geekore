'use client'
// SwipeablePageContainer — swipe orizzontale tra tab primarie.
// Swipe è una tab primaria. Library resta fuori dalla nav principale.
// Profile non è più tab primaria: è accessibile dall'avatar/header.

import { usePathname, useRouter } from 'next/navigation'
import { useRef, useEffect, type ReactNode } from 'react'
import { useDrag } from '@use-gesture/react'
import { gestureState } from '@/hooks/gestureState'
import { swipeNavBridge } from '@/hooks/swipeNavBridge'
import { useActiveTab, pathnameToTab } from '@/context/ActiveTabContext'

export const TAB_ORDER = ['/home', '/for-you', '/swipe', '/discover', '/friends']

const THRESHOLD = 0.40
const VEL_THRESHOLD = 0.5
const MIN_DIST_VEL = 30
const EDGE = 20


const HARD_BLOCK_SELECTOR = [
  'input', 'textarea', 'select', '[contenteditable="true"]',
  '[role="slider"]', '[role="spinbutton"]', '[role="textbox"]', '[role="combobox"]',
  'form', 'fieldset', 'dialog', '[data-drawer="true"]', '[data-modal="true"]', '[aria-modal="true"]',
].join(',')

function isHardBlockTarget(target: EventTarget | null): boolean {
  let node = target as HTMLElement | null
  while (node && node.tagName !== 'BODY') {
    if (node.matches?.(HARD_BLOCK_SELECTOR) || node.isContentEditable) return true
    node = node.parentElement
  }
  return false
}

function isScrollableOnAxis(node: HTMLElement, axis: 'x' | 'y'): boolean {
  const style = window.getComputedStyle(node)
  const overflow = axis === 'x' ? style.overflowX : style.overflowY
  if (!(overflow === 'auto' || overflow === 'scroll')) return false
  return axis === 'x' ? node.scrollWidth > node.clientWidth : node.scrollHeight > node.clientHeight
}

function canScrollableConsumeHorizontal(node: HTMLElement, dx: number): boolean {
  if (!isScrollableOnAxis(node, 'x')) return false
  const { scrollLeft, scrollWidth, clientWidth } = node
  const atStart = scrollLeft <= 0
  const atEnd = scrollLeft + clientWidth >= scrollWidth - 1
  // dx > 0 = dito verso destra: il contenuto può ancora andare verso sinistra solo se non è già all'inizio.
  // dx < 0 = dito verso sinistra: il contenuto può ancora andare verso destra solo se non è già alla fine.
  return dx > 0 ? !atStart : !atEnd
}

function isHorizontalGestureConsumedInside(target: EventTarget | null, dx: number): boolean {
  let node = target as HTMLElement | null
  while (node && node.tagName !== 'BODY') {
    // La card Swipe ha priorità assoluta sul cambio pagina. Quando SwipeMode decide
    // esplicitamente che il gesto è "page" imposta gestureState.pageSwipeZone=true,
    // quindi questo blocco viene bypassato dal caller.
    if (node.dataset?.swipeCard === 'true') return true

    // Pills/carousel/scroller hanno priorità SOLO se possono davvero scrollare nella
    // direzione del gesto. Se sono già a inizio/fine, il gesto passa al cambio pagina.
    if (node.dataset?.horizontalScroll === 'true' || isScrollableOnAxis(node, 'x')) {
      if (canScrollableConsumeHorizontal(node, dx)) return true
    }

    if (isScrollableOnAxis(node, 'y') && (node.closest('[role="dialog"], [aria-modal="true"], [data-drawer="true"], [data-modal="true"]'))) {
      return true
    }

    node = node.parentElement
  }
  return false
}

export function SwipeablePageContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { setActiveTab } = useActiveTab()

  const currentIdx = TAB_ORDER.findIndex(t => {
    if (t === '/home') return pathname === '/home'
    return pathname === t
  })
  const isMain = currentIdx !== -1
  const prevTab = currentIdx > 0 ? TAB_ORDER[currentIdx - 1] : null
  const nextTab = currentIdx < TAB_ORDER.length - 1 ? TAB_ORDER[currentIdx + 1] : null

  const prevTabRef = useRef(prevTab)
  const nextTabRef = useRef(nextTab)
  prevTabRef.current = prevTab
  nextTabRef.current = nextTab

  const bridgeStarted = useRef(false)
  const resolvedRef = useRef(false)

  const navigate = (dest: string) => {
    const tab = pathnameToTab(dest)
    if (tab) setActiveTab(tab)
    router.push(dest)
  }

  useEffect(() => {
    const handleResolve = (dx: number, vx: number) => {
      if (!bridgeStarted.current) return
      resolvedRef.current = true
      const w = window.innerWidth
      const absX = Math.abs(dx)
      const shouldNav = absX > w * THRESHOLD || (Math.abs(vx) > VEL_THRESHOLD && absX > MIN_DIST_VEL)

      if (shouldNav && dx > 0 && prevTabRef.current) {
        swipeNavBridge.notifySnap(w, vx, 0)
        navigate(prevTabRef.current)
      } else if (shouldNav && dx < 0 && nextTabRef.current) {
        swipeNavBridge.notifySnap(-w, vx, 0)
        navigate(nextTabRef.current)
      } else {
        swipeNavBridge.notifySnap(0, vx, 0)
        swipeNavBridge.notifyEnd()
      }
      bridgeStarted.current = false
      gestureState.swipeActive = false
    }

    swipeNavBridge._resolve = handleResolve
    return () => { swipeNavBridge._resolve = null }
  }, [router, setActiveTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const bind = useDrag(
    ({ first, active, movement: [mx, my], velocity: [vx], xy: [x], event, cancel, memo }) => {
      if (!isMain) return memo

      if (gestureState.pullActive || gestureState.drawerActive) {
        cancel()
        return memo
      }

      const target = event?.target ?? null

      if (first) {
        const w = window.innerWidth
        if (x <= EDGE || x >= w - EDGE || isHardBlockTarget(target)) {
          cancel()
          return memo
        }
        bridgeStarted.current = false
        resolvedRef.current = false
        return { locked: null }
      }

      const memoState = (memo ?? { locked: null }) as { locked: 'x' | 'y' | null }
      if (memoState.locked === null) {
        const absX2 = Math.abs(mx)
        const absY2 = Math.abs(my)
        if (absX2 < 6 && absY2 < 6) return memoState
        if (absY2 > absX2 * 0.8) {
          cancel()
          return { locked: 'y' }
        }
        memoState.locked = 'x'
      }
      if (memoState.locked === 'y') return memoState

      if (!gestureState.pageSwipeZone && isHorizontalGestureConsumedInside(target, mx)) {
        cancel()
        return memoState
      }

      const w = window.innerWidth
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

      gestureState.swipeActive = false
      if (resolvedRef.current) { resolvedRef.current = false; return memoState }
      if (!bridgeStarted.current) return memoState

      const shouldNav = absX > w * THRESHOLD || (Math.abs(vx) > VEL_THRESHOLD && absX > MIN_DIST_VEL)

      if (shouldNav && mx > 0 && prevTabRef.current) {
        swipeNavBridge.notifySnap(w, vx, 0)
        navigate(prevTabRef.current)
      } else if (shouldNav && mx < 0 && nextTabRef.current) {
        swipeNavBridge.notifySnap(-w, vx, 0)
        navigate(nextTabRef.current)
      } else {
        swipeNavBridge.notifySnap(0, vx, 0)
        swipeNavBridge.notifyEnd()
      }

      bridgeStarted.current = false
      return memoState
    },
    {
      filterTaps: true,
      pointer: { touch: true },
      threshold: 4,
      from: () => [0, 0],
      eventOptions: { passive: false },
    }
  )

  return (
    <div {...bind()} style={{ minHeight: '100dvh', touchAction: 'pan-y' }}>
      {children}
    </div>
  )
}
