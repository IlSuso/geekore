'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, PlusCircle, User, Trophy, Bell } from 'lucide-react'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Navbar() {
  const pathname = usePathname()
  const supabase = createClient()
  const [hasNewNotifications, setHasNewNotifications] = useState(false)

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/discover', label: 'Discover', icon: Search },
    { href: '/feed', label: 'Feed', icon: PlusCircle },
    { href: '/notifications', label: 'Notifiche', icon: Bell, hasDot: true },
    { href: '/profile/me', label: 'Profilo', icon: User },
  ]

  const isProfileActive =
    pathname === '/profile/me' || pathname.startsWith('/profile/')

  useEffect(() => {
    if (pathname === '/notifications') setHasNewNotifications(false)
  }, [pathname])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return

      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false)
        .then(({ count }) => {
          if (count && count > 0) setHasNewNotifications(true)
        })

      channel = supabase
        .channel('navbar-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `receiver_id=eq.${user.id}`,
          },
          () => setHasNewNotifications(true)
        )
        .subscribe()
    })

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  return (
    <>
      {/* Navbar Desktop */}
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-6xl mx-auto w-full px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center">
              <Trophy className="text-white" size={22} />
            </div>
            <span className="text-2xl font-bold tracking-tighter text-white">geekore</span>
          </div>

          <div className="flex items-center gap-10 text-sm font-medium">
            {navItems.map((item) => {
              const isActive =
                item.href === '/profile/me'
                  ? isProfileActive
                  : pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-2 transition hover:text-violet-400 ${
                    isActive ? 'text-violet-400' : 'text-zinc-400'
                  }`}
                >
                  <item.icon size={20} />
                  {item.label}
                  {item.hasDot && hasNewNotifications && (
                    <span className="absolute -top-1 -right-2 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </Link>
              )
            })}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-xs px-4 py-2 bg-zinc-900 rounded-full border border-zinc-700 text-zinc-400">
              v0.1
            </div>
          </div>
        </div>
      </nav>

      {/* Navbar Mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-2xl border-t border-zinc-800">
        <div className="flex items-center justify-around py-3 px-6">
          {navItems.map((item) => {
            const isActive =
              item.href === '/profile/me'
                ? isProfileActive
                : pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 transition ${
                  isActive ? 'text-violet-400' : 'text-zinc-400'
                }`}
              >
                <div className="relative">
                  <item.icon size={26} strokeWidth={isActive ? 2.5 : 2} />
                  {item.hasDot && hasNewNotifications && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-black" />
                  )}
                </div>
                <span className="text-[10px] font-medium tracking-wide">
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="h-20 md:h-20" />
    </>
  )
}