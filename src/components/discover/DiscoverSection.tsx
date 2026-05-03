import type { ReactNode } from 'react'

interface DiscoverSectionProps {
  title: string
  count?: number
  subtitle?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  variant?: 'plain' | 'panel'
}

export function DiscoverSection({
  title,
  count,
  subtitle,
  icon,
  action,
  children,
  className = '',
  variant = 'plain',
}: DiscoverSectionProps) {
  const panelClass = variant === 'panel'
    ? 'rounded-[24px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/48 p-3 ring-1 ring-white/5'
    : ''

  return (
    <section className={`mb-6 ${panelClass} ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          {icon && (
            <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-[13px] border border-[rgba(230,255,61,0.16)] bg-[rgba(230,255,61,0.07)] text-[var(--accent)] ring-1 ring-white/5">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate font-display text-[20px] font-black leading-none tracking-[-0.04em] text-[var(--text-primary)]">{title}</h2>
              {typeof count === 'number' && (
                <span className="rounded-full border border-[var(--border)] bg-black/18 px-2 py-0.5 font-mono-data text-[10px] font-black text-[var(--text-muted)]">
                  {count}
                </span>
              )}
            </div>
            {subtitle && <p className="mt-1 truncate text-[12px] leading-5 text-[var(--text-muted)]">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}
