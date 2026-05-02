import type { ReactNode } from 'react'

export type ViewToggleOption<T extends string = string> = {
  id: T
  label: string
  icon: ReactNode
}

type ViewToggleProps<T extends string = string> = {
  value: T
  options: ViewToggleOption<T>[]
  onChange: (value: T) => void
  className?: string
}

export function ViewToggle<T extends string = string>({ value, options, onChange, className = '' }: ViewToggleProps<T>) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1 ${className}`}>
      {options.map(option => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
            style={{
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#0B0B0F' : 'var(--text-muted)',
            }}
            aria-label={option.label}
          >
            {option.icon}
          </button>
        )
      })}
    </div>
  )
}
