import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Feed',
  description: 'Il feed della community Geekore — post, aggiornamenti e progressi degli utenti che segui.',
  openGraph: {
    title: 'Feed — Geekore',
    description: 'Il feed della community Geekore — post, aggiornamenti e progressi degli utenti che segui.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Feed — Geekore',
    description: 'Il feed della community Geekore.',
  },
}

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
