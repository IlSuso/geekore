'use client'

// src/components/KeepAliveTabShell.tsx
// Keep-alive solo per le tab primarie: Home, For You, Swipe, Discover, Friends.
// Library/Profile/Community e altre pagine secondarie
// devono renderizzare i children reali, non riusare il pannello cached della tab primaria.

import { Activity } from 'react'
import { animate } from 'motion/react'
import { usePathname } from 'next/navigation'
import { useActiveTab } from '@/context/ActiveTabContext'
import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import type { ReactNode, CSSProperties, MutableRefObject } from 'react'
import FeedPage     from '@/app/home/page'
import DiscoverPage from '@/app/discover/page'
import ForYouPage   from '@/app/for-you/page'
import SwipePage    from '@/app/swipe/page'
import FriendsPage  from '@/app/friends/page'
import { swipeNavBridge } from '@/hooks/swipeNavBridge'
import { ScrollPanelContext } from '@/context/ScrollPanelContext'
import { TabActiveContext } from '@/context/TabActiveContext'
import { useLocale } from '@/lib/locale'
import { MobileHeader } from '@/components/MobileHeader'

type KATab = 'feed' | 'for-you' | 'swipe' | 'discover' | 'friends'

const ALL_TABS: KATab[] = ['feed', 'for-you', 'swipe', 'discover', 'friends']
const TAB_IDX_TO_KA: Array<KATab | null> = ['feed', 'for-you', 'swipe', 'discover', 'friends']
const KA_TO_PATH: Record<KATab, string> = {
  feed: '/home',
  'for-you': '/for-you',
  swipe: '/swipe',
  discover: '/discover',
  friends: '/friends',
}

const HEADER_H_PX  = 53
const HEADER_TOP   = `calc(env(safe-area-inset-top, 0px) + ${HEADER_H_PX}px)`

const SPRING_NAV = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 40,
  mass: 1,
  restDelta: 0.5,
  restSpeed: 0.5,
}
const SPRING_BACK = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 35,
  mass: 1,
  restDelta: 0.5,
  restSpeed: 0.5,
}

function getKATab(pathname: string): KATab | null {
  if (pathname === '/home') return 'feed'
  if (pathname === '/for-you') return 'for-you'
  if (pathname === '/swipe') return 'swipe'
  if (pathname === '/discover') return 'discover'
  if (pathname === '/friends') return 'friends'
  return null
}

function panelBaseStyle(panelTab: KATab): CSSProperties {
  const isSwipePanel = panelTab === 'swipe'

  return {
    position:  'fixed',
    // Tutti i panel partono da top=0. L'header mobile ora vive dentro
    // il panel stesso, quindi durante lo swipe orizzontale si muove insieme
    // alla pagina e non forza più un reflow/abbassamento del contenuto.
    top:       0,
    left:      0,
    width:     '100%',
    height:    '100dvh',
    overflowY: isSwipePanel ? 'hidden' : 'auto',
    overflowX: 'hidden',
    touchAction: 'pan-y',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch' as CSSProperties['WebkitOverflowScrolling'],
    isolation: 'isolate' as CSSProperties['isolation'],
  }
}

function PanelWrapper({
  divRef, style, isActive, panelTab, children,
}: {
  divRef: MutableRefObject<HTMLDivElement | null>
  style: CSSProperties
  isActive: boolean
  panelTab: KATab
  children: ReactNode
}) {
  const scrollToTop = useCallback((behavior: ScrollBehavior = 'smooth') => {
    divRef.current?.scrollTo({ top: 0, behavior })
  }, [divRef])

  const scrollContextValue = useMemo(() => ({
    panelRef: divRef,
    scrollToTop,
    current: divRef.current,
  }), [divRef, scrollToTop])

  const isSwipePanel = panelTab === 'swipe'

  return (
    <TabActiveContext.Provider value={isActive}>
      <ScrollPanelContext.Provider value={scrollContextValue}>
        <div ref={divRef} style={style} className={`gk-tab-panel gk-tab-panel-${panelTab}`}>
          {!isSwipePanel && (
            <MobileHeader pathnameOverride={KA_TO_PATH[panelTab]} embeddedInTabPanel />
          )}
          <div style={isSwipePanel ? undefined : { paddingTop: HEADER_TOP }}>
            {children}
          </div>
        </div>
      </ScrollPanelContext.Provider>
    </TabActiveContext.Provider>
  )
}

export function KeepAliveTabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { activeTab, setActiveTab } = useActiveTab()
  const { locale } = useLocale()

  const pathnameTab = getKATab(pathname)
  const tab = pathnameTab ?? (
    activeTab && ALL_TABS.includes(activeTab as KATab)
      ? activeTab as KATab
      : null
  )

  const visited = useRef<Set<KATab>>(new Set())
  if (tab && pathnameTab) visited.current.add(tab)

  const [localeEpoch, setLocaleEpoch] = useState(0)
  const previousLocaleRef = useRef(locale)

  useEffect(() => {
    if (previousLocaleRef.current === locale) return
    previousLocaleRef.current = locale
    visited.current = pathnameTab ? new Set<KATab>([pathnameTab]) : new Set<KATab>()
    adjLeftRef.current = null
    adjRightRef.current = null
    exitingTabRef.current = null
    setAdjLeft(null)
    setAdjRight(null)
    setExitingTab(null)
    setLocaleEpoch(epoch => epoch + 1)
  }, [locale, pathnameTab])

  // PERF: non montiamo/carichiamo più automaticamente le tab vicine quando entri in una pagina.
  // Le tab adiacenti vengono montate solo quando parte davvero uno swipe orizzontale.
  // Questo evita che entrando in /swipe partano anche For You/Discover con fetch pesanti.

  useEffect(() => {
    if (pathnameTab !== null) setActiveTab(pathnameTab)
  }, [pathname, pathnameTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const panelRefs = useRef<Record<KATab, MutableRefObject<HTMLDivElement | null>>>(
    Object.fromEntries(
      ALL_TABS.map(t => [t, { current: null }])
    ) as Record<KATab, MutableRefObject<HTMLDivElement | null>>
  )

  const [adjLeft,  setAdjLeft]  = useState<KATab | null>(null)
  const [adjRight, setAdjRight] = useState<KATab | null>(null)
  const adjLeftRef  = useRef<KATab | null>(null)
  const adjRightRef = useRef<KATab | null>(null)
  const tabRef      = useRef(tab)
  tabRef.current    = tab

  const animCurrentRef = useRef<ReturnType<typeof animate> | null>(null)
  const animAdjRef     = useRef<ReturnType<typeof animate> | null>(null)
  const swipeAnimatingRef = useRef(false)
  const [exitingTab, setExitingTab] = useState<KATab | null>(null)
  const exitingTabRef = useRef<KATab | null>(null)

  useEffect(() => {
    swipeNavBridge.register(
      (prevIdx, nextIdx) => {
        const pk = prevIdx != null ? TAB_IDX_TO_KA[prevIdx] : null
        const nk = nextIdx != null ? TAB_IDX_TO_KA[nextIdx] : null

        // Monta just-in-time i panel vicini SOLO quando l'utente inizia lo swipe.
        // Prima venivano pre-montati dopo 350ms a ogni ingresso pagina, facendo partire
        // caricamenti immensi anche su pagine che l'utente non aveva aperto.
        if (pk) visited.current.add(pk)
        if (nk) visited.current.add(nk)

        const newLeft  = pk || null
        const newRight = nk || null
        adjLeftRef.current  = newLeft
        adjRightRef.current = newRight
        setAdjLeft(newLeft)
        setAdjRight(newRight)
      },
      () => {},
      (dx: number) => {
        const currentEl = tabRef.current ? panelRefs.current[tabRef.current]?.current : null
        const leftEl    = adjLeftRef.current  ? panelRefs.current[adjLeftRef.current]?.current  : null
        const rightEl   = adjRightRef.current ? panelRefs.current[adjRightRef.current]?.current : null

        animCurrentRef.current?.stop()
        animAdjRef.current?.stop()

        const w = window.innerWidth

        if (currentEl) {
          currentEl.style.willChange = 'transform'
          currentEl.style.transform  = dx !== 0 ? `translateX(${dx}px)` : ''
        }
        if (leftEl) {
          leftEl.style.willChange = 'transform'
          leftEl.style.transform  = `translateX(${-w + dx}px)`
        }
        if (rightEl) {
          rightEl.style.willChange = 'transform'
          rightEl.style.transform  = `translateX(${w + dx}px)`
        }
      },
      (targetX: number, velocityParam: number | string) => {
        const currentEl = tabRef.current ? panelRefs.current[tabRef.current]?.current : null
        const leftEl    = adjLeftRef.current  ? panelRefs.current[adjLeftRef.current]?.current  : null
        const rightEl   = adjRightRef.current ? panelRefs.current[adjRightRef.current]?.current : null
        const adjEl     = leftEl ?? rightEl

        function getCurrentX(el: HTMLElement): number {
          const t = el.style.transform
          if (!t) return 0
          const mPx = t.match(/translateX\((-?[\d.]+)px\)/)
          if (mPx) return parseFloat(mPx[1])
          const mPct = t.match(/translateX\((-?[\d.]+)%\)/)
          if (mPct) return (parseFloat(mPct[1]) / 100) * window.innerWidth
          return 0
        }

        const velocityPxPerSec = typeof velocityParam === 'number' ? velocityParam * 1000 : 0

        if (targetX === 0) {
          if (currentEl) {
            const fromX = getCurrentX(currentEl)
            if (Math.abs(fromX) < 1) {
              currentEl.style.transform = ''
              currentEl.style.willChange = ''
            } else {
              animCurrentRef.current = animate(fromX, 0, {
                ...SPRING_BACK,
                velocity: velocityPxPerSec,
                onUpdate: (v: number) => { currentEl.style.transform = v !== 0 ? `translateX(${v}px)` : '' },
                onComplete: () => {
                  currentEl.style.transform = ''
                  currentEl.style.willChange = ''
                  animCurrentRef.current = null
                },
              })
            }
          }
          if (adjEl) {
            const fromX   = getCurrentX(adjEl)
            const restPos = adjLeftRef.current ? -window.innerWidth : window.innerWidth
            animAdjRef.current = animate(fromX, restPos, {
              ...SPRING_BACK,
              velocity: velocityPxPerSec,
              onUpdate: (v: number) => { adjEl.style.transform = `translateX(${v}px)` },
              onComplete: () => {
                adjEl.style.transform  = adjLeftRef.current ? 'translateX(-100%)' : 'translateX(100%)'
                adjEl.style.willChange = ''
                adjLeftRef.current = null
                adjRightRef.current = null
                setAdjLeft(null)
                setAdjRight(null)
                animAdjRef.current = null
              },
            })
          } else {
            adjLeftRef.current = null
            adjRightRef.current = null
            setAdjLeft(null)
            setAdjRight(null)
          }
        } else {
          swipeAnimatingRef.current = true
          const outgoingTab = tabRef.current
          if (outgoingTab) {
            exitingTabRef.current = outgoingTab
            setExitingTab(outgoingTab)
          }
          const clampedVelocity = Math.sign(velocityPxPerSec) * Math.min(Math.abs(velocityPxPerSec), 3000)
          const incomingEl = targetX > 0 ? leftEl : rightEl

          if (currentEl) {
            const fromX = getCurrentX(currentEl)
            animCurrentRef.current = animate(fromX, targetX, {
              ...SPRING_NAV,
              velocity: clampedVelocity,
              onUpdate: (v: number) => { currentEl.style.transform = `translateX(${v}px)` },
              onComplete: () => {
                currentEl.style.transform  = `translateX(${targetX > 0 ? '100%' : '-100%'})`
                currentEl.style.willChange = ''
                animCurrentRef.current = null
                exitingTabRef.current = null
                setExitingTab(null)
              },
            })
          }

          if (incomingEl) {
            const fromX = getCurrentX(incomingEl)
            animAdjRef.current = animate(fromX, 0, {
              ...SPRING_NAV,
              velocity: clampedVelocity,
              onUpdate: (v: number) => { incomingEl.style.transform = v !== 0 ? `translateX(${v}px)` : '' },
              onComplete: () => {
                incomingEl.style.transform = ''
                incomingEl.style.willChange = ''
                adjLeftRef.current = null
                adjRightRef.current = null
                setAdjLeft(null)
                setAdjRight(null)
                animAdjRef.current = null
              },
            })
          } else {
            adjLeftRef.current = null
            adjRightRef.current = null
            setAdjLeft(null)
            setAdjRight(null)
          }
        }
      },
    )
    return () => swipeNavBridge.unregister()
  }, [])

  useEffect(() => {
    if (swipeAnimatingRef.current) {
      swipeAnimatingRef.current = false
      return
    }

    animCurrentRef.current?.stop()
    animAdjRef.current?.stop()
    animCurrentRef.current = null
    animAdjRef.current = null

    adjLeftRef.current = null
    adjRightRef.current = null
    setAdjLeft(null)
    setAdjRight(null)
    if (tab) {
      const el = panelRefs.current[tab]?.current
      if (el) { el.style.transform = ''; el.style.willChange = '' }
    }
  }, [tab])

  const getPanelStyle = useCallback((panelTab: KATab): CSSProperties => {
    const base = panelBaseStyle(panelTab)
    if (tab === panelTab && pathnameTab) {
      return { ...base, zIndex: 2, pointerEvents: 'auto', visibility: 'visible' }
    }

    const frozen = { overflowY: 'hidden' as const }

    if (adjLeft === panelTab) {
      return { ...base, ...frozen, transform: 'translateX(-100%)', zIndex: 1, pointerEvents: 'none', visibility: 'visible' }
    }
    if (adjRight === panelTab) {
      return { ...base, ...frozen, transform: 'translateX(100%)', zIndex: 1, pointerEvents: 'none', visibility: 'visible' }
    }
    if (exitingTab === panelTab) {
      return { ...base, ...frozen, zIndex: 1, pointerEvents: 'none', visibility: 'visible' }
    }
    if (visited.current.has(panelTab)) {
      const currentIdx = tab ? TAB_IDX_TO_KA.indexOf(tab) : -1
      const panelIdx = TAB_IDX_TO_KA.indexOf(panelTab)
      const isNeighbor = currentIdx !== -1 && Math.abs(panelIdx - currentIdx) === 1
      if (isNeighbor) {
        const tx = panelIdx < currentIdx ? '-100%' : '100%'
        return { ...base, ...frozen, transform: `translateX(${tx})`, zIndex: 0, pointerEvents: 'none', visibility: 'hidden',
          contentVisibility: 'auto' as CSSProperties['contentVisibility'],
          containIntrinsicSize: '100vw 100dvh' as CSSProperties['containIntrinsicSize'] }
      }
      return { ...base, ...frozen, transform: 'translateX(-300%)', zIndex: 0, pointerEvents: 'none', visibility: 'hidden',
        contentVisibility: 'hidden' as CSSProperties['contentVisibility'] }
    }
    return { display: 'none' }
  }, [tab, pathnameTab, adjLeft, adjRight, exitingTab])

  function activityMode(panelTab: KATab): 'visible' | 'hidden' {
    if (pathnameTab && tab === panelTab) return 'visible'
    if (adjLeft === panelTab || adjRight === panelTab) return 'visible'
    if (exitingTab === panelTab) return 'visible'
    return 'hidden'
  }

  function shouldMount(panelTab: KATab): boolean {
    return visited.current.has(panelTab)
  }

  return (
    <>
      <Activity mode={activityMode('feed')}>
        <PanelWrapper divRef={panelRefs.current.feed} panelTab="feed" isActive={pathnameTab === 'feed'} style={getPanelStyle('feed')}>
          {shouldMount('feed') && <FeedPage key={`feed-${localeEpoch}`} />}
        </PanelWrapper>
      </Activity>

      <Activity mode={activityMode('for-you')}>
        <PanelWrapper divRef={panelRefs.current['for-you']} panelTab="for-you" isActive={pathnameTab === 'for-you'} style={getPanelStyle('for-you')}>
          {shouldMount('for-you') && <ForYouPage key={`for-you-${localeEpoch}`} />}
        </PanelWrapper>
      </Activity>

      <Activity mode={activityMode('swipe')}>
        <PanelWrapper divRef={panelRefs.current.swipe} panelTab="swipe" isActive={pathnameTab === 'swipe'} style={getPanelStyle('swipe')}>
          {shouldMount('swipe') && <SwipePage key={`swipe-${localeEpoch}`} />}
        </PanelWrapper>
      </Activity>

      <Activity mode={activityMode('discover')}>
        <PanelWrapper divRef={panelRefs.current.discover} panelTab="discover" isActive={pathnameTab === 'discover'} style={getPanelStyle('discover')}>
          {shouldMount('discover') && <DiscoverPage key={`discover-${localeEpoch}`} />}
        </PanelWrapper>
      </Activity>

      <Activity mode={activityMode('friends')}>
        <PanelWrapper divRef={panelRefs.current.friends} panelTab="friends" isActive={pathnameTab === 'friends'} style={getPanelStyle('friends')}>
          {shouldMount('friends') && <FriendsPage key={`friends-${localeEpoch}`} />}
        </PanelWrapper>
      </Activity>

      {pathnameTab === null && children}
    </>
  )
}
