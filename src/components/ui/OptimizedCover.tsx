'use client'
// src/components/ui/OptimizedCover.tsx
// Sostituisce gli <img> delle cover con next/image per LCP e bandwidth ottimali.
// Mantiene fallback su <img> standard per URL da domini non configurati.

import Image from 'next/image'
import { useState } from 'react'

// Domini configurati in next.config.js — URL fuori da questi usa <img> normale
const OPTIMIZED_DOMAINS = [
  's4.anilist.co',
  'image.tmdb.org',
  'images.igdb.com',
  'cdn.cloudflare.steamstatic.com',
  'cf.geekdo-images.com',
  // api.dicebear.com escluso: gli avatar DiceBear vanno gestiti da Avatar component
  // (non sono cover, e i loro container non hanno position: relative)
]

function isOptimizable(src: string): boolean {
  try {
    const url = new URL(src)
    return OPTIMIZED_DOMAINS.some(
      d => url.hostname === d || url.hostname.endsWith(`.${d}`)
    ) || url.hostname.endsWith('.supabase.co')
  } catch {
    return false
  }
}

interface OptimizedCoverProps {
  src: string | undefined | null
  alt: string
  className?: string
  /** Width in px — usato da next/image per il calcolo sizes */
  width?: number
  /** Height in px */
  height?: number
  /** Se true, usa fill mode (il parent deve avere position: relative) */
  fill?: boolean
  /** Priorità LCP: true per le cover above-the-fold */
  priority?: boolean
  /** Fallback JSX se src è vuoto */
  fallback?: React.ReactNode
  onError?: () => void
  /**
   * PERF FIX: sizes hint per next/image — usa il valore che corrisponde
   * alla dimensione reale del contenitore per evitare download sovrastimati.
   * Default: auto-calcolato da width prop.
   * Esempi: "33vw" per griglia 3col, "128px" per cover fissa, "100vw" per full-width
   */
  sizes?: string
}

export function OptimizedCover({
  src,
  alt,
  className = '',
  width = 300,
  height = 450,
  fill = false,
  priority = false,
  fallback,
  onError,
  sizes,
}: OptimizedCoverProps) {
  const [imgError, setImgError] = useState(false)

  const handleError = () => {
    setImgError(true)
    onError?.()
  }

  if (!src || imgError) {
    return fallback ? <>{fallback}</> : null
  }

  // PERF FIX: sizes auto-calcolato da width se non passato esplicitamente.
  // Evita il default "50vw" di next/image che scarica immagini 2x più grandi del necessario.
  const computedSizes = sizes ?? (width <= 80 ? `${width}px`
    : width <= 150 ? `(max-width: 640px) ${width}px, ${width}px`
    : `(max-width: 640px) ${Math.round(width * 0.8)}px, ${width}px`)

  // Usa next/image per i domini configurati
  if (isOptimizable(src)) {
    if (fill) {
      return (
        <Image
          src={src}
          alt={alt}
          fill
          className={`object-cover ${className}`}
          priority={priority}
          sizes={sizes ?? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw'}
          onError={handleError}
        />
      )
    }

    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={`object-cover ${className}`}
        priority={priority}
        sizes={computedSizes}
        onError={handleError}
      />
    )
  }

  // Fallback a <img> standard per domini non configurati (BGG, Steam header, ecc.)
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={priority ? 'eager' : 'lazy'}
      onError={handleError}
    />
  )
}