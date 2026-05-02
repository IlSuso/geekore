'use client'
// src/context/TabActiveContext.tsx
//
// Ogni panel del KeepAliveTabShell riceve isActive=true solo quando è il tab
// corrente. Le pagine usano questo per sospendere le attività costose
// (Realtime, polling, listener) quando sono nascoste, riducendo il lag.
//
// Uso:
//   const isActive = useTabActive()
//   useEffect(() => {
//     if (!isActive) return   // non fare nulla se nascosto
//     const channel = supabase.channel(...).subscribe()
//     return () => supabase.removeChannel(channel)
//   }, [isActive])

import { createContext, useContext } from 'react'

const TabActiveContext = createContext<boolean>(true)

export function useTabActive(_tabPath?: string) {
  // _tabPath è accettato solo per compatibilità con pagine che chiamano
  // useTabActive('/for-you'). Il provider espone già il boolean corretto
  // per il panel corrente, quindi non serve confrontare qui il pathname.
  return useContext(TabActiveContext)
}

export { TabActiveContext }