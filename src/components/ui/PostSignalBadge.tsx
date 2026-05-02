import { Pin, Sparkles } from 'lucide-react'

type PostSignal = 'pinned' | 'discovery'

interface PostSignalBadgeProps {
  type: PostSignal
  className?: string
}

export function PostSignalBadge({ type, className = '' }: PostSignalBadgeProps) {
  const isPinned = type === 'pinned'
  const Icon = isPinned ? Pin : Sparkles

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${className}`}
      style={{ color: isPinned ? 'var(--accent)' : 'var(--brand-light)' }}
    >
      <Icon size={11} className={isPinned ? 'rotate-45' : ''} />
      {isPinned ? 'In evidenza' : 'Consigliato per te'}
    </div>
  )
}
