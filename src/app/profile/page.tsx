'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import { CheckCircle, RefreshCw, Clock, X } from 'lucide-react';
import SteamConnectButton from '@/components/SteamConnectButton';
import { SteamIcon } from '@/components/icons/SteamIcon';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type UserMedia = {
  id: string;
  title: string;
  type: 'anime' | 'tv' | 'movie' | 'game' | 'manga';
  cover_image?: string;
  current_episode: number;
  current_season?: number;
  season_episodes?: Record<number, { episode_count: number }>;
  episodes?: number;
  display_order?: number;
  updated_at: string;
  is_steam?: boolean;
  appid?: string;
};

function SortableBox({ media, children }: { media: UserMedia; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: media.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 50ms ease',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab active:cursor-grabbing transition-all duration-200 rounded-3xl overflow-hidden ${
        isDragging 
          ? 'border-2 border-violet-500 shadow-2xl scale-[1.02] z-50' 
          : 'border border-zinc-800 hover:border-violet-500/50 hover:shadow-xl'
      }`}
    >
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [steamAccount, setSteamAccount] = useState<any>(null);
  const [mediaList, setMediaList] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingGames, setImportingGames] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Funzione per ordinare la lista: videogiochi per ore (desc), altri per display_order
  const sortMediaList = (list: UserMedia[]) => {
    return [...list].sort((a, b) => {
      if (a.type === 'game' && b.type === 'game') {
        return (b.current_episode || 0) - (a.current_episode || 0); // ore discendente
      }
      if (a.type === 'game') return -1; // i giochi vanno prima
      if (b.type === 'game') return 1;
      return (b.display_order || 0) - (a.display_order || 0); // altri per display_order
    });
  };

  const refreshMediaList = async (userId: string) => {
    const { data } = await supabase
      .from('user_media_entries')
      .select('*')
      .eq('user_id', userId);

    if (data) {
      const sorted = sortMediaList(data);
      setMediaList(sorted);
    } else {
      setMediaList([]);
    }
  };

  const importSteamGames = async () => {
    if (!steamAccount?.steam_id64 || !user?.id || importingGames) return;

    setImportingGames(true);
    try {
      const res = await fetch(`/api/steam/games?steamid=${steamAccount.steam_id64}`);
      const data = await res.json();

      if (!data.success || !data.games?.length) return;

      const steamMedia = data.games.map((game: any) => ({
        user_id: user.id,
        title: game.name,
        type: 'game',
        appid: String(game.appid),
        cover_image: game.cover_image ?? null,
        current_episode: Math.floor(game.playtime_forever / 60),
        is_steam: true,
        display_order: Date.now(),
        updated_at: new Date().toISOString(),
      }));

      await supabase
        .from('user_media_entries')
        .upsert(steamMedia, { onConflict: 'user_id,title' });

      await refreshMediaList(user.id);
    } catch (e) {
      console.error('Error importing Steam games:', e);
    } finally {
      setImportingGames(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Vuoi davvero eliminare questo elemento dalla tua collezione?')) return;

    await supabase.from('user_media_entries').delete().eq('id', id);
    setMediaList(prev => prev.filter(item => item.id !== id));
  };

  const saveProgress = async (id: string, newValue: number, field: 'current_episode' | 'current_season' = 'current_episode') => {
    const updateData = field === 'current_season'
      ? { current_season: newValue, current_episode: 1 }
      : { current_episode: newValue };

    await supabase
      .from('user_media_entries')
      .update(updateData)
      .eq('id', id);

    setMediaList(prev =>
      prev.map(item =>
        item.id === id
          ? {
              ...item,
              ...(field === 'current_season' ? { current_season: newValue, current_episode: 1 } : { current_episode: newValue })
            }
          : item
      )
    );
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = mediaList.findIndex(item => item.id === active.id);
    const newIndex = mediaList.findIndex(item => item.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const newList = arrayMove(mediaList, oldIndex, newIndex);

    const updatedList = newList.map((item, index) => ({
      ...item,
      display_order: Date.now() - index * 10000,
    }));

    setMediaList(updatedList);

    const updates = updatedList.map(item => ({
      id: item.id,
      display_order: item.display_order,
    }));

    await supabase.from('user_media_entries').upsert(updates);
  };

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/login';
        return;
      }

      setUser(user);

      const [profileRes, steamRes, mediaRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('steam_accounts').select('*').eq('user_id', user.id).single(),
        supabase
          .from('user_media_entries')
          .select('*')
          .eq('user_id', user.id),
      ]);

      setProfile(profileRes.data);
      setSteamAccount(steamRes.data);

      if (mediaRes.data) {
        const sorted = sortMediaList(mediaRes.data);
        setMediaList(sorted);
      } else {
        setMediaList([]);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-zinc-700 border-t-white rounded-full mx-auto mb-4"></div>
          <p>Caricamento profilo...</p>
        </div>
      </div>
    );
  }

  const grouped = mediaList.reduce((acc: Record<string, UserMedia[]>, item) => {
    let cat: string;
    if (item.type === 'game') cat = 'Videogiochi';
    else if (item.type === 'manga') cat = 'Manga';
    else if (item.type === 'anime' || item.type === 'tv') cat = 'Serie & Anime';
    else if (item.type === 'movie') cat = 'Film';
    else cat = 'Altro';

    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categoryOrder = ['Videogiochi', 'Serie & Anime', 'Manga', 'Film', 'Altro'];
  const orderedCategories = categoryOrder.filter(cat => grouped[cat] && grouped[cat].length > 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
      <div className="pt-8 max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="flex flex-col items-center mb-12">
          <Avatar className="w-48 h-48 border-4 border-zinc-700 mb-6">
            <AvatarImage src={profile?.avatar_url || undefined} alt="Avatar" />
            <AvatarFallback className="text-7xl bg-zinc-800">
              {profile?.username?.[0]?.toUpperCase() || 'G'}
            </AvatarFallback>
          </Avatar>

          <h1 className="text-5xl font-bold tracking-tighter mb-2">
            {profile?.display_name || user?.email?.split('@')[0]}
          </h1>
          <p className="text-xl text-zinc-400">@{profile?.username || 'geek'}</p>

          <Link href="/profile/edit" className="mt-6">
            <button className="px-8 py-3 bg-white text-black font-semibold rounded-full hover:bg-zinc-200 transition-all">
              Modifica Profilo
            </button>
          </Link>
        </div>

        {/* Steam */}
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
              onClick={importSteamGames}
              disabled={importingGames}
              className="w-full flex items-center justify-center gap-3 bg-[#1B2838] hover:bg-[#2a475e] border border-[#66C0F4] py-4 rounded-2xl font-medium transition"
            >
              <RefreshCw size={20} className={importingGames ? 'animate-spin' : ''} />
              {importingGames ? 'Aggiornamento...' : 'Aggiorna giochi da Steam'}
            </button>
          )}
        </div>

        <h2 className="text-4xl font-bold tracking-tight mb-10">I miei progressi</h2>

        {mediaList.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">Non hai ancora nulla nella tua collezione.</div>
        ) : (
          orderedCategories.map((category) => (
            <div key={category} className="mb-16">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-semibold">{category}</h3>
                <p className="text-zinc-500">{grouped[category]?.length || 0} elementi</p>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={grouped[category]?.map(m => m.id) || []}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {grouped[category]?.map((media) => {
                      const imageUrl = media.cover_image ||
                        (media.appid ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${media.appid}/header.jpg` : undefined);

                      const hasSeasonData = !!media.season_episodes && Object.keys(media.season_episodes).length > 0;
                      const hasEpisodeData = media.episodes && media.episodes > 1;

                      const currentSeasonNum = media.current_season || 1;
                      const seasonData = media.season_episodes?.[currentSeasonNum];
                      const maxEpisodesThisSeason = seasonData ? seasonData.episode_count : (media.episodes || 0);
                      const maxSeasons = hasSeasonData && media.season_episodes 
                        ? Math.max(...Object.keys(media.season_episodes).map(Number)) 
                        : 1;

                      return (
                        <SortableBox key={media.id} media={media}>
                          <div className="group relative bg-zinc-950 rounded-3xl overflow-hidden transition-all duration-300">
                            {media.is_steam && (
                              <div className="absolute top-3 left-3 z-20 bg-[#171D25] p-1.5 rounded-full shadow-lg border border-[#66C0F4]/50">
                                <SteamIcon size={18} className="text-white" />
                              </div>
                            )}

                            <button
                              onClick={() => handleDelete(media.id)}
                              className="absolute top-3 right-3 z-30 opacity-0 group-hover:opacity-100 bg-zinc-950/90 hover:bg-red-950 border border-zinc-700 hover:border-red-500 p-2 rounded-full transition-all duration-200"
                            >
                              <X className="w-5 h-5 text-zinc-400 hover:text-red-400" />
                            </button>

                            <div className="relative h-72 bg-zinc-900">
                              {imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt={media.title}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                  onError={(e) => {
                                    const img = e.target as HTMLImageElement;
                                    img.onerror = null;
                                    img.src = `https://via.placeholder.com/600x900/27272a/ffffff?text=${encodeURIComponent(media.title.substring(0, 12))}`;
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
                              <h4 className="font-semibold line-clamp-2 mb-4 text-lg leading-tight">{media.title}</h4>

                              {media.type === 'game' ? (
                                <p className="text-emerald-400 text-sm flex items-center justify-center gap-1.5">
                                  <Clock size={14} className="text-emerald-400" />
                                  {media.current_episode} ore
                                </p>
                              ) : (hasSeasonData || hasEpisodeData) ? (
                                <div className="space-y-3">
                                  {hasSeasonData && (
                                    <div className="flex items-center justify-between gap-2">
                                      <button
                                        onClick={() => saveProgress(media.id, Math.max(1, currentSeasonNum - 1), 'current_season')}
                                        disabled={currentSeasonNum <= 1}
                                        className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                                      >
                                        −
                                      </button>
                                      <div className="flex-1 text-emerald-400 text-sm flex items-center justify-center gap-1.5">
                                        Stagione {currentSeasonNum}
                                      </div>
                                      <button
                                        onClick={() => {
                                          const newSeason = currentSeasonNum + 1;
                                          if (newSeason <= maxSeasons) saveProgress(media.id, newSeason, 'current_season');
                                        }}
                                        disabled={currentSeasonNum >= maxSeasons}
                                        className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}

                                  {hasEpisodeData && (
                                    <div className="flex items-center justify-between gap-2">
                                      <button
                                        onClick={() => {
                                          const newValue = Math.max(1, media.current_episode - 1);
                                          saveProgress(media.id, newValue);
                                        }}
                                        disabled={media.current_episode <= 1}
                                        className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                                      >
                                        −
                                      </button>

                                      <div className="flex-1 text-emerald-400 text-sm flex items-center justify-center gap-1.5">
                                        <span>Ep. {media.current_episode}</span>
                                        <span className="text-zinc-500">/ {maxEpisodesThisSeason}</span>
                                      </div>

                                      <button
                                        onClick={() => {
                                          const newValue = media.current_episode + 1;
                                          if (newValue <= maxEpisodesThisSeason) saveProgress(media.id, newValue);
                                        }}
                                        disabled={media.current_episode >= maxEpisodesThisSeason}
                                        className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </SortableBox>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          ))
        )}
      </div>
    </div>
  );
}