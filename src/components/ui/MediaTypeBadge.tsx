import type { CSSProperties, ReactNode } from 'react'
import { getMediaTypeColor, getMediaTypeLabel } from '@/lib/mediaTypes'

type MediaTypeBadgeVariant = 'soft' | 'solid' | 'tag'
type MediaTypeBadgeSize = 'xs' | 'sm'

interface MediaTypeBadgeProps {
  type?: string | null
  label?: string
  icon?: ReactNode
  variant?: MediaTypeBadgeVariant
  size?: MediaTypeBadgeSize
  className?: string
}

function getVariantStyle(type: string | null | undefined, variant: MediaTypeBadgeVariant): CSSProperties {
  const color = getMediaTypeColor(type)

  if (variant === 'solid') {
    return {
      backgroundColor: color,
      borderColor: color,
      color: '#0B0B0F',
    }
  }

  if (variant === 'tag') {
    // Per i type-tag sulle cover: bg rgba(11,11,15,0.85) blur + text type-color
    return {
      backgroundColor: 'rgba(11,11,15,0.85)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      borderColor: 'transparent',
      color,
    }
  }

  // soft (default): bg 8%, border 30%, text = type-color
  return {
    backgroundColor: `color-mix(in srgb, ${color} 8%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
    color,
  }
}

export function MediaTypeBadge({
  type,
  label,
  icon,
  variant = 'soft',
  size = 'sm',
  className = '',
}: MediaTypeBadgeProps) {
  const content = label || getMediaTypeLabel(type)
  // h-6 = 24px, r99, p0-10, font 11/700
  const sizeStyle: CSSProperties = size === 'xs'
    ? { height: 18, padding: '0 6px', fontSize: 9, gap: 4 }
    : { height: 24, padding: '0 10px', fontSize: 11, gap: 6 }

  return (
    <span
      className={`inline-flex items-center border font-bold uppercase tracking-[0.05em] leading-none flex-shrink-0 ${className}`}
      style={{
        borderRadius: 99,
        fontFamily: 'var(--font-mono-data)',
        ...sizeStyle,
        ...getVariantStyle(type, variant),
      }}
    >
      {icon && <span className="flex items-center [&_svg]:h-[1em] [&_svg]:w-[1em]">{icon}</span>}
      {content}
    </span>
  )
}
