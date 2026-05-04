'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bookmark, List, BarChart2, Trophy, Bell, TrendingUp, Settings } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useState } from 'react'
import { NotificationsDrawer } from './NotificationsDrawer'
import { useLocale } from '@/lib/locale'

interface Profile {
  username: string
  display_name?: string
  avatar_url?: string
}

const COPY = {
  it: {
    nav: {
      wishlist: 'Wishlist', lists: 'Le mie liste', stats: 'Statistiche', leaderboard: 'Classifica', trending: 'Trending', notifications: 'Notifiche', settings: 'Impostazioni',
    },
    discover: 'Scopri',
  },
  en: {
    nav: {
      wishlist: 'Wishlist', lists: 'My lists', stats: 'Stats', leaderboard: 'Leaderboard', trending: 'Trending', notifications: 'Notifications', settings: 'Settings',
    },
    discover: 'Discover',
  },
} as const

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: React.ElementType; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-4 px-4 py-3.5 rounded-xl text-[15px] font-medium transition-colors ${
        active ? 'bg-zinc-800/80' : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
      }`}
      style={active ? { color: 'var(--accent)' } : {}}
    >
      <Icon size={22} style={active ? { color: 'var(--accent)' } : { color: '#a1a1aa' }} />
      {label}
    </Link>
  )
}

export function FeedLeftSidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname()
  const { locale } = useLocale()
  const copy = COPY[locale]
  const [drawerOpen, setDrawerOpen] = useState(false)

  const mainNav = [
    { href: '/wishlist', icon: Bookmark, label: copy.nav.wishlist },
    { href: '/lists', icon: List, label: copy.nav.lists },
    { href: '/stats', icon: BarChart2, label: copy.nav.stats },
    { href: '/leaderboard', icon: Trophy, label: copy.nav.leaderboard },
  ]

  const exploreNav = [
    { href: '/trending', icon: TrendingUp, label: copy.nav.trending },
  ]

  return (
    <>
      <aside className="h-full flex flex-col py-4 pr-1">
        {profile && (
          <Link
            href={`/profile/${profile.username}`}
            className="flex items-center gap-3 px-3 py-3.5 mb-2 rounded-2xl hover:bg-zinc-800/70 transition-colors group flex-shrink-0"
          >
            <div className="w-11 h-11 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-zinc-700 group-hover:ring-zinc-600/40 transition-all">
              <Avatar src={profile.avatar_url} username={profile.username} displayName={profile.display_name} size={44} />
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-white truncate leading-tight">
                {profile.display_name || profile.username}
              </p>
              <p className="text-[13px] text-zinc-500 truncate">@{profile.username}</p>
            </div>
          </Link>
        )}

        <div className="h-px bg-zinc-800 mx-2 my-2" />

        <nav className="flex flex-col gap-0.5">
          {mainNav.map(({ href, icon, label }) => (
            <NavItem key={href} href={href} icon={icon} label={label} active={pathname === href} />
          ))}

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-4 px-4 py-3.5 rounded-xl text-[15px] font-medium transition-colors text-zinc-300 hover:text-white hover:bg-zinc-800/70 w-full text-left"
          >
            <Bell size={22} className="text-zinc-400" />
            {copy.nav.notifications}
          </button>
        </nav>

        <div className="h-px bg-zinc-800 mx-2 my-4" />

        <div className="mb-4">
          <p className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wide px-4 mb-2">{copy.discover}</p>
          <nav className="flex flex-col gap-0.5">
            {exploreNav.map(({ href, icon, label }) => (
              <NavItem key={href} href={href} icon={icon} label={label} active={pathname === href} />
            ))}
          </nav>
        </div>

        <div className="flex-1" />

        <div className="pb-2">
          <div className="h-px bg-zinc-800 mx-2 mb-3" />
          <NavItem href="/settings" icon={Settings} label={copy.nav.settings} active={pathname === '/settings'} />
          <p className="text-[11px] text-zinc-600 px-4 mt-4">© 2025 Geekore</p>
        </div>
      </aside>

      <NotificationsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
