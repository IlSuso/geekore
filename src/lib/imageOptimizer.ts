// src/lib/imageOptimizer.ts
//
// Ottimizzazione immagini tramite wsrv.nl (proxy pubblico gratuito).
// Converte automaticamente in WebP e ridimensiona in base al contesto d'uso,
// riducendo il peso senza perdita visibile di qualità.
//
// LOGICA DI DIMENSIONAMENTO:
//   - wsrv.nl ridimensiona al volo e serve WebP (browser compat. automatica).
//   - Usiamo "device pixel ratio" conservativo: 2× per tutti i contesti
//     tranne swipe (già grande) dove restiamo a 1× per non esagerare.
//   - Le URL già passanti per wsrv.nl vengono restituite invariate.
//   - URL relative (avatar da Supabase Storage) vengono restituite invariate
//     perché Next.js Image le ottimizza già tramite il suo endpoint interno.

export type ImageContext =
  | 'discover-card'    // grid 3-5 col, card ~120×180px → ottimizziamo a 240px wide
  | 'foryou-card'      // thumbnail lista ~80px → ottimizziamo a 160px wide
  | 'feed-post'        // immagine post full-width ~390px → ottimizziamo a 780px wide
  | 'swipe-card'       // card grande ~360px wide → ottimizziamo a 540px (1.5×)
  | 'profile-grid'     // grid profilo ~110px → ottimizziamo a 220px wide
  | 'profile-cover'    // cover media nel profilo modal → ottimizziamo a 500px
  | 'avatar-small'     // avatar 28-44px → ottimizziamo a 88px
  | 'background-blur'  // sfocato in background → 120px bastano

// Larghezze in px per ogni contesto (output wsrv.nl)
const CONTEXT_WIDTH: Record<ImageContext, number> = {
  'discover-card':   240,  // 120px × 2dpr
  'foryou-card':     160,  // 80px × 2dpr
  'feed-post':       780,  // 390px × 2dpr
  'swipe-card':      540,  // 360px × 1.5 (già grande, non esageriamo)
  'profile-grid':    220,  // 110px × 2dpr
  'profile-cover':   500,  // usato nel modal profilo
  'avatar-small':     88,  // 44px × 2dpr
  'background-blur': 120,  // va sfocato, bassa res ok
}

/**
 * Restituisce un URL ottimizzato via wsrv.nl per il contesto dato.
 * Se l'URL è già wsrv.nl, relativo, o un data URL, lo restituisce invariato.
 */
export function optimizeImage(src: string | null | undefined, context: ImageContext): string {
  if (!src) return ''

  // Già ottimizzato o URL speciale → passa attraverso
  if (
    src.startsWith('data:') ||
    src.startsWith('/') ||
    src.includes('wsrv.nl') ||
    src.includes('supabase.co') // Supabase Storage → gestito separatamente
  ) {
    return src
  }

  const w = CONTEXT_WIDTH[context]
  return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${w}&output=webp&q=82&n=-1`
  // n=-1: disable upscaling (non ingrandire immagini già piccole)
  // q=82: qualità WebP — bilancio ottimo tra peso e qualità visiva
}

/**
 * Versione per copertine con aspect ratio fisso (2:3).
 * Specifica anche l'altezza per evitare che wsrv.nl debba calcolarla.
 */
export function optimizeCover(src: string | null | undefined, context: ImageContext): string {
  if (!src) return ''
  if (
    src.startsWith('data:') ||
    src.startsWith('/') ||
    src.includes('wsrv.nl') ||
    src.includes('supabase.co')
  ) return src

  const w = CONTEXT_WIDTH[context]
  const h = Math.round(w * 1.5) // aspect 2:3
  return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${w}&h=${h}&fit=cover&output=webp&q=82&n=-1`
}