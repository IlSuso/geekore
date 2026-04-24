'use client'
// KeepAliveTabShell — Instagram-style tab persistence
//
// Come funziona:
//   1. children viene salvato in panels.current[tab] SOLO alla prima visita (o cambio URL per profile)
//   2. Ogni pannello è sempre nel DOM (mai smontato), solo display:none/block
//   3. React riconcilia la stessa istanza del componente → stato preservato al 100%
//   4. Per le route non-tab (settings, trending, search…) children si renderizza normalmente
//   5. Scroll position salvato continuamente e ripristinato al ritorno
//
// Bug fix: in precedenza panels.current[tab] veniva sovrascritto ad ogni navigation,
// causando unmount/remount del componente e perdita dello stato. Ora usiamo panelUrls
// per aggiornare il pannello solo quando l'URL cambia realmente.

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

type KATab = 'feed' | 'for-you' | 'swipe' | 'profile'

function getKATab(pathname: string): KATab | null {
  if (pathname === '/' || pathname === '/feed') return 'feed'
  if (pathname === '/for-you') return 'for-you'
  if (pathname === '/swipe') return 'swipe'
  if (pathname.startsWith('/profile/')) return 'profile'
  return null
}

export function KeepAliveTabShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const tab = getKATab(pathname)

  const panels = useRef<Partial<Record<KATab, ReactNode>>>({})
  const panelUrls = useRef<Partial<Record<KATab, string>>>({})

  if (tab) {
    // Per feed/for-you/swipe: la URL non cambia mai → usa il nome del tab come chiave stabile
    //   → children viene memorizzato una volta sola → stessa istanza React → stato preservato
    // Per profile: la URL cambia per ogni profilo → aggiorna solo quando si visita un profilo diverso
    const stableKey = tab === 'profile' ? pathname : tab
    if (panelUrls.current[tab] !== stableKey) {
      panels.current[tab] = children
      panelUrls.current[tab] = stableKey
    }
  }

  const tabRef = useRef(tab)
  tabRef.current = tab

  const savedY = useRef<Partial<Record<KATab, number>>>({})
  const prevTab = useRef<KATab | null>(null)

  // Salva continuamente lo scroll della tab attiva (non per swipe: fixed inset-0)
  useEffect(() => {
    const onScroll = () => {
      if (tabRef.current && tabRef.current !== 'swipe') savedY.current[tabRef.current] = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Ripristina scroll al cambio tab (non per swipe)
  useEffect(() => {
    if (prevTab.current === tab) return
    if (tab !== 'swipe') {
      requestAnimationFrame(() => {
        window.scrollTo(0, tab ? (savedY.current[tab] ?? 0) : 0)
      })
    }
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
      <div style={{ display: tab === 'swipe' ? undefined : 'none' }}>
        {panels.current.swipe}
      </div>
      <div style={{ display: tab === 'profile' ? undefined : 'none' }}>
        {panels.current.profile}
      </div>
      {/* Route non-tab: trending, settings, search, ecc. */}
      {!tab && children}
    </>
  )
}
