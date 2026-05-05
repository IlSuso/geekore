import { useEffect, useState, type ReactNode } from 'react'
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
  className?: string
}

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
  className = '',
}: MediaCoverProps) {
  const safeProgress = typeof progress === 'number'
    ? Math.max(0, Math.min(100, progress))
    : null

  const normalizedSrc = typeof src === 'string' && src.trim().length > 0 ? src.trim() : null
  const resolvedType = type || undefined
  const resolvedTypeLabel = typeLabel || (resolvedType ? TYPE_LABELS[resolvedType] || resolvedType : null)
  const typeColor = resolvedType ? TYPE_COLOR_VAR[resolvedType] : undefined

  const [imageFailed, setImageFailed] = useState(false)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)

  useEffect(() => {
    setImageFailed(false)
    setLoadedSrc(null)
  }, [normalizedSrc])

  const canTryImage = Boolean(normalizedSrc && !imageFailed)
  const imageReady = Boolean(normalizedSrc && loadedSrc === normalizedSrc && !imageFailed)

  return (
    <div className={`gk-cover ${className}`}>
      <div className={`absolute inset-0 flex h-full w-full items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-tertiary)] ${canTryImage && !imageReady ? 'animate-pulse' : ''}`}>
        {!canTryImage ? fallback : null}
      </div>

      {canTryImage && (
        <img
          src={normalizedSrc || undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 block h-full w-full object-cover transition-opacity duration-200 ${imageReady ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoadedSrc(normalizedSrc)}
          onError={() => {
            setImageFailed(true)
            setLoadedSrc(null)
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
