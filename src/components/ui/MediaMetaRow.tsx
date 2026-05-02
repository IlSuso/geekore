import type { ReactNode } from 'react'
import { MediaTypeBadge } from '@/components/ui/MediaTypeBadge'
import { MediaStatusBadge } from '@/components/ui/MediaStatusBadge'
import { MediaProgress } from '@/components/ui/MediaProgress'

interface MediaMetaRowProps {
  type?: string | null
  status?: string | null
  year?: number | string | null
  score?: number | string | null
  progress?: {
    current?: number | null
    total?: number | null
    label?: string
  }
  trailing?: ReactNode
  dense?: boolean
  className?: string
}

export function MediaMetaRow({
  type,
  status,
  year,
  score,
  progress,
  trailing,
  dense = false,
  className = '',
}: MediaMetaRowProps) {
  return (
    <div className={`${dense ? 'space-y-1' : 'space-y-2'} ${className}`}>
      <div className={`flex min-w-0 flex-wrap items-center ${dense ? 'gap-1.5' : 'gap-2'}`}>
        {type && <MediaTypeBadge type={type} size="xs" />}
        {status && <MediaStatusBadge status={status} />}
        {year && <span className="font-mono-data text-[11px] text-[var(--text-muted)]">{year}</span>}
        {score != null && score !== '' && (
          <span className="font-mono-data text-[11px] font-bold text-[var(--text-secondary)]">
            ★ {score}
          </span>
        )}
        {trailing}
      </div>
      {progress && (
        <MediaProgress
          current={progress.current}
          total={progress.total}
          label={progress.label}
          compact={dense}
        />
      )}
    </div>
  )
}
