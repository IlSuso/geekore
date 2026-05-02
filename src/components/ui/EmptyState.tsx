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
  accent?: 'signature' | 'violet' | 'zinc'
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  accent = 'signature',
  className = '',
}: EmptyStateProps) {
  const accentMap = {
    signature: { icon: 'text-[var(--accent)]', ring: 'border-[rgba(230,255,61,0.2)]', bg: 'bg-[rgba(230,255,61,0.06)]' },
    violet:    { icon: 'text-[var(--accent)]', ring: 'border-[rgba(230,255,61,0.2)]', bg: 'bg-[rgba(230,255,61,0.06)]' },
    zinc:      { icon: 'text-zinc-500',  ring: 'border-[var(--border)]', bg: 'bg-[var(--bg-card)]' },
  }
  const colors = accentMap[accent]

  return (
    <div className={`flex flex-col items-center justify-center px-8 py-20 text-center ${className}`} data-no-swipe="true">
      <div className={`mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border ${colors.bg} ${colors.ring}`}>
        <Icon size={28} className={colors.icon} strokeWidth={1.5} />
      </div>

      <p className="gk-headline mb-1.5 text-[var(--text-primary)]">
        {title}
      </p>
      {description && (
        <p className="gk-body max-w-[280px]">
          {description}
        </p>
      )}

      {action && (
        <div className="mt-6" data-no-swipe="true">
          {action.href ? (
            <Link
              href={action.href}
              data-no-swipe="true"
              onClick={event => event.stopPropagation()}
              onPointerDown={event => event.stopPropagation()}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
              style={{ background: 'var(--accent)', color: '#0B0B0F' }}
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              data-no-swipe="true"
              onClick={(event) => { event.stopPropagation(); action.onClick?.() }}
              onPointerDown={event => event.stopPropagation()}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-2.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
