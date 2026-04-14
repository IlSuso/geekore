// DESTINAZIONE: src/app/layout.tsx
// FIX stacking context navbar:
//   Il precedente <div style={{ viewTransitionName: 'navbar' }}> attorno a <Navbar>
//   creava un nuovo stacking context che intrappolava il z-index della navbar,
//   permettendo agli elementi delle pagine di coprirla durante lo scroll.
//   Soluzione: wrapper rimosso. La viewTransitionName è ora sui tag <nav> interni.
//   Rimosso anche viewTransitionName sull'<html> per lo stesso motivo.

import type { Metadata, Viewport } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'
import { ToastProvider } from '@/components/ui/Toast'
import { ClientProviders } from '@/components/ClientProviders'
import { Footer } from '@/components/Footer'

export const metadata: Metadata = {
  title: { default: 'Geekore', template: '%s — Geekore' },
  description: 'Traccia anime, manga, videogiochi, film e serie in un unico posto. Condividi i tuoi progressi con la community.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/favicon-32.png',
    apple: '/icons/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Geekore',
    description: 'Il tuo universo geek in un unico posto.',
    type: 'website',
    locale: 'it_IT',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Geekore',
    description: 'Il tuo universo geek in un unico posto.',
  },
}

export const viewport: Viewport = {
  themeColor: '#7c6af7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        <meta name="view-transition" content="same-origin" />
        <meta name="color-scheme" content="dark light" />
        {/* Preconnect ai domini API esterni — riduce DNS lookup e TLS handshake */}
        <link rel="preconnect" href="https://graphql.anilist.co" />
        <link rel="preconnect" href="https://api.themoviedb.org" />
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="preconnect" href="https://images.igdb.com" />
        <link rel="preconnect" href="https://api.igdb.com" />
        <link rel="preconnect" href="https://cdn.cloudflare.steamstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://s4.anilist.co" />
        <link rel="dns-prefetch" href="https://api.dicebear.com" />
      </head>
      <body className="bg-black text-white min-h-screen antialiased">
        <ClientProviders>
          {/* Navbar senza wrapper — qualsiasi div/span con viewTransitionName,
              isolation, transform, will-change, filter, opacity<1 crea uno
              stacking context che imprigiona il z-index dei figli */}
          <Navbar />
          <main className="pt-16 pb-24 md:pb-8">
            {children}
          </main>
          <Footer />
          <ToastProvider />
        </ClientProviders>
      </body>
    </html>
  )
}