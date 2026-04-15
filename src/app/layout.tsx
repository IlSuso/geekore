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
import { MobileHeader } from '@/components/MobileHeader'
import { SwipeablePageContainer } from '@/components/SwipeablePageContainer'
import { cookies } from 'next/headers'

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
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  colorScheme: 'dark',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const localeCookie = cookieStore.get('geekore_locale')?.value
  const initialLocale = localeCookie === 'en' ? 'en' : 'it'

  return (
    <html lang="it">
      <head>
        <meta name="view-transition" content="same-origin" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#000000" />
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: light)" />
      </head>
      <body suppressHydrationWarning className="bg-black text-white min-h-screen antialiased">
        <ClientProviders initialLocale={initialLocale}>
          {/* Navbar senza wrapper — qualsiasi div/span con viewTransitionName,
              isolation, transform, will-change, filter, opacity<1 crea uno
              stacking context che imprigiona il z-index dei figli */}
          <MobileHeader />
          <Navbar />
          <SwipeablePageContainer>
            <main className="pt-14 md:pt-16 pb-20 md:pb-8">
              {children}
            </main>
          </SwipeablePageContainer>
          <Footer />
          <ToastProvider />
        </ClientProviders>
      </body>
    </html>
  )
}