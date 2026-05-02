import type { ReactNode } from 'react'
import { SectionHeader } from '@/components/ui/SectionHeader'

interface RailSectionProps {
  title: string
  eyebrow?: string
  description?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  icon?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  snap?: boolean
}

export function RailSection({
  title,
  eyebrow,
  description,
  action,
  icon,
  children,
  className = '',
  contentClassName = '',
  snap = true,
}: RailSectionProps) {
  return (
    <section className={`space-y-3 ${className}`}>
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={action}
        icon={icon}
      />
      <div className={`gk-carousel -mx-4 flex gap-3 px-4 pb-1 ${snap ? 'snap-x snap-mandatory' : ''} ${contentClassName}`}>
        {children}
      </div>
    </section>
  )
}
