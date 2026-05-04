'use client'

import { Send } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useLocale } from '@/lib/locale'

interface FeedCommentComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  profile?: {
    username?: string
    display_name?: string
    avatar_url?: string
  } | null
  placeholder?: string
  maxLength?: number
}

export function FeedCommentComposer({
  value,
  onChange,
  onSubmit,
  profile,
  placeholder,
  maxLength = 500,
}: FeedCommentComposerProps) {
  const { locale } = useLocale()
  const copy = locale === 'en' ? { placeholder: 'Add a comment...', publish: 'Publish comment' } : { placeholder: 'Aggiungi un commento...', publish: 'Pubblica commento' }
  const canSubmit = value.trim().length > 0

  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--bg-primary)] px-4 py-3">
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-2xl ring-1 ring-white/10">
        <Avatar
          src={profile?.avatar_url}
          username={profile?.username || 'user'}
          displayName={profile?.display_name}
          size={36}
          className="rounded-2xl"
        />
      </div>

      <input
        data-no-swipe="true"
        type="text"
        value={value}
        onChange={event => onChange(event.target.value.slice(0, maxLength))}
        placeholder={placeholder || copy.placeholder}
        maxLength={maxLength}
        className="min-w-0 flex-1 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-[14px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition focus:border-[rgba(230,255,61,0.45)]"
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />

      <button
        type="button"
        data-no-swipe="true"
        onClick={onSubmit}
        disabled={!canSubmit}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-all disabled:opacity-35"
        style={canSubmit ? { background: 'var(--accent)', color: '#0B0B0F' } : { background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        aria-label={copy.publish}
      >
        <Send size={15} />
      </button>
    </div>
  )
}
