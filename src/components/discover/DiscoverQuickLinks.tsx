'use client'

import Link from 'next/link'
import { Dices, Film, Gamepad2, Layers, Search, Swords, Tv } from 'lucide-react'
import { useLocale } from '@/lib/locale'

const QUICK_LINKS = [
  { href: '/discover?type=anime&q=attack%20on%20titan', label: { it: 'Anime', en: 'Anime' }, icon: Swords },
  { href: '/discover?type=manga&q=berserk', label: { it: 'Manga', en: 'Manga' }, icon: Layers },
  { href: '/discover?type=movie&q=dune', label: { it: 'Film', en: 'Movies' }, icon: Film },
  { href: '/discover?type=tv&q=breaking%20bad', label: { it: 'Serie', en: 'Shows' }, icon: Tv },
  { href: '/discover?type=game&q=zelda', label: { it: 'Giochi', en: 'Games' }, icon: Gamepad2 },
  { href: '/discover?type=boardgame&q=catan', label: { it: 'Boardgame', en: 'Board games' }, icon: Dices },
]

export function DiscoverQuickLinks() {
  const { locale } = useLocale()
  const copy = locale === 'en' ? { aria: 'Discover quick links', quickSearch: 'Quick search' } : { aria: 'Link rapidi Discover', quickSearch: 'Cerca rapido' }
  return (
    <nav
      data-no-swipe="true"
      data-horizontal-scroll="true"
      data-interactive="true"
      className="pointer-events-auto flex w-full max-w-[min(720px,calc(100vw-1rem))] items-center gap-1.5 overflow-x-auto overscroll-x-contain rounded-full border border-[var(--border)] bg-[rgba(20,20,27,0.94)] p-1 shadow-lg shadow-black/20 backdrop-blur-xl scrollbar-hide"
      aria-label={copy.aria}
      onClick={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)] md:text-[11px]">
        <Search size={13} />
        {copy.quickSearch}
      </div>
      {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          data-no-swipe="true"
          className="inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
        >
          <Icon size={13} />
          {label[locale]}
        </Link>
      ))}
    </nav>
  )
}
