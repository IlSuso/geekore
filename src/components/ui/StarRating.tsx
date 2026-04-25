'use client'

import { useState, useRef, useId, useCallback } from 'react'
import { X } from 'lucide-react'

const STAR_PATH = "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"

interface StarRatingProps {
  value?: number
  onChange?: (rating: number) => void
  size?: number
  viewOnly?: boolean
}

export function StarRating({
  value = 0,
  onChange,
  size = 22,
  viewOnly = false,
}: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const displayed = hovered ?? value
  const instanceId = useId()
  const containerRef = useRef<HTMLDivElement>(null)

  const GAP = 2

  const ratingFromClientX = useCallback((clientX: number): number => {
    const el = containerRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    if (x <= 0) return 0
    const clampedX = Math.min(x, rect.width - 1)
    const starIdx = Math.min(4, Math.floor(clampedX / (size + GAP)))
    const xInStar = clampedX - starIdx * (size + GAP)
    return xInStar < size / 2 ? starIdx + 0.5 : starIdx + 1
  }, [size])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (viewOnly) return
    e.preventDefault()
    setHovered(ratingFromClientX(e.touches[0].clientX))
  }, [viewOnly, ratingFromClientX])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (viewOnly) return
    e.preventDefault()
    setHovered(ratingFromClientX(e.touches[0].clientX))
  }, [viewOnly, ratingFromClientX])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (viewOnly) return
    e.preventDefault()
    if (hovered !== null) onChange?.(hovered)
    setHovered(null)
  }, [viewOnly, hovered, onChange])

  return (
    <div className={`inline-flex items-center gap-1 select-none ${viewOnly ? '' : 'group'}`}>
      {/* Clear button — outside containerRef to not affect star coordinate math */}
      {!viewOnly && (
        <button
          onClick={() => { onChange?.(0); setHovered(null) }}
          onMouseEnter={() => setHovered(0)}
          onMouseLeave={() => setHovered(null)}
          aria-label="Rimuovi voto"
          className={`flex items-center justify-center rounded transition-colors ${
            value > 0
              ? 'text-zinc-500 hover:text-red-400 cursor-pointer'
              : 'text-zinc-800 cursor-default pointer-events-none'
          }`}
          style={{ width: Math.round(size * 0.7), height: size }}
        >
          <X size={Math.round(size * 0.55)} strokeWidth={2.5} />
        </button>
      )}

      {/* Stars */}
      <div
        ref={containerRef}
        className={`flex flex-row items-center gap-0.5 ${viewOnly ? 'pointer-events-none' : 'touch-none'}`}
        onMouseLeave={() => !viewOnly && setHovered(null)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const full = displayed >= star
          const half = !full && displayed >= star - 0.5
          const clipId = `star-half-${instanceId}-${star}`

          return (
            <div
              key={star}
              className={`relative ${!viewOnly ? 'cursor-pointer hover:scale-110' : ''} transition-transform duration-100`}
              style={{ width: size, height: size }}
            >
              {/* Base star (gray) */}
              <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0">
                <path d={STAR_PATH} fill="#27272a" />
              </svg>

              {/* Colored star (full or half) */}
              <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0 transition-colors duration-100">
                <defs>
                  <clipPath id={clipId}>
                    <rect x="0" y="0" width="12" height="24" />
                  </clipPath>
                </defs>
                <path
                  d={STAR_PATH}
                  fill={full || half ? '#fbbf24' : 'transparent'}
                  clipPath={full ? undefined : half ? `url(#${clipId})` : undefined}
                />
              </svg>

              {/* Clickable zones — mouse only; touch handled on container */}
              {!viewOnly && (
                <>
                  <div
                    className="absolute inset-y-0 left-0 z-10"
                    style={{ width: '50%' }}
                    onMouseEnter={() => setHovered(star - 0.5)}
                    onClick={() => onChange?.(star - 0.5)}
                  />
                  <div
                    className="absolute inset-y-0 right-0 z-10"
                    style={{ width: '50%' }}
                    onMouseEnter={() => setHovered(star)}
                    onClick={() => onChange?.(star)}
                  />
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
