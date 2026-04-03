'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Compass, Newspaper, Bookmark, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/feed',     icon: Home,      label: 'Home' },
  { href: '/discover', icon: Compass,   label: 'Scopri' },
  { href: '/news',     icon: Newspaper, label: 'News' },
  { href: '/wishlist', icon: Bookmark,  label: 'Wishlist' },
  { href: '/profile',  icon: User,      label: 'Profilo' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] bg-bg/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 pb-safe">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-3 transition-all duration-200',
                active ? 'text-accent' : 'text-white/30 hover:text-white/60'
              )}
            >
              <div className="relative">
                <Icon
                  size={22}
                  strokeWidth={active ? 2.2 : 1.7}
                  className={cn('transition-all duration-200', active && 'drop-shadow-[0_0_8px_rgba(124,106,247,0.8)]')}
                />
                {active && (
                  <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" />
                )}
              </div>
              <span className={cn('text-[10px] font-medium tracking-wide transition-all', active ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden')}>
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
