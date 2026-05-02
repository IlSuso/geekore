import type { ReactNode } from 'react'

interface FilterChipProps {
  children: ReactNode
  active?: boolean
  icon?: ReactNode
  className?: string
  onClick?: () => void
  /**
   * pill (default): active = text-accent + border-accent30% + bg-accent8%
   * solid: active = bg-accent + text #0B0B0F (per toggle segmentati tipo Library)
   * type: usa il colore del media type passato via typeColor
   */
  variant?: 'pill' | 'solid' | 'type'
  typeColor?: string
}

export function FilterChip({
  children,
  active = false,
  icon,
  className = '',
  onClick,
  variant = 'pill',
  typeColor,
}: FilterChipProps) {

  let activeStyle: React.CSSProperties
  let inactiveStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    borderColor: 'var(--border)',
    color: 'var(--text-secondary)',
  }

  if (variant === 'solid') {
    activeStyle = {
      background: 'var(--accent)',
      borderColor: 'var(--accent)',
      color: '#0B0B0F',
    }
  } else if (variant === 'type' && typeColor) {
    activeStyle = {
      background: `color-mix(in srgb, ${typeColor} 8%, transparent)`,
      borderColor: `color-mix(in srgb, ${typeColor} 30%, transparent)`,
      color: typeColor,
    }
    inactiveStyle = {
      background: `color-mix(in srgb, ${typeColor} 8%, transparent)`,
      borderColor: `color-mix(in srgb, ${typeColor} 30%, transparent)`,
      color: typeColor,
    }
  } else {
    activeStyle = {
      background: 'rgba(230,255,61,0.08)',
      borderColor: 'rgba(230,255,61,0.3)',
      color: 'var(--accent)',
    }
  }

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-no-swipe="true"
      onClick={(event) => { event.stopPropagation(); onClick?.() }}
      onPointerDown={event => event.stopPropagation()}
      className={`gk-pill inline-flex flex-shrink-0 transition-all focus-visible:outline-none ${className}`}
      style={active ? activeStyle : inactiveStyle}
    >
      {icon && <span className="flex items-center [&_svg]:h-[1em] [&_svg]:w-[1em]">{icon}</span>}
      {children}
    </button>
  )
}
