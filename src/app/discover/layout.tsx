import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Discover',
  description: 'Cerca anime, manga, videogiochi, film, serie TV e board game da aggiungere alla tua collezione.',
  openGraph: {
    title: 'Discover — Geekore',
    description: 'Cerca e aggiungi anime, manga, videogiochi, film, serie TV e board game alla tua collezione.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Discover — Geekore',
    description: 'Cerca e aggiungi media alla tua collezione Geekore.',
  },
}

export default function DiscoverLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
