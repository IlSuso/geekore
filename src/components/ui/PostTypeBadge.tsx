import { MessageCircle, PlayCircle } from 'lucide-react'

type PostType = 'activity' | 'discussion'

interface PostTypeBadgeProps {
  type: PostType
  className?: string
}

export function PostTypeBadge({ type, className = '' }: PostTypeBadgeProps) {
  const isActivity = type === 'activity'
  const Icon = isActivity ? PlayCircle : MessageCircle

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${className}`}
      style={isActivity
        ? { color: 'var(--accent)', borderColor: 'rgba(230,255,61,0.28)', background: 'rgba(230,255,61,0.08)' }
        : { color: 'var(--text-secondary)', borderColor: 'var(--border)', background: 'var(--bg-card)' }}
    >
      <Icon size={12} strokeWidth={2} />
      {isActivity ? 'Attività' : 'Discussione'}
    </span>
  )
}
