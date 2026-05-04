import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { useLocale } from '@/lib/locale'

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  loading?: boolean
  rightSlot?: ReactNode
  className?: string
  inputClassName?: string
  onClear?: () => void
}

export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus = false,
  loading = false,
  rightSlot,
  className = '',
  inputClassName = '',
  onClear,
}: SearchFieldProps) {
  const { locale } = useLocale()
  const resolvedPlaceholder = placeholder || (locale === 'en' ? 'Search...' : 'Cerca...')
  const clearLabel = locale === 'en' ? 'Clear search' : 'Cancella ricerca'

  const clear = () => {
    onChange('')
    onClear?.()
  }

  return (
    <div className={`relative ${className}`}>
      <Search
        size={16}
        className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: loading ? 'var(--accent)' : 'var(--text-muted)' }}
      />
      <input
        type="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={resolvedPlaceholder}
        autoFocus={autoFocus}
        className={`h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] pl-10 pr-20 text-[15px] text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-colors focus:border-[var(--accent)] ${inputClassName}`}
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value && (
          <button
            type="button"
            onClick={clear}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-card-hover)] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
            aria-label={clearLabel}
          >
            <X size={13} strokeWidth={2.4} />
          </button>
        )}
        {rightSlot}
      </div>
    </div>
  )
}
