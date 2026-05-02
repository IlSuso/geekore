import type { CSSProperties, ReactNode } from 'react'
import { getMediaTypeColor, getMediaTypeLabel } from '@/lib/mediaTypes'

type MediaTypeBadgeVariant = 'soft' | 'solid' | 'line'
type MediaTypeBadgeSize = 'xs' | 'sm'

interface MediaTypeBadgeProps {
  type?: string | null
  label?: string
  icon?: ReactNode
  variant?: MediaTypeBadgeVariant
  size?: MediaTypeBadgeSize
  className?: string
}

const sizeClasses: Record<MediaTypeBadgeSize, string> = {
  xs: 'px-2 py-0.5 text-[10px] gap-1',
  sm: 'px-2.5 py-1 text-[11px] gap-1.5',
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

  if (variant === 'line') {
    return {
      borderColor: color,
      color,
    }
  }

  return {
    backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 34%, transparent)`,
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

  return (
    <span
      className={`inline-flex items-center rounded-full border font-bold uppercase tracking-[0.08em] leading-none ${sizeClasses[size]} ${className}`}
      style={getVariantStyle(type, variant)}
    >
      {icon && <span className="flex items-center [&_svg]:h-[1em] [&_svg]:w-[1em]">{icon}</span>}
      {content}
    </span>
  )
}
