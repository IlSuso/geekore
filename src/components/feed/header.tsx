"use client"
import Link from 'next/link'
import { Search, Zap } from 'lucide-react'

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0f]/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-xl mx-auto px-6 h-20 flex items-center justify-between">
        
        {/* Logo Geekore */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="bg-[#7c6af7] p-2 rounded-xl shadow-lg shadow-[#7c6af7]/20 group-hover:scale-110 transition-transform duration-300">
            <Zap size={18} className="text-white fill-white" />
          </div>
          <span className="text-sm font-black uppercase tracking-[0.3em] text-white">
            Geekore
          </span>
        </Link>

        {/* Search Action */}
        <div className="flex items-center gap-3">
          <Link 
            href="/search"
            className="p-2.5 rounded-2xl bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-[#7c6af7]/10 hover:border-[#7c6af7]/30 transition-all active:scale-95"
          >
            <Search size={20} />
          </Link>
        </div>

      </div>
    </header>
  )
}