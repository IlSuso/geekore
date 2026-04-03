"use client"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, User, Home, PlusSquare, Search } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

export function Navbar() {
  const [hasNotifications, setHasNotifications] = useState(false)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const checkNotifications = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', session.user.id)
        .eq('is_read', false)

      setHasNotifications(Number(count) > 0)
    }
    checkNotifications()

    const channel = supabase
      .channel('realtime-notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        setHasNotifications(true)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[999] w-full bg-[#0a0a0f]/90 backdrop-blur-md border-t border-white/5 md:top-0 md:bottom-auto md:border-b md:border-t-0">
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        
        {/* LATO SINISTRO: LOGO (Solo Desktop) */}
        <div className="hidden md:flex items-center flex-1">
          <Link href="/" className="text-2xl font-black text-white italic tracking-tighter hover:opacity-80 transition-opacity">
            GEEK<span className="text-[#7c6af7]">ORE</span>
          </Link>
        </div>

        {/* CENTRO/DESTRA: ICONE (Mobile occupa tutto, Desktop sta a destra) */}
        <div className="flex items-center justify-around w-full md:w-auto md:gap-4 lg:gap-8">
          
          <Link href="/" className="p-3 text-gray-500 hover:text-white transition-all">
            <Home size={26} />
          </Link>
          
          <Link href="/search" className="p-3 text-gray-500 hover:text-white transition-all">
            <Search size={26} />
          </Link>

          {/* PULSANTE UPLOAD (Sempre centrale/evidente) */}
          <Link href="/upload" className="mx-2 bg-gradient-to-tr from-[#7c6af7] to-[#ff4d4d] p-3 rounded-2xl shadow-lg shadow-[#7c6af7]/20 hover:scale-110 active:scale-95 transition-all text-white">
            <PlusSquare size={26} />
          </Link>

          <Link href="/notifications" className="p-3 text-gray-500 hover:text-white transition-all relative">
            <Bell size={26} />
            {hasNotifications && (
              <span className="absolute top-3 right-3 w-3 h-3 bg-[#ff4d4d] border-2 border-[#0a0a0f] rounded-full animate-pulse" />
            )}
          </Link>

          <Link href="/profile" className="p-3 text-gray-500 hover:text-white transition-all">
            <User size={26} />
          </Link>
          
        </div>

        {/* SPACER PER DESKTOP (Per bilanciare il logo a sinistra) */}
        <div className="hidden md:flex flex-1 justify-end">
           {/* Vuoto, serve solo a mantenere le icone centrate o spostate correttamente */}
        </div>

      </div>
    </nav>
  )
}