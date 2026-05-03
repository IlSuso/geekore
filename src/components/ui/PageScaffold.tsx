import type { ReactNode } from 'react'
import { PageHero } from '@/components/ui/PageHero'

interface PageScaffoldAction {
  label: string
  href?: string
  onClick?: () => void
  icon?: ReactNode
  variant?: 'primary' | 'secondary'
}

interface PageScaffoldStat {
  label: string
  value: string | number
  icon?: ReactNode
  accent?: boolean
}

interface PageScaffoldProps {
  children: ReactNode
  title?: string
  eyebrow?: string
  description?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  actions?: PageScaffoldAction[]
  stats?: PageScaffoldStat[]
  icon?: ReactNode
  contained?: boolean
  className?: string
  contentClassName?: string
  /**
   * Opt-in: renderizza il nuovo PageHero standard.
   * Lo teniamo disattivo di default per evitare duplicazioni sulle pagine che hanno già header custom.
   */
  showHero?: boolean
  heroCompact?: boolean
  heroClassName?: string
}

export function PageScaffold({
  children,
  title,
  eyebrow,
  description,
  action,
  actions,
  stats,
  icon,
  contained = true,
  className = '',
  contentClassName = '',
  showHero = false,
  heroCompact = false,
  heroClassName = '',
}: PageScaffoldProps) {
  const normalizedActions: PageScaffoldAction[] = actions || (action ? [{ ...action, variant: 'primary' }] : [])

  return (
    <div className={`gk-page-scaffold min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] ${className}`}>
      <div
        className={`${contained ? 'gk-page-container w-full px-3 sm:px-4 md:px-6' : ''} ${contentClassName}`}
        style={{
          paddingBottom: contentClassName.includes('pb-') ? undefined : 'calc(6rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="relative">
          {showHero && title && (
            <PageHero
              eyebrow={eyebrow}
              title={title}
              description={description}
              icon={icon}
              actions={normalizedActions}
              stats={stats}
              compact={heroCompact}
              className={heroClassName}
            />
          )}
          {children}
        </div>
      </div>
    </div>
  )
}
