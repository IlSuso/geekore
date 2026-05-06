'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Star } from 'lucide-react'
import { useLocale } from '@/lib/locale'

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
  const { locale } = useLocale()
  const copy = locale === 'en'
    ? { rating: (value: number) => `Rating ${value} out of 5`, select: 'Select rating', value: (value: number) => `${value} out of 5`, none: 'No rating' }
    : { rating: (value: number) => `Voto ${value} su 5`, select: 'Seleziona voto', value: (value: number) => `${value} su 5`, none: 'Nessun voto' }
  const [hovered, setHovered] = useState<number | null>(null)
  const [pending, setPending] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const liveValueRef = useRef<number>(value)

  useEffect(() => {
    liveValueRef.current = value
    if (pending !== null && value === pending) setPending(null)
  }, [value, pending])

  const displayed = hovered ?? pending ?? value

  const commitRating = useCallback((rating: number) => {
    if (viewOnly) return

    // 0 means "no rating". Every real rating is snapped to half-stars.
    const normalized = rating <= 0 ? 0 : Math.max(0.5, Math.min(5, Math.round(rating * 2) / 2))
    setPending(normalized)
    setHovered(null)

    if (normalized !== liveValueRef.current) {
      liveValueRef.current = normalized
      onChange?.(normalized)
    }
  }, [viewOnly, onChange])

  const ratingFromClientX = useCallback((clientX: number): number => {
    const el = containerRef.current
    if (!el) return 0

    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left

    if (x <= 0) return 0
    if (x >= rect.width) return 5

    const cellWidth = rect.width / 5
    const starIndex = Math.min(4, Math.max(0, Math.floor(x / cellWidth)))
    const xInCell = x - starIndex * cellWidth

    // Only the very beginning of the first star clears the rating.
    // After that, the minimum real vote is 0.5.
    if (starIndex === 0 && xInCell < cellWidth * 0.28) return 0

    return xInCell < cellWidth / 2 ? starIndex + 0.5 : starIndex + 1
  }, [])

  const updateHoverFromPointer = useCallback((clientX: number) => {
    if (viewOnly) return
    setHovered(ratingFromClientX(clientX))
  }, [viewOnly, ratingFromClientX])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (viewOnly) return

    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      commitRating((displayed || 0.5) - 0.5)
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      commitRating((displayed || 0) + 0.5)
    }

    if (e.key === 'Home') {
      e.preventDefault()
      commitRating(0)
    }

    if (e.key === 'End') {
      e.preventDefault()
      commitRating(5)
    }
  }, [viewOnly, displayed, commitRating])

  return (
    <div
      data-no-swipe="true"
      data-interactive="true"
      className="inline-flex items-center gap-2 select-none"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (!viewOnly) e.stopPropagation()
      }}
    >
      {!viewOnly && (
        <span
          className={`min-w-[28px] text-right text-[12px] font-black leading-none tabular-nums ${
            displayed > 0 ? 'text-amber-300' : 'text-zinc-500'
          }`}
          aria-hidden="true"
        >
          {displayed > 0 ? Number(displayed).toFixed(1) : '—'}
        </span>
      )}

      {viewOnly && displayed > 0 && (
        <span className="min-w-[28px] text-right text-[12px] font-black leading-none text-amber-300 tabular-nums">
          {Number(displayed).toFixed(1)}
        </span>
      )}

      <div
        ref={containerRef}
        data-no-swipe="true"
        data-interactive="true"
        role={viewOnly ? 'img' : 'slider'}
        aria-label={viewOnly ? copy.rating(displayed) : copy.select}
        aria-valuemin={viewOnly ? undefined : 0}
        aria-valuemax={viewOnly ? undefined : 5}
        aria-valuenow={viewOnly ? undefined : displayed}
        aria-valuetext={viewOnly ? undefined : displayed > 0 ? copy.value(displayed) : copy.none}
        tabIndex={viewOnly ? -1 : 0}
        className={`flex items-center gap-1 outline-none ${
          viewOnly
            ? 'pointer-events-none'
            : 'cursor-pointer touch-none rounded-xl focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35'
        }`}
        onMouseMove={(event) => updateHoverFromPointer(event.clientX)}
        onMouseLeave={() => !viewOnly && setHovered(null)}
        onClick={(event) => {
          if (viewOnly) return
          event.stopPropagation()
          commitRating(ratingFromClientX(event.clientX))
        }}
        onTouchStart={(event) => {
          if (viewOnly) return
          event.preventDefault()
          event.stopPropagation()
          updateHoverFromPointer(event.touches[0].clientX)
        }}
        onTouchMove={(event) => {
          if (viewOnly) return
          event.preventDefault()
          event.stopPropagation()
          updateHoverFromPointer(event.touches[0].clientX)
        }}
        onTouchEnd={(event) => {
          if (viewOnly) return
          event.preventDefault()
          event.stopPropagation()
          commitRating(hovered ?? value)
        }}
        onKeyDown={handleKeyDown}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const full = displayed >= star
          const half = !full && displayed >= star - 0.5

          return (
            <span
              key={star}
              className="relative flex items-center justify-center"
              style={{ width: size, height: size }}
              aria-hidden="true"
            >
              <Star
                size={size}
                className="absolute inset-0 text-white/45"
                fill="none"
                strokeWidth={1.55}
              />

              {(full || half) && (
                <Star
                  size={size}
                  className="absolute inset-0 text-amber-400"
                  fill="currentColor"
                  strokeWidth={0}
                  style={{
                    clipPath: half ? 'inset(0 50% 0 0)' : undefined,
                    filter: 'drop-shadow(0 0 7px rgba(251,191,36,.65))',
                  }}
                />
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
