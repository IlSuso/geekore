'use client'

// src/components/KeepAliveTabShell.tsx
//
// ARCHITETTURA 2026 (React 19 + Motion):
//   - <Activity> de-prioritizza panel nascosti (React scheduler)
//   - animate() da Motion per spring fisica vera al rilascio del dito
//   - Durante il drag: DOM diretto via style (zero librerie, zero overhead)
//   - Al rilascio: spring Motion con velocity del dito → feel nativo iOS/Android

import { Activity } from 'react'
import { animate } from 'motion/react'
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

// Spring per navigazione confermata — stiff + alto damping = nessun rimbalzo, feel nativo
const SPRING_NAV = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 40,
  mass: 1,
  restDelta: 0.5,
  restSpeed: 0.5,
}
// Spring per snap-back (torna indietro) — leggermente più morbido
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

  // Ref per le animazioni Motion in corso — permettono interruzione/cancellazione
  const animCurrentRef = useRef<ReturnType<typeof animate> | null>(null)
  const animAdjRef     = useRef<ReturnType<typeof animate> | null>(null)

  useEffect(() => {
    swipeNavBridge.register(
      // onStart: prepara panel adiacenti
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
      // onEnd
      () => {},
      // onDrag: muove panel via DOM diretto (zero Motion overhead durante drag)
      (dx: number) => {
        const currentEl = tabRef.current ? panelRefs.current[tabRef.current]?.current : null
        const leftEl    = adjLeftRef.current  ? panelRefs.current[adjLeftRef.current]?.current  : null
        const rightEl   = adjRightRef.current ? panelRefs.current[adjRightRef.current]?.current : null

        // Cancella eventuali animazioni Motion in corso (interruzione mid-animation)
        animCurrentRef.current?.stop()
        animAdjRef.current?.stop()

        const w = window.innerWidth

        if (currentEl) {
          currentEl.style.willChange = 'transform'
          currentEl.style.transform  = dx !== 0 ? `translateX(${dx}px)` : ''
        }
        if (leftEl) {
          leftEl.style.willChange = 'transform'
          // Usiamo px puro invece di calc() per evitare problemi di parsing con dx negativo
          leftEl.style.transform  = `translateX(${-w + dx}px)`
        }
        if (rightEl) {
          rightEl.style.willChange = 'transform'
          // Usiamo px puro invece di calc() per evitare problemi di parsing con dx negativo
          rightEl.style.transform  = `translateX(${w + dx}px)`
        }
      },
      // onSnap: usa Motion animate() con spring fisica
      // targetX: destinazione in px (±viewport width o 0 per snap-back)
      // velocityParam: velocity del dito al rilascio (passata alla spring)
      // _unused: era la durata fissa — ora ignorata, usa spring
      (targetX: number, velocityParam: number | string, _unused: number) => {
        const currentEl = tabRef.current ? panelRefs.current[tabRef.current]?.current : null
        const leftEl    = adjLeftRef.current  ? panelRefs.current[adjLeftRef.current]?.current  : null
        const rightEl   = adjRightRef.current ? panelRefs.current[adjRightRef.current]?.current : null
        const isLeft    = !!adjLeftRef.current
        const adjEl     = leftEl ?? rightEl

        // Calcola posizione corrente del panel dal suo style.transform.
        // Durante il drag usiamo sempre px puri → i primi due casi coprono tutto.
        // Il caso calc() rimane come fallback di sicurezza per stati residui.
        function getCurrentX(el: HTMLElement): number {
          const t = el.style.transform
          if (!t) return 0
          // Caso px: translateX(123px) o translateX(-45px)
          const mPx = t.match(/translateX\((-?[\d.]+)px\)/)
          if (mPx) return parseFloat(mPx[1])
          // Caso %: translateX(-100%) o translateX(100%)
          const mPct = t.match(/translateX\((-?[\d.]+)%\)/)
          if (mPct) return (parseFloat(mPct[1]) / 100) * window.innerWidth
          // Caso calc (fallback): translateX(calc(-100% + 23px)) o translateX(calc(100% + -45px))
          const mCalc = t.match(/translateX\(calc\((-?[\d.]+)%\s*\+\s*(-?[\d.]+)px\)\)/)
          if (mCalc) return (parseFloat(mCalc[1]) / 100) * window.innerWidth + parseFloat(mCalc[2])
          const mCalcSub = t.match(/translateX\(calc\((-?[\d.]+)%\s*-\s*([\d.]+)px\)\)/)
          if (mCalcSub) return (parseFloat(mCalcSub[1]) / 100) * window.innerWidth - parseFloat(mCalcSub[2])
          return 0
        }

        // Velocity del dito: use-gesture dà vx in px/ms → Motion animate() vuole px/s → *1000
        const velocityPxPerSec = typeof velocityParam === 'number'
          ? velocityParam * 1000
          : 0

        if (targetX === 0) {
          // SNAP-BACK: tutto torna alla posizione di riposo.
          // Passiamo velocity solo qui — serve per il "respingimento" naturale del dito.
          if (currentEl) {
            const fromX = getCurrentX(currentEl)
            animCurrentRef.current = animate(
              fromX, 0,
              {
                ...SPRING_BACK,
                velocity: velocityPxPerSec,
                onUpdate: (v: number) => {
                  currentEl.style.transform = v !== 0 ? `translateX(${v}px)` : ''
                },
                onComplete: () => {
                  currentEl.style.transform = ''
                  currentEl.style.willChange = ''
                  animCurrentRef.current = null
                },
              }
            )
          }
          if (adjEl) {
            const fromX   = getCurrentX(adjEl)
            // restPos: panel sinistro torna a sinistra (-w), panel destro torna a destra (+w)
            const restPos = adjLeftRef.current ? -window.innerWidth : window.innerWidth
            animAdjRef.current = animate(
              fromX, restPos,
              {
                ...SPRING_BACK,
                velocity: velocityPxPerSec,
                onUpdate: (v: number) => {
                  adjEl.style.transform = `translateX(${v}px)`
                },
                onComplete: () => {
                  adjEl.style.transform  = `translateX(${restPos}px)`
                  adjEl.style.willChange = ''
                  adjLeftRef.current  = null
                  adjRightRef.current = null
                  setAdjLeft(null)
                  setAdjRight(null)
                  animAdjRef.current = null
                },
              }
            )
          } else {
            adjLeftRef.current = null; adjRightRef.current = null
            setAdjLeft(null); setAdjRight(null)
          }
        } else {
          // NAVIGAZIONE CONFERMATA: current esce, incoming entra.
          // Passiamo la velocity del dito alla spring in modo che la pagina
          // "continui" il momentum del dito → feel nativo iOS/Android.
          // La velocity da use-gesture è in px/ms → Motion animate() vuole px/s → *1000
          // Clamppiamo a un massimo ragionevole per evitare snap istantaneo su swipe molto veloci
          const clampedVelocity = Math.sign(velocityPxPerSec) * Math.min(Math.abs(velocityPxPerSec), 3000)
          const incomingEl = targetX > 0 ? leftEl : rightEl

          if (currentEl) {
            const fromX = getCurrentX(currentEl)
            animCurrentRef.current = animate(
              fromX, targetX,
              {
                ...SPRING_NAV,
                velocity: clampedVelocity,
                onUpdate: (v: number) => {
                  currentEl.style.transform = `translateX(${v}px)`
                },
                onComplete: () => {
                  currentEl.style.transform  = `translateX(${targetX > 0 ? '100%' : '-100%'})`
                  currentEl.style.willChange = ''
                  animCurrentRef.current = null
                },
              }
            )
          }

          if (incomingEl) {
            const fromX = getCurrentX(incomingEl)
            animAdjRef.current = animate(
              fromX, 0,
              {
                ...SPRING_NAV,
                velocity: clampedVelocity,
                onUpdate: (v: number) => {
                  incomingEl.style.transform = v !== 0 ? `translateX(${v}px)` : ''
                },
                onComplete: () => {
                  incomingEl.style.transform  = ''
                  incomingEl.style.willChange = ''
                  adjLeftRef.current  = null
                  adjRightRef.current = null
                  setAdjLeft(null)
                  setAdjRight(null)
                  animAdjRef.current = null
                },
              }
            )
          } else {
            adjLeftRef.current = null; adjRightRef.current = null
            setAdjLeft(null); setAdjRight(null)
          }
        }
      },
    )
    return () => swipeNavBridge.unregister()
  }, []) // eslint-disable-line

  useEffect(() => {
    // Cancella animazioni in corso al cambio tab da navbar/back
    animCurrentRef.current?.stop()
    animAdjRef.current?.stop()
    animCurrentRef.current = null
    animAdjRef.current     = null

    adjLeftRef.current = null; adjRightRef.current = null
    setAdjLeft(null); setAdjRight(null)
    if (tab) {
      const el = panelRefs.current[tab]?.current
      if (el) { el.style.transform = ''; el.style.willChange = '' }
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
      return { ...base, transform: 'translateX(-300%)', zIndex: 0, pointerEvents: 'none', visibility: 'hidden',
        contentVisibility: 'hidden' as CSSProperties['contentVisibility'] }
    }
    return { display: 'none' }
  }, [tab, adjLeft, adjRight])

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