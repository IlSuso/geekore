import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
})

import { ClientProviders } from '@/components/ClientProviders'
import { Footer } from '@/components/Footer'
import { MobileHeader } from '@/components/MobileHeader'
import { SwipeablePageContainer } from '@/components/SwipeablePageContainer'
import { KeepAliveTabShell } from '@/components/KeepAliveTabShell'
import { MainShell } from '@/components/MainShell'
import { ActiveTabProvider } from '@/context/ActiveTabContext'
import { cookies, headers } from 'next/headers'

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

  // Legge il pathname dalla request server-side per inizializzare
  // ActiveTabProvider con il tab corretto fin dal primo render,
  // eliminando il flash da null → tab.
  const headersList = await headers()
  const initialPathname = headersList.get('x-pathname') ?? headersList.get('x-invoke-path') ?? '/home'

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
      <body suppressHydrationWarning className={`${jakarta.variable} bg-black text-white min-h-screen antialiased`}>
        <ActiveTabProvider initialPathname={initialPathname}>
        <ClientProviders initialLocale={initialLocale}>
          <SwipeablePageContainer>
            <MainShell>
              <KeepAliveTabShell>
                {children}
              </KeepAliveTabShell>
            </MainShell>
          </SwipeablePageContainer>
          <Footer />
          <MobileHeader />
          <Navbar />
        </ClientProviders>
        </ActiveTabProvider>
      </body>
    </html>
  )
}
