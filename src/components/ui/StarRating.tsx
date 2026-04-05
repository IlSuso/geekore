'use client'

import { useState, useId } from 'react'

const STAR_PATH = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'

interface StarRatingProps {
  value?: number
  onChange?: (rating: number) => void
  size?: number
  viewOnly?: boolean
}

export function StarRating({ value = 0, onChange, size = 22, viewOnly = false }: StarRatingProps) {
  const uid = useId()
  const [hovered, setHovered] = useState<number | null>(null)
  const displayed = hovered ?? value

  return (
    <div
      className={`flex flex-row items-center gap-0.5 ${viewOnly ? 'pointer-events-none' : ''}`}
      role={viewOnly ? 'img' : 'group'}
      aria-label={viewOnly ? `Voto: ${value} su 5` : 'Seleziona un voto da 1 a 5'}
      onMouseLeave={() => !viewOnly && setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const full = displayed >= star
        const half = !full && displayed >= star - 0.5
        const clipId = `${uid}-clip-${star}`
        const glowId = `${uid}-glow-${star}`

        return (
          <div
            key={star}
            className={`relative transition-transform duration-100 ${
              !viewOnly ? 'cursor-pointer select-none hover:scale-110' : ''
            }`}
            style={{ width: size, height: size }}
          >
            {/* Base (grey) */}
            <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0" aria-hidden="true">
              <path d={STAR_PATH} fill="#27272a" />
            </svg>

            {/* Filled overlay */}
            <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0 transition-all duration-150" aria-hidden="true">
              <defs>
                <clipPath id={clipId}>
                  <rect x="0" y="0" width="12" height="24" />
                </clipPath>
                <filter id={glowId}>
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
                filter={!viewOnly && hovered !== null && hovered >= star - 0.5 ? `url(#${glowId})` : undefined}
              />
            </svg>

            {/* Click zones */}
            {!viewOnly && (
              <>
                <div
                  className="absolute inset-y-0 left-0 z-10"
                  style={{ width: '50%' }}
                  role="button"
                  aria-label={`${star - 0.5} stelle`}
                  onMouseEnter={() => setHovered(star - 0.5)}
                  onClick={() => onChange?.(value === star - 0.5 ? 0 : star - 0.5)}
                />
                <div
                  className="absolute inset-y-0 right-0 z-10"
                  style={{ width: '50%' }}
                  role="button"
                  aria-label={`${star} stelle`}
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
