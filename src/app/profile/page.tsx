'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { Trophy, Clock, Star, Users, Trash2, Edit3 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type UserMedia = {
  id: string;
  title: string;
  type: string;
  cover_image?: string;
  current_episode: number;
  status: string;
  episodes?: number;        // ← massimale
};

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [mediaList, setMediaList] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newEpisode, setNewEpisode] = useState<number>(1);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUser(user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setProfile(profileData);

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

  const getDisplayStatus = (media: UserMedia) => {
    if (media.type === 'movie' || media.type === 'game') {
      return '';
    }

    const total = media.episodes ? ` / ${media.episodes}` : '';
    if (media.episodes && media.current_episode >= media.episodes) {
      return '✅ Completato';
    }

    return `Episodio ${media.current_episode}${total}`;
  };

  const startEditing = (media: UserMedia) => {
    setEditingId(media.id);
    setNewEpisode(media.current_episode);
  };

  const saveEdit = async (id: string) => {
    const media = mediaList.find(m => m.id === id);
    if (!media) return;

    const finalEpisode = media.episodes ? Math.min(newEpisode, media.episodes) : newEpisode;

    const { error } = await supabase
      .from('user_media_entries')
      .update({
        current_episode: finalEpisode,
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (!error) {
      setMediaList(prev =>
        prev.map(item =>
          item.id === id ? { ...item, current_episode: finalEpisode } : item
        )
      );
      setEditingId(null);
    } else {
      alert("Errore durante il salvataggio");
    }
  };

  const requestDelete = (id: string) => {
    setShowDeleteConfirm(id);
  };

  const confirmDelete = async (id: string) => {
    const { error } = await supabase
      .from('user_media_entries')
      .delete()
      .eq('id', id);

    if (!error) {
      setMediaList(prev => prev.filter(item => item.id !== id));
    } else {
      alert("Errore durante l'eliminazione");
    }
    setShowDeleteConfirm(null);
  };

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white">Caricamento...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="pt-8 max-w-6xl mx-auto px-6">
        {/* Banner */}
        <div className="relative h-[380px] rounded-3xl overflow-hidden mb-12 bg-gradient-to-br from-violet-950 via-fuchsia-950 to-black border border-violet-500/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#ffffff08_0%,transparent_70%)]" />
          <div className="absolute bottom-10 left-10 flex items-end gap-8">
            <div className="w-36 h-36 rounded-3xl overflow-hidden border-4 border-zinc-900 shadow-2xl ring-1 ring-violet-500/30">
              <img 
                src={profile?.avatar_url || 'https://via.placeholder.com/300'} 
                alt="Avatar" 
                className="w-full h-full object-cover" 
              />
            </div>
            <div>
              <h1 className="text-5xl font-bold tracking-tighter">{profile?.display_name || user?.email?.split('@')[0]}</h1>
              <p className="text-xl text-zinc-400 mt-1">@{profile?.username || 'geek'}</p>
            </div>
          </div>
        </div>

        {/* Statistiche */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
          {[
            { icon: Trophy, color: 'text-yellow-400', label: 'Media', value: mediaList.length },
            { icon: Clock, color: 'text-cyan-400', label: 'Ore guardate', value: '142' },
            { icon: Star, color: 'text-amber-400', label: 'Media voto', value: '8.4' },
            { icon: Users, color: 'text-violet-400', label: 'Amici', value: '18' },
          ].map((s, i) => (
            <div key={i} className="bg-zinc-900/70 backdrop-blur-xl border border-zinc-700 rounded-3xl p-8 hover:border-violet-500/30 transition-all">
              <s.icon className={`${s.color} mb-6`} size={34} />
              <p className="text-5xl font-bold tracking-tighter mb-1">{s.value}</p>
              <p className="text-zinc-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Progressi */}
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-4xl font-bold tracking-tight">I miei progressi</h2>
          <p className="text-zinc-500">{mediaList.length} elementi</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {mediaList.map((media) => (
            <div 
              key={media.id} 
              className="group bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden hover:border-violet-500/50 transition-all hover:-translate-y-1"
            >
              <div className="relative h-56 bg-zinc-900">
                {media.cover_image ? (
                  <img src={media.cover_image} alt={media.title} className="w-full h-full object-cover transition-transform group-hover:scale-[1.03]" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-7xl bg-zinc-800">
                    {media.type === 'game' ? '🎮' : media.type === 'anime' || media.type === 'tv' ? '📺' : '📖'}
                  </div>
                )}
              </div>

              <div className="p-6">
                <h3 className="font-semibold line-clamp-2 text-lg leading-tight mb-3">{media.title}</h3>
                <p className="text-sm text-zinc-500 capitalize mb-4">{media.type}</p>

                <div className="text-emerald-400 text-sm font-medium mb-6 min-h-[1.25rem]">
                  {getDisplayStatus(media)}
                </div>

                <div className="flex gap-3">
                  {(media.type === 'anime' || media.type === 'tv') && (
                    <button
                      onClick={() => startEditing(media)}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-zinc-900 hover:bg-violet-600 rounded-2xl text-sm border border-zinc-700 hover:border-violet-500 transition"
                    >
                      <Edit3 size={16} /> Modifica
                    </button>
                  )}

                  <button
                    onClick={() => requestDelete(media.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-950 hover:bg-red-600 rounded-2xl text-sm border border-red-900/50 hover:border-red-500 transition"
                  >
                    <Trash2 size={16} /> Elimina
                  </button>
                </div>
              </div>
            </div>
          ))}

          {mediaList.length === 0 && (
            <div className="col-span-full text-center py-20 text-zinc-500">
              Non hai ancora aggiunto nulla.<br />
              Vai su <span className="text-violet-400">Discover</span> per iniziare!
            </div>
          )}
        </div>
      </div>

      {/* Modal Modifica senza freccette */}
      {editingId && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-6">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-md w-full p-8">
            <h3 className="text-2xl font-semibold mb-8">Modifica progresso</h3>

            <div className="mb-8">
              <label className="text-sm text-zinc-400 block mb-2">Episodio attuale</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={newEpisode}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setNewEpisode(val === '' ? 1 : parseInt(val));
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-6 py-5 text-4xl text-center focus:border-violet-500 focus:outline-none appearance-none"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setEditingId(null)}
                className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition text-sm"
              >
                Annulla
              </button>
              <button
                onClick={() => saveEdit(editingId)}
                className="flex-1 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-2xl font-semibold transition hover:brightness-110"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conferma Elimina integrata */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-6">
          <div className="bg-zinc-900 border border-red-500/30 rounded-3xl max-w-sm w-full p-8 text-center">
            <Trash2 className="mx-auto text-red-500 mb-6" size={48} />
            <h3 className="text-xl font-semibold mb-2">Elimina elemento?</h3>
            <p className="text-zinc-400 mb-8">Questa azione non può essere annullata.</p>

            <div className="flex gap-4">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition"
              >
                Annulla
              </button>
              <button
                onClick={() => confirmDelete(showDeleteConfirm)}
                className="flex-1 py-4 bg-red-600 hover:bg-red-700 rounded-2xl font-semibold transition"
              >
                Sì, elimina
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}