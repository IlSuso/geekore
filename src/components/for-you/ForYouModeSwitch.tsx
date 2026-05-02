'use client'

import Link from 'next/link'
import { List, Shuffle } from 'lucide-react'

interface ForYouModeSwitchProps {
  active: 'list' | 'swipe'
  className?: string
}

export function ForYouModeSwitch({ active, className = '' }: ForYouModeSwitchProps) {
  return (
    <div
      className={`inline-flex items-center rounded-full border border-[var(--border)] bg-[rgba(20,20,27,0.92)] p-1 shadow-lg shadow-black/20 backdrop-blur-xl ${className}`}
      aria-label="Modalità For You"
    >
      <Link
        href="/for-you"
        aria-current={active === 'list' ? 'page' : undefined}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-all ${
          active === 'list'
            ? 'bg-[var(--accent)] text-[#0B0B0F]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <List size={14} />
        Lista
      </Link>
      <Link
        href="/swipe"
        aria-current={active === 'swipe' ? 'page' : undefined}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-all ${
          active === 'swipe'
            ? 'bg-[var(--accent)] text-[#0B0B0F]'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <Shuffle size={14} />
        Swipe
      </Link>
    </div>
  )
}
