import type { ReactNode } from 'react'
import Link from 'next/link'

interface PageHeroAction {
  label: string
  href?: string
  onClick?: () => void
  icon?: ReactNode
  variant?: 'primary' | 'secondary'
}

interface PageHeroStat {
  label: string
  value: string | number
  icon?: ReactNode
  accent?: boolean
}

interface PageHeroProps {
  eyebrow?: string
  title: string
  description?: string
  icon?: ReactNode
  actions?: PageHeroAction[]
  stats?: PageHeroStat[]
  children?: ReactNode
  className?: string
  compact?: boolean
}

function actionClass(variant: PageHeroAction['variant'] = 'primary') {
  if (variant === 'secondary') {
    return 'inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[rgba(255,255,255,0.035)] px-4 text-[13px] font-black text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35'
  }
  return 'inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-[13px] font-black text-[#0B0B0F] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35'
}

function HeroAction({ action }: { action: PageHeroAction }) {
  const className = actionClass(action.variant)
  const content = (
    <>
      {action.icon}
      {action.label}
    </>
  )

  if (action.href) {
    return (
      <Link href={action.href} data-no-swipe="true" className={className}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" data-no-swipe="true" onClick={action.onClick} className={className}>
      {content}
    </button>
  )
}

export function PageHero({
  eyebrow,
  title,
  description,
  icon,
  actions = [],
  stats = [],
  children,
  className = '',
  compact = false,
}: PageHeroProps) {
  return (
    <section
      className={`mb-5 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.16)] bg-[radial-gradient(circle_at_15%_0%,rgba(230,255,61,0.12),transparent_34%),linear-gradient(135deg,rgba(230,255,61,0.065),rgba(22,22,30,0.94)_45%,rgba(18,18,27,0.98))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.24)] ring-1 ring-white/5 md:p-6 ${compact ? 'md:p-5' : ''} ${className}`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          {(eyebrow || icon) && (
            <div className="mb-3 gk-section-eyebrow">
              {icon}
              {eyebrow || 'Geekore'}
            </div>
          )}
          <h1 className="font-display text-[34px] font-black leading-none tracking-[-0.045em] text-[var(--text-primary)] md:text-[42px]">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-[15px] leading-6 text-[var(--text-secondary)] md:text-[16px]">
              {description}
            </p>
          )}
        </div>

        {actions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 lg:justify-end" data-no-swipe="true">
            {actions.map((action) => (
              <HeroAction key={`${action.label}-${action.href || 'button'}`} action={action} />
            ))}
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-white/5 bg-black/18 p-3 ring-1 ring-white/5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="gk-label">{stat.label}</p>
                {stat.icon && <span className={stat.accent ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}>{stat.icon}</span>}
              </div>
              <p className={`font-mono-data text-[22px] font-black leading-none ${stat.accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {children && <div className="mt-5">{children}</div>}
    </section>
  )
}
