import type { ReactNode } from 'react'
import { PostTypeBadge } from '@/components/ui/PostTypeBadge'

interface FeedPostShellProps {
  type?: 'activity' | 'discussion'
  header: ReactNode
  children: ReactNode
  actions?: ReactNode
  className?: string
}

export function FeedPostShell({
  type = 'discussion',
  header,
  children,
  actions,
  className = '',
}: FeedPostShellProps) {
  return (
    <article className={`rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-4 ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{header}</div>
        <PostTypeBadge type={type} className="flex-shrink-0" />
      </div>

      <div className="min-w-0">
        {children}
      </div>

      {actions && (
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
          {actions}
        </div>
      )}
    </article>
  )
}
