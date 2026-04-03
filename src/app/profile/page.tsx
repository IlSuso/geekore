'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { Trophy, Clock, Star, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type UserMedia = {
  id: string;
  title: string;
  type: string;
  cover_image?: string;
  current_episode: number;
  status: string;
};

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [mediaList, setMediaList] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUser(user);

      // Prendi profilo utente
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setProfile(profileData);

      // Prendi i media dell'utente
      const { data: mediaData } = await supabase
        .from('user_media_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      setMediaList(mediaData || []);
      setLoading(false);
    };

    fetchProfile();
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center">Caricamento...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-8 pb-20 max-w-6xl mx-auto px-6">
        {/* Banner + Avatar */}
        <div className="relative h-80 rounded-3xl overflow-hidden mb-8 bg-gradient-to-r from-violet-900 to-fuchsia-900">
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute bottom-8 left-8 flex items-end gap-6">
            <div className="w-32 h-32 rounded-2xl overflow-hidden border-4 border-zinc-900">
              <img 
                src={profile?.avatar_url || 'https://via.placeholder.com/128'} 
                alt="Avatar" 
                className="w-full h-full object-cover" 
              />
            </div>
            <div>
              <h1 className="text-4xl font-bold">{profile?.display_name || user?.email?.split('@')[0]}</h1>
              <p className="text-zinc-400">@{profile?.username || 'utente'}</p>
            </div>
          </div>
        </div>

        {/* Statistiche */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <Trophy className="text-yellow-400 mb-4" size={32} />
            <p className="text-4xl font-bold">{mediaList.length}</p>
            <p className="text-zinc-400">Media aggiunti</p>
          </div>
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <Clock className="text-cyan-400 mb-4" size={32} />
            <p className="text-4xl font-bold">124</p>
            <p className="text-zinc-400">Ore guardate</p>
          </div>
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <Star className="text-amber-400 mb-4" size={32} />
            <p className="text-4xl font-bold">8.4</p>
            <p className="text-zinc-400">Media voto</p>
          </div>
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <Users className="text-violet-400 mb-4" size={32} />
            <p className="text-4xl font-bold">12</p>
            <p className="text-zinc-400">Amici</p>
          </div>
        </div>

        {/* I miei progressi */}
        <h2 className="text-3xl font-bold mb-6">I miei progressi</h2>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {mediaList.map((media) => (
            <div key={media.id} className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden">
              <div className="relative h-48 bg-zinc-900">
                {media.cover_image ? (
                  <img src={media.cover_image} alt={media.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl">
                    {media.type === 'anime' || media.type === 'tv' ? '📺' : '🎬'}
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold line-clamp-2 mb-2">{media.title}</h3>
                <p className="text-sm text-zinc-500 capitalize mb-3">{media.type}</p>
                <p className="text-sm text-emerald-400">
                  Episodio {media.current_episode} • {media.status}
                </p>
              </div>
            </div>
          ))}

          {mediaList.length === 0 && (
            <p className="col-span-full text-center text-zinc-500 py-12">
              Non hai ancora aggiunto nulla.<br />Vai su Discover e inizia!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}