import type { ReactNode } from 'react'
import { SectionHeader } from '@/components/ui/SectionHeader'

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
  title,
  eyebrow,
  description,
  action,
  icon,
  contained = true,
  className = '',
  contentClassName = '',
}: PageScaffoldProps) {
  return (
    <div className={`min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] ${className}`}>
      <div
        className={`${contained ? 'mx-auto max-w-screen-2xl px-3 sm:px-4 md:px-6' : ''} ${contentClassName}`}
        style={{
          paddingTop: contentClassName.includes('pt-') ? undefined : 'calc(0.5rem + env(safe-area-inset-top, 0px))',
          paddingBottom: contentClassName.includes('pb-') ? undefined : 'calc(6rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {title && (
          <SectionHeader
            eyebrow={eyebrow}
            title={title}
            description={description}
            action={action}
            icon={icon}
            className="mb-5 hidden md:flex"
          />
        )}
        {children}
      </div>
    </div>
  )
}
