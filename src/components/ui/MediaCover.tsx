import { useEffect, useMemo, useState, type ReactNode } from 'react'
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

  const [candidateIndex, setCandidateIndex] = useState(0)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)

  useEffect(() => {
    setCandidateIndex(0)
    setLoadedSrc(null)
  }, [imageCandidates.join('|')])

  const activeSrc = imageCandidates[candidateIndex] || null
  const canTryImage = Boolean(activeSrc)
  const imageReady = Boolean(activeSrc && loadedSrc === activeSrc)

  return (
    <div className={`gk-cover ${className}`}>
      <div className={`absolute inset-0 flex h-full w-full items-center justify-center bg-[var(--bg-secondary)] text-[var(--text-tertiary)] ${canTryImage && !imageReady ? 'animate-pulse' : ''}`}>
        {!canTryImage ? fallback : null}
      </div>

      {canTryImage && (
        <img
          src={activeSrc || undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 block h-full w-full object-cover transition-opacity duration-200 ${imageReady ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoadedSrc(activeSrc)}
          onError={() => {
            setLoadedSrc(null)
            setCandidateIndex(index => index + 1)
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
