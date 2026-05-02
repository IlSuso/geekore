import { getMediaStatusColor, getMediaStatusLabel } from '@/lib/mediaStatus'

interface MediaStatusBadgeProps {
  status?: string | null
  label?: string
  className?: string
}

export function MediaStatusBadge({ status, label, className = '' }: MediaStatusBadgeProps) {
  const color = getMediaStatusColor(status)

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] leading-none ${className}`}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 34%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label || getMediaStatusLabel(status)}
    </span>
  )
}
