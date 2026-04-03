'use client';

import Link from 'next/link';
import { Home, Compass, User, Newspaper, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { User as SupabaseUser } from '@supabase/supabase-js';

export default function Navbar() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
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
    window.location.href = '/';
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-2xl border-b border-violet-500/10">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/feed" className="flex items-center gap-3 group">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/50 group-hover:scale-110 transition">
            <span className="text-2xl font-black text-black">G</span>
          </div>
          <span className="text-3xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
            GEEKORE
          </span>
        </Link>

        <div className="flex items-center gap-10 text-sm font-medium">
          <Link href="/feed" className="hover:text-violet-400 transition flex items-center gap-2">
            <Home size={20} /> Feed
          </Link>
          <Link href="/discover" className="hover:text-violet-400 transition flex items-center gap-2">
            <Compass size={20} /> Discover
          </Link>
          <Link href="/news" className="hover:text-violet-400 transition flex items-center gap-2">
            <Newspaper size={20} /> News
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link href="/profile" className="flex items-center gap-3 px-5 py-2 rounded-2xl border border-violet-500/20 hover:border-violet-500 hover:bg-zinc-950 transition">
                <div className="w-8 h-8 bg-zinc-800 rounded-xl flex items-center justify-center">👾</div>
                <span className="font-medium">Profilo</span>
              </Link>
              <button onClick={handleLogout} className="text-zinc-400 hover:text-red-400 p-2 transition">
                <LogOut size={20} />
              </button>
            </>
          ) : (
            <Link href="/" className="bg-violet-600 hover:bg-violet-700 px-6 py-2.5 rounded-2xl font-medium transition">
              Accedi
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}