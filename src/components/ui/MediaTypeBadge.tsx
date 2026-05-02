import type { ReactNode } from 'react'
import { getMediaTypeAccentStyle, getMediaTypeLabel } from '@/lib/mediaTypes'

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

export function MediaTypeBadge({
  type,
  label,
  icon,
  variant = 'soft',
  size = 'sm',
  className = '',
}: MediaTypeBadgeProps) {
  const content = label || getMediaTypeLabel(type)

  const variantClasses: Record<MediaTypeBadgeVariant, string> = {
    soft: 'border border-[color:color-mix(in_srgb,var(--media-color)_34%,transparent)] bg-[color:color-mix(in_srgb,var(--media-color)_12%,transparent)] text-[var(--media-color)]',
    solid: 'border border-transparent bg-[var(--media-color)] text-[#0B0B0F]',
    line: 'border border-[color:color-mix(in_srgb,var(--media-color)_45%,transparent)] bg-transparent text-[var(--media-color)]',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold uppercase tracking-[0.08em] leading-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      style={getMediaTypeAccentStyle(type)}
    >
      {icon && <span className="flex items-center [&_svg]:h-[1em] [&_svg]:w-[1em]">{icon}</span>}
      {content}
    </span>
  )
}
