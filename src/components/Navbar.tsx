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
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-xl border-b border-violet-500/20">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/feed" className="flex items-center gap-3 group">
          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/50 group-hover:scale-110 transition-transform">
            <span className="text-2xl font-black tracking-tighter text-black">G</span>
          </div>
          <div>
            <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
              GEEKORE
            </span>
          </div>
        </Link>

        {/* Links centrali */}
        <div className="flex items-center gap-8 text-sm font-medium">
          <Link href="/feed" className="flex items-center gap-2 hover:text-violet-400 transition-colors">
            <Home size={20} />
            Feed
          </Link>
          <Link href="/discover" className="flex items-center gap-2 hover:text-violet-400 transition-colors">
            <Compass size={20} />
            Discover
          </Link>
          <Link href="/news" className="flex items-center gap-2 hover:text-violet-400 transition-colors">
            <Newspaper size={20} />
            News
          </Link>
        </div>

        {/* User section */}
        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link 
                href="/profile" 
                className="flex items-center gap-3 hover:bg-zinc-900 px-4 py-2 rounded-2xl transition-all border border-transparent hover:border-violet-500/30"
              >
                <div className="w-8 h-8 bg-zinc-800 rounded-xl flex items-center justify-center text-lg">
                  👾
                </div>
                <span className="font-medium">Profilo</span>
              </Link>

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-zinc-400 hover:text-red-400 transition-colors px-3 py-2"
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <Link href="/auth/login" className="bg-violet-600 hover:bg-violet-700 px-6 py-2 rounded-2xl font-medium transition">
              Accedi
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}