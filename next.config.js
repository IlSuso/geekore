// P1: Bundle analyzer — attivato solo con ANALYZE=true
// Uso: ANALYZE=true npm run build
const withBundleAnalyzer = process.env.ANALYZE === 'true'
  ? require('@next/bundle-analyzer')({ enabled: true })
  : (config) => config

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 's4.anilist.co', pathname: '/file/**' },
      { protocol: 'https', hostname: 'image.tmdb.org', pathname: '/t/p/**' },
      { protocol: 'https', hostname: 'images.igdb.com', pathname: '/igdb/image/upload/**' },
      { protocol: 'https', hostname: 'cdn.cloudflare.steamstatic.com', pathname: '/steam/apps/**' },
      // BGG — accetta sia cf.geekdo-images.com che www.boardgamegeek.com
      { protocol: 'https', hostname: 'cf.geekdo-images.com' },
      { protocol: 'https', hostname: 'www.boardgamegeek.com' },
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
      { protocol: 'https', hostname: 'api.dicebear.com', pathname: '/7.x/**' },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 giorni
    // P4: qualità default ridotta per immagini pesanti (BGG arriva a 800KB+)
    // next/image comprime automaticamente; 80 è il trade-off ottimale
    dangerouslyAllowSVG: false,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // Headers di sicurezza + HSTS + CSP di base
  async headers() {
    const isDev = process.env.NODE_ENV === 'development'
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS: forza HTTPS per 1 anno (non in dev per non rompere localhost)
          ...(!isDev ? [{
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          }] : []),
          // CSP di base — permette Supabase, CDN media, e il proprio dominio
          // In produzione: stringa restrittiva. In dev: relaxed per HMR.
          {
            key: 'Content-Security-Policy',
            value: isDev
              ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' *; img-src * data: blob:;"
              : [
                  "default-src 'self'",
                  "script-src 'self' 'unsafe-inline'", // next.js necessita inline
                  "style-src 'self' 'unsafe-inline'",
                  "img-src * data: blob:",
                  "font-src 'self' data:",
                  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.steampowered.com https://graphql.anilist.co https://api.themoviedb.org https://api.igdb.com",
                  "frame-ancestors 'none'",
                  "base-uri 'self'",
                  "form-action 'self'",
                ].join('; '),
          },
        ],
      },
    ]
  },

  async redirects() {
    return [
      { source: '/profile/', destination: '/profile/me', permanent: false },
    ]
  },

  // P1: ottimizzazioni bundle
  webpack(config, { isServer }) {
    // Evita di includere moduli server-only nel bundle client
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      }
    }
    return config
  },
}

module.exports = withBundleAnalyzer(nextConfig)