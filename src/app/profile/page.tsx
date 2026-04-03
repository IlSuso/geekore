'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import Navbar from '@/components/Navbar';
import { Trophy, Clock, Target, Star, Edit } from 'lucide-react';

type ProfileData = {
  username: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  steam_id?: string;
};

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/auth/login';
        return;
      }

      setUser(user);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Errore profilo:', error);
      } else {
        setProfile(data);
      }
      setLoading(false);
    };

    fetchProfile();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-6 text-zinc-400">Caricamento profilo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="pt-24 pb-20 max-w-5xl mx-auto px-6">
        {/* Banner di sfondo */}
        <div className="h-64 bg-gradient-to-r from-violet-900 via-fuchsia-900 to-cyan-900 rounded-3xl relative mb-8 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(#ffffff10_1px,transparent_1px)] bg-[length:40px_40px]"></div>
        </div>

        {/* Info Profilo */}
        <div className="relative -mt-16 mb-12 flex flex-col md:flex-row gap-8 items-start">
          <div className="w-40 h-40 rounded-3xl overflow-hidden border-4 border-black bg-zinc-900 ring-2 ring-violet-500/50">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-7xl">
                👾
              </div>
            )}
          </div>

          <div className="flex-1 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-5xl font-bold tracking-tighter">{profile?.display_name || 'Geek'}</h1>
                <p className="text-xl text-violet-400">@{profile?.username}</p>
              </div>
              <button className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 border border-violet-500/30 px-6 py-3 rounded-2xl transition">
                <Edit size={18} />
                Modifica Profilo
              </button>
            </div>

            {profile?.bio && (
              <p className="mt-6 text-zinc-300 text-lg max-w-2xl">{profile.bio}</p>
            )}

            {profile?.steam_id && (
              <p className="mt-3 text-sm text-cyan-400 flex items-center gap-2">
                <span>🎮</span> Steam ID: {profile.steam_id}
              </p>
            )}
          </div>
        </div>

        {/* Statistiche Geek */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
          <div className="bg-zinc-950 border border-violet-500/20 rounded-3xl p-8 hover:border-violet-500/50 transition">
            <Trophy className="w-10 h-10 text-yellow-400 mb-4" />
            <p className="text-4xl font-bold text-white">12</p>
            <p className="text-zinc-400 mt-1">Completati</p>
          </div>

          <div className="bg-zinc-950 border border-violet-500/20 rounded-3xl p-8 hover:border-violet-500/50 transition">
            <Clock className="w-10 h-10 text-cyan-400 mb-4" />
            <p className="text-4xl font-bold text-white">347h</p>
            <p className="text-zinc-400 mt-1">Ore giocate</p>
          </div>

          <div className="bg-zinc-950 border border-violet-500/20 rounded-3xl p-8 hover:border-violet-500/50 transition">
            <Target className="w-10 h-10 text-fuchsia-400 mb-4" />
            <p className="text-4xl font-bold text-white">28</p>
            <p className="text-zinc-400 mt-1">In corso</p>
          </div>

          <div className="bg-zinc-950 border border-violet-500/20 rounded-3xl p-8 hover:border-violet-500/50 transition">
            <Star className="w-10 h-10 text-amber-400 mb-4" />
            <p className="text-4xl font-bold text-white">8.7</p>
            <p className="text-zinc-400 mt-1">Media voti</p>
          </div>
        </div>

        {/* Sezione "I miei progressi recenti" */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-3">
            <span>📊</span> I miei progressi recenti
          </h2>
          <div className="text-center py-16 bg-zinc-950/50 border border-dashed border-zinc-700 rounded-3xl">
            <p className="text-zinc-500">Qui appariranno i tuoi ultimi anime, manga, giochi e serie aggiornati</p>
            <p className="text-sm text-zinc-600 mt-2">(Funzionalità in arrivo nel prossimo passo)</p>
          </div>
        </div>

        {/* I miei post recenti */}
        <div>
          <h2 className="text-3xl font-bold mb-8 flex items-center gap-3">
            <span>📝</span> I miei ultimi post
          </h2>
          <div className="text-center py-16 bg-zinc-950/50 border border-dashed border-zinc-700 rounded-3xl">
            <p className="text-zinc-500">I tuoi post appariranno qui</p>
          </div>
        </div>
      </div>
    </div>
  );
}