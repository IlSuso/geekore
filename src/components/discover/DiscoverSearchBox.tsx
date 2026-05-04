import type { ReactNode } from 'react'
import { Mic, MicOff, Search, X } from 'lucide-react'
import { useLocale } from '@/lib/locale'

interface DiscoverSearchBoxProps {
  value: string
  onChange: (value: string) => void
  onClear: () => void
  placeholder: string
  inputRef?: React.RefObject<HTMLInputElement | null>
  isListening?: boolean
  voiceSupported?: boolean
  onToggleVoice?: () => void
  rightSlot?: ReactNode
}

export function DiscoverSearchBox({
  value,
  onChange,
  onClear,
  placeholder,
  inputRef,
  isListening = false,
  voiceSupported = false,
  onToggleVoice,
  rightSlot,
}: DiscoverSearchBoxProps) {
  const { locale } = useLocale()
  const copy = locale === 'en' ? { clear: 'Clear search', stopVoice: 'Stop voice search', startVoice: 'Start voice search' } : { clear: 'Cancella ricerca', stopVoice: 'Ferma ricerca vocale', startVoice: 'Avvia ricerca vocale' }
  return (
    <div className="relative mb-4">
      <Search
        size={16}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
      />

      <input
        data-testid="search-input"
        type="text"
        value={value}
        ref={inputRef}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl border py-2.5 pl-10 pr-20 text-[15px] outline-none transition-colors ${
          isListening
            ? 'border-red-500/40 bg-red-500/10 text-[var(--text-primary)] placeholder-red-400/60'
            : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-[var(--accent)]/60'
        }`}
        autoFocus={false}
      />

      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {value && !isListening && (
          <button
            type="button"
            onClick={onClear}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--text-muted)] text-[var(--bg-primary)]"
            aria-label={copy.clear}
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        )}

        {voiceSupported && onToggleVoice && (
          <button
            type="button"
            onClick={onToggleVoice}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
              isListening ? 'bg-red-500 text-white' : 'text-[var(--text-secondary)] hover:text-[var(--accent)]'
            }`}
            aria-label={isListening ? copy.stopVoice : copy.startVoice}
          >
            {isListening ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
        )}

        {rightSlot}
      </div>
    </div>
  )
}
