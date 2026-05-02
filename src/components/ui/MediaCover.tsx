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
  const resolvedType = type || undefined
  const resolvedTypeLabel = typeLabel || (resolvedType ? TYPE_LABELS[resolvedType] || resolvedType : null)
  const typeColor = resolvedType ? TYPE_COLOR_VAR[resolvedType] : undefined

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
