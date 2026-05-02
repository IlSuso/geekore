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
  const actionClass = 'text-[12px] font-bold transition-colors hover:opacity-80'
  const actionStyle = { color: 'var(--accent)' }

  return (
    <div className={`flex items-end justify-between gap-4 ${className}`}>
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
          <h2 className="gk-title text-[var(--text-primary)] truncate">{title}</h2>
        </div>
        {description && (
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-secondary)] max-w-xl">
            {description}
          </p>
        )}
      </div>

      {action && (
        action.href ? (
          <Link href={action.href} className={actionClass} style={actionStyle}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={actionClass} style={actionStyle}>
            {action.label}
          </button>
        )
      )}
    </div>
  )
}
