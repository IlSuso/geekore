import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
})

import { ClientProviders } from '@/components/ClientProviders'
import { Footer } from '@/components/Footer'
import { MobileHeader } from '@/components/MobileHeader'
import { AppShell } from '@/components/AppShell'
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

const APP_THEME_COLOR = '#0B0B0F'

export const viewport: Viewport = {
  themeColor: APP_THEME_COLOR,
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
        <meta name="theme-color" content={APP_THEME_COLOR} />
        <meta name="theme-color" content={APP_THEME_COLOR} media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content={APP_THEME_COLOR} media="(prefers-color-scheme: light)" />
      </head>
      <body suppressHydrationWarning className={`${jakarta.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} min-h-screen antialiased`}>
        <ActiveTabProvider initialPathname={initialPathname}>
          <ClientProviders initialLocale={initialLocale}>
            <AppShell>
              {children}
            </AppShell>
            <Footer />
            <MobileHeader />
            <Navbar />
          </ClientProviders>
        </ActiveTabProvider>
      </body>
    </html>
  )
}
