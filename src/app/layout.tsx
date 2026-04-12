// DESTINAZIONE: src/app/layout.tsx
// N6: Aggiunto color-scheme meta tag per compatibilità con Dark Reader
// #40: View Transitions API abilitata

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
  // N6: color-scheme segnala a Dark Reader che il sito gestisce già dark/light
  colorScheme: 'dark light',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className="dark" suppressHydrationWarning>
      <head>
        {/* N6: meta tag esplicito per Dark Reader — segnala che il sito gestisce
            autonomamente dark/light mode e non deve essere invertito */}
        <meta name="color-scheme" content="dark light" />
      </head>
      <body className="bg-zinc-950 text-white antialiased">
        <ClientProviders>
          <ToastProvider>
            <Navbar />
            <main className="min-h-screen">
              {children}
            </main>
            <Footer />
          </ToastProvider>
        </ClientProviders>
      </body>
    </html>
  )
}
