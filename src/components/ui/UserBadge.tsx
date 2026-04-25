'use client'
import { Gem } from 'lucide-react'

const BADGE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  early_supporter: {
    icon: <Gem size={13} strokeWidth={2.2} />,
    label: 'Early Supporter',
    color: 'text-amber-400',
  },
}

export function UserBadge({
  badge,
  displayName,
  className = '',
}: {
  badge?: string | null
  displayName: string
  className?: string
}) {
  const config = badge ? BADGE_CONFIG[badge] : null
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {config && (
        <span className={`${config.color} flex-shrink-0`} title={config.label}>
          {config.icon}
        </span>
      )}
      {displayName}
    </span>
  )
}
