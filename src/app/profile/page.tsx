'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CheckCircle, RefreshCw } from 'lucide-react';
import SteamConnectButton from '@/components/SteamConnectButton';
import { SteamIcon } from '@/components/icons/SteamIcon';

type UserMedia = {
  id: string;
  title: string;
  type: 'anime' | 'tv' | 'movie' | 'game';
  cover_image?: string;
  current_episode: number;
  episodes?: number;
  updated_at: string;
  is_steam?: boolean;
};

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [steamAccount, setSteamAccount] = useState<any>(null);
  const [mediaList, setMediaList] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingGames, setImportingGames] = useState(false);

  const supabase = createClient();

  // Importa e salva i giochi Steam
  const importSteamGames = async (isAuto = false) => {
    if (!steamAccount?.steam_id64 || importingGames) return;

    setImportingGames(true);
    console.log(isAuto ? "🔄 Auto-import Steam..." : "🔄 Import manuale...");

    try {
      const res = await fetch(`/api/steam/games?steamid=${steamAccount.steam_id64}`);
      const data = await res.json();

      if (data.success && data.games?.length > 0) {
        const steamMedia = data.games.map((game: any) => ({
          user_id: user.id,
          title: game.name,
          type: 'game',
          cover_image: game.img_icon_url || null,
          current_episode: Math.floor(game.playtime_forever / 60),
          is_steam: true,
          updated_at: new Date().toISOString()
        }));

        const { error } = await supabase
          .from('user_media_entries')
          .upsert(steamMedia, { onConflict: 'user_id,title' });

        if (!error) {
          console.log(`✅ ${data.games.length} giochi Steam salvati`);
        }
      }
    } catch (e) {
      console.error("Errore import Steam:", e);
    } finally {
      setImportingGames(false);
      window.location.reload();
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUser(user);

      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(profileData);

      const { data: steamData } = await supabase.from('steam_accounts').select('*').eq('user_id', user.id).single();
      setSteamAccount(steamData);

      const { data: mediaData } = await supabase
        .from('user_media_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      setMediaList(mediaData || []);
      setLoading(false);

      // Import automatico solo se non ci sono ancora giochi Steam
      if (steamData && !mediaData?.some((m: any) => m.is_steam === true)) {
        setTimeout(() => importSteamGames(true), 1200);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white">Caricamento...</div>;
  }

  const grouped = mediaList.reduce((acc: Record<string, UserMedia[]>, item) => {
    const cat = item.type === 'anime' ? 'Anime' :
                item.type === 'tv' ? 'Serie TV' :
                item.type === 'movie' ? 'Film' : 'Videogiochi';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="pt-8 max-w-6xl mx-auto px-6">
        {/* Banner */}
        <div className="relative h-[380px] rounded-3xl overflow-hidden mb-12 bg-gradient-to-br from-violet-950 to-black">
          <div className="absolute bottom-10 left-10 flex items-end gap-8">
            <div className="w-36 h-36 rounded-3xl overflow-hidden border-4 border-zinc-900">
              <img src={profile?.avatar_url || 'https://via.placeholder.com/300'} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-5xl font-bold tracking-tighter">
                {profile?.display_name || user?.email?.split('@')[0]}
              </h1>
              <p className="text-xl text-zinc-400 mt-1">@{profile?.username || 'geek'}</p>
            </div>
          </div>
        </div>

        {/* Sezione Steam */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 mb-12">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <SteamIcon size={32} className="text-[#66C0F4]" />
              <h2 className="text-2xl font-semibold">Account Steam</h2>
            </div>
            {steamAccount && <div className="text-green-400 flex items-center gap-2"><CheckCircle size={20} /> Collegato</div>}
          </div>

          {!steamAccount ? (
            <SteamConnectButton />
          ) : (
            <button
              onClick={() => importSteamGames(false)}
              disabled={importingGames}
              className="w-full flex items-center justify-center gap-3 bg-[#1B2838] hover:bg-[#2a475e] border border-[#66C0F4] py-4 rounded-2xl font-medium transition"
            >
              <RefreshCw size={20} className={importingGames ? 'animate-spin' : ''} />
              {importingGames ? 'Aggiornamento in corso...' : 'Aggiorna giochi da Steam'}
            </button>
          )}
        </div>

        <h2 className="text-4xl font-bold tracking-tight mb-10">I miei progressi</h2>

        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-20 text-zinc-500">
            Non hai ancora nulla. Collega Steam o aggiungi media.
          </div>
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-16">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-semibold">{category}</h3>
                <p className="text-zinc-500">{items.length} elementi</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {items.map((media) => (
                  <div key={media.id} className="group relative bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden hover:border-violet-500/50 transition">
                    {/* Bollino Steam ultra-minimo */}
{media.is_steam && (
  <div className="absolute top-3 right-3 z-20 bg-[#171D25] p-[2px] rounded-full shadow-md border border-[#66C0F4]/40">
    <SteamIcon 
      size={19} 
      className="text-white" 
    />
  </div>
)}

                    <div className="relative h-56 bg-zinc-900">
                      {media.cover_image ? (
                        <img src={media.cover_image} alt={media.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-7xl bg-zinc-800">🎮</div>
                      )}
                    </div>

                    <div className="p-6">
                      <h4 className="font-semibold line-clamp-2 mb-2">{media.title}</h4>
                      <p className="text-emerald-400 text-sm">
                        {media.type === 'game' 
                          ? `${media.current_episode} ore giocate` 
                          : `Ep. ${media.current_episode}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}