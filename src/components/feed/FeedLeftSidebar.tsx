'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bookmark, List, BarChart2, Trophy, Bell, TrendingUp, Newspaper, Users, Star, Settings } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useState } from 'react'
import { NotificationsDrawer } from './NotificationsDrawer'

interface Profile {
  username: string
  display_name?: string
  avatar_url?: string
}

const MAIN_NAV = [
  { href: '/wishlist',    icon: Bookmark,    label: 'Wishlist' },
  { href: '/lists',       icon: List,        label: 'Le mie liste' },
  { href: '/stats',       icon: BarChart2,   label: 'Statistiche' },
  { href: '/leaderboard', icon: Trophy,      label: 'Classifica' },
]

const EXPLORE_NAV = [
  { href: '/trending',   icon: TrendingUp,  label: 'Trending' },
  { href: '/discover',   icon: Star,        label: 'Scopri' },
  { href: '/news',       icon: Newspaper,   label: 'Notizie geek' },
  { href: '/explore',    icon: Users,       label: 'Community' },
]

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: React.ElementType; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors ${
        active
          ? 'bg-violet-600/15 text-violet-300'
          : 'text-zinc-300 hover:text-white hover:bg-zinc-800/70'
      }`}
    >
      <Icon size={20} className={active ? 'text-violet-400' : 'text-zinc-400'} />
      {label}
    </Link>
  )
}

export function FeedLeftSidebar({ profile }: { profile: Profile | null }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <aside className="sticky top-16 h-[calc(100vh-4rem)] flex flex-col overflow-y-auto py-3 pr-1 scrollbar-none">

        {/* User card */}
        {profile && (
          <Link
            href={`/profile/${profile.username}`}
            className="flex items-center gap-3 px-2 py-3 mb-1 rounded-2xl hover:bg-zinc-800/70 transition-colors group flex-shrink-0"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-zinc-700 group-hover:ring-violet-500/40 transition-all">
              <Avatar
                src={profile.avatar_url}
                username={profile.username}
                displayName={profile.display_name}
                size={40}
              />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-white truncate leading-tight">
                {profile.display_name || profile.username}
              </p>
              <p className="text-[12px] text-zinc-500 truncate">@{profile.username}</p>
            </div>
          </Link>
        )}

        {/* Divider */}
        <div className="h-px bg-zinc-800 mx-2 my-2" />

        {/* Main nav */}
        <nav className="flex flex-col gap-0.5">
          {MAIN_NAV.map(({ href, icon, label }) => (
            <NavItem key={href} href={href} icon={icon} label={label} active={pathname === href} />
          ))}

          {/* Notifiche — apre drawer */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors text-zinc-300 hover:text-white hover:bg-zinc-800/70 w-full text-left"
          >
            <Bell size={20} className="text-zinc-400" />
            Notifiche
          </button>
        </nav>

        {/* Divider */}
        <div className="h-px bg-zinc-800 mx-2 my-3" />

        {/* Explore section */}
        <div className="mb-2">
          <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide px-3 mb-1.5">Scopri</p>
          <nav className="flex flex-col gap-0.5">
            {EXPLORE_NAV.map(({ href, icon, label }) => (
              <NavItem key={href} href={href} icon={icon} label={label} active={pathname === href} />
            ))}
          </nav>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom: Settings */}
        <div className="mt-3 pb-2">
          <div className="h-px bg-zinc-800 mx-2 mb-3" />
          <NavItem href="/settings" icon={Settings} label="Impostazioni" active={pathname === '/settings'} />
          <p className="text-[10px] text-zinc-600 px-3 mt-3">© 2025 Geekore</p>
        </div>
      </aside>

      <NotificationsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
