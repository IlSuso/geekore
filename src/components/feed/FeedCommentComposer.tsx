import { Avatar } from '@/components/ui/Avatar'

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
  placeholder = 'Aggiungi un commento...',
  maxLength = 500,
}: FeedCommentComposerProps) {
  const canSubmit = value.trim().length > 0

  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-t border-[var(--border)] px-5 py-3">
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-[var(--border)]">
        <Avatar
          src={profile?.avatar_url}
          username={profile?.username || 'user'}
          displayName={profile?.display_name}
          size={32}
          className="rounded-full"
        />
      </div>

      <input
        type="text"
        value={value}
        onChange={event => onChange(event.target.value.slice(0, maxLength))}
        placeholder={placeholder}
        maxLength={maxLength}
        className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />

      {canSubmit && (
        <button
          type="button"
          onClick={onSubmit}
          className="shrink-0 text-sm font-bold text-[var(--accent)]"
        >
          Pubblica
        </button>
      )}
    </div>
  )
}
