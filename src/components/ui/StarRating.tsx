// DESTINAZIONE: src/components/ui/StarRating.tsx

'use client'

import { useState, useRef, useId, useCallback } from 'react'

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

  // gap-0.5 = 2px in Tailwind
  const GAP = 2

  const ratingFromClientX = useCallback((clientX: number): number => {
    const el = containerRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width - 1))
    const starIdx = Math.min(4, Math.floor(x / (size + GAP)))
    const xInStar = x - starIdx * (size + GAP)
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
    if (hovered !== null) onChange?.(value === hovered ? 0 : hovered)
    setHovered(null)
  }, [viewOnly, hovered, onChange, value])

  return (
    <div
      ref={containerRef}
      className={`flex flex-row items-center gap-0.5 select-none ${viewOnly ? 'pointer-events-none' : 'touch-none'}`}
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
            className={`relative transition-transform duration-100 ${
              !viewOnly ? 'cursor-pointer hover:scale-110' : ''
            }`}
            style={{ width: size, height: size }}
          >
            {/* Stella base (grigia) */}
            <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0">
              <path d={STAR_PATH} fill="#27272a" />
            </svg>

            {/* Stella colorata (piena o metà) */}
            <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0 transition-all duration-150">
              <defs>
                <clipPath id={clipId}>
                  <rect x="0" y="0" width="12" height="24" />
                </clipPath>
                <filter id={`glow-${instanceId}-${star}`}>
                  <feGaussianBlur stdDeviation="1" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path
                d={STAR_PATH}
                fill={full || half ? '#fbbf24' : 'transparent'}
                clipPath={full ? undefined : half ? `url(#${clipId})` : undefined}
                filter={
                  !viewOnly && hovered !== null && hovered >= star - 0.5
                    ? `url(#glow-${instanceId}-${star})`
                    : undefined
                }
              />
            </svg>

            {/* Zone cliccabili — solo su desktop (pointer); touch gestito sul container */}
            {!viewOnly && (
              <>
                <div
                  className="absolute inset-y-0 left-0 z-10"
                  style={{ width: '50%' }}
                  onMouseEnter={() => setHovered(star - 0.5)}
                  onClick={() => onChange?.(value === star - 0.5 ? 0 : star - 0.5)}
                />
                <div
                  className="absolute inset-y-0 right-0 z-10"
                  style={{ width: '50%' }}
                  onMouseEnter={() => setHovered(star)}
                  onClick={() => onChange?.(value === star ? 0 : star)}
                />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
