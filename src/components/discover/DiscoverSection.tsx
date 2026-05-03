import type { ReactNode } from 'react'

interface DiscoverSectionProps {
  title: string
  count?: number
  subtitle?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function DiscoverSection({
  title,
  count,
  subtitle,
  icon,
  action,
  children,
  className = '',
}: DiscoverSectionProps) {
  return (
    <section className={`mb-8 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          {icon && (
            <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--accent)]">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-[14px] font-black text-[var(--text-primary)]">{title}</h2>
              {typeof count === 'number' && (
                <span className="gk-mono text-[var(--text-muted)]">
                  {count}
                </span>
              )}
            </div>
            {subtitle && <p className="gk-caption mt-0.5 truncate text-[var(--text-muted)]">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}
