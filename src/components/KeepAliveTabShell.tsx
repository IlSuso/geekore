'use client'

// src/components/KeepAliveTabShell.tsx
//
// ARCHITETTURA DEFINITIVA (React 19 + Next.js 15):
//   <Activity mode="visible"|"hidden"> de-prioritizza i panel nascosti
//   → frame budget libero per l'animazione swipe.

import { Activity } from 'react'
import { usePathname } from 'next/navigation'
import { useActiveTab } from '@/context/ActiveTabContext'
import { useEffect, useRef, useCallback, useState } from 'react'
import type { ReactNode, CSSProperties, MutableRefObject } from 'react'
import FeedPage     from '@/app/home/page'
import DiscoverPage from '@/app/discover/page'
import ForYouPage   from '@/app/for-you/page'
import SwipePage    from '@/app/swipe/page'
import ProfilePage  from '@/app/profile/[username]/page'
import { swipeNavBridge } from '@/hooks/swipeNavBridge'
import { ScrollPanelContext } from '@/context/ScrollPanelContext'
import { TabActiveContext } from '@/context/TabActiveContext'

type KATab = 'feed' | 'discover' | 'for-you' | 'swipe' | 'profile'

const ALL_TABS: KATab[] = ['feed', 'discover', 'for-you', 'swipe', 'profile']
const TAB_IDX_TO_KA: Array<KATab | null> = ['feed', 'discover', 'for-you', 'swipe', 'profile']

const HEADER_H_PX  = 53
const HEADER_TOP   = `calc(env(safe-area-inset-top, 0px) + ${HEADER_H_PX}px)`
const PANEL_HEIGHT = `calc(100dvh - env(safe-area-inset-top, 0px) - ${HEADER_H_PX}px)`
const FULL_SCREEN_TABS = new Set<KATab>(['swipe'])

function getKATab(pathname: string): KATab | null {
  if (pathname === '/home' || pathname === '/') return 'feed'
  if (pathname === '/discover') return 'discover'
  if (pathname === '/for-you') return 'for-you'
  if (pathname === '/swipe') return 'swipe'
  if (pathname.startsWith('/profile/') && pathname.split('/').length === 3) return 'profile'
  return null
}

function panelBaseStyle(panelTab: KATab): CSSProperties {
  const full = FULL_SCREEN_TABS.has(panelTab)
  return {
    position:  'fixed',
    top:       full ? 0 : HEADER_TOP,
    left:      0,
    width:     '100%',
    height:    full ? '100dvh' : PANEL_HEIGHT,
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch' as CSSProperties['WebkitOverflowScrolling'],
  }
}

function PanelWrapper({
  divRef, style, isActive, children,
}: {
  divRef: MutableRefObject<HTMLDivElement | null>
  style: CSSProperties
  isActive: boolean
  children: ReactNode
}) {
  const scrollToTop = useCallback((behavior: ScrollBehavior = 'smooth') => {
    divRef.current?.scrollTo({ top: 0, behavior })
  }, [divRef])

  return (
    <TabActiveContext.Provider value={isActive}>
      <ScrollPanelContext.Provider value={{ panelRef: divRef, scrollToTop }}>
        <div ref={divRef} style={style}>
          {children}
        </div>
      </ScrollPanelContext.Provider>
    </TabActiveContext.Provider>
  )
}

export function KeepAliveTabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { activeTab, setActiveTab } = useActiveTab()

  const pathnameTab = getKATab(pathname)
  const tab = activeTab ?? pathnameTab

  const visited = useRef<Set<KATab>>(new Set())
  if (tab) visited.current.add(tab)

  useEffect(() => {
    if (pathnameTab !== null) setActiveTab(pathnameTab)
  }, [pathname]) // eslint-disable-line

  const latestProfileUsername = useRef<string | null>(null)
  if (tab === 'profile') {
    const u = pathname.split('/')[2]
    if (u) latestProfileUsername.current = u
  }

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

  useEffect(() => {
    swipeNavBridge.register(
      (prevIdx, nextIdx) => {
        const pk = prevIdx != null ? TAB_IDX_TO_KA[prevIdx] : null
        const nk = nextIdx != null ? TAB_IDX_TO_KA[nextIdx] : null
        const newLeft  = pk && visited.current.has(pk) ? pk : null
        const newRight = nk && visited.current.has(nk) ? nk : null
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

        if (currentEl) {
          currentEl.style.willChange = 'transform'
          currentEl.style.transition = 'none'
          currentEl.style.transform  = dx !== 0 ? `translateX(${dx}px)` : ''
        }
        if (leftEl) {
          leftEl.style.willChange = 'transform'
          leftEl.style.transition = 'none'
          leftEl.style.transform  = `translateX(calc(-100% + ${dx}px))`
        }
        if (rightEl) {
          rightEl.style.willChange = 'transform'
          rightEl.style.transition = 'none'
          rightEl.style.transform  = `translateX(calc(100% + ${dx}px))`
        }
      },
      (targetX: number, easing: string, duration: number) => {
        const currentEl = tabRef.current ? panelRefs.current[tabRef.current]?.current : null
        const leftEl    = adjLeftRef.current  ? panelRefs.current[adjLeftRef.current]?.current  : null
        const rightEl   = adjRightRef.current ? panelRefs.current[adjRightRef.current]?.current : null
        const isLeft    = !!adjLeftRef.current
        const adjEl     = leftEl ?? rightEl
        const tr = `transform ${duration}ms ${easing}`

        if (targetX === 0) {
          if (currentEl) {
            currentEl.style.transition = tr
            currentEl.style.transform  = ''
            currentEl.addEventListener('transitionend', () => { currentEl.style.transition = ''; currentEl.style.willChange = '' }, { once: true })
          }
          if (adjEl) {
            adjEl.style.transition = tr
            adjEl.style.transform  = isLeft ? 'translateX(-100%)' : 'translateX(100%)'
            adjEl.addEventListener('transitionend', () => {
              adjEl.style.transition  = ''
              adjEl.style.willChange  = ''
              adjLeftRef.current  = null
              adjRightRef.current = null
              setAdjLeft(null)
              setAdjRight(null)
            }, { once: true })
          } else {
            adjLeftRef.current = null; adjRightRef.current = null
            setTimeout(() => { setAdjLeft(null); setAdjRight(null) }, duration + 50)
          }
        } else {
          const incomingEl = targetX > 0 ? leftEl : rightEl
          if (currentEl) {
            currentEl.style.transition = tr
            currentEl.style.transform  = `translateX(${targetX}px)`
          }
          if (incomingEl) {
            incomingEl.style.transition = tr
            incomingEl.style.transform  = 'translateX(0)'
          }
          setTimeout(() => {
            adjLeftRef.current = null; adjRightRef.current = null
            setAdjLeft(null); setAdjRight(null)
            if (currentEl)  { currentEl.style.transition  = ''; currentEl.style.transform  = ''; currentEl.style.willChange  = '' }
            if (incomingEl) { incomingEl.style.transition = ''; incomingEl.style.transform = ''; incomingEl.style.willChange = '' }
          }, duration + 50)
        }
      },
    )
    return () => swipeNavBridge.unregister()
  }, []) // eslint-disable-line

  useEffect(() => {
    adjLeftRef.current = null; adjRightRef.current = null
    setAdjLeft(null); setAdjRight(null)
    if (tab) {
      const el = panelRefs.current[tab]?.current
      if (el) { el.style.transition = ''; el.style.transform = '' }
    }
  }, [tab]) // eslint-disable-line

  const getPanelStyle = useCallback((panelTab: KATab): CSSProperties => {
    const base = panelBaseStyle(panelTab)
    if (tab === panelTab) {
      return { ...base, zIndex: 2, pointerEvents: 'auto', visibility: 'visible' }
    }
    if (adjLeft === panelTab) {
      return { ...base, transform: 'translateX(-100%)', zIndex: 1, pointerEvents: 'none', visibility: 'visible' }
    }
    if (adjRight === panelTab) {
      return { ...base, transform: 'translateX(100%)', zIndex: 1, pointerEvents: 'none', visibility: 'visible' }
    }
    if (visited.current.has(panelTab)) {
      return { ...base, transform: 'translateX(-300%)', zIndex: 0, pointerEvents: 'none', visibility: 'hidden', contentVisibility: 'hidden' as CSSProperties['contentVisibility'] }
    }
    return { display: 'none' }
  }, [tab, adjLeft, adjRight])

  // Activity mode: 'visible' = priorità normale, 'hidden' = de-prioritizzato
  // I panel adiacenti durante swipe devono restare 'visible' per l'animazione
  function activityMode(panelTab: KATab): 'visible' | 'hidden' {
    if (tab === panelTab) return 'visible'
    if (adjLeft === panelTab || adjRight === panelTab) return 'visible'
    return 'hidden'
  }

  const profileUsername = latestProfileUsername.current

  return (
    <>
      <Activity mode={activityMode('feed')}>
        <PanelWrapper divRef={panelRefs.current['feed']} isActive={tab === 'feed'} style={getPanelStyle('feed')}>
          {visited.current.has('feed') && <FeedPage />}
        </PanelWrapper>
      </Activity>

      <Activity mode={activityMode('discover')}>
        <PanelWrapper divRef={panelRefs.current['discover']} isActive={tab === 'discover'} style={getPanelStyle('discover')}>
          {visited.current.has('discover') && <DiscoverPage />}
        </PanelWrapper>
      </Activity>

      <Activity mode={activityMode('for-you')}>
        <PanelWrapper divRef={panelRefs.current['for-you']} isActive={tab === 'for-you'} style={getPanelStyle('for-you')}>
          {visited.current.has('for-you') && <ForYouPage />}
        </PanelWrapper>
      </Activity>

      <Activity mode={activityMode('swipe')}>
        <PanelWrapper divRef={panelRefs.current['swipe']} isActive={tab === 'swipe'} style={getPanelStyle('swipe')}>
          {visited.current.has('swipe') && <SwipePage />}
        </PanelWrapper>
      </Activity>

      <Activity mode={activityMode('profile')}>
        <PanelWrapper divRef={panelRefs.current['profile']} isActive={tab === 'profile'} style={getPanelStyle('profile')}>
          {visited.current.has('profile') && profileUsername && (
            <ProfilePage usernameOverride={profileUsername} />
          )}
        </PanelWrapper>
      </Activity>

      {tab === null && children}
    </>
  )
}
