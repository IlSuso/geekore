'use client'

import Link from 'next/link'
import { useLocale } from '@/lib/locale'

interface GeekoreWordmarkProps {
  href?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showMark?: boolean
  className?: string
}

const sizeClasses = {
  xs: {
    text: 'text-[18px]',
    mark: { width: 5, height: 5, borderRadius: 1, marginLeft: 2, transform: 'translateY(-1px)' },
  },
  sm: {
    text: 'text-[22px]',
    mark: { width: 6, height: 6, borderRadius: 1.5, marginLeft: 3, transform: 'translateY(-2px)' },
  },
  md: {
    text: 'text-[30px]',
    mark: { width: 10, height: 10, borderRadius: 2.5, marginLeft: 3, transform: 'translateY(-4px)' },
  },
  lg: {
    text: 'text-[52px]',
    mark: { width: 18, height: 18, borderRadius: 4, marginLeft: 5, transform: 'translateY(-8px)' },
  },
}

export function GeekoreMonogram({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[22%] bg-[var(--accent)] font-display text-[#0B0B0F] shadow-[0_0_28px_rgba(230,255,61,0.28)] ${className}`}
      data-geekore-dot="true"
      aria-hidden="true"
    >
      <span className="translate-y-[-2px] text-[1.32em] font-black leading-none tracking-[-0.06em]">g.</span>
    </span>
  )
}

export function GeekoreWordmark({
  href = '/home',
  size = 'md',
  showMark = true,
  className = '',
}: GeekoreWordmarkProps) {
  const { locale } = useLocale()
  const homeLabel = locale === 'it' ? 'Home Geekore' : 'Geekore home'
  const cfg = sizeClasses[size]
  const content = (
    <span className={`inline-flex items-baseline gap-0 py-1 font-display ${className}`} style={{ letterSpacing: '-0.05em' }}>
      <span className={`${cfg.text} font-black leading-none text-[var(--text-primary)]`}>geekore</span>
      {showMark && (
        <span
          aria-hidden="true"
          data-geekore-dot="true"
          className="gk-logo-dot inline-block flex-shrink-0 bg-[var(--accent)]"
          style={{
            ...cfg.mark,
            boxShadow: size === 'lg' ? '0 0 32px rgba(230,255,61,0.5)' : undefined,
          }}
        />
      )}
    </span>
  )

  return (
    <Link href={href} data-no-swipe="true" className="inline-flex items-center" aria-label={homeLabel}>
      {content}
    </Link>
  )
}
