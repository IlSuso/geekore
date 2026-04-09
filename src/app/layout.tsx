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
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="bg-black text-white min-h-screen antialiased">
        <ClientProviders>
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