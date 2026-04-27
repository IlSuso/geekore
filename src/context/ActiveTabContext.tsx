'use client'
// src/context/ActiveTabContext.tsx
// Context per il tab attivo — aggiornato IMMEDIATAMENTE al click nella Navbar,
// senza aspettare il ciclo di navigazione Next.js (~100-150ms).
// KeepAliveTabShell legge questo invece di usePathname() per lo switch visivo.

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type KATab = 'feed' | 'discover' | 'for-you' | 'swipe' | 'profile'

function pathnameToTab(pathname: string): KATab | null {
  if (pathname === '/home' || pathname === '/') return 'feed'
  if (pathname === '/discover') return 'discover'
  if (pathname === '/for-you') return 'for-you'
  if (pathname === '/swipe') return 'swipe'
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
    setActiveTabState(tab)
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
