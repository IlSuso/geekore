'use client'
// src/components/ClientProviders.tsx
// M8: Aggiunto SyncStatusListener per ricevere messaggi dal Service Worker

import { ThemeProvider } from '@/lib/theme'
import { SyncStatusListener } from '@/components/ui/SyncToast'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      {/* M8: Ascolta i messaggi del SW per Background Sync */}
      <SyncStatusListener />
      {children}
    </ThemeProvider>
  )
}
