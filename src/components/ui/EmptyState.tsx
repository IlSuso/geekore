import React from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  /** CTA button/link */
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  accent?: 'violet' | 'zinc'
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  accent = 'violet',
  className = '',
}: EmptyStateProps) {
  const accentMap = {
    violet: { icon: 'text-[#E6FF3D]', ring: 'border-[rgba(230,255,61,0.2)]', bg: 'bg-[rgba(230,255,61,0.06)]' },
    zinc:   { icon: 'text-zinc-500',  ring: 'border-[var(--border)]', bg: 'bg-[var(--bg-card)]' },
  }
  const colors = accentMap[accent]

  return (
    <div className={`flex flex-col items-center justify-center py-20 text-center px-8 ${className}`}>
      {/* Icon container */}
      <div className={`w-16 h-16 rounded-2xl ${colors.bg} border ${colors.ring} flex items-center justify-center mb-5`}>
        <Icon size={28} className={colors.icon} strokeWidth={1.5} />
      </div>

      {/* Text */}
      <p className="text-[17px] font-bold text-[var(--text-primary)] tracking-tight mb-1.5">
        {title}
      </p>
      {description && (
        <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed max-w-[280px]">
          {description}
        </p>
      )}

      {/* CTA */}
      {action && (
        <div className="mt-6">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
              style={{ background: '#E6FF3D', color: '#0B0B0F' }}
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] border border-[var(--border)] transition-colors"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}