import type { ReactNode } from 'react'
import { ImageIcon } from 'lucide-react'
import { MediaMetaRow } from '@/components/ui/MediaMetaRow'

interface ActivityMediaCardProps {
  title: string
  type?: string | null
  coverImage?: string | null
  status?: string | null
  score?: number | string | null
  progress?: {
    current?: number | null
    total?: number | null
    label?: string
  }
  note?: ReactNode
  action?: ReactNode
  onClick?: () => void
  className?: string
}

export function ActivityMediaCard({
  title,
  type,
  coverImage,
  status,
  score,
  progress,
  note,
  action,
  onClick,
  className = '',
}: ActivityMediaCardProps) {
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] text-left transition-colors hover:bg-[var(--bg-card-hover)] ${className}`}
    >
      <div className="flex gap-3 p-3">
        <div className="h-24 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--bg-secondary)]">
          {coverImage ? (
            <img src={coverImage} alt={`Copertina di ${title}`} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
              <ImageIcon size={22} strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          <h3 className="line-clamp-2 text-[15px] font-bold leading-tight text-[var(--text-primary)]">
            {title}
          </h3>
          <MediaMetaRow
            className="mt-2"
            type={type}
            status={status}
            score={score}
            progress={progress}
          />
          {note && (
            <div className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {note}
            </div>
          )}
        </div>

        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
    </Component>
  )
}
