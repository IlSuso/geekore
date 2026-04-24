'use client'
// KeepAliveTabShell — Instagram-style tab persistence
//
// Come funziona:
//   1. children viene salvato in panels.current[tab] ad ogni render
//   2. Ogni pannello è sempre nel DOM (mai smontato), solo display:none/block
//   3. React riconcilia la stessa istanza del componente → stato preservato al 100%
//   4. Per le route non-tab (settings, profile, trending…) children si renderizza normalmente
//   5. Scroll position salvato continuamente e ripristinato al ritorno

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

type KATab = 'feed' | 'for-you'

function getKATab(pathname: string): KATab | null {
  if (pathname === '/' || pathname === '/feed') return 'feed'
  if (pathname === '/for-you') return 'for-you'
  return null
}

export function KeepAliveTabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const tab = getKATab(pathname)

  // Persiste il contenuto renderizzato per ogni tab (ref = no re-render on update)
  const panels = useRef<Partial<Record<KATab, ReactNode>>>({})
  if (tab) panels.current[tab] = children

  const tabRef = useRef(tab)
  tabRef.current = tab

  const savedY = useRef<Partial<Record<KATab, number>>>({})
  const prevTab = useRef<KATab | null>(null)

  // Salva continuamente lo scroll della tab attiva
  useEffect(() => {
    const onScroll = () => {
      if (tabRef.current) savedY.current[tabRef.current] = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Ripristina scroll al cambio tab
  useEffect(() => {
    if (prevTab.current === tab) return
    requestAnimationFrame(() => {
      window.scrollTo(0, tab ? (savedY.current[tab] ?? 0) : 0)
    })
    prevTab.current = tab
  }, [tab])

  return (
    <>
      <div style={{ display: tab === 'feed' ? undefined : 'none' }}>
        {panels.current.feed}
      </div>
      <div style={{ display: tab === 'for-you' ? undefined : 'none' }}>
        {panels.current['for-you']}
      </div>
      {/* Route non-tab: trending, profile, settings, search, ecc. */}
      {!tab && children}
    </>
  )
}
