'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Search, Rss, Bell, User, Zap, LogOut, Newspaper } from 'lucide-react'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/feed',          label: 'Home',      icon: Home   },
  { href: '/discover',      label: 'Discover',  icon: Search },
  { href: '/news',          label: 'News',      icon: Newspaper },
  { href: '/notifications', label: 'Notifiche', icon: Bell, hasDot: true },
  { href: '/profile/me',    label: 'Profilo',   icon: User   },
]

const AUTH_PATHS = ['/login', '/register', '/auth/confirm']

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [hasNewNotifications, setHasNewNotifications] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isProfileActive = pathname === '/profile/me' || pathname.startsWith('/profile/')
  const isAuthPage = AUTH_PATHS.some(p => pathname.startsWith(p))

  useEffect(() => {
    if (pathname === '/notifications') setHasNewNotifications(false)
  }, [pathname])

  useEffect(() => {
    if (isAuthPage) return
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return

      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false)
        .then(({ count }) => { if (count && count > 0) setHasNewNotifications(true) })

      channel = supabase
        .channel('navbar-notifications')
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'notifications',
          filter: `receiver_id=eq.${user.id}`,
        }, () => setHasNewNotifications(true))
        .subscribe()
    })

    return () => { if (channel) supabase.removeChannel(channel) }
  }, [isAuthPage])

  // Hide on auth pages
  if (isAuthPage) return null

  return (
    <>
      {/* Desktop navbar */}
      <nav className="hidden md:flex fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-2xl border-b border-zinc-800/60">
        <div className="max-w-6xl mx-auto w-full px-6 py-4 flex items-center justify-between">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center shadow-md shadow-violet-500/30 group-hover:scale-105 transition-transform">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tighter text-white">geekore</span>
          </Link>

          {/* Nav items */}
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === '/profile/me'
                ? isProfileActive
                : item.href === '/feed'
                  ? pathname === '/feed' || pathname === '/'
                  : pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-violet-500/10 text-violet-400'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                  }`}
                >
                  <item.icon size={18} />
                  {item.label}
                  {item.hasDot && hasNewNotifications && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                  )}
                </Link>
              )
            })}
          </div>

          <button
            onClick={handleLogout}
            aria-label="Logout"
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </nav>

      {/* Mobile bottom navbar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-2xl border-t border-zinc-800/60">
        <div className="flex items-center justify-around py-2 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/profile/me' ? isProfileActive : pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all ${
                  isActive ? 'text-violet-400' : 'text-zinc-500'
                }`}
              >
                <div className="relative">
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                  {item.hasDot && hasNewNotifications && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-black" />
                  )}
                </div>
                {isActive && (
                  <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="h-16" />
    </>
  )
}
