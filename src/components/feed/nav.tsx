"use client"
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, PlusSquare, User, Ghost } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

export function Nav() {
  const pathname = usePathname()
  const [hasNewNotifications, setHasNewNotifications] = useState(false)
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const isActive = (path: string) => pathname === path

  useEffect(() => {
    // Reset se siamo già sulla pagina
    if (pathname === '/notifications') {
      setHasNewNotifications(false)
    }

    const checkNotifications = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false)
      
      if (count && count > 0) setHasNewNotifications(true)
    }

    checkNotifications()
    
    // Check ogni 60 secondi (opzionale)
    const interval = setInterval(checkNotifications, 60000)
    return () => clearInterval(interval)
  }, [pathname, supabase])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] px-4 pb-8 pointer-events-none">
      {/* Sfumatura di fondo migliorata */}
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/90 to-transparent pointer-events-none" />
      
      <div className="relative z-[110] max-w-lg mx-auto bg-[#16161e]/85 backdrop-blur-2xl border border-white/10 rounded-[2.8rem] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)] pointer-events-auto">
        <div className="flex items-center justify-between px-3">
          
          <Link href="/" className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${isActive('/') ? 'text-[#7c6af7] scale-110' : 'text-gray-500 hover:text-gray-300'}`}>
            <Home size={22} strokeWidth={isActive('/') ? 2.5 : 2} />
            <span className="text-[7px] font-black uppercase tracking-widest">Arena</span>
          </Link>

          <Link href="/search" className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${isActive('/search') ? 'text-[#7c6af7] scale-110' : 'text-gray-500 hover:text-gray-300'}`}>
            <Search size={22} strokeWidth={isActive('/search') ? 2.5 : 2} />
            <span className="text-[7px] font-black uppercase tracking-widest">Scanner</span>
          </Link>

          {/* Plus Button Centralizzato */}
          <Link href="/dashboard" className="relative -mt-14 bg-[#7c6af7] p-5 rounded-[2.2rem] text-white border-[8px] border-[#0a0a0f] shadow-2xl shadow-[#7c6af7]/40 hover:scale-110 active:scale-90 transition-all duration-300 group">
            <PlusSquare size={28} className="group-hover:rotate-90 transition-transform duration-500" />
          </Link>

          {/* IL GHOST POTENZIATO */}
          <Link href="/notifications" className={`flex flex-col items-center gap-1.5 relative transition-all duration-300 ${isActive('/notifications') ? 'text-[#7c6af7] scale-110' : 'text-gray-500 hover:text-gray-300'}`}>
            {hasNewNotifications && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#16161e] animate-ping" />
            )}
            {hasNewNotifications && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#16161e]" />
            )}
            <Ghost 
              size={22} 
              strokeWidth={isActive('/notifications') ? 2.5 : 2}
              className={isActive('/notifications') ? "drop-shadow-[0_0_8px_rgba(124,106,247,0.8)]" : ""} 
            />
            <span className="text-[7px] font-black uppercase tracking-widest">Attività</span>
          </Link>

          <Link href="/profile" className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${isActive('/profile') ? 'text-[#7c6af7] scale-110' : 'text-gray-500 hover:text-gray-300'}`}>
            <User size={22} strokeWidth={isActive('/profile') ? 2.5 : 2} />
            <span className="text-[7px] font-black uppercase tracking-widest">Profilo</span>
          </Link>

        </div>
      </div>
    </nav>
  )
}