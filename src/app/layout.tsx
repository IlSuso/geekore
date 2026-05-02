import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Space_Grotesk, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import './visual-vision.css'
import './visual-vision-completion.css'
import './visual-vision-pages.css'
import Navbar from '@/components/Navbar'

// Manteniamo next/font come fallback self-hosted e usiamo i link nel <head>
// per caricare la direzione visiva del documento: Cabinet + Switzer + JetBrains.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-body-fallback',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display-fallback',
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

const APP_THEME_COLOR = '#0B0B0F'
const BRAND_ACCENT = '#E6FF3D'
const APP_URL = 'https://geekore.app'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: 'Geekore', template: '%s — Geekore' },
  description: 'Traccia anime, manga, videogiochi, film e serie in un unico posto. Condividi i tuoi progressi con la community.',
  manifest: '/manifest.json',
  applicationName: 'Geekore',
  appleWebApp: {
    capable: true,
    title: 'Geekore',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icons/favicon-64.svg', sizes: '64x64', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.svg', sizes: '32x32', type: 'image/svg+xml' },
      { url: '/icons/favicon-16.svg', sizes: '16x16', type: 'image/svg+xml' },
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/geekore-touch.svg', sizes: '180x180', type: 'image/svg+xml' },
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: '/icons/icon-badge.svg', color: BRAND_ACCENT },
    ],
  },
  openGraph: {
    title: 'Geekore',
    description: 'Anime · Manga · Game · Film · Serie · Board. Il tuo universo geek in un unico posto.',
    type: 'website',
    locale: 'it_IT',
    url: APP_URL,
    siteName: 'Geekore',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Geekore — Anime, Manga, Game, Film, Serie, Board' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Geekore',
    description: 'Il tuo universo geek in un unico posto.',
    images: ['/og-image.png'],
  },
}

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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@500;700;800;900&family=Switzer:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/svg+xml" sizes="64x64" href="/icons/favicon-64.svg" />
        <link rel="icon" type="image/svg+xml" sizes="32x32" href="/icons/favicon-32.svg" />
        <link rel="icon" type="image/svg+xml" sizes="16x16" href="/icons/favicon-16.svg" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" sizes="180x180" />
        <link rel="mask-icon" href="/icons/icon-badge.svg" color={BRAND_ACCENT} />
        <meta name="msapplication-TileColor" content={BRAND_ACCENT} />
        <meta name="view-transition" content="same-origin" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Geekore" />
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
