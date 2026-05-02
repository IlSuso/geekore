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
  const actionClass = 'rounded-lg px-1 py-0.5 text-[12px] font-bold transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35'
  const actionStyle = { color: 'var(--accent)' }

  return (
    <div className={`flex items-end justify-between gap-4 ${className}`} data-no-swipe="true">
      <div className="min-w-0">
        {eyebrow && (
          <div className="gk-label mb-1.5" style={{ color: 'var(--accent)' }}>
            {eyebrow}
          </div>
        )}
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-card-hover)] text-[var(--text-secondary)]">
              {icon}
            </div>
          )}
          <h2 className="gk-title truncate text-[var(--text-primary)]">{title}</h2>
        </div>
        {description && (
          <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[var(--text-secondary)]">
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
            style={actionStyle}
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
            style={actionStyle}
          >
            {action.label}
          </button>
        )
      )}
    </div>
  )
}
