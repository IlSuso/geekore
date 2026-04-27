/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ottimizzazione immagini: domini esterni autorizzati per next/image
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
      // Supabase Storage (wildcard per project-id variabile)
      { protocol: 'https', hostname: '*.supabase.co' },
      // Copertine Google Books
      { protocol: 'https', hostname: 'books.google.com' },
      // Avatar generativi DiceBear (SVG e PNG)
      { protocol: 'https', hostname: 'api.dicebear.com', pathname: '/**' },
    ],
    // Formati moderni: WebP e AVIF (AVIF ~50% più leggero di WebP)
    formats: ['image/avif', 'image/webp'],
    // Abilita SVG da DiceBear (avatar generativi)
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Cache immagini ottimizzate per 30 giorni (default 60s è troppo basso)
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Dimensioni device comuni — evita di generare varianti inutili
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [64, 96, 128, 256, 384],
  },

  // Header HTTP per cache aggressiva su asset statici e API pubbliche
  async headers() {
    return [
      // API news — cambiano raramente, cache 5 min con SWR 10 min
      {
        source: '/api/news/:path*',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=300, stale-while-revalidate=600' },
        ],
      },
      // API search (TMDB, IGDB, Anilist ecc.) — cache 2 min, SWR 5 min
      {
        source: '/api/:path(tmdb|igdb|anilist|boardgames|steam)',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=120, stale-while-revalidate=300' },
        ],
      },
      // BGG — dati cambiano raramente, cache 10 min
      {
        source: '/api/bgg/:path*',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=600, stale-while-revalidate=1200' },
        ],
      },
      // Steam giochi — cache 5 min
      {
        source: '/api/steam/games/:path*',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=300, stale-while-revalidate=600' },
        ],
      },
      // Font e immagini pubbliche in /public
      {
        source: '/fonts/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },

  // Compressione risposta (gzip/brotli) — abilitata di default ma esplicitiamo
  compress: true,

  // Abilita React strict mode per rilevare problemi in dev
  reactStrictMode: true,

  // Rimuove X-Powered-By header (leggero miglioramento sicurezza)
  poweredByHeader: false,

  // Ottimizzazioni sperimentali per navigazione più veloce
  experimental: {
    // Mantiene in cache il payload delle pagine lato client tra navigazioni.
    // Evita re-fetch dei dati quando l'utente torna indietro (back button).
    optimisticClientCache: true,
  },

  // Logging ridotto in produzione
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
}

module.exports = nextConfig