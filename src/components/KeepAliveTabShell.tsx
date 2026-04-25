'use client'

// KeepAliveTabShell — lazy-mount + scroll-restore for keep-alive tabs.
//
// Active tab renders in normal flow (document scroll works).
// Inactive tabs are hidden with display:none — no stacking context issues,
// no position:fixed containment side-effects, no bridge complexity.

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import FeedPage from '@/app/feed/page'
import ForYouPage from '@/app/for-you/page'
import SwipePage from '@/app/swipe/page'
import ProfilePage from '@/app/profile/[username]/page'

type KATab = 'feed' | 'for-you' | 'swipe' | 'profile'

function getKATab(pathname: string): KATab | null {
  if (pathname === '/feed' || pathname === '/') return 'feed'
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

  const profileUsername = latestProfileUsername.current

  return (
    <>
      <div style={{ display: tab === 'feed' ? undefined : 'none' }}>
        {visited.current.has('feed') && <FeedPage />}
      </div>

      <div style={{ display: tab === 'for-you' ? undefined : 'none' }}>
        {visited.current.has('for-you') && <ForYouPage />}
      </div>

      <div style={{ display: tab === 'swipe' ? undefined : 'none' }}>
        {visited.current.has('swipe') && <SwipePage />}
      </div>

      <div style={{ display: tab === 'profile' ? undefined : 'none' }}>
        {visited.current.has('profile') && profileUsername && (
          <ProfilePage usernameOverride={profileUsername} />
        )}
      </div>

      {tab === null && children}
    </>
  )
}
