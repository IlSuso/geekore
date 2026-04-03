import { cn } from '@/lib/utils'
import { MediaType } from '@/types'

interface MediaBadgeProps {
  type: MediaType
  className?: string
}

const LABELS: Record<MediaType, string> = {
  anime: 'Anime',
  manga: 'Manga',
  game: 'Game',
  board: 'Board',
}

export function MediaBadge({ type, className }: MediaBadgeProps) {
  return (
    <span className={cn(`badge-${type}`, 'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest', className)}>
      {LABELS[type]}
    </span>
  )
}
