// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // ── Image optimization ──────────────────────────────────────────────────────
  images: {
    remotePatterns: [
      // AniList covers
      { protocol: 'https', hostname: 's4.anilist.co' },
      { protocol: 'https', hostname: '*.anilist.co' },
      // TMDb (film, serie, anime news)
      { protocol: 'https', hostname: 'image.tmdb.org' },
      // IGDB (videogiochi)
      { protocol: 'https', hostname: 'images.igdb.com' },
      // Steam (libreria giochi)
      { protocol: 'https', hostname: 'cdn.cloudflare.steamstatic.com' },
      { protocol: 'https', hostname: 'media.steampowered.com' },
      // BoardGameGeek
      { protocol: 'https', hostname: 'cf.geekdo-images.com' },
      { protocol: 'https', hostname: '*.geekdo-images.com' },
      // Supabase Storage (avatar, post images)
      { protocol: 'https', hostname: '*.supabase.co' },
      // DiceBear (avatar generati)
      { protocol: 'https', hostname: 'api.dicebear.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 86400, // 24 ore
  },

  // ── Security Headers ─────────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Previene clickjacking
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          // Previene MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Referrer policy
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Permissions policy — disabilita features non necessarie
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // HSTS — forza HTTPS per 1 anno (abilitare solo in produzione con HTTPS)
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          // Content Security Policy
          // Permissiva ma sicura: blocca inline scripts non autorizzati
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Script: solo self + Next.js inline (necessario per hydration)
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Stili: self + inline (necessario per Tailwind)
              "style-src 'self' 'unsafe-inline'",
              // Immagini: tutti i domini delle cover + data URIs
              "img-src 'self' data: blob: https://s4.anilist.co https://*.anilist.co https://image.tmdb.org https://images.igdb.com https://cdn.cloudflare.steamstatic.com https://media.steampowered.com https://*.geekdo-images.com https://*.supabase.co https://api.dicebear.com https://*.steamstatic.com",
              // Font: solo self
              "font-src 'self'",
              // Connessioni: Supabase + API esterne
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://graphql.anilist.co https://api.themoviedb.org https://api.igdb.com https://id.twitch.tv https://api.steampowered.com https://boardgamegeek.com",
              // Manifest PWA
              "manifest-src 'self'",
              // Service Worker
              "worker-src 'self' blob:",
              // Frame
              "frame-ancestors 'none'",
            ].join('; '),
          },
          // X-DNS-Prefetch-Control
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
        ],
      },
      // Cache aggressiva per assets statici Next.js
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Cache per immagini ottimizzate
      {
        source: '/_next/image(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      // Cache per assets pubblici (sw.js, manifest, icons)
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ]
  },

  // ── Redirects ────────────────────────────────────────────────────────────────
  async redirects() {
    return [
      // Redirect legacy paths
      {
        source: '/home',
        destination: '/feed',
        permanent: true,
      },
      {
        source: '/collection',
        destination: '/profile/me',
        permanent: true,
      },
    ]
  },

  // ── Ottimizzazioni ───────────────────────────────────────────────────────────
  // Compressione
  compress: true,

  // PoweredBy header rimosso (sicurezza)
  poweredByHeader: false,

  // Strict mode React per catch bugs in sviluppo
  reactStrictMode: true,

  // Ottimizzazione pacchetti (Next.js 14+)
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
    ],
  },
}

export default nextConfig