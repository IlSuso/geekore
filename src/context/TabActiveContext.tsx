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

export function useTabActive() {
  return useContext(TabActiveContext)
}

export { TabActiveContext }