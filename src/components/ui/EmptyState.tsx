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
  const muted = accent === 'zinc'

  return (
    <div className={`gk-empty-actionable flex flex-col items-center justify-center px-8 py-16 text-center ${className}`} data-no-swipe="true">
      <div className={`mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border ${muted ? 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)]' : 'border-[rgba(230,255,61,0.26)] bg-[rgba(230,255,61,0.07)] text-[var(--accent)] shadow-[0_0_30px_rgba(230,255,61,0.08)]'}`}>
        <Icon size={28} strokeWidth={1.5} />
      </div>

      <p className="gk-title mb-2 text-[var(--text-primary)]">
        {title}
      </p>
      {description && (
        <p className="gk-body max-w-[320px]">
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
              className="gk-primary-cta inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-[13px] font-black transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              data-no-swipe="true"
              onClick={(event) => { event.stopPropagation(); action.onClick?.() }}
              onPointerDown={event => event.stopPropagation()}
              className="inline-flex items-center gap-2 rounded-2xl border border-[rgba(230,255,61,0.22)] bg-[rgba(230,255,61,0.07)] px-5 py-2.5 text-[13px] font-black text-[var(--accent)] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
