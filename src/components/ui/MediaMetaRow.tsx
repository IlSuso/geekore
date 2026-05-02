import type { ReactNode } from 'react'
import { Star } from 'lucide-react'
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
  subtle?: boolean
  className?: string
}

function MetaDot() {
  return <span className="h-1 w-1 rounded-full bg-[var(--text-muted)] opacity-45" aria-hidden />
}

export function MediaMetaRow({
  type,
  status,
  year,
  score,
  progress,
  trailing,
  dense = false,
  subtle = false,
  className = '',
}: MediaMetaRowProps) {
  const hasTextMeta = !!year || (score != null && score !== '') || !!trailing

  return (
    <div className={`${dense ? 'space-y-1' : 'space-y-2'} ${className}`}>
      <div className={`flex min-w-0 flex-wrap items-center ${dense ? 'gap-1.5' : 'gap-2'}`}>
        {type && <MediaTypeBadge type={type} size="xs" variant={subtle ? 'line' : 'soft'} />}
        {status && <MediaStatusBadge status={status} />}

        {hasTextMeta && (type || status) && <MetaDot />}

        {year && (
          <span className="font-mono-data text-[11px] font-bold text-[var(--text-muted)]">
            {year}
          </span>
        )}

        {year && score != null && score !== '' && <MetaDot />}

        {score != null && score !== '' && (
          <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/15 bg-yellow-500/8 px-1.5 py-0.5 font-mono-data text-[10px] font-black text-yellow-300">
            <Star size={10} fill="currentColor" />
            {score}
          </span>
        )}

        {trailing && (year || score != null) && <MetaDot />}
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
