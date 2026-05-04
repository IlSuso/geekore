'use client'

import Link from 'next/link'
import { List, Shuffle } from 'lucide-react'
import { useLocale } from '@/lib/locale'

interface ForYouModeSwitchProps {
  active: 'list' | 'swipe'
  className?: string
}

export function ForYouModeSwitch({ active, className = '' }: ForYouModeSwitchProps) {
  const { locale } = useLocale()
  const copy = locale === 'en'
    ? { aria: 'For You mode', list: 'List', swipe: 'Swipe', rail: 'rail', cards: 'cards' }
    : { aria: 'Modalità Per te', list: 'Lista', swipe: 'Swipe', rail: 'rail', cards: 'card' }

  const modes = [
    { id: 'list' as const, href: '/for-you', label: copy.list, icon: List, caption: copy.rail },
    { id: 'swipe' as const, href: '/swipe', label: copy.swipe, icon: Shuffle, caption: copy.cards },
  ]

  return (
    <nav
      data-no-swipe="true"
      data-interactive="true"
      className={`inline-flex items-center gap-1 rounded-[18px] border border-[rgba(230,255,61,0.18)] bg-[rgba(20,20,27,0.94)] p-1 shadow-[0_14px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl ${className}`}
      aria-label={copy.aria}
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      {modes.map(({ id, href, label, icon: Icon, caption }) => {
        const isActive = active === id
        return (
          <Link
            key={id}
            href={href}
            data-no-swipe="true"
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex h-9 items-center gap-2 rounded-[14px] px-3 text-xs font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 ${
              isActive
                ? 'bg-[var(--accent)] text-[#0B0B0F] shadow-[0_0_24px_rgba(230,255,61,0.24)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon size={14} strokeWidth={2.2} />
            <span className="leading-none">{label}</span>
            <span className={`hidden font-mono-data text-[9px] uppercase tracking-[0.08em] md:inline ${isActive ? 'text-black/55' : 'text-[var(--text-muted)]'}`}>
              {caption}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
