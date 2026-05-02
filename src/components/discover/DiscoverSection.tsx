import type { ReactNode } from 'react'

interface DiscoverSectionProps {
  title: string
  count?: number
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function DiscoverSection({
  title,
  count,
  action,
  children,
  className = '',
}: DiscoverSectionProps) {
  return (
    <section className={`mb-8 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <h2 className="truncate text-[15px] font-bold text-[var(--text-primary)]">{title}</h2>
          {typeof count === 'number' && (
            <span className="font-mono-data text-[12px] text-[var(--text-muted)]">
              {count}
            </span>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}
