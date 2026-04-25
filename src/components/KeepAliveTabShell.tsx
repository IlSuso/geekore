'use client'

// KeepAliveTabShell — lazy-mount + scroll-restore + Instagram-style carousel preview.
//
// Normal state: inactive panels are display:none (no layout / paint cost).
// During swipe: adjacent panels become position:absolute at ±100% of wrapRef width,
//   so SwipeablePageContainer's own transform carries them into view automatically —
//   no additional transform needed on the panels themselves.
// After snap: panels revert to display:none via resetPanels().
//
// position:absolute (not fixed) avoids the CSS containment issue where
// willChange:transform on an ancestor traps position:fixed descendants.

import { usePathname } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
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
  if (pathname === '/feed' || pathname === '/') return 'feed'
  if (pathname === '/for-you') return 'for-you'
  if (pathname === '/swipe') return 'swipe'
  if (pathname.startsWith('/profile/') && pathname.split('/').length === 3) return 'profile'
  return null
}

function tabOrderIdx(tab: KATab): number {
  return TAB_ORDER.indexOf(KA_TO_PATH[tab])
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

  // Panel refs — bridge writes styles directly, no React re-renders per frame
  const panelRefs = useRef<Partial<Record<KATab, HTMLDivElement | null>>>({})

  const resetPanels = useCallback(() => {
    const currentTab = tabRef.current
    for (const key of KA_TABS) {
      const el = panelRefs.current[key]
      if (!el) continue
      el.style.position   = ''
      el.style.top        = ''
      el.style.left       = ''
      el.style.width      = ''
      el.style.minHeight  = ''
      el.style.paddingTop = ''
      el.style.paddingBottom = ''
      el.style.pointerEvents = ''
      el.style.overflow   = ''
      // Restore React-controlled display
      el.style.display    = currentTab === key ? '' : 'none'
    }
  }, [])

  const applyCarousel = useCallback((currActiveIdx: number) => {
    const isDesktop = window.innerWidth >= 768
    // Match the padding of <main> so adjacent panel content clears the navbar
    const navH = isDesktop ? '64px' : 'calc(52px + env(safe-area-inset-top, 0px))'
    const botH = isDesktop ? '32px' : '80px'

    for (const key of KA_TABS) {
      const el = panelRefs.current[key]
      if (!el) continue
      const panelIdx = tabOrderIdx(key)
      if (panelIdx === -1) continue
      const rel = panelIdx - currActiveIdx  // -1 = left, 0 = active, +1 = right

      if (rel === 0) continue  // active panel: wrapRef transform handles it

      if (Math.abs(rel) === 1 && visited.current.has(key)) {
        // Adjacent visited panel: show at ±100% offset.
        // wrapRef's own transform slides it into view — no extra transform needed.
        el.style.display       = 'block'
        el.style.position      = 'absolute'
        el.style.top           = '0'
        el.style.left          = rel > 0 ? '100%' : '-100%'
        el.style.width         = '100%'
        el.style.minHeight     = '100%'
        el.style.paddingTop    = navH
        el.style.paddingBottom = botH
        el.style.pointerEvents = 'none'
        el.style.overflow      = 'hidden'
      }
    }
  }, [])

  useEffect(() => {
    swipeNavBridge.register((offset, currActiveIdx, snap) => {
      if (offset !== 0) {
        applyCarousel(currActiveIdx)
      } else if (snap) {
        // Snap back to current page — reset after transition completes
        setTimeout(resetPanels, 310)
      }
    })
    return () => swipeNavBridge.unregister()
  }, [applyCarousel, resetPanels])

  // On route change: reset all panels synchronously before paint
  useLayoutEffect(() => {
    resetPanels()
  }, [pathname, resetPanels])

  const profileUsername = latestProfileUsername.current

  return (
    <>
      <div ref={(el: HTMLDivElement | null) => { panelRefs.current['feed'] = el }}
           style={{ display: tab === 'feed' ? undefined : 'none' }}>
        {visited.current.has('feed') && <FeedPage />}
      </div>

      <div ref={(el: HTMLDivElement | null) => { panelRefs.current['for-you'] = el }}
           style={{ display: tab === 'for-you' ? undefined : 'none' }}>
        {visited.current.has('for-you') && <ForYouPage />}
      </div>

      <div ref={(el: HTMLDivElement | null) => { panelRefs.current['swipe'] = el }}
           style={{ display: tab === 'swipe' ? undefined : 'none' }}>
        {visited.current.has('swipe') && <SwipePage />}
      </div>

      <div ref={(el: HTMLDivElement | null) => { panelRefs.current['profile'] = el }}
           style={{ display: tab === 'profile' ? undefined : 'none' }}>
        {visited.current.has('profile') && profileUsername && (
          <ProfilePage usernameOverride={profileUsername} />
        )}
      </div>

      {tab === null && children}
    </>
  )
}
