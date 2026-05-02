'use client'
// src/context/ActiveTabContext.tsx
// Context per il tab attivo — aggiornato immediatamente al click nella Navbar.
// Swipe resta compatibile ma viene mappata a For You perché è una modalità.
// Profile non è più tab primaria: l'accesso avviene dall'avatar/header.

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type KATab = 'feed' | 'for-you' | 'library' | 'discover' | 'friends' | 'profile' | 'swipe'

function pathnameToTab(pathname: string): KATab | null {
  if (pathname === '/home' || pathname === '/') return 'feed'
  if (pathname === '/for-you' || pathname === '/swipe') return 'for-you'
  if (pathname === '/library') return 'library'
  if (pathname === '/discover') return 'discover'
  if (pathname === '/friends' || pathname === '/community') return 'friends'
  if (pathname.startsWith('/profile/') && pathname.split('/').length === 3) return 'profile'
  return null
}

interface ActiveTabCtx {
  activeTab: KATab | null
  setActiveTab: (tab: KATab | null) => void
  pathnameToTab: (p: string) => KATab | null
}

const ActiveTabContext = createContext<ActiveTabCtx>({
  activeTab: null,
  setActiveTab: () => {},
  pathnameToTab,
})

export function ActiveTabProvider({ children, initialPathname }: { children: ReactNode; initialPathname?: string }) {
  const [activeTab, setActiveTabState] = useState<KATab | null>(
    initialPathname ? pathnameToTab(initialPathname) : null
  )

  const setActiveTab = useCallback((tab: KATab | null) => {
    setActiveTabState(tab === 'swipe' ? 'for-you' : tab)
  }, [])

  return (
    <ActiveTabContext.Provider value={{ activeTab, setActiveTab, pathnameToTab }}>
      {children}
    </ActiveTabContext.Provider>
  )
}

export function useActiveTab() {
  return useContext(ActiveTabContext)
}

export { pathnameToTab }
