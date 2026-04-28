// src/lib/imageOptimizer.ts
//
// Ottimizzazione immagini per Geekore.
//
// STRATEGIA:
//   Molti CDN di immagini (AniList, MAL, IGDB, BGG, Google Books, Steam)
//   usano hotlink/IP protection: bloccano i server proxy (come wsrv.nl)
//   con HTTP 403, ma servono le immagini senza problemi ai browser degli
//   utenti finali. Passare queste URL per wsrv.nl ROMPE le immagini.
//
//   Regola: se il dominio è noto per bloccare i proxy → passa diretto.
//   wsrv.nl si usa solo per immagini da Supabase Storage proprie (foto post
//   degli utenti) dove controlliamo noi il dominio e non c'è IP blocking.
//
//   Per le cover da domini esterni, il ridimensionamento avviene tramite
//   next/image (componente OptimizedCover) che usa il proxy interno di Next.js
//   (/_next/image) — questo funziona perché la richiesta parte dal SERVER
//   Next.js del progetto (non da un IP di datacenter generico).
//   I domini devono essere configurati in next.config.ts remotePatterns.
//
// LATENZA: zero impatto sul real-time. Le richieste immagine sono sempre
//   parallele e non bloccano mai il thread JS.

export type ImageContext =
  | 'discover-card'      // grid 3 col: ~123px logical
  | 'foryou-card-small'  // sequel card w-44: ~176px logical
  | 'foryou-card-large'  // rec card w-52: ~208px logical
  | 'foryou-friend'      // friends w-28: ~112px logical
  | 'feed-post'          // full-width post: ~360px logical
  | 'swipe-card'         // card ~360px logical
  | 'profile-grid'       // grid ~120px logical
  | 'profile-cover'      // modal profilo: ~128px logical
  | 'drawer-cover'       // MediaDetailsDrawer: w-20 (80px logical)
  | 'drawer-related'     // related serie: w-16 (64px logical)
  | 'avatar-small'       // avatar 28-44px logical
  | 'background-blur'    // sfocato → qualità irrilevante

// Domini che bloccano i proxy (wsrv.nl, etc.) ma funzionano direttamente
// nel browser dell'utente. NON passare per wsrv.nl.
const DIRECT_DOMAINS = [
  's4.anilist.co',
  'anilist.co',
  'cdn.myanimelist.net',
  'myanimelist.net',
  'images.igdb.com',
  'cf.geekdo-images.com',
  'geekdo-images.com',
  'books.google.com',
  'lh3.googleusercontent.com',   // Google Books covers
  'covers.openlibrary.org',
  'image.tmdb.org',
  'cdn.cloudflare.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'media.kitsu.io',
  'img.animefillerlist.com',
]

function isDirect(src: string): boolean {
  try {
    const hostname = new URL(src).hostname
    return DIRECT_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}

// URL che passano invariati (già ottimizzati, locali, o Supabase)
function shouldPassThrough(src: string): boolean {
  return (
    src.startsWith('data:') ||
    src.startsWith('/') ||
    src.startsWith('blob:') ||
    src.includes('wsrv.nl') ||
    isDirect(src)  // ← domini noti che bloccano i proxy → diretto al browser
    // NB: supabase.co non è qui — le foto post degli utenti passano per wsrv.nl
    // perché il nostro Supabase NON blocca i proxy e vogliamo il ridimensionamento
  )
}

// Larghezze output wsrv.nl per immagini Supabase (foto post utenti)
// Samsung S25 DPR ~3 → moltiplichiamo la dimensione logica × 2.5
const CONTEXT_WIDTH: Record<ImageContext, number> = {
  'discover-card':      380,
  'foryou-card-small':  460,
  'foryou-card-large':  520,
  'foryou-friend':      300,
  'feed-post':          900,
  'swipe-card':         720,
  'profile-grid':       360,
  'profile-cover':      400,
  'drawer-cover':       240,
  'drawer-related':     200,
  'avatar-small':       110,
  'background-blur':    120,
}

function buildWsrvUrl(src: string, w: number, h?: number): string {
  const base = `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${w}&output=webp&q=82&n=-1`
  return h ? `${base}&h=${h}&fit=cover` : base
}

/**
 * Ottimizza un URL immagine per il contesto dato.
 * Domini noti (AniList, MAL, IGDB, BGG…) vengono restituiti invariati
 * perché il browser dell'utente li può richiedere direttamente.
 * Immagini da Supabase Storage (foto post utenti) passano per wsrv.nl.
 */
export function optimizeImage(src: string | null | undefined, context: ImageContext): string {
  if (!src) return ''
  if (shouldPassThrough(src)) return src
  return buildWsrvUrl(src, CONTEXT_WIDTH[context])
}

/**
 * Ottimizza una copertina (aspect ratio 2:3).
 * Stessa logica di optimizeImage ma specifica anche l'altezza
 * per un crop preciso (solo per immagini Supabase).
 */
export function optimizeCover(src: string | null | undefined, context: ImageContext): string {
  if (!src) return ''
  if (shouldPassThrough(src)) return src
  const w = CONTEXT_WIDTH[context]
  const h = Math.round(w * 1.5) // aspect 2:3
  return buildWsrvUrl(src, w, h)
}