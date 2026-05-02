import type { HTMLAttributes, ReactNode } from 'react'

type PillVariant = 'default' | 'active' | 'match' | 'award'
type PillType = 'anime' | 'manga' | 'game' | 'board' | 'boardgame' | 'movie' | 'tv'

interface PillProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: PillVariant
  mediaType?: PillType | string | null
  active?: boolean
  children: ReactNode
}

export function Pill({
  variant = 'default',
  mediaType,
  active = false,
  className = '',
  children,
  ...props
}: PillProps) {
  const mediaClass = mediaType ? `gk-chip-${mediaType}` : ''
  const variantClass = variant !== 'default' ? `gk-chip-${variant}` : ''

  return (
    <span
      className={`gk-chip ${mediaClass} ${variantClass} ${className}`}
      data-active={active || variant === 'active' ? 'true' : undefined}
      {...props}
    >
      {children}
    </span>
  )
}
