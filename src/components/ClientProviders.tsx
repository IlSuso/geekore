'use client'
// src/components/ClientProviders.tsx
// M8: Aggiunto SyncStatusListener per Background Sync toast

import { LocaleProvider } from '@/lib/locale'
import { ThemeProvider } from '@/lib/theme'
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar'
import { SyncStatusListener } from '@/components/ui/SyncToast'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <ServiceWorkerRegistrar />
        {/* M8: ascolta messaggi Background Sync dal Service Worker */}
        <SyncStatusListener />
        {children}
      </LocaleProvider>
    </ThemeProvider>
  )
}