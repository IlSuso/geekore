'use client'
// SwipeablePageContainer — swipe orizzontale tra tab primarie.
// Swipe non è più una tab: è una modalità interna di For You.
// Profile non è più tab primaria: è accessibile dall'avatar/header.

import { usePathname, useRouter } from 'next/navigation'
import { useRef, useEffect, type ReactNode } from 'react'
import { useDrag } from '@use-gesture/react'
import { gestureState } from '@/hooks/gestureState'
import { swipeNavBridge } from '@/hooks/swipeNavBridge'
import { useActiveTab, pathnameToTab } from '@/context/ActiveTabContext'

export const TAB_ORDER = ['/home', '/for-you', '/library', '/discover', '/friends']

const THRESHOLD = 0.40
const VEL_THRESHOLD = 0.5
const MIN_DIST_VEL = 30
const EDGE = 20

function isInteractiveTarget(target: EventTarget | null): boolean {
  let node = target as HTMLElement | null
  while (node && node.tagName !== 'BODY') {
    const tag = node.tagName.toLowerCase()
    if (
      tag === 'a' || tag === 'button' || tag === 'input' || tag === 'textarea' ||
      tag === 'select' || tag === 'label' || node.isContentEditable ||
      node.dataset?.noSwipe === 'true' || node.dataset?.interactive === 'true' ||
      node.getAttribute('role') === 'button' || node.getAttribute('role') === 'link'
    ) {
      return true
    }
    node = node.parentElement
  }
  return false
}

function isHorizontalScroller(target: EventTarget | null, dx: number): boolean {
  let node = target as HTMLElement | null
  while (node && node.tagName !== 'BODY') {
    if (node.dataset && 'noSwipe' in node.dataset) return true
    const ox = window.getComputedStyle(node).overflowX
    if ((ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth) {
      const { scrollLeft, scrollWidth, clientWidth } = node
      const atStart = scrollLeft <= 0
      const atEnd = scrollLeft + clientWidth >= scrollWidth - 1
      if (dx > 0 ? !atStart : !atEnd) return true
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

      if (first) {
        const target = event?.target ?? null
        const w = window.innerWidth
        if (x <= EDGE || x >= w - EDGE || isInteractiveTarget(target)) {
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

      if (!gestureState.pageSwipeZone && isHorizontalScroller(event?.target ?? null, mx)) {
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
