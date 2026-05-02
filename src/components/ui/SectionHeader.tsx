import type { ReactNode } from 'react'
import Link from 'next/link'

interface SectionHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  icon?: ReactNode
  className?: string
}

export function SectionHeader({ eyebrow, title, description, action, icon, className = '' }: SectionHeaderProps) {
  const actionClass = 'inline-flex min-h-9 items-center rounded-2xl border border-[rgba(230,255,61,0.22)] bg-[rgba(230,255,61,0.07)] px-3 py-1 text-[12px] font-black text-[var(--accent)] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35'

  return (
    <div className={`gk-surface flex items-end justify-between gap-4 overflow-hidden p-4 md:p-5 ${className}`} data-no-swipe="true">
      <div className="min-w-0">
        {eyebrow && (
          <div className="gk-label mb-2 text-[var(--accent)]">
            {eyebrow}
          </div>
        )}
        <div className="flex items-center gap-3">
          {icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[rgba(230,255,61,0.18)] bg-[rgba(230,255,61,0.07)] text-[var(--accent)] shadow-[0_0_24px_rgba(230,255,61,0.08)]">
              {icon}
            </div>
          )}
          <h2 className="gk-title truncate text-[var(--text-primary)]">{title}</h2>
        </div>
        {description && (
          <p className="gk-body mt-2 max-w-xl">
            {description}
          </p>
        )}
      </div>

      {action && (
        action.href ? (
          <Link
            href={action.href}
            data-no-swipe="true"
            className={actionClass}
            onClick={event => event.stopPropagation()}
            onPointerDown={event => event.stopPropagation()}
          >
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            data-no-swipe="true"
            onClick={(event) => { event.stopPropagation(); action.onClick?.() }}
            onPointerDown={event => event.stopPropagation()}
            className={actionClass}
          >
            {action.label}
          </button>
        )
      )}
    </div>
  )
}
