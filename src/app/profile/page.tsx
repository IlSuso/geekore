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
  appid?: string;
};

// Determina se l'immagine è orizzontale (header/capsule) o verticale (library portrait).
// Le immagini orizzontali vanno mostrate con object-contain per non zoomare.
function isHorizontalSteamImage(url?: string): boolean {
  if (!url) return false;
  return (
    url.includes('header.jpg') ||
    url.includes('capsule_231x87') ||
    url.includes('capsule_616x353') ||
    // header_image della Store API contiene "header" nell'URL
    (url.includes('steampowered.com') && url.includes('header'))
  );
}

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [steamAccount, setSteamAccount] = useState<any>(null);
  const [mediaList, setMediaList] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingGames, setImportingGames] = useState(false);

  const supabase = createClient();

  const refreshMediaList = async (userId: string) => {
    const { data } = await supabase
      .from('user_media_entries')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    setMediaList(data || []);
  };

  const importSteamGames = async (
    steamId?: string,
    userId?: string,
    skipIfExists = false
  ) => {
    const resolvedSteamId = steamId ?? steamAccount?.steam_id64;
    const resolvedUserId = userId ?? user?.id;

    if (!resolvedSteamId || !resolvedUserId || importingGames) return;

    if (skipIfExists) {
      const { count } = await supabase
        .from('user_media_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', resolvedUserId)
        .eq('is_steam', true);

      if ((count ?? 0) > 0) {
        console.log('Giochi Steam già presenti, skip auto-import.');
        return;
      }
    }

    setImportingGames(true);

    try {
      const res = await fetch(`/api/steam/games?steamid=${resolvedSteamId}`);
      const data = await res.json();

      if (!data.success || !data.games?.length) {
        console.error('Nessun gioco trovato o errore API:', data.error);
        return;
      }

      const steamMedia = data.games.map((game: any) => ({
        user_id: resolvedUserId,
        title: game.name,
        type: 'game',
        appid: String(game.appid),
        cover_image: game.cover_image ?? null,
        current_episode: Math.floor(game.playtime_forever / 60),
        is_steam: true,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('user_media_entries')
        .upsert(steamMedia, { onConflict: 'user_id,title' });

      if (error) {
        console.error('Errore upsert Supabase:', error.code, error.message, error.details);
        return;
      }

      await refreshMediaList(resolvedUserId);
    } catch (e) {
      console.error('Error importing Steam games:', e);
    } finally {
      setImportingGames(false);
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

      const [profileRes, steamRes, mediaRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('steam_accounts').select('*').eq('user_id', user.id).single(),
        supabase
          .from('user_media_entries')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false }),
      ]);

      setProfile(profileRes.data);
      setSteamAccount(steamRes.data);
      setMediaList(mediaRes.data || []);
      setLoading(false);

      if (steamRes.data?.steam_id64) {
        importSteamGames(steamRes.data.steam_id64, user.id, true);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        Caricamento...
      </div>
    );
  }

  const grouped = mediaList.reduce((acc: Record<string, UserMedia[]>, item) => {
    const cat =
      item.type === 'anime' ? 'Anime' :
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
              <img
                src={profile?.avatar_url || 'https://via.placeholder.com/300'}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-5xl font-bold tracking-tighter">
                {profile?.display_name || user?.email?.split('@')[0]}
              </h1>
              <p className="text-xl text-zinc-400 mt-1">
                @{profile?.username || 'geek'}
              </p>
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
            {steamAccount && (
              <div className="text-green-400 flex items-center gap-2">
                <CheckCircle size={20} /> Collegato
              </div>
            )}
          </div>

          {steamAccount && (
            <button
              onClick={() => importSteamGames()}
              disabled={importingGames}
              className="w-full flex items-center justify-center gap-3 bg-[#1B2838] hover:bg-[#2a475e] border border-[#66C0F4] py-4 rounded-2xl font-medium transition"
            >
              <RefreshCw size={20} className={importingGames ? 'animate-spin' : ''} />
              {importingGames ? 'Aggiornamento...' : 'Aggiorna giochi da Steam'}
            </button>
          )}
        </div>

        <h2 className="text-4xl font-bold tracking-tight mb-10">I miei progressi</h2>

        {Object.keys(grouped).length === 0 ? (
          <div className="text-center py-20 text-zinc-500">Non hai ancora nulla.</div>
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-16">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-semibold">{category}</h3>
                <p className="text-zinc-500">{items.length} elementi</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {items.map((media) => {
                  const imageUrl =
                    media.cover_image ||
                    (media.appid
                      ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${media.appid}/header.jpg`
                      : undefined);

                  // Le immagini orizzontali (header) usano object-contain per non zoomare,
                  // quelle verticali (library portrait) usano object-cover come prima.
                  const isHorizontal = isHorizontalSteamImage(imageUrl);

                  return (
                    <div
                      key={media.id}
                      className="group relative bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden hover:border-violet-500/50 transition"
                    >
                      {media.is_steam && (
                        <div className="absolute top-3 right-3 z-20 bg-[#171D25] p-[3px] rounded-full shadow-lg border border-[#66C0F4]/50">
                          <SteamIcon size={16} className="text-white" />
                        </div>
                      )}

                      <div className="relative h-72 bg-zinc-900">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={media.title}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            onError={(e) => {
                              const img = e.target as HTMLImageElement;
                              img.onerror = null;
                              img.src = `https://via.placeholder.com/600x900/27272a/ffffff?text=${encodeURIComponent(
                                media.title.substring(0, 12)
                              )}`;
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 text-white">
                            <span className="text-7xl mb-3">🎮</span>
                            <p className="text-sm font-medium text-center px-6">{media.title}</p>
                          </div>
                        )}
                      </div>

                      <div className="p-6">
                        <h4 className="font-semibold line-clamp-2 mb-1">{media.title}</h4>
                        <p className="text-emerald-400 text-sm">
                          {media.type === 'game'
                            ? `${media.current_episode} ore`
                            : `Ep. ${media.current_episode}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}