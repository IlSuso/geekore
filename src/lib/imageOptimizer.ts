// src/lib/imageOptimizer.ts
//
// Ottimizzazione immagini tramite wsrv.nl (proxy pubblico gratuito).
// Funziona come un mini-CDN: ridimensiona e converte in WebP on-the-fly,
// con cache automatica sul loro edge. Latenza aggiuntiva: 0 dopo la prima
// richiesta (la risposta è cachata). La prima richiesta di ogni URL+size
// va e viene da wsrv.nl (< 200ms tipicamente) — invisibile all'utente
// perché avviene in parallelo al rendering della pagina.
//
// PERCHÉ NON RALLENTA L'APP:
//   - wsrv.nl risponde con header Cache-Control lunghi → il browser non
//     re-fetcha mai la stessa URL ottimizzata.
//   - Le richieste immagine sono sempre parallele e non bloccano il JS.
//   - Il fallback all'URL originale è immediato in caso di errore.
//
// DIMENSIONAMENTO (Samsung S25 = DPR 3, logical width 393px):
//   Regola: dimensione_logica × DPR_target (usiamo 2.5 come conservativo
//   — copre DPR 2 e 3 senza servire immagini enormi su DPR 1).
//   Eccezione: contesti dove la sorgente è già limitata (cover BGG ~300px,
//   AniList large ~460px) — inutile chiedere più di quello che esiste.

export type ImageContext =
  | 'discover-card'      // grid 3 col: ~123px logical → 370px @ DPR3
  | 'foryou-card-small'  // sequel card w-44: ~176px logical → 440px @ DPR2.5
  | 'foryou-card-large'  // rec card w-52: ~208px logical → 520px @ DPR2.5
  | 'foryou-friend'      // friends w-28: ~112px logical → 280px @ DPR2.5
  | 'feed-post'          // full-width post: ~360px logical → 900px @ DPR2.5
  | 'swipe-card'         // card ~360px logical → 720px (fonte spesso max 460px)
  | 'profile-grid'       // grid ~120px → 360px @ DPR3
  | 'profile-cover'      // modal profilo: ~128px w-32 → 384px @ DPR3
  | 'drawer-cover'       // MediaDetailsDrawer: w-20 h-28 (80px) → 240px @ DPR3
  | 'drawer-related'     // related nella serie: w-16 (64px) → 192px @ DPR3
  | 'avatar-small'       // avatar 28-44px → 110px @ DPR2.5
  | 'background-blur'    // sfocato 32px blur → 120px è già troppo

// Larghezze output in px — bilancio qualità/peso calibrato per ogni contesto
const CONTEXT_WIDTH: Record<ImageContext, number> = {
  'discover-card':      380,  // 123px × ~3dpr, leggermente sopra per sicurezza
  'foryou-card-small':  460,  // 176px × 2.5dpr ≈ 440, arrotondiamo a 460
  'foryou-card-large':  520,  // 208px × 2.5dpr
  'foryou-friend':      300,  // 112px × 2.5dpr, fonte spesso piccola
  'feed-post':          900,  // 360px × 2.5dpr
  'swipe-card':         720,  // fonte AniList/IGDB max ~460px, inutile chiedere di più
  'profile-grid':       360,  // 120px × 3dpr
  'profile-cover':      400,  // 128px × 3dpr
  'drawer-cover':       240,  // 80px × 3dpr
  'drawer-related':     200,  // 64px × 3dpr
  'avatar-small':       110,  // 44px × 2.5dpr
  'background-blur':    120,  // va sfocato a 32px blur — qualità irrilevante
}

// Domini che richiedono un Referer header per servire le immagini.
// wsrv.nl lo supporta tramite il parametro &referer=
const REFERER_MAP: Array<{ pattern: string; referer: string }> = [
  { pattern: 'anilist.co',       referer: 'https://anilist.co' },
  { pattern: 'myanimelist.net',  referer: 'https://myanimelist.net' },
  { pattern: 'media.kitsu.io',   referer: 'https://kitsu.io' },
]

function getReferer(url: string): string {
  for (const { pattern, referer } of REFERER_MAP) {
    if (url.includes(pattern)) return referer
  }
  return ''
}

// URL che non devono passare per wsrv.nl
function shouldPassThrough(src: string): boolean {
  return (
    src.startsWith('data:') ||
    src.startsWith('/') ||
    src.startsWith('blob:') ||
    src.includes('wsrv.nl') ||
    src.includes('supabase.co')  // Supabase Storage — già ottimizzato / Transform futuro
  )
}

function buildWsrvUrl(src: string, w: number, h?: number): string {
  const referer = getReferer(src)
  const base = `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${w}&output=webp&q=82&n=-1`
  const withH = h ? `${base}&h=${h}&fit=cover` : base
  return referer ? `${withH}&referer=${encodeURIComponent(referer)}` : withH
  // n=-1: non ingrandire immagini già piccole della sorgente
  // q=82: sweet spot WebP — ~50-65% più leggero del JPEG originale, differenza invisibile
}

/**
 * Ottimizza un URL immagine generico per il contesto dato.
 * Usa per immagini non cover (avatar, post foto, ecc.)
 */
export function optimizeImage(src: string | null | undefined, context: ImageContext): string {
  if (!src) return ''
  if (shouldPassThrough(src)) return src
  return buildWsrvUrl(src, CONTEXT_WIDTH[context])
}

/**
 * Ottimizza una copertina (aspect ratio 2:3).
 * Specifica sia width che height così wsrv.nl fa un crop preciso
 * senza distorsioni, riducendo ulteriormente il peso.
 */
export function optimizeCover(src: string | null | undefined, context: ImageContext): string {
  if (!src) return ''
  if (shouldPassThrough(src)) return src
  const w = CONTEXT_WIDTH[context]
  const h = Math.round(w * 1.5) // aspect 2:3
  return buildWsrvUrl(src, w, h)
}