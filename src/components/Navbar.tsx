'use client';

import Link from 'next/link';
import { Home, Compass, User, Newspaper, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

export default function Navbar() {
  const [user, setUser] = useState<any>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/feed';
  };

  return (
    <>
      {/* NAVBAR DESKTOP - In alto */}
      <nav className="hidden md:block fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-2xl border-b border-zinc-800 h-16">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <Link href="/feed" className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 rounded-2xl flex items-center justify-center">
              <span className="text-2xl font-black text-black">G</span>
            </div>
            <span className="text-3xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
              GEEKORE
            </span>
          </Link>

          <div className="flex gap-10 text-sm font-medium">
            <Link href="/feed" className="hover:text-violet-400 transition">Feed</Link>
            <Link href="/discover" className="hover:text-violet-400 transition">Discover</Link>
            <Link href="/news" className="hover:text-violet-400 transition">News</Link>
          </div>

          <div className="flex items-center gap-4">
            {user ? (
              <Link href="/profile" className="flex items-center gap-3 px-5 py-2 rounded-2xl hover:bg-zinc-900 border border-zinc-700 hover:border-violet-500">
                <div className="w-8 h-8 bg-zinc-800 rounded-xl flex items-center justify-center text-lg">👾</div>
                <span>Profilo</span>
              </Link>
            ) : (
              <Link href="/feed" className="bg-violet-600 hover:bg-violet-700 px-6 py-2.5 rounded-2xl font-medium">
                Accedi
              </Link>
            )}
            {user && (
              <button onClick={handleLogout} className="text-zinc-400 hover:text-red-400">
                <LogOut size={20} />
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* NAVBAR MOBILE - In basso */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-2xl border-t border-zinc-800 h-16 safe-area-inset-bottom">
        <div className="flex items-center justify-around h-full px-4 text-xs font-medium">
          <Link href="/feed" className="flex flex-col items-center text-violet-400 active:text-violet-300">
            <Home size={26} />
            <span className="mt-0.5">Feed</span>
          </Link>
          <Link href="/discover" className="flex flex-col items-center text-zinc-400 active:text-white">
            <Compass size={26} />
            <span className="mt-0.5">Discover</span>
          </Link>
          <Link href="/news" className="flex flex-col items-center text-zinc-400 active:text-white">
            <Newspaper size={26} />
            <span className="mt-0.5">News</span>
          </Link>
          <Link href="/profile" className="flex flex-col items-center text-zinc-400 active:text-white">
            <div className="w-7 h-7 bg-zinc-700 rounded-full flex items-center justify-center text-xl">👾</div>
            <span className="mt-0.5">Io</span>
          </Link>
        </div>
      </nav>
    </>
  );
}