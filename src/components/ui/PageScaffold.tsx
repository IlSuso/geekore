import type { ReactNode } from 'react'

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
  icon?: ReactNode
  contained?: boolean
  className?: string
  contentClassName?: string
}

export function PageScaffold({
  children,
  contained = true,
  className = '',
  contentClassName = '',
}: PageScaffoldProps) {
  return (
    <div className={`gk-page-scaffold min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] ${className}`}>
      <div
        className={`${contained ? 'w-full px-3 sm:px-4 md:px-6' : ''} ${contentClassName}`}
        style={{
          paddingBottom: contentClassName.includes('pb-') ? undefined : 'calc(6rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="relative">
          {children}
        </div>
      </div>
    </div>
  )
}
