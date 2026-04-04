'use client';

import { useState, useEffect, use } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import { CheckCircle, Clock, X, RotateCw, RotateCcw, Edit3, RefreshCw, User } from 'lucide-react';
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
  notes?: string;
  rating?: number;
};

// StarRating
export function StarRating({
  value = 0,
  onChange,
  size = 20,
  viewOnly = false,
}: {
  value?: number;
  onChange?: (rating: number) => void;
  size?: number;
  viewOnly?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const displayed = hovered ?? value;

  if (viewOnly) {
    return (
      <div className="flex flex-row items-center gap-0.5 pointer-events-none">
        {[1, 2, 3, 4, 5].map((star) => {
          const full = displayed >= star;
          const half = !full && displayed >= star - 0.5;
          return (
            <div key={star} className="relative" style={{ width: size, height: size }}>
              <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#374151" />
              </svg>
              <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0">
                <defs>
                  <clipPath id={`half-${star}`}>
                    <rect x="0" y="0" width="12" height="24" />
                  </clipPath>
                </defs>
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  fill={full || half ? '#fbbf24' : 'transparent'}
                  clipPath={full ? undefined : `url(#half-${star})`}
                />
              </svg>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-row items-center gap-0.5" onMouseLeave={() => setHovered(null)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const full = displayed >= star;
        const half = !full && displayed >= star - 0.5;
        return (
          <div key={star} className="relative cursor-pointer select-none" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#374151" />
            </svg>
            <svg width={size} height={size} viewBox="0 0 24 24" className="absolute inset-0">
              <defs>
                <clipPath id={`half-${star}`}>
                  <rect x="0" y="0" width="12" height="24" />
                </clipPath>
              </defs>
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                fill={full || half ? '#fbbf24' : 'transparent'}
                clipPath={full ? undefined : `url(#half-${star})`}
              />
            </svg>
            <div className="absolute inset-y-0 left-0 z-10" style={{ width: '50%' }}
              onMouseEnter={() => setHovered(star - 0.5)} onClick={() => onChange?.(star - 0.5)} />
            <div className="absolute inset-y-0 right-0 z-10" style={{ width: '50%' }}
              onMouseEnter={() => setHovered(star)} onClick={() => onChange?.(star)} />
          </div>
        );
      })}
    </div>
  );
}

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
      className={`cursor-grab active:cursor-grabbing transition-all duration-200 rounded-3xl overflow-hidden h-[520px] flex flex-col ${
        isDragging
          ? 'border-2 border-violet-500 shadow-2xl scale-[1.02] z-50'
          : 'border border-zinc-800 hover:border-violet-500/50 hover:shadow-xl'
      }`}
    >
      {children}
    </div>
  );
}

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [steamAccount, setSteamAccount] = useState<any>(null);
  const [mediaList, setMediaList] = useState<UserMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingGames, setImportingGames] = useState(false);
  const [reorderingGames, setReorderingGames] = useState(false);

  const [selectedMedia, setSelectedMedia] = useState<UserMedia | null>(null);
  const [notesInput, setNotesInput] = useState('');
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const sortMediaList = (list: UserMedia[]) => {
    return [...list].sort((a, b) => {
      if (a.type === 'game' && b.type === 'game') {
        return (b.current_episode || 0) - (a.current_episode || 0);
      }
      if (a.type === 'game') return -1;
      if (b.type === 'game') return 1;
      return (b.display_order || 0) - (a.display_order || 0);
    });
  };

  const refreshMediaList = async (userId: string) => {
    const { data } = await supabase
      .from('user_media_entries')
      .select('*')
      .eq('user_id', userId);

    if (data) setMediaList(sortMediaList(data));
  };

  const importSteamGames = async () => {
    if (!steamAccount?.steam_id64 || !currentUserId || importingGames) return;
    setImportingGames(true);
    try {
      const res = await fetch(`/api/steam/games?steamid=${steamAccount.steam_id64}`);
      const data = await res.json();
      if (!data.success || !data.games?.length) return;

      const steamMedia = data.games.map((game: any) => ({
        user_id: currentUserId,
        title: game.name,
        type: 'game',
        appid: String(game.appid),
        cover_image: game.cover_image ?? null,
        current_episode: Math.floor(game.playtime_forever / 60),
        is_steam: true,
        display_order: Date.now(),
        updated_at: new Date().toISOString(),
        rating: 0,
      }));

      await supabase.from('user_media_entries').upsert(steamMedia, { onConflict: 'user_id,title' });
      await refreshMediaList(currentUserId);
    } catch (e) {
      console.error('Error importing Steam games:', e);
    } finally {
      setImportingGames(false);
    }
  };

  const reorderGamesByHours = async () => {
    if (!currentUserId || reorderingGames) return;
    setReorderingGames(true);
    try {
      const { data } = await supabase
        .from('user_media_entries')
        .select('*')
        .eq('user_id', currentUserId)
        .eq('type', 'game');

      if (!data || data.length === 0) return;

      const sortedGames = [...data].sort((a, b) => (b.current_episode || 0) - (a.current_episode || 0));
      const updates = sortedGames.map((game, index) => ({
        id: game.id,
        display_order: Date.now() - index * 10000,
      }));

      await supabase.from('user_media_entries').upsert(updates);
      await refreshMediaList(currentUserId);
    } catch (e) {
      console.error('Error reordering games:', e);
    } finally {
      setReorderingGames(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Vuoi davvero eliminare questo elemento dalla tua collezione?')) return;
    await supabase.from('user_media_entries').delete().eq('id', id);
    setMediaList(prev => prev.filter(item => item.id !== id));
  };

  const markAsCompleted = async (id: string, media: UserMedia) => {
    let updateData: any = {};
    if (media.season_episodes) {
      const maxSeason = Math.max(...Object.keys(media.season_episodes).map(Number));
      const lastSeasonEpisodes = media.season_episodes[maxSeason]?.episode_count || 1;
      updateData = { current_season: maxSeason, current_episode: lastSeasonEpisodes };
    } else if (media.episodes) {
      updateData = { current_episode: media.episodes };
    } else {
      updateData = { current_episode: 999 };
    }

    await supabase.from('user_media_entries').update(updateData).eq('id', id);
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...updateData } : item));
  };

  const resetProgress = async (id: string) => {
    const updateData = { current_season: 1, current_episode: 1 };
    await supabase.from('user_media_entries').update(updateData).eq('id', id);
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...updateData } : item));
  };

  const saveProgress = async (id: string, newValue: number, field: 'current_episode' | 'current_season' = 'current_episode') => {
    const updateData = field === 'current_season'
      ? { current_season: newValue, current_episode: 1 }
      : { current_episode: newValue };

    await supabase.from('user_media_entries').update(updateData).eq('id', id);
    setMediaList(prev => prev.map(item => item.id === id ? { ...item, ...updateData } : item));
  };

  const openNotesModal = (media: UserMedia) => {
    setSelectedMedia(media);
    setNotesInput(media.notes || '');
    setIsNotesModalOpen(true);
  };

  const saveNotes = async () => {
    if (!selectedMedia) return;
    await supabase
      .from('user_media_entries')
      .update({ notes: notesInput.trim() })
      .eq('id', selectedMedia.id);

    setMediaList(prev =>
      prev.map(item =>
        item.id === selectedMedia.id
          ? { ...item, notes: notesInput.trim() }
          : item
      )
    );
    setIsNotesModalOpen(false);
    setSelectedMedia(null);
  };

  const setRating = async (mediaId: string, newRating: number) => {
    await supabase.from('user_media_entries').update({ rating: newRating }).eq('id', mediaId);
    setMediaList(prev => prev.map(item => item.id === mediaId ? { ...item, rating: newRating } : item));
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
    const updates = updatedList.map(item => ({ id: item.id, display_order: item.display_order }));
    await supabase.from('user_media_entries').upsert(updates);
  };

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
      setUser(user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', username)
        .single();

      if (!profileData) {
        setLoading(false);
        return;
      }

      setProfile(profileData);

      const isCurrentOwner = !!user && user.id === profileData.id;
      setIsOwner(isCurrentOwner);

      if (isCurrentOwner) {
  let sData = null;
  try {
    const { data, error } = await supabase
      .from('steam_accounts')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();   // ← Cambiato da .single() a .maybeSingle()

    if (error) {
      console.log('Steam account non trovato:', error.message);
    } else {
      sData = data;
    }
  } catch (err) {
    console.log('Errore nella query steam_accounts:', err);
  }
  setSteamAccount(sData);
}

      const { data: mediaData } = await supabase
        .from('user_media_entries')
        .select('*')
        .eq('user_id', profileData.id);

      if (mediaData) setMediaList(sortMediaList(mediaData));

      setLoading(false);
    };

    fetchData();
  }, [username]);

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">Caricamento...</div>;
  }

  if (!profile) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white"><p>Utente non trovato</p></div>;
  }

  const grouped = mediaList.reduce((acc: Record<string, UserMedia[]>, item) => {
    let cat: string = 'Altro';
    if (item.type === 'game') cat = 'Videogiochi';
    else if (item.type === 'manga') cat = 'Manga';
    else if (item.type === 'anime' || item.type === 'tv') cat = 'Serie & Anime';
    else if (item.type === 'movie') cat = 'Film';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const categoryOrder = ['Videogiochi', 'Serie & Anime', 'Manga', 'Film', 'Altro'];
  const orderedCategories = categoryOrder.filter(cat => grouped[cat] && grouped[cat].length > 0);

  // Avatar funzionante
  const AvatarComponent = () => (
    <div className="w-48 h-48 border-4 border-zinc-700 mb-6 bg-zinc-800 rounded-full flex items-center justify-center overflow-hidden">
      {profile.avatar_url ? (
        <img 
          src={profile.avatar_url} 
          alt="Avatar" 
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="text-7xl font-bold text-zinc-400">
          {profile.display_name?.[0]?.toUpperCase() || 
           profile.username?.[0]?.toUpperCase() || 
           'G'}
        </span>
      )}
    </div>
  );

  // VISTA PUBBLICA
  if (!isOwner) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white pb-20">
        <div className="pt-8 max-w-6xl mx-auto px-6">
          <div className="flex justify-between items-start mb-12">
            <div className="flex flex-col items-center flex-1">
              <AvatarComponent />
              <h1 className="text-5xl font-bold tracking-tighter mb-2">{profile.display_name}</h1>
              <p className="text-xl text-zinc-400">@{profile.username}</p>
            </div>

            {currentUserId && (
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = '/login';
                }}
                className="px-6 py-2.5 text-sm font-medium border border-zinc-700 hover:border-zinc-500 hover:text-white rounded-full transition-colors"
              >
                Logout
              </button>
            )}
          </div>

          <h2 className="text-4xl font-bold tracking-tight mb-10">Progressi di @{profile.username}</h2>

          {mediaList.length === 0 ? (
            <div className="text-center py-20 text-zinc-500">Questo utente non ha ancora nulla nella collezione.</div>
          ) : (
            orderedCategories.map((category) => (
              <div key={category} className="mb-16">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-semibold">{category}</h3>
                  <p className="text-zinc-500">{grouped[category].length} elementi</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {grouped[category].map((media) => {
                    const imageUrl = media.cover_image ||
                      (media.appid ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${media.appid}/header.jpg` : undefined);

                    const hasSeasonData = !!media.season_episodes && Object.keys(media.season_episodes).length > 0;
                    const hasEpisodeData = media.episodes && media.episodes > 1;

                    const currentSeasonNum = media.current_season || 1;
                    const maxEpisodesThisSeason = media.season_episodes?.[currentSeasonNum]?.episode_count || media.episodes || 0;
                    const maxSeasons = hasSeasonData && media.season_episodes
                      ? Math.max(...Object.keys(media.season_episodes).map(Number))
                      : 1;

                    const isCompleted = hasEpisodeData &&
                      media.current_episode >= maxEpisodesThisSeason &&
                      (!hasSeasonData || currentSeasonNum >= maxSeasons);

                    let totalProgress = 0;
                    if (hasSeasonData && media.season_episodes) {
                      const totalEp = Object.values(media.season_episodes).reduce((sum, s) => sum + (s.episode_count || 0), 0);
                      let completed = media.current_episode;
                      for (let s = 1; s < currentSeasonNum; s++) {
                        completed += media.season_episodes[s]?.episode_count || 0;
                      }
                      totalProgress = totalEp > 0 ? Math.min(Math.round((completed / totalEp) * 100), 100) : 0;
                    } else if (hasEpisodeData && maxEpisodesThisSeason > 0) {
                      totalProgress = Math.min(Math.round((media.current_episode / maxEpisodesThisSeason) * 100), 100);
                    }

                    const rating = media.rating || 0;

                    return (
                      <div key={media.id} className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden h-[520px] flex flex-col">
                        <div className="relative h-72 bg-zinc-900 flex-shrink-0">
                          {media.is_steam && (
                            <div className="absolute top-3 left-3 z-20 bg-[#171D25] p-1.5 rounded-full shadow-lg border border-[#66C0F4]/50">
                              <SteamIcon size={18} className="text-white" />
                            </div>
                          )}

                          <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2">
                            <div className="bg-zinc-950/90 border border-zinc-700 rounded-full px-3 py-1.5">
                              <StarRating value={rating} viewOnly={true} size={18} />
                            </div>
                          </div>

                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={media.title}
                              className="w-full h-full object-cover"
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

                        <div className="p-6 pb-3 flex-shrink-0">
                          <h4 className="font-semibold line-clamp-2 text-lg leading-tight">{media.title}</h4>
                          {isCompleted && (
                            <div className="mt-3 text-emerald-400 text-sm font-medium flex items-center gap-1.5">
                              <CheckCircle size={16} />
                              Completato
                            </div>
                          )}
                        </div>

                        <div className="mt-auto p-6 pt-0">
                          {media.type === 'game' ? (
                            <p className="text-emerald-400 text-sm flex items-center justify-center gap-1.5">
                              <Clock size={14} className="text-emerald-400" />
                              {media.current_episode} ore
                            </p>
                          ) : hasEpisodeData ? (
                            <div className="space-y-3">
                              {hasSeasonData && (
                                <div className="text-center text-emerald-400 text-sm">
                                  Stagione {currentSeasonNum}
                                </div>
                              )}

                              <div className="text-center text-emerald-400 text-sm">
                                Episodio {media.current_episode} 
                                {maxEpisodesThisSeason > 0 && ` / ${maxEpisodesThisSeason}`}
                              </div>

                              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                                  style={{ width: `${totalProgress}%` }}
                                />
                              </div>

                              <div className="text-right text-xs text-zinc-500">
                                {totalProgress}% completato
                              </div>
                            </div>
                          ) : null}
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

  // VISTA PRIVATA (proprietario)
  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
      <div className="pt-8 max-w-6xl mx-auto px-6">
        <div className="flex justify-between items-start mb-12">
          <div className="flex flex-col items-center flex-1">
            <AvatarComponent />
            <h1 className="text-5xl font-bold tracking-tighter mb-2">
              {profile?.display_name || user?.email?.split('@')[0]}
            </h1>
            <p className="text-xl text-zinc-400">@{profile?.username}</p>

            <Link href="/profile/edit" className="mt-6">
              <button className="px-8 py-3 bg-white text-black font-semibold rounded-full hover:bg-zinc-200 transition-all">
                Modifica Profilo
              </button>
            </Link>
          </div>

          <button
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = '/login';
            }}
            className="px-6 py-2.5 text-sm font-medium border border-zinc-700 hover:border-zinc-500 hover:text-white rounded-full transition-colors"
          >
            Logout
          </button>
        </div>

        {/* Steam Section - sempre visibile */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-8 mb-12">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-4">
              <SteamIcon size={32} className="text-[#66C0F4]" />
              <h2 className="text-2xl font-semibold">Account Steam</h2>
            </div>
            {steamAccount ? (
              <div className="text-green-400 flex items-center gap-2">
                <CheckCircle size={20} /> Collegato
              </div>
            ) : (
              <div className="text-amber-400 text-sm">Non collegato</div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            {steamAccount ? (
              <button
                onClick={importSteamGames}
                disabled={importingGames}
                className="flex-1 flex items-center justify-center gap-3 bg-[#1B2838] hover:bg-[#2a475e] border border-[#66C0F4] py-4 rounded-2xl font-medium transition"
              >
                <RefreshCw size={20} className={importingGames ? 'animate-spin' : ''} />
                {importingGames ? 'Aggiornamento...' : 'Aggiorna giochi da Steam'}
              </button>
            ) : (
              <a
                href="/api/steam/connect"
                className="flex-1 flex items-center justify-center gap-3 bg-[#1B2838] hover:bg-[#2a475e] border border-[#66C0F4] py-4 rounded-2xl font-medium transition"
              >
                <SteamIcon size={20} />
                Collega Account Steam
              </a>
            )}

            <button
              onClick={reorderGamesByHours}
              disabled={reorderingGames || !steamAccount}
              className="flex-1 flex items-center justify-center gap-3 bg-zinc-900 hover:bg-zinc-800 border border-violet-500/50 hover:border-violet-500 py-4 rounded-2xl font-medium transition disabled:opacity-60"
            >
              <RotateCw size={20} className={reorderingGames ? 'animate-spin' : ''} />
              {reorderingGames ? 'Riordinamento...' : 'Riordina videogiochi per ore'}
            </button>
          </div>
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

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={grouped[category]?.map(m => m.id) || []} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {grouped[category]?.map((media) => {
                      const imageUrl = media.cover_image ||
                        (media.appid ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${media.appid}/header.jpg` : undefined);

                      const hasSeasonData = !!media.season_episodes && Object.keys(media.season_episodes).length > 0;
                      const hasEpisodeData = media.episodes && media.episodes > 1;

                      const currentSeasonNum = media.current_season || 1;
                      const maxEpisodesThisSeason = media.season_episodes?.[currentSeasonNum]?.episode_count || media.episodes || 0;
                      const maxSeasons = hasSeasonData && media.season_episodes
                        ? Math.max(...Object.keys(media.season_episodes).map(Number))
                        : 1;

                      const isCompleted = hasEpisodeData &&
                        media.current_episode >= maxEpisodesThisSeason &&
                        (!hasSeasonData || currentSeasonNum >= maxSeasons);

                      let totalProgress = 0;
                      if (hasSeasonData && media.season_episodes) {
                        const totalEp = Object.values(media.season_episodes).reduce((sum, s) => sum + (s.episode_count || 0), 0);
                        let completed = media.current_episode;
                        for (let s = 1; s < currentSeasonNum; s++) {
                          completed += media.season_episodes[s]?.episode_count || 0;
                        }
                        totalProgress = totalEp > 0 ? Math.min(Math.round((completed / totalEp) * 100), 100) : 0;
                      } else if (hasEpisodeData && maxEpisodesThisSeason > 0) {
                        totalProgress = Math.min(Math.round((media.current_episode / maxEpisodesThisSeason) * 100), 100);
                      }

                      const hasNotes = !!media.notes?.trim();
                      const rating = media.rating || 0;

                      return (
                        <SortableBox key={media.id} media={media}>
                          <div className="group relative bg-zinc-950 rounded-3xl overflow-hidden h-full flex flex-col">
                            <div className="relative h-72 bg-zinc-900 flex-shrink-0">
                              {media.is_steam && (
                                <div className="absolute top-3 left-3 z-20 bg-[#171D25] p-1.5 rounded-full shadow-lg border border-[#66C0F4]/50">
                                  <SteamIcon size={18} className="text-white" />
                                </div>
                              )}

                              <div className="absolute bottom-3 left-3 z-30 flex items-center gap-2">
                                <button
                                  onClick={() => openNotesModal(media)}
                                  className={`p-2.5 rounded-full border transition-all ${
                                    hasNotes
                                      ? 'bg-violet-600 border-violet-500 text-white'
                                      : 'bg-zinc-950/80 border-zinc-700 hover:border-violet-500 text-zinc-400 hover:text-violet-400'
                                  }`}
                                >
                                  <Edit3 size={18} />
                                </button>

                                <div className="bg-zinc-950/90 border border-zinc-700 rounded-full px-3 py-1.5">
                                  <StarRating
                                    value={rating}
                                    onChange={(rate) => setRating(media.id, rate)}
                                    size={18}
                                  />
                                </div>
                              </div>

                              <button
                                onClick={() => handleDelete(media.id)}
                                className="absolute top-3 right-3 z-30 opacity-0 group-hover:opacity-100 bg-zinc-950/90 hover:bg-red-950 border border-zinc-700 hover:border-red-500 p-2 rounded-full transition-all duration-200"
                              >
                                <X className="w-5 h-5 text-zinc-400 hover:text-red-400" />
                              </button>

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

                            <div className="p-6 pb-3 flex-shrink-0">
                              <h4 className="font-semibold line-clamp-2 text-lg leading-tight">{media.title}</h4>
                              {isCompleted && (
                                <div className="mt-3 text-emerald-400 text-sm font-medium flex items-center gap-1.5">
                                  <CheckCircle size={16} />
                                  Completato
                                </div>
                              )}
                            </div>

                            <div className="mt-auto p-6 pt-0">
                              {media.type === 'game' ? (
                                <p className="text-emerald-400 text-sm flex items-center justify-center gap-1.5">
                                  <Clock size={14} className="text-emerald-400" />
                                  {media.current_episode} ore
                                </p>
                              ) : hasEpisodeData ? (
                                isCompleted ? (
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() => resetProgress(media.id)}
                                      className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
                                      title="Ripristina progresso"
                                    >
                                      <RotateCcw size={18} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="space-y-4">
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

                                    <div className="flex items-center justify-between gap-3">
                                      <button
                                        onClick={() => saveProgress(media.id, Math.max(1, media.current_episode - 1))}
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
                                          if (newValue <= maxEpisodesThisSeason) {
                                            saveProgress(media.id, newValue);
                                          } else {
                                            markAsCompleted(media.id, media);
                                          }
                                        }}
                                        className="w-7 h-7 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/50 rounded-lg transition-all text-emerald-400 font-bold"
                                      >
                                        +
                                      </button>
                                    </div>

                                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mt-3">
                                      <div
                                        className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                                        style={{ width: `${totalProgress}%` }}
                                      />
                                    </div>

                                    <div className="flex items-center justify-between mt-2">
                                      <div className="text-xs text-zinc-500">
                                        {totalProgress}% completato
                                      </div>
                                      <button
                                        onClick={() => markAsCompleted(media.id, media)}
                                        className="p-1.5 text-emerald-400 hover:text-emerald-300 transition-colors"
                                        title="Completa serie"
                                      >
                                        <CheckCircle size={20} />
                                      </button>
                                    </div>
                                  </div>
                                )
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

      {/* Modal Note */}
      {isNotesModalOpen && selectedMedia && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]">
          <div className="bg-zinc-900 rounded-3xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-xl font-semibold">Note su {selectedMedia.title}</h3>
              <button onClick={() => setIsNotesModalOpen(false)} className="text-zinc-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <p className="text-sm text-zinc-400 mb-2">Note personali</p>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Scrivi qui le tue note personali..."
                  className="w-full h-40 bg-zinc-800 border border-zinc-700 rounded-2xl p-4 text-white resize-y focus:outline-none focus:border-violet-500"
                />
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800 flex gap-3">
              <button
                onClick={() => setIsNotesModalOpen(false)}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition"
              >
                Annulla
              </button>
              <button
                onClick={saveNotes}
                className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl transition font-medium"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}