'use client'

// KeepAliveTabShell — lazy-mount + scroll-restore + Instagram-style carousel.
//
// Active tab renders in normal flow (document scroll works).
// Inactive tabs are hidden with display:none.
//
// Carousel: when SwipeablePageContainer detects a horizontal swipe, it calls
// swipeNavBridge.notifyStart(prevIdx, nextIdx). The shell changes adjacent panels
// from display:none to position:fixed with translateX(±100%). Since
// SwipeablePageContainer applies a CSS transform, position:fixed children become
// relative to it — so the panels slide in sync with the gesture for free,
// without any per-frame React updates.

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import FeedPage from '@/app/home/page'
import ForYouPage from '@/app/for-you/page'
import SwipePage from '@/app/swipe/page'
import ProfilePage from '@/app/profile/[username]/page'
import { swipeNavBridge } from '@/hooks/swipeNavBridge'

type KATab = 'feed' | 'for-you' | 'swipe' | 'profile'

// Maps TAB_ORDER indices → KATab (null = not keep-alive, e.g. /discover)
const TAB_IDX_TO_KA: Array<KATab | null> = ['feed', null, 'for-you', 'swipe', 'profile']

const ADJ_BASE = {
  position: 'absolute' as const,
  top: 0, left: 0,
  width: '100%',
  // bottom: 0 invece di height: 100vh — si adatta al wrapper genitore senza
  // dipendere dall'altezza viewport. Su Samsung gesture nav, 100vh include la
  // system/gesture area e copriva la navbar durante lo swipe.
  bottom: 0,
  overflow: 'hidden',
  pointerEvents: 'none' as const,
  // zIndex 1: sotto la chrome (Navbar z-100, MobileHeader z-99).
  // Non serve più competere con il viewport — i pannelli adiacenti sono già
  // traslati fuori schermo via translateX(±100%).
  zIndex: 1,
  contain: 'paint',
}
const ADJ_LEFT:  CSSProperties = { ...ADJ_BASE, transform: 'translateX(-100%)' }
const ADJ_RIGHT: CSSProperties = { ...ADJ_BASE, transform: 'translateX(100%)' }

function getKATab(pathname: string): KATab | null {
  if (pathname === '/home' || pathname === '/') return 'feed'
  if (pathname === '/for-you') return 'for-you'
  if (pathname === '/swipe') return 'swipe'
  if (pathname.startsWith('/profile/') && pathname.split('/').length === 3) return 'profile'
  return null
}

export function KeepAliveTabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const tab      = getKATab(pathname)

  const visited = useRef<Set<KATab>>(new Set())
  if (tab) visited.current.add(tab)

  const latestProfileUsername = useRef<string | null>(null)
  if (tab === 'profile') {
    const u = pathname.split('/')[2]
    if (u) latestProfileUsername.current = u
  }

  // Scroll save / restore
  const savedY  = useRef<Partial<Record<KATab, number>>>({})
  const prevTab = useRef<KATab | null>(null)
  const tabRef  = useRef(tab)
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

  // ── Carousel state ─────────────────────────────────────────────────────────
  const [adjLeft,  setAdjLeft]  = useState<KATab | null>(null)
  const [adjRight, setAdjRight] = useState<KATab | null>(null)

  useEffect(() => {
    swipeNavBridge.register(
      (prevIdx, nextIdx) => {
        const pk = prevIdx != null ? TAB_IDX_TO_KA[prevIdx] : null
        const nk = nextIdx != null ? TAB_IDX_TO_KA[nextIdx] : null
        setAdjLeft(pk  && visited.current.has(pk)  ? pk  : null)
        setAdjRight(nk && visited.current.has(nk) ? nk : null)
      },
      () => { setTimeout(() => { setAdjLeft(null); setAdjRight(null) }, 300) },
    )
    return () => swipeNavBridge.unregister()
  }, []) // eslint-disable-line

  // Clear adjacent panels on navigation (completed swipe)
  useEffect(() => {
    setAdjLeft(null)
    setAdjRight(null)
  }, [pathname])

  // ── Panel style helper ──────────────────────────────────────────────────────
  const panelStyle = (panelTab: KATab): CSSProperties => {
    if (tab === panelTab)       return {}
    if (adjLeft  === panelTab)  return ADJ_LEFT
    if (adjRight === panelTab)  return ADJ_RIGHT
    return { display: 'none' }
  }

  const profileUsername = latestProfileUsername.current

  return (
    <>
      <div style={panelStyle('feed')}>
        {visited.current.has('feed') && <FeedPage />}
      </div>

      <div style={panelStyle('for-you')}>
        {visited.current.has('for-you') && <ForYouPage />}
      </div>

      <div style={panelStyle('swipe')}>
        {visited.current.has('swipe') && <SwipePage />}
      </div>

      <div style={panelStyle('profile')}>
        {visited.current.has('profile') && profileUsername && (
          <ProfilePage usernameOverride={profileUsername} />
        )}
      </div>

      {tab === null && children}
    </>
  )
}
