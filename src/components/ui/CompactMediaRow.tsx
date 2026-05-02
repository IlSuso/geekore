import type { ReactNode } from 'react'
import { MediaMetaRow } from '@/components/ui/MediaMetaRow'
import { getMediaStatusLabel } from '@/lib/mediaStatus'
import { getMediaTypeColor } from '@/lib/mediaTypes'

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

function CompactMediaRowContent({
  title,
  type,
  coverImage,
  year,
  score,
  status,
  progress,
  trailing,
}: Omit<CompactMediaRowProps, 'onClick' | 'className'>) {
  const color = getMediaTypeColor(type)
  const statusLabel = getMediaStatusLabel(status || 'planning')

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="relative h-[64px] w-11 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--bg-secondary)] ring-1 ring-white/5"
        style={{ boxShadow: `inset 0 -2px 0 ${color}` }}
      >
        {coverImage ? (
          <img
            src={coverImage}
            alt={`Copertina di ${title}`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div
            className="gk-cover-placeholder h-full w-full"
            style={{ ['--gk-type' as string]: color }}
          >
            <span className="line-clamp-3">{title}</span>
          </div>
        )}
        <span className="gk-status-pill !right-1 !top-1 !px-1.5 !py-0.5 !text-[8px]">
          {statusLabel}
        </span>
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
  )
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
  const color = getMediaTypeColor(type)
  const classes = `gk-library-row group relative w-full min-w-0 overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--bg-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 ${className}`
  const content = (
    <>
      <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: color }} aria-hidden="true" />
      <CompactMediaRowContent
        title={title}
        type={type}
        coverImage={coverImage}
        year={year}
        score={score}
        status={status}
        progress={progress}
        trailing={trailing}
      />
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        data-no-swipe="true"
        onClick={(event) => { event.stopPropagation(); onClick() }}
        onPointerDown={event => event.stopPropagation()}
        className={classes}
        aria-label={`Apri ${title}`}
      >
        {content}
      </button>
    )
  }

  return (
    <div data-no-swipe="true" className={classes}>
      {content}
    </div>
  )
}
