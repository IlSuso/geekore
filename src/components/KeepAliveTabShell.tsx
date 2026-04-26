'use client'

// KeepAliveTabShell — lazy-mount + scroll-restore + Instagram-style carousel.
//
// Active tab renders in normal flow (document scroll works).
// Visited-but-inactive tabs are pre-positioned off-screen (position:absolute,
// translateX(-300%), visibility:hidden) instead of display:none — so the
// transition to adjacent panel during a swipe is a pure transform change with
// zero layout recalc and no navbar flicker on Samsung gesture nav.
//
// Carousel: when SwipeablePageContainer detects a horizontal swipe, it calls
// swipeNavBridge.notifyStart(prevIdx, nextIdx). The shell changes adjacent panels
// to position:absolute with translateX(±100%). Since SwipeablePageContainer
// applies a CSS transform, absolute children become relative to it — so the
// panels slide in sync with the gesture for free, without any per-frame React updates.
// All 5 main tabs are keep-alive (including Discover and Swipe).

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode, CSSProperties } from 'react'
import FeedPage from '@/app/home/page'
import DiscoverPage from '@/app/discover/page'
import ForYouPage from '@/app/for-you/page'
import SwipePage from '@/app/swipe/page'
import ProfilePage from '@/app/profile/[username]/page'
import { swipeNavBridge } from '@/hooks/swipeNavBridge'

type KATab = 'feed' | 'discover' | 'for-you' | 'swipe' | 'profile'

// Maps TAB_ORDER indices → KATab. Tutte le tab principali sono keep-alive.
const TAB_IDX_TO_KA: Array<KATab | null> = ['feed', 'discover', 'for-you', 'swipe', 'profile']

const ADJ_BASE = {
  position: 'absolute' as const,
  top: 0, left: 0,
  width: '100%',
  bottom: 0,
  overflow: 'hidden',
  pointerEvents: 'none' as const,
  zIndex: 1,
  contain: 'paint',
}
const ADJ_LEFT:  CSSProperties = { ...ADJ_BASE, transform: 'translateX(-100%)' }
const ADJ_RIGHT: CSSProperties = { ...ADJ_BASE, transform: 'translateX(100%)' }

// Pannelli visitati ma non attivi/adiacenti: pre-posizionati fuori schermo.
// Il transform translateX(-300%) pre-crea la GPU layer — così la transizione
// a ADJ_LEFT/ADJ_RIGHT durante lo swipe è solo un cambio di posizione su una
// layer già stabile, senza creare/distruggere layer a metà gestura (che causa
// il flash/scomparsa della navbar su Android/Samsung).
const HIDDEN_VISITED: CSSProperties = {
  position: 'absolute',
  top: 0, left: 0, width: '100%', bottom: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
  zIndex: 1,
  contain: 'paint',
  visibility: 'hidden',
  transform: 'translateX(-300%)',
}

function getKATab(pathname: string): KATab | null {
  if (pathname === '/home' || pathname === '/') return 'feed'
  if (pathname === '/discover') return 'discover'
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
    // Skip 'me' — the router briefly lands on /profile/me before the server
    // redirect resolves to the real username. Passing 'me' to ProfilePage would
    // trigger a Supabase query for a user that doesn't exist.
    if (u && u !== 'me') latestProfileUsername.current = u
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
    // Visitato ma non attivo: pre-posizionato fuori schermo (no display:none)
    // → il passaggio ad adjacent è solo un transform change, zero reflow.
    if (visited.current.has(panelTab)) return HIDDEN_VISITED
    // Non ancora visitato: fuori dal DOM.
    return { display: 'none' }
  }

  const profileUsername = latestProfileUsername.current

  return (
    <>
      <div style={panelStyle('feed')}>
        {visited.current.has('feed') && <FeedPage />}
      </div>

      <div style={panelStyle('discover')}>
        {visited.current.has('discover') && <DiscoverPage />}
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
