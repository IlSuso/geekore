// src/app/layout.tsx
// #40: View Transitions API abilitata
// N6:  color-scheme meta tag per compatibilità Dark Reader

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
  // #14: viewport-fit=cover per tastiera iOS
  viewportFit: 'cover',
  // N6: segnala a Dark Reader che il sito gestisce già dark/light autonomamente
  colorScheme: 'dark light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" style={{ viewTransitionName: 'root' } as React.CSSProperties}>
      <head>
        {/* #40: View Transitions */}
        <meta name="view-transition" content="same-origin" />
        {/* N6: Dark Reader compatibility */}
        <meta name="color-scheme" content="dark light" />
      </head>
      <body className="bg-black text-white min-h-screen antialiased">
        <ClientProviders>
          <div style={{ viewTransitionName: 'navbar' } as React.CSSProperties}>
            <Navbar />
          </div>
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