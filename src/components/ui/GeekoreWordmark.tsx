import Link from 'next/link'

interface GeekoreWordmarkProps {
  href?: string
  size?: 'sm' | 'md' | 'lg'
  showMark?: boolean
  className?: string
}

const sizeClasses = {
  sm: {
    text: 'text-[15px]',
    mark: { width: 6, height: 6, borderRadius: 1.5, marginLeft: 3, marginBottom: 1 },
  },
  md: {
    text: 'text-[24px]',
    mark: { width: 7, height: 7, borderRadius: 2, marginLeft: 3, marginBottom: 2 },
  },
  lg: {
    text: 'text-[32px]',
    mark: { width: 9, height: 9, borderRadius: 2.5, marginLeft: 4, marginBottom: 3 },
  },
}

export function GeekoreWordmark({
  href = '/home',
  size = 'md',
  showMark = true,
  className = '',
}: GeekoreWordmarkProps) {
  const cfg = sizeClasses[size]
  const content = (
    <span className={`inline-flex items-baseline gap-0 py-1 font-display ${className}`} style={{ letterSpacing: '-0.03em' }}>
      <span className={`${cfg.text} font-bold leading-none text-[var(--text-primary)]`}>geekore</span>
      {showMark && (
        <span
          aria-hidden="true"
          className="inline-block flex-shrink-0"
          style={{
            ...cfg.mark,
            background: 'var(--accent)',
            boxShadow: size === 'lg' ? '0 0 24px rgba(230,255,61,0.35)' : undefined,
          }}
        />
      )}
    </span>
  )

  return (
    <Link href={href} className="inline-flex items-center">
      {content}
    </Link>
  )
}
