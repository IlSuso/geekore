'use client'

import { useState, useRef, useId, useCallback, useEffect } from 'react'
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
  const [hovered,  setHovered]  = useState<number | null>(null)
  const [pending,  setPending]  = useState<number | null>(null)
  const gestureActive = useRef(false)
  const instanceId    = useId()
  const containerRef  = useRef<HTMLDivElement>(null)

  const displayed = hovered ?? pending ?? value

  useEffect(() => {
    if (pending !== null && value === pending) setPending(null)
  }, [value, pending])

  const GAP = 2

  const commitRating = useCallback((rating: number) => {
    if (viewOnly) return
    const normalized = Math.max(0, Math.min(5, rating))
    setPending(normalized)
    setHovered(null)
    if (normalized !== value) onChange?.(normalized)
  }, [viewOnly, value, onChange])

  const ratingFromClientX = useCallback((clientX: number): number => {
    const el = containerRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    const x = clientX - rect.left
    if (x <= 0) return 0
    const clampedX = Math.min(x, rect.width - 1)
    const starIdx  = Math.min(4, Math.floor(clampedX / (size + GAP)))
    const xInStar  = clampedX - starIdx * (size + GAP)
    return xInStar < size / 2 ? starIdx + 0.5 : starIdx + 1
  }, [size])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (viewOnly) return
    e.preventDefault()
    e.stopPropagation()
    gestureActive.current = true
    setHovered(ratingFromClientX(e.touches[0].clientX))
  }, [viewOnly, ratingFromClientX])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (viewOnly || !gestureActive.current) return
    e.preventDefault()
    e.stopPropagation()
    setHovered(ratingFromClientX(e.touches[0].clientX))
  }, [viewOnly, ratingFromClientX])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (viewOnly) return
    e.preventDefault()
    e.stopPropagation()
    gestureActive.current = false
    if (hovered !== null) commitRating(hovered)
    setHovered(null)
  }, [viewOnly, hovered, commitRating])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (viewOnly) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      commitRating((displayed || 0) - 0.5)
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
      className={`inline-flex items-center gap-1.5 select-none ${viewOnly ? '' : 'group'}`}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => !viewOnly && e.stopPropagation()}
    >
      {!viewOnly && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={(event) => { event.stopPropagation(); commitRating(0); setHovered(null); setPending(null) }}
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

      <div
        ref={containerRef}
        data-no-swipe="true"
        data-interactive="true"
        role={viewOnly ? 'img' : 'slider'}
        aria-label={viewOnly ? `Voto ${displayed} su 5` : 'Seleziona voto'}
        aria-valuemin={viewOnly ? undefined : 0}
        aria-valuemax={viewOnly ? undefined : 5}
        aria-valuenow={viewOnly ? undefined : displayed}
        tabIndex={viewOnly ? -1 : 0}
        className={`flex flex-row items-center gap-0.5 outline-none ${viewOnly ? 'pointer-events-none' : 'touch-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 rounded-lg'}`}
        onMouseLeave={() => !viewOnly && setHovered(null)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onKeyDown={handleKeyDown}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const full   = displayed >= star
          const half   = !full && displayed >= star - 0.5
          const clipId = `star-half-${instanceId}-${star}`

          return (
            <div
              key={star}
              className={`relative ${!viewOnly ? 'cursor-pointer hover:scale-110' : ''} transition-transform duration-100`}
              style={{ width: size, height: size }}
            >
              <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0" aria-hidden="true">
                <path d={STAR_PATH} fill="#27272a" />
              </svg>

              <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0 transition-colors duration-100" aria-hidden="true">
                <defs>
                  <clipPath id={clipId}>
                    <rect x="0" y="0" width="12" height="24" />
                  </clipPath>
                </defs>
                <path
                  d={STAR_PATH}
                  fill={full || half ? 'var(--accent, #E6FF3D)' : 'transparent'}
                  clipPath={full ? undefined : half ? `url(#${clipId})` : undefined}
                />
              </svg>

              {!viewOnly && (
                <>
                  <button
                    type="button"
                    data-no-swipe="true"
                    aria-label={`${star - 0.5} stelle`}
                    className="absolute inset-y-0 left-0 z-10 cursor-pointer"
                    style={{ width: '50%' }}
                    onMouseEnter={() => setHovered(star - 0.5)}
                    onClick={(event) => { event.stopPropagation(); commitRating(star - 0.5) }}
                  />
                  <button
                    type="button"
                    data-no-swipe="true"
                    aria-label={`${star} stelle`}
                    className="absolute inset-y-0 right-0 z-10 cursor-pointer"
                    style={{ width: '50%' }}
                    onMouseEnter={() => setHovered(star)}
                    onClick={(event) => { event.stopPropagation(); commitRating(star) }}
                  />
                </>
              )}
            </div>
          )
        })}
      </div>

      {displayed > 0 && (
        <span className="text-[12px] font-bold text-[var(--accent)] tabular-nums leading-none ml-0.5">
          {displayed % 1 === 0 ? displayed.toFixed(1) : displayed}
        </span>
      )}
    </div>
  )
}
