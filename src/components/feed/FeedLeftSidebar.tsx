'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Library, Bookmark, List, BarChart2, Trophy, Bell, Compass } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'

interface Profile {
  username: string
  display_name?: string
  avatar_url?: string
}

const NAV_ITEMS = [
  { href: '/discover',      icon: Compass,   label: 'Scopri' },
  { href: '/wishlist',      icon: Bookmark,  label: 'Wishlist' },
  { href: '/lists',         icon: List,      label: 'Le mie liste' },
  { href: '/stats',         icon: BarChart2, label: 'Statistiche' },
  { href: '/leaderboard',   icon: Trophy,    label: 'Classifica' },
  { href: '/notifications', icon: Bell,      label: 'Notifiche' },
]

export function FeedLeftSidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname()

  return (
    <aside className="py-4 sticky top-16">

      {/* User card */}
      {profile && (
        <Link
          href={`/profile/${profile.username}`}
          className="flex items-center gap-3 px-2 py-2.5 mb-4 rounded-2xl hover:bg-zinc-900 transition-colors group"
        >
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-zinc-800 group-hover:ring-violet-500/40 transition-all">
            <Avatar
              src={profile.avatar_url}
              username={profile.username}
              displayName={profile.display_name}
              size={40}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate leading-tight">
              {profile.display_name || profile.username}
            </p>
            <p className="text-[11px] text-zinc-500 truncate">@{profile.username}</p>
          </div>
        </Link>
      )}

      {/* Nav shortcuts */}
      <nav className="space-y-0.5">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
                active
                  ? 'bg-violet-600/15 text-violet-300'
                  : 'text-zinc-400 hover:text-[var(--text-primary)] hover:bg-zinc-900'
              }`}
            >
              <Icon size={16} className={active ? 'text-violet-400' : 'text-zinc-500'} />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
