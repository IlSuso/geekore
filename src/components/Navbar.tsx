'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, PlusCircle, User, Trophy } from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/discover', label: 'Discover', icon: Search },
    { href: '/feed', label: 'Feed', icon: PlusCircle },
    { href: '/profile', label: 'Profilo', icon: User },
  ];

  return (
    <>
      {/* Navbar Desktop - in alto */}
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
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 transition hover:text-violet-400 ${isActive ? 'text-violet-400' : 'text-zinc-400'}`}
                >
                  <item.icon size={20} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <div className="text-xs px-4 py-2 bg-zinc-900 rounded-full border border-zinc-700 text-zinc-400">
              v0.1
            </div>
          </div>
        </div>
      </nav>

      {/* Navbar Mobile - in basso (a prova di pollice) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-2xl border-t border-zinc-800">
        <div className="flex items-center justify-around py-3 px-6">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 transition ${isActive ? 'text-violet-400' : 'text-zinc-400'}`}
              >
                <item.icon size={26} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Spazio per compensare la navbar fissa */}
      <div className="h-20 md:h-20" />
    </>
  );
}