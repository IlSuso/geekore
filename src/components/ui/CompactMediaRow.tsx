import type { ReactNode } from 'react'
import { ImageIcon } from 'lucide-react'
import { MediaMetaRow } from '@/components/ui/MediaMetaRow'

interface CompactMediaRowProps {
  title: string
  type?: string | null
  coverImage?: string | null
  year?: number | string | null
  score?: number | string | null
  status?: string | null
  progress?: {
    current?: number | null
    total?: number | null
    label?: string
  }
  trailing?: ReactNode
  onClick?: () => void
  className?: string
}

export function CompactMediaRow({
  title,
  type,
  coverImage,
  year,
  score,
  status,
  progress,
  trailing,
  onClick,
  className = '',
}: CompactMediaRowProps) {
  const Component = onClick ? 'button' : 'div'

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`w-full min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-left transition-colors hover:bg-[var(--bg-card-hover)] ${className}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--bg-secondary)]">
          {coverImage ? (
            <img src={coverImage} alt={`Copertina di ${title}`} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
              <ImageIcon size={18} strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-[14px] font-bold leading-tight text-[var(--text-primary)]">
            {title}
          </h3>
          <MediaMetaRow
            className="mt-1.5"
            type={type}
            status={status}
            year={year}
            score={score}
            progress={progress}
          />
        </div>

        {trailing && <div className="flex-shrink-0">{trailing}</div>}
      </div>
    </Component>
  )
}
