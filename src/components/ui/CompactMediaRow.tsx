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
      data-no-swipe="true"
      onClick={(event: any) => { event.stopPropagation?.(); onClick?.() }}
      onPointerDown={(event: any) => event.stopPropagation?.()}
      className={`group w-full min-w-0 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 ${className}`}
      aria-label={onClick ? `Apri ${title}` : undefined}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-[58px] w-10 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--bg-secondary)] ring-1 ring-white/5">
          {coverImage ? (
            <img
              src={coverImage}
              alt={`Copertina di ${title}`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
              <ImageIcon size={17} strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-[14px] font-bold leading-tight tracking-[-0.01em] text-[var(--text-primary)]">
            {title}
          </h3>
          <MediaMetaRow
            dense
            className="mt-1"
            type={type}
            status={status}
            year={year}
            score={score}
            progress={progress}
          />
        </div>

        {trailing && <div className="flex-shrink-0 self-stretch py-1" data-no-swipe="true">{trailing}</div>}
      </div>
    </Component>
  )
}
