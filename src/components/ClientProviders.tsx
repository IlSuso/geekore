'use client'

import { LocaleProvider } from '@/lib/locale'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>
}
