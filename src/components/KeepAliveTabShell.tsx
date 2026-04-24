'use client'

// KeepAliveTabShell — Instagram-style keep-alive + side-by-side page transitions.
//
// Come funziona:
//   - I pannelli keep-alive (feed, for-you, swipe, profile) vengono montati al primo
//     accesso e restano vivi (lazy mount).
//   - Il pannello ATTIVO è in normal flow → determina l'altezza del documento,
//     window scroll funziona normalmente.
//   - I pannelli NON ATTIVI sono position:fixed → off-screen con pointer-events:none.
//   - transform NON è nel style object React (evita conflitti con re-render);
//     è controllato esclusivamente dal bridge via DOM diretto.
//   - swipeNavBridge riceve gli aggiornamenti da SwipeablePageContainer e li
//     propaga a tutti i pannelli fissi → Instagram side-by-side.
//   - Le route non-KA (discover, trending…) renderizzano tramite {children}.

import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import FeedPage from '@/app/feed/page'
import ForYouPage from '@/app/for-you/page'
import SwipePage from '@/app/swipe/page'
import ProfilePage from '@/app/profile/[username]/page'
import { TAB_ORDER } from '@/components/SwipeablePageContainer'
import { swipeNavBridge } from '@/hooks/swipeNavBridge'

type KATab = 'feed' | 'for-you' | 'swipe' | 'profile'

const KA_TABS: KATab[] = ['feed', 'for-you', 'swipe', 'profile']

const KA_TO_PATH: Record<KATab, string> = {
  feed: '/feed', 'for-you': '/for-you', swipe: '/swipe', profile: '/profile/me',
}

function getKATab(pathname: string): KATab | null {
  if (pathname === '/feed') return 'feed'
  if (pathname === '/for-you') return 'for-you'
  if (pathname === '/swipe') return 'swipe'
  if (pathname.startsWith('/profile/') && pathname.split('/').length === 3) return 'profile'
  return null
}

function tabOrderIdx(tab: KATab | null): number {
  if (!tab) return -1
  return TAB_ORDER.indexOf(KA_TO_PATH[tab])
}

function activeTabOrderIdx(pathname: string): number {
  return TAB_ORDER.findIndex(t => {
    if (t === '/profile/me') return pathname.startsWith('/profile/')
    if (t === '/feed')       return pathname === '/feed' || pathname === '/'
    return pathname === t
  })
}

const EASE_SNAP = 'cubic-bezier(0.22, 1, 0.36, 1)'

export function KeepAliveTabShell({ children }: { children: ReactNode }) {
  const pathname  = usePathname()
  const tab       = getKATab(pathname)
  const activeIdx = activeTabOrderIdx(pathname)

  const visited = useRef<Set<KATab>>(new Set())
  if (tab) visited.current.add(tab)

  const latestProfileUsername = useRef<string | null>(null)
  if (tab === 'profile') {
    const u = pathname.split('/')[2]
    if (u) latestProfileUsername.current = u
  }

  // Scroll save/restore
  const savedY   = useRef<Partial<Record<KATab, number>>>({})
  const prevTab  = useRef<KATab | null>(null)
  const tabRef   = useRef(tab)
  tabRef.current = tab

  useEffect(() => {
    const onScroll = () => {
      if (tabRef.current && tabRef.current !== 'swipe') {
        savedY.current[tabRef.current] = window.scrollY
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (prevTab.current === tab) return
    if (tab !== 'swipe') {
      requestAnimationFrame(() => {
        window.scrollTo(0, tab ? (savedY.current[tab] ?? 0) : 0)
      })
    }
    prevTab.current = tab
  }, [tab])

  // Panel refs: transform is ONLY set via direct DOM (not inline React style)
  // so React re-renders never override the bridge's animation values.
  const panelRefs = useRef<Partial<Record<KATab, HTMLDivElement | null>>>({})
  const activeIdxRef = useRef(activeIdx)
  activeIdxRef.current = activeIdx

  const applyPositions = useCallback((offset: number, currActiveIdx: number, snap: boolean) => {
    const transition = snap ? `transform 0.28s ${EASE_SNAP}` : 'none'
    for (const key of KA_TABS) {
      const el = panelRefs.current[key]
      if (!el) continue
      // Skip the active panel — wrapRef in SwipeablePageContainer handles its motion
      if (tabRef.current === key) continue
      const panelIdx = tabOrderIdx(key)
      if (panelIdx === -1) continue
      const relX = (panelIdx - currActiveIdx) * 100
      el.style.transition = transition
      el.style.transform  = `translateX(calc(${relX}vw + ${offset}px))`
    }
  }, [])

  // Register bridge — non-active panels get their transforms here
  useEffect(() => {
    swipeNavBridge.register((offset, currActiveIdx, snap) =>
      applyPositions(offset, currActiveIdx, snap ?? false)
    )
    return () => swipeNavBridge.unregister()
  }, [applyPositions])

  // Set initial positions synchronously before paint on route change
  useLayoutEffect(() => {
    for (const key of KA_TABS) {
      const el = panelRefs.current[key]
      if (!el) continue
      if (tabRef.current === key) {
        // Active panel: remove any stale transform
        el.style.transition = 'none'
        el.style.transform  = 'none'
        continue
      }
      const panelIdx = tabOrderIdx(key)
      if (panelIdx === -1) continue
      const relX = (panelIdx - activeIdx) * 100
      el.style.transition = 'none'
      el.style.transform  = `translateX(${relX}vw)`
    }
  }, [activeIdx])

  const profileUsername = latestProfileUsername.current

  // Static panel style — NO transform here; bridge controls it
  const panelStyle = (key: KATab): CSSProperties => {
    const isActive = tab === key
    if (isActive) {
      return {
        position:      'relative',
        willChange:    'transform',
        pointerEvents: 'auto',
        visibility:    'visible',
      }
    }
    return {
      position:      'fixed',
      top:            0,
      left:           0,
      right:          0,
      bottom:         0,
      // Replicate <main> padding so preview content sits below MobileHeader
      paddingTop:    'calc(52px + env(safe-area-inset-top, 0px))',
      paddingBottom: '80px',
      willChange:     'transform',
      pointerEvents:  'none',
      visibility:     visited.current.has(key) ? 'visible' : 'hidden',
    }
  }

  return (
    <>
      <div ref={(el: HTMLDivElement | null) => { panelRefs.current['feed'] = el }} style={panelStyle('feed')}>
        {visited.current.has('feed') && <FeedPage />}
      </div>

      <div ref={(el: HTMLDivElement | null) => { panelRefs.current['for-you'] = el }} style={panelStyle('for-you')}>
        {visited.current.has('for-you') && <ForYouPage />}
      </div>

      <div ref={(el: HTMLDivElement | null) => { panelRefs.current['swipe'] = el }} style={panelStyle('swipe')}>
        {visited.current.has('swipe') && <SwipePage />}
      </div>

      <div ref={(el: HTMLDivElement | null) => { panelRefs.current['profile'] = el }} style={panelStyle('profile')}>
        {visited.current.has('profile') && profileUsername && (
          <ProfilePage usernameOverride={profileUsername} />
        )}
      </div>

      {tab === null && children}
    </>
  )
}
