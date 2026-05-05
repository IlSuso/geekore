import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'

interface MediaCoverProps {
  src?: string | null
  alt: string
  type?: string | null
  typeLabel?: string
  score?: number | string | null
  match?: number | string | null
  progress?: number | null
  completed?: boolean
  fallback?: ReactNode
  fallbackSrcs?: string[]
  className?: string
  loading?: 'lazy' | 'eager'
}


// Cache client-side degli URL già caricati: evita che, tornando su una tab keep-alive
// o rimontando le card Discover, le cover già presenti tornino grigie aspettando
// un nuovo evento onLoad. Il modulo resta vivo nella sessione browser.
const LOADED_COVER_SRCS = new Set<string>()
const FAILED_COVER_SRCS = new Set<string>()

const TYPE_LABELS: Record<string, string> = {
  anime: 'Anime',
  manga: 'Manga',
  game: 'Game',
  board: 'Board',
  boardgame: 'Board',
  movie: 'Movie',
  tv: 'TV',
}

const TYPE_COLOR_VAR: Record<string, string> = {
  anime: 'var(--type-anime)',
  manga: 'var(--type-manga)',
  game: 'var(--type-game)',
  board: 'var(--type-board)',
  boardgame: 'var(--type-board)',
  movie: 'var(--type-movie)',
  tv: 'var(--type-tv)',
}

function normalizeImageUrl(src: string | null): string | null {
  if (!src) return null
  const trimmed = src.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('//')) return `https:${trimmed}`
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`
  return trimmed
}

function imageProxyUrl(src: string): string | null {
  if (!src.startsWith('https://')) return null
  if (src.includes('/api/image-proxy?')) return null
  return `/api/image-proxy?url=${encodeURIComponent(src)}`
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const normalized = normalizeImageUrl(value || null)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

export function MediaCover({
  src,
  alt,
  type,
  typeLabel,
  score,
  match,
  progress,
  completed,
  fallback,
  fallbackSrcs = [],
  className = '',
  loading = 'lazy',
}: MediaCoverProps) {
  const safeProgress = typeof progress === 'number'
    ? Math.max(0, Math.min(100, progress))
    : null

  const normalizedSrc = normalizeImageUrl(typeof src === 'string' ? src : null)
  const resolvedType = type || undefined
  const resolvedTypeLabel = typeLabel || (resolvedType ? TYPE_LABELS[resolvedType] || resolvedType : null)
  const typeColor = resolvedType ? TYPE_COLOR_VAR[resolvedType] : undefined

  const imageCandidates = useMemo(() => {
    const direct = uniqueStrings([normalizedSrc, ...fallbackSrcs])
    const proxied = direct.map(imageProxyUrl).filter((value): value is string => Boolean(value))
    return uniqueStrings([...direct, ...proxied])
  }, [normalizedSrc, fallbackSrcs.join('|')])

  const imgRef = useRef<HTMLImageElement | null>(null)
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)

  const candidateSignature = imageCandidates.join('|')

  useEffect(() => {
    const firstUsable = imageCandidates.find(src => !FAILED_COVER_SRCS.has(src)) || imageCandidates[0] || null
    const nextIndex = firstUsable ? Math.max(0, imageCandidates.indexOf(firstUsable)) : 0
    setCandidateIndex(nextIndex)
    setLoadedSrc(firstUsable && LOADED_COVER_SRCS.has(firstUsable) ? firstUsable : null)
  }, [candidateSignature])

  const activeSrc = imageCandidates[candidateIndex] || null
  const canTryImage = Boolean(activeSrc)
  const imageReady = Boolean(activeSrc && (loadedSrc === activeSrc || LOADED_COVER_SRCS.has(activeSrc)))

  useEffect(() => {
    if (!activeSrc) return
    if (LOADED_COVER_SRCS.has(activeSrc)) {
      setLoadedSrc(activeSrc)
      return
    }

    // In Chromium può capitare che, tornando in una tab keep-alive, l'immagine
    // sia già completa nella cache browser ma React non riceva un nuovo onLoad.
    // Senza questo controllo la card resta con placeholder grigio.
    const img = imgRef.current
    if (img?.complete && img.naturalWidth > 0) {
      LOADED_COVER_SRCS.add(activeSrc)
      setLoadedSrc(activeSrc)
    }
  }, [activeSrc])

  return (
    <div className={`gk-cover ${className}`}>
      <div className={`absolute inset-0 flex h-full w-full items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-tertiary)] ${canTryImage && !imageReady ? 'animate-pulse' : ''}`}>
        {!canTryImage ? fallback : null}
      </div>

      {canTryImage && (
        <img
          ref={imgRef}
          src={activeSrc || undefined}
          alt={alt}
          loading={loading}
          decoding="async"
          className={`absolute inset-0 block h-full w-full object-cover transition-opacity duration-200 ${imageReady ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => {
            if (!activeSrc) return
            LOADED_COVER_SRCS.add(activeSrc)
            FAILED_COVER_SRCS.delete(activeSrc)
            setLoadedSrc(activeSrc)
          }}
          onError={() => {
            if (activeSrc) FAILED_COVER_SRCS.add(activeSrc)
            setLoadedSrc(null)
            setCandidateIndex(index => {
              const next = imageCandidates.findIndex((candidate, candidateIdx) => candidateIdx > index && !FAILED_COVER_SRCS.has(candidate))
              return next >= 0 ? next : index + 1
            })
          }}
        />
      )}

      {resolvedTypeLabel && (
        <span className="gk-cover-tag" style={typeColor ? { color: typeColor } : undefined}>
          <span className="sr-only">Tipo media: </span>{resolvedTypeLabel}
        </span>
      )}

      {match != null && <span className="gk-cover-match">★ {match}%</span>}
      {score != null && <span className="gk-cover-score">{score}</span>}

      {completed && (
        <span className="gk-cover-check" aria-label="Completato">
          <Check size={9} strokeWidth={3} />
        </span>
      )}

      {safeProgress != null && (
        <span className="gk-cover-progress" aria-hidden>
          <i style={{ width: `${safeProgress}%` }} />
        </span>
      )}
    </div>
  )
}
