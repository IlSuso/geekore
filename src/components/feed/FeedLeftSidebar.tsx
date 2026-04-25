'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bookmark, List, BarChart2, Trophy, Bell } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useState } from 'react'
import { NotificationsDrawer } from './NotificationsDrawer'

interface Profile {
  username: string
  display_name?: string
  avatar_url?: string
}

const NAV_ITEMS = [
  { href: '/wishlist',    icon: Bookmark,  label: 'Wishlist' },
  { href: '/lists',       icon: List,      label: 'Le mie liste' },
  { href: '/stats',       icon: BarChart2, label: 'Statistiche' },
  { href: '/leaderboard', icon: Trophy,    label: 'Classifica' },
]

export function FeedLeftSidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <aside className="sticky top-16 h-[calc(100vh-4rem)] flex flex-col py-6">

        {/* User card */}
        {profile && (
          <Link
            href={`/profile/${profile.username}`}
            className="flex items-center gap-3 px-2 py-3 mb-2 rounded-2xl hover:bg-zinc-900 transition-colors group flex-shrink-0"
          >
            <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-zinc-800 group-hover:ring-violet-500/40 transition-all">
              <Avatar
                src={profile.avatar_url}
                username={profile.username}
                displayName={profile.display_name}
                size={44}
              />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate leading-tight">
                {profile.display_name || profile.username}
              </p>
              <p className="text-[12px] text-zinc-500 truncate">@{profile.username}</p>
            </div>
          </Link>
        )}

        {/* Nav shortcuts */}
        <nav className="flex flex-col gap-1 py-2">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3.5 px-3 py-3 rounded-xl text-[14px] font-medium transition-colors ${
                  active
                    ? 'bg-violet-600/15 text-violet-300'
                    : 'text-zinc-400 hover:text-[var(--text-primary)] hover:bg-zinc-900'
                }`}
              >
                <Icon size={18} className={active ? 'text-violet-400' : 'text-zinc-500'} />
                {label}
              </Link>
            )
          })}

          {/* Notifiche — apre drawer */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-3.5 px-3 py-3 rounded-xl text-[14px] font-medium transition-colors text-zinc-400 hover:text-[var(--text-primary)] hover:bg-zinc-900 w-full text-left"
          >
            <Bell size={18} className="text-zinc-500" />
            Notifiche
          </button>
        </nav>
      </aside>

      <NotificationsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
