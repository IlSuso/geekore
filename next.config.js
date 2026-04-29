const isProd = process.env.NODE_ENV === 'production'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'image.tmdb.org' },
      { protocol: 'https', hostname: 'images.igdb.com' },
      { protocol: 'https', hostname: 'cdn.cloudflare.steamstatic.com' },
      { protocol: 'https', hostname: 's4.anilist.co' },
      { protocol: 'https', hostname: 'media.kitsu.app' },
      { protocol: 'https', hostname: 'cdn.myanimelist.net' },
      { protocol: 'https', hostname: '*.boardgamegeek.com' },
      { protocol: 'https', hostname: 'cf.geekdo-images.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'books.google.com' },
      { protocol: 'https', hostname: 'api.dicebear.com', pathname: '/**' },
    ],
    formats: ['image/avif', 'image/webp'],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [64, 96, 128, 256, 384],
    // Next.js 16: blocca ottimizzazione IP locali per sicurezza,
    // abilitiamo solo per dev locale se necessario
    // dangerouslyAllowLocalIP: false, // default sicuro
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/api/news/:path*',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=300, stale-while-revalidate=600' },
        ],
      },
      {
        source: '/api/:path(tmdb|igdb|anilist|boardgames|steam)',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=120, stale-while-revalidate=300' },
        ],
      },
      {
        source: '/api/bgg/:path*',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=600, stale-while-revalidate=1200' },
        ],
      },
      {
        source: '/api/steam/games/:path*',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=300, stale-while-revalidate=600' },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },

  compress: true,
  reactStrictMode: true,
  poweredByHeader: false,

  // Next.js 16: experimental ripulito
  // optimisticClientCache è stato rimosso — la navigazione ottimistica
  // è ora il comportamento di default nel nuovo sistema di routing di Next.js 16.
  experimental: {},

  // Next.js 16: logging semplificato
  logging: {
    fetches: {
      fullUrl: false,
      hmrRefreshes: false,
    },
  },
}

module.exports = nextConfig
