interface MediaProgressProps {
  current?: number | null
  total?: number | null
  label?: string
  titleLabel?: string
  compact?: boolean
  className?: string
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function MediaProgress({ current, total, label, titleLabel = 'Progress', compact = false, className = '' }: MediaProgressProps) {
  const hasCurrent = typeof current === 'number' && Number.isFinite(current)
  const hasTotal = typeof total === 'number' && Number.isFinite(total) && total > 0
  const percent = hasCurrent && hasTotal ? clampPercent((current / total) * 100) : 0
  const progressLabel = label || (hasCurrent && hasTotal
    ? `${current}/${total}`
    : hasCurrent
    ? `${current}`
    : '—')

  if (compact) {
    return (
      <div className={`flex min-w-0 items-center gap-2 ${className}`}>
        <div className="h-1 min-w-[42px] flex-1 overflow-hidden rounded-full bg-[var(--bg-card-hover)]">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: hasTotal ? `${percent}%` : hasCurrent ? '100%' : '0%',
              background: 'var(--accent)',
            }}
          />
        </div>
        <span className="font-mono-data text-[10px] font-bold text-[var(--text-muted)]">
          {progressLabel}
        </span>
      </div>
    )
  }

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="gk-caption uppercase tracking-[0.08em]">{titleLabel}</span>
        <span className="font-mono-data text-[11px] font-bold text-[var(--text-secondary)]">
          {progressLabel}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-card-hover)]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: hasTotal ? `${percent}%` : hasCurrent ? '100%' : '0%',
            background: 'var(--accent)',
          }}
        />
      </div>
    </div>
  )
}
