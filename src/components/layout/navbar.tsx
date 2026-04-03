"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, PlusSquare, Bell, User, Zap, Trophy, Ghost } from 'lucide-react'
import { useState, useEffect } from 'react'

export function Navbar() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)

  // Effetto per rendere la navbar più solida quando si scende col mouse (solo PC)
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Funzione per capire se un link è attivo e colorarlo
  const isActive = (path: string) => pathname === path

  return (
    <nav className={`fixed bottom-0 md:top-0 left-0 w-full z-[999] transition-all duration-300 
      ${scrolled ? 'md:h-16 md:bg-[#0a0a0f]/95 md:border-b' : 'md:h-20 md:bg-transparent'} 
      bg-[#0a0a0f]/90 backdrop-blur-xl border-t md:border-t-0 border-white/5 h-20`}>
      
      <div className="h-full max-w-5xl mx-auto px-6 flex items-center justify-between">
        
        {/* --- LOGO (Solo PC) --- */}
        <div className="hidden md:flex items-center w-[200px] group">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#7c6af7] rounded-lg flex items-center justify-center rotate-3 group-hover:rotate-12 transition-transform shadow-lg shadow-[#7c6af7]/20">
              <Ghost size={20} className="text-white" />
            </div>
            <span className="text-xl font-black text-white italic tracking-tighter group-hover:tracking-normal transition-all">
              GEEK<span className="text-[#7c6af7]">ORE</span>
            </span>
          </Link>
        </div>

        {/* --- NAVIGAZIONE CENTRALE (Mobile e PC) --- */}
        <div className="flex flex-1 justify-around md:justify-center md:gap-8 items-center h-full">
          
          {/* HOME */}
          <Link href="/" className={`p-2 transition-all flex flex-col items-center gap-1 group
            ${isActive('/') ? 'text-[#7c6af7] scale-110' : 'text-gray-500 hover:text-white'}`}>
            <Home size={24} strokeWidth={isActive('/') ? 2.5 : 2} />
            <span className="text-[8px] font-black uppercase tracking-widest md:hidden">Home</span>
          </Link>

          {/* SEARCH */}
          <Link href="/search" className={`p-2 transition-all flex flex-col items-center gap-1
            ${isActive('/search') ? 'text-[#7c6af7] scale-110' : 'text-gray-500 hover:text-white'}`}>
            <Search size={24} strokeWidth={isActive('/search') ? 2.5 : 2} />
            <span className="text-[8px] font-black uppercase tracking-widest md:hidden">Cerca</span>
          </Link>

          {/* ADD DROP (Bottone Centrale) */}
          <Link href="/upload" className="group relative">
            <div className="bg-gradient-to-tr from-[#7c6af7] to-[#ff4d4d] p-3.5 rounded-2xl text-white shadow-xl shadow-[#7c6af7]/30 group-hover:scale-110 group-active:scale-90 transition-all border border-white/20">
              <PlusSquare size={24} />
            </div>
          </Link>

          {/* NEWS FLASH (Il nuovo cuore Nerd) */}
          <Link href="/news" className={`p-2 transition-all flex flex-col items-center gap-1 group relative
            ${isActive('/news') ? 'text-[#ffb800] scale-110' : 'text-gray-500 hover:text-white'}`}>
            <Zap size={24} fill={isActive('/news') ? "currentColor" : "none"} strokeWidth={2.5} />
            <span className="text-[8px] font-black uppercase tracking-widest md:hidden">News</span>
            {/* Tooltip PC */}
            <span className="hidden md:block absolute -top-10 left-1/2 -translate-x-1/2 bg-[#ffb800] text-black text-[9px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">FLASH</span>
          </Link>

          {/* NOTIFICHE */}
          <Link href="/notifications" className={`p-2 transition-all flex flex-col items-center gap-1 relative
            ${isActive('/notifications') ? 'text-[#7c6af7] scale-110' : 'text-gray-500 hover:text-white'}`}>
            <Bell size={24} strokeWidth={isActive('/notifications') ? 2.5 : 2} />
            <span className="text-[8px] font-black uppercase tracking-widest md:hidden">Alert</span>
            {/* Indicatore puntino (Simulato) */}
            <span className="absolute top-2 right-2 w-2 h-2 bg-[#ff4d4d] rounded-full border border-[#0a0a0f]" />
          </Link>

          {/* PROFILO */}
          <Link href="/profile" className={`p-2 transition-all flex flex-col items-center gap-1
            ${isActive('/profile') ? 'text-[#7c6af7] scale-110' : 'text-gray-500 hover:text-white'}`}>
            <User size={24} strokeWidth={isActive('/profile') ? 2.5 : 2} />
            <span className="text-[8px] font-black uppercase tracking-widest md:hidden">Me</span>
          </Link>

        </div>

        {/* --- RANKING INDICATOR (Solo PC) --- */}
        <div className="hidden md:flex items-center justify-end w-[200px] gap-3">
          <div className="text-right">
            <p className="text-[10px] text-gray-500 font-black uppercase leading-none">Rank</p>
            <p className="text-sm text-white font-black italic tracking-tighter">ELITE NERD</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#ffb800]">
            <Trophy size={20} />
          </div>
        </div>

      </div>
    </nav>
  )
}