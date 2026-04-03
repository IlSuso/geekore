'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/Navbar';
import { Trophy, Clock, Target, Star } from 'lucide-react';

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/';
        return;
      }

      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(data);
      setLoading(false);
    };
    fetchProfile();
  }, []);

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center"><div className="animate-spin w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="pt-24 pb-20 max-w-5xl mx-auto px-6">
        <div className="h-64 bg-gradient-to-r from-violet-900 via-fuchsia-900 to-cyan-900 rounded-3xl relative mb-8" />

        <div className="relative -mt-20 flex flex-col md:flex-row gap-10">
          <div className="w-40 h-40 rounded-3xl overflow-hidden border-4 border-black ring-4 ring-violet-500/50">
            <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-8xl">👾</div>
          </div>

          <div className="flex-1 pt-8">
            <h1 className="text-5xl font-bold tracking-tighter">{profile?.display_name || 'Geek User'}</h1>
            <p className="text-2xl text-violet-400">@{profile?.username}</p>
            {profile?.bio && <p className="mt-6 text-lg text-zinc-300 max-w-2xl">{profile.bio}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-16">
          <div className="bg-zinc-950 border border-violet-500/20 rounded-3xl p-8">
            <Trophy className="w-10 h-10 text-yellow-400 mb-4" />
            <p className="text-5xl font-bold">12</p>
            <p className="text-zinc-400">Completati</p>
          </div>
          <div className="bg-zinc-950 border border-violet-500/20 rounded-3xl p-8">
            <Clock className="w-10 h-10 text-cyan-400 mb-4" />
            <p className="text-5xl font-bold">347h</p>
            <p className="text-zinc-400">Ore giocate</p>
          </div>
          <div className="bg-zinc-950 border border-violet-500/20 rounded-3xl p-8">
            <Target className="w-10 h-10 text-fuchsia-400 mb-4" />
            <p className="text-5xl font-bold">28</p>
            <p className="text-zinc-400">In corso</p>
          </div>
          <div className="bg-zinc-950 border border-violet-500/20 rounded-3xl p-8">
            <Star className="w-10 h-10 text-amber-400 mb-4" />
            <p className="text-5xl font-bold">8.7</p>
            <p className="text-zinc-400">Media voti</p>
          </div>
        </div>

        <div className="mt-16">
          <h2 className="text-3xl font-bold mb-8">I miei progressi</h2>
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-12 text-center">
            <p className="text-zinc-500">Sezione progressi in arrivo (user_media_entries)</p>
          </div>
        </div>
      </div>
    </div>
  );
}