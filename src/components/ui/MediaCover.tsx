import type { ReactNode } from 'react'
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
  const resolvedType = type || undefined
  const resolvedTypeLabel = typeLabel || (resolvedType ? TYPE_LABELS[resolvedType] || resolvedType : null)

  return (
    <div className={`gk-cover ${className}`}>
      {src ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[var(--text-tertiary)]">
          {fallback}
        </div>
      )}

      {resolvedTypeLabel && (
        <span className={`gk-cover-tag ${resolvedType ? `text-[var(--type-${resolvedType === 'boardgame' ? 'board' : resolvedType})]` : ''}`}>
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
