export type SortSelectOption<T extends string = string> = {
  id: T
  label: string
}

type SortSelectProps<T extends string = string> = {
  value: T
  options: SortSelectOption<T>[]
  onChange: (value: T) => void
  label?: string
  className?: string
}

export function SortSelect<T extends string = string>({
  value,
  options,
  onChange,
  label = 'Ordina',
  className = '',
}: SortSelectProps<T>) {
  return (
    <label className={`inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 ${className}`}>
      <span className="hidden text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] sm:inline">
        {label}
      </span>
      <select
        value={value}
        onChange={event => onChange(event.target.value as T)}
        className="bg-transparent text-[12px] font-bold text-[var(--text-secondary)] outline-none"
        aria-label={label}
      >
        {options.map(option => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
