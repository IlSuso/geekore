'use client'

// KeepAliveTabShell — lazy-mount + scroll-restore + Instagram-style carousel.
//
// Problemi risolti in questa versione:
//
// 1. FLASH SCROLL: al cambio tab il panel attivo è opacity:0 finché il
//    window.scrollTo non ha portato la pagina alla posizione salvata.
//    Solo dopo (doppio rAF) torna opacity:1. L'utente non vede mai il
//    frame a scrollY=0.
//
// 2. PADDING HEADER: i panel adiacenti (off-screen durante lo swipe) usano
//    position:fixed con top=HEADER_H così il contenuto è allineato
//    all'header fin dal primo frame. Il panel attivo è in flow normale.
//
// 3. LAG: i panel off-screen usano position:fixed + translateX(-300%) +
//    visibility:hidden. Il passaggio da "hidden" ad "adjacent" è solo un
//    cambio di transform+visibility — zero reflow, tutto GPU.
//    contain:layout paint sugli elementi off-screen limita il lavoro del compositor.

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

const TAB_IDX_TO_KA: Array<KATab | null> = ['feed', 'discover', 'for-you', 'swipe', 'profile']

// Altezza header mobile: h-[52px] + 1px border = 53px.
// I panel off-screen partono da qui per allinearsi al panel attivo durante lo swipe.
const HEADER_H = '53px'

const FULL_SCREEN_TABS = new Set<KATab>(['swipe'])

function getKATab(pathname: string): KATab | null {
  if (pathname === '/home') return 'feed'
  if (pathname === '/discover') return 'discover'
  if (pathname === '/for-you') return 'for-you'
  if (pathname === '/swipe') return 'swipe'
  if (pathname.startsWith('/profile/') && pathname.split('/').length === 3) return 'profile'
  return null
}

// Stile base per panel fuori dal flow (off-screen o adjacent durante swipe).
// position:fixed evita reflow sul documento. contain:layout paint limita
// il lavoro del compositor ai soli pixel di quel panel.
function offScreenBase(panelTab: KATab): CSSProperties {
  const full = FULL_SCREEN_TABS.has(panelTab)
  return {
    position:      'fixed',
    top:           full ? 0 : HEADER_H,
    left:          0,
    width:         '100%',
    height:        full ? '100dvh' : `calc(100dvh - ${HEADER_H})`,
    overflow:      'hidden',
    pointerEvents: 'none',
    zIndex:        1,
    contain:       'layout paint',
  }
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

  // ── Scroll save / restore ──────────────────────────────────────────────────
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

  // opacity:0 durante il ripristino scroll nasconde il frame intermedio a scrollY=0.
  const [activeVisible, setActiveVisible] = useState(true)

  useEffect(() => {
    if (prevTab.current === tab) return
    prevTab.current = tab
    if (tab === 'swipe') return

    const targetY = tab ? (savedY.current[tab] ?? 0) : 0

    // Se la posizione salvata è 0 (o prima visita) non serve nascondere nulla.
    if (targetY === 0) {
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }

    // Nascondi il panel, applica lo scroll nel prossimo frame,
    // poi rendi visibile nel frame successivo ancora.
    setActiveVisible(false)
    requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: 'instant' })
      requestAnimationFrame(() => {
        setActiveVisible(true)
      })
    })
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

  useEffect(() => {
    setAdjLeft(null)
    setAdjRight(null)
  }, [pathname])

  // ── Panel style helper ──────────────────────────────────────────────────────
  const panelStyle = (panelTab: KATab): CSSProperties => {
    if (tab === panelTab) {
      // Panel attivo: in flow normale del documento.
      // opacity:0 solo durante il breve ripristino scroll (max 2 frame).
      return activeVisible ? {} : { opacity: 0, pointerEvents: 'none' }
    }

    if (adjLeft  === panelTab) {
      return { ...offScreenBase(panelTab), transform: 'translateX(-100%)', visibility: 'visible' }
    }
    if (adjRight === panelTab) {
      return { ...offScreenBase(panelTab), transform: 'translateX(100%)', visibility: 'visible' }
    }

    if (visited.current.has(panelTab)) {
      // Visitato ma non adiacente: nascosto, fuori schermo.
      return { ...offScreenBase(panelTab), transform: 'translateX(-300%)', visibility: 'hidden' }
    }

    // Non ancora visitato: non nel DOM.
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