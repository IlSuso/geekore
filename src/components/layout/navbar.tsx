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
    // 1. Controlla se ci sono notifiche non lette all'avvio
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

    // 2. Realtime: Ascolta se arrivano NUOVE notifiche
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => setHasNotifications(true)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] bg-[#0a0a0f]/80 backdrop-blur-xl border-t border-white/5 px-6 py-4 md:top-0 md:bottom-auto md:border-b md:border-t-0">
      <div className="max-w-5xl mx-auto flex justify-between items-center">
        
        {/* Logo (Solo Desktop) */}
        <Link href="/" className="hidden md:block text-2xl font-black text-white italic tracking-tighter hover:scale-105 transition-transform">
          GEEK<span className="text-[#7c6af7]">ORE</span>
        </Link>

        {/* Menu Items */}
        <div className="flex justify-around w-full md:w-auto md:gap-8 items-center">
          <Link href="/" className="p-2 text-gray-500 hover:text-white transition-colors">
            <Home size={24} />
          </Link>
          
          <Link href="/search" className="p-2 text-gray-500 hover:text-white transition-colors">
            <Search size={24} />
          </Link>

          {/* Tasto Centrale "Drop" */}
          <Link href="/upload" className="bg-gradient-to-tr from-[#7c6af7] to-[#ff4d4d] p-3 rounded-2xl shadow-lg shadow-[#7c6af7]/20 hover:scale-110 active:scale-95 transition-all mx-2">
            <PlusSquare size={24} className="text-white" />
          </Link>

          {/* NOTIFICHE con Pallino Rosso */}
          <Link href="/notifications" className="p-2 text-gray-500 hover:text-white transition-colors relative group">
            <Bell size={24} />
            {hasNotifications && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[#ff4d4d] border-2 border-[#0a0a0f] rounded-full animate-pulse group-hover:scale-125 transition-transform" />
            )}
          </Link>

          <Link href="/profile" className="p-2 text-gray-500 hover:text-white transition-colors">
            <User size={24} />
          </Link>
        </div>

      </div>
    </nav>
  )
}