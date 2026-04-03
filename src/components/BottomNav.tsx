"use client"
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Newspaper, Search, User, Bell } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'HOME', icon: Home, href: '/' },
  { label: 'NEWS', icon: Newspaper, href: '/news' },
  { label: 'NOTIFY', icon: Bell, href: '/notifications' }, // PUNTA ALLA TUA CARTELLA
  { label: 'SEARCH', icon: Search, href: '/search' },
  { label: 'ME', icon: User, href: '/profile' },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-md bg-black/60 backdrop-blur-2xl border border-white/10 rounded-[3rem] py-4 px-6 z-[100] shadow-2xl shadow-purple-500/10">
      <div className="flex justify-between items-center">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link key={item.label} href={item.href} className="flex flex-col items-center gap-1 group">
              <item.icon 
                size={20} 
                className={isActive ? "text-[#7c6af7]" : "text-gray-500 group-hover:text-white transition-all duration-300"} 
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className={`text-[7px] font-black tracking-tighter ${isActive ? "text-[#7c6af7]" : "text-gray-500"}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}