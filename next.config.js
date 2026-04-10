/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Usa il loader ottimizzato di Vercel (default) con i domini delle cover
    remotePatterns: [
      // AniList
      {
        protocol: 'https',
        hostname: 's4.anilist.co',
        pathname: '/file/**',
      },
      // TMDb
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
      // IGDB / Twitch
      {
        protocol: 'https',
        hostname: 'images.igdb.com',
        pathname: '/igdb/image/upload/**',
      },
      // Steam CDN (cover librerie)
      {
        protocol: 'https',
        hostname: 'cdn.cloudflare.steamstatic.com',
        pathname: '/steam/apps/**',
      },
      // BGG
      {
        protocol: 'https',
        hostname: 'cf.geekdo-images.com',
      },
      {
        protocol: 'https',
        hostname: 'www.boardgamegeek.com',
      },
      // Supabase storage (avatar)
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      // DiceBear (avatar generati)
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
        pathname: '/7.x/**',
      },
    ],
    // Formati moderni
    formats: ['image/avif', 'image/webp'],
    // Device sizes per responsive
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    // Image sizes per componenti piccoli (cover card)
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Cache delle immagini ottimizzate: 30 giorni
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  // Headers di sicurezza
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ]
  },

  // Redirect utili
  async redirects() {
    return [
      // Normalizza URL profilo senza trailing slash
      {
        source: '/profile/',
        destination: '/profile/me',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig