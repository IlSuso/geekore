'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, X, Film, Tv, Gamepad2, BookOpen, Dices, Bookmark, BookmarkCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { StarRating } from '@/components/ui/StarRating';
import { showToast } from '@/components/ui/Toast';
import { useLocale } from '@/lib/locale';
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer';
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer';

type MediaItem = {
  id: string;
  title: string;
  type: string;
  coverImage?: string;
  year?: number;
  episodes?: number;
  totalSeasons?: number;
  seasons?: Record<number, { episode_count: number }>;
  description?: string;
  genres?: string[];
  source: 'anilist' | 'tmdb' | 'igdb' | 'bgg';
  tags?: string[];
  keywords?: string[];
  themes?: string[];
  player_perspectives?: string[];
  game_modes?: string[];
  developers?: string[];
  categories?: string[];
  mechanics?: string[];
  designers?: string[];
  min_players?: number;
  max_players?: number;
  playing_time?: number;
  complexity?: number;
  bgg_rating?: number;
  score?: number;
};

const TYPE_ORDER: Record<string, number> = {
  anime: 0, manga: 1, movie: 2, tv: 3, game: 4, boardgame: 5,
};

function hasValidCover(item: any): item is MediaItem & { coverImage: string } {
  if (!item?.coverImage || typeof item.coverImage !== 'string') return false;
  const url = item.coverImage.trim();
  if (url.length < 10) return false;
  if (url.includes('N/A') || url.includes('placeholder') || url.includes('no-image')) return false;
  return true;
}

const TYPE_LABELS: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', movie: 'Film',
  tv: 'Serie TV', game: 'Videogiochi', boardgame: 'Board Game',
};

const TYPE_COLORS: Record<string, string> = {
  anime:     'text-sky-400 border-sky-500/30 bg-sky-500/10',
  manga:     'text-orange-400 border-orange-500/30 bg-orange-500/10',
  movie:     'text-red-400 border-red-500/30 bg-red-500/10',
  tv:        'text-purple-400 border-purple-500/30 bg-purple-500/10',
  game:      'text-green-400 border-green-500/30 bg-green-500/10',
  boardgame: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
};

function toMediaDetails(item: MediaItem): MediaDetails {
  return {
    id: item.id, title: item.title, type: item.type, coverImage: item.coverImage,
    year: item.year, episodes: item.episodes, description: item.description, genres: item.genres,
    source: item.source, score: item.score, min_players: item.min_players, max_players: item.max_players,
    playing_time: item.playing_time, complexity: item.complexity, bgg_rating: item.bgg_rating,
    mechanics: item.mechanics, designers: item.designers, developers: item.developers, themes: item.themes,
  };
}

// Haptic feedback helper
function haptic(duration = 50) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(duration)
  }
}

export default function DiscoverPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeType, setActiveType] = useState<string>('all');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [currentEpisode, setCurrentEpisode] = useState('');
  const [adding, setAdding] = useState(false);
  const [alreadyAdded, setAlreadyAdded] = useState<string[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [modalRating, setModalRating] = useState(0);
  const [drawerMedia, setDrawerMedia] = useState<MediaDetails | null>(null);

  // AbortController ref for cancelling in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  const supabase = createClient();
  const tmdbToken = process.env.NEXT_PUBLIC_TMDB_API_KEY;
  const { t } = useLocale();
  const d = t.discover;

  const typeFilters = [
    { id: 'all',       label: d.all,       icon: Search   },
    { id: 'anime',     label: d.anime,     icon: Film     },
    { id: 'manga',     label: d.manga,     icon: BookOpen },
    { id: 'movie',     label: d.movie,     icon: Film     },
    { id: 'tv',        label: d.tv,        icon: Tv       },
    { id: 'game',      label: d.game,      icon: Gamepad2 },
    { id: 'boardgame', label: d.boardgame, icon: Dices    },
  ];

  useEffect(() => {
    const loadAdded = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: entries }, { data: wish }] = await Promise.all([
        supabase.from('user_media_entries').select('external_id').eq('user_id', user.id),
        supabase.from('wishlist').select('external_id').eq('user_id', user.id),
      ]);
      if (entries) setAlreadyAdded(entries.map(item => item.external_id));
      if (wish) setWishlistIds(wish.map(item => item.external_id));
    };
    loadAdded();
  }, []);

  const searchMedia = useCallback(async (term: string, type: string) => {
    if (term.trim().length < 2 && type !== 'game') return;

    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setResults([]);
    setSearchError(null);

    const cleanTerm = term.trim();
    let rawResults: MediaItem[] = [];

    try {
      if (type === 'all' || type === 'anime' || type === 'manga') {
        const mediaFields = `id title { romaji english } coverImage { large } seasonYear episodes chapters type description(asHtml: false) genres tags { name rank category }`;
        const anilistQuery = `query ($search: String) {
          ${type === 'all' || type === 'anime' ? `
          anime: Page(page: 1, perPage: 20) {
            media(search: $search, type: ANIME, sort: [POPULARITY_DESC, SCORE_DESC]) { ${mediaFields} }
          }` : ''}
          ${type === 'all' || type === 'manga' ? `
          manga: Page(page: 1, perPage: 15) {
            media(search: $search, type: MANGA, format_in: [MANGA, ONE_SHOT], sort: [POPULARITY_DESC, SCORE_DESC]) { ${mediaFields} }
          }
          novel: Page(page: 1, perPage: 5) {
            media(search: $search, type: MANGA, format_in: [NOVEL], sort: [POPULARITY_DESC, SCORE_DESC]) { ${mediaFields} }
          }` : ''}
        }`;

        const anilistRes = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: anilistQuery, variables: { search: cleanTerm } }),
          signal: controller.signal,
        });
        const anilistJson = await anilistRes.json();

        const mapAnilist = (m: any, mediaType: 'anime' | 'manga', prefix: string): MediaItem => ({
          id: `anilist-${prefix}-${m.id}`,
          title: m.title.romaji || m.title.english || 'Senza titolo',
          type: mediaType,
          coverImage: m.coverImage?.large,
          year: m.seasonYear,
          episodes: m.episodes ?? m.chapters,
          description: m.description ? m.description.replace(/<[^>]+>/g, '').slice(0, 400) : undefined,
          genres: m.genres,
          tags: (m.tags || []).filter((tag: any) => tag.rank >= 60).sort((a: any, b: any) => b.rank - a.rank).slice(0, 20).map((tag: any) => tag.name),
          source: 'anilist',
        });

        const aniResults = (anilistJson.data?.anime?.media || []).map((m: any) => mapAnilist(m, 'anime', 'anime')).filter(hasValidCover);
        const mangaResults = (anilistJson.data?.manga?.media || []).map((m: any) => mapAnilist(m, 'manga', 'manga')).filter(hasValidCover);
        const novelResults = (anilistJson.data?.novel?.media || []).map((m: any) => mapAnilist(m, 'manga', 'novel')).filter(hasValidCover);
        rawResults = [...rawResults, ...aniResults, ...mangaResults, ...novelResults];
      }

      if (controller.signal.aborted) return;

      if (tmdbToken && (type === 'all' || type === 'movie' || type === 'tv')) {
        const mediaType = type === 'tv' ? 'tv' : 'movie';
        const searchRes = await fetch(
          `https://api.themoviedb.org/3/search/${mediaType}?query=${encodeURIComponent(cleanTerm)}&language=it-IT&page=1`,
          { headers: { 'accept': 'application/json', 'Authorization': `Bearer ${tmdbToken}` }, signal: controller.signal }
        );
        const searchJson = await searchRes.json();

        if (searchJson.results) {
          const resultsToFetch = mediaType === 'tv' ? searchJson.results.slice(0, 8) : searchJson.results.slice(0, 15);
          const detailedResults = await Promise.all(
            resultsToFetch.map(async (m: any) => {
              if (controller.signal.aborted) return null;
              let episodes = undefined;
              let totalSeasons = undefined;
              let seasonsData: Record<number, { episode_count: number }> = {};
              let tmdbKeywords: string[] = [];

              if (mediaType === 'tv') {
                try {
                  const [detailRes, kwRes] = await Promise.all([
                    fetch(`https://api.themoviedb.org/3/tv/${m.id}?language=it-IT`, { headers: { 'accept': 'application/json', 'Authorization': `Bearer ${tmdbToken}` }, signal: controller.signal }),
                    fetch(`https://api.themoviedb.org/3/tv/${m.id}/keywords`, { headers: { 'accept': 'application/json', 'Authorization': `Bearer ${tmdbToken}` }, signal: controller.signal }),
                  ]);
                  if (detailRes.ok) {
                    const detailJson = await detailRes.json();
                    totalSeasons = detailJson.number_of_seasons;
                    episodes = detailJson.number_of_episodes;
                    if (detailJson.seasons) {
                      detailJson.seasons.forEach((s: any) => {
                        if (s.season_number > 0) seasonsData[s.season_number] = { episode_count: s.episode_count || 0 };
                      });
                    }
                  }
                  if (kwRes.ok) {
                    const kwJson = await kwRes.json();
                    tmdbKeywords = (kwJson.results || []).map((k: any) => k.name).slice(0, 30);
                  }
                } catch {}
              } else {
                try {
                  const kwRes = await fetch(`https://api.themoviedb.org/3/movie/${m.id}/keywords`, { headers: { 'accept': 'application/json', 'Authorization': `Bearer ${tmdbToken}` }, signal: AbortSignal.timeout(3000) });
                  if (kwRes.ok) {
                    const kwJson = await kwRes.json();
                    tmdbKeywords = (kwJson.keywords || []).map((k: any) => k.name).slice(0, 30);
                  }
                } catch {}
              }

              return {
                id: m.id.toString(), title: m.name || m.title || 'Senza titolo', type: mediaType,
                coverImage: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
                year: m.first_air_date ? parseInt(m.first_air_date.substring(0, 4)) : m.release_date ? parseInt(m.release_date.substring(0, 4)) : undefined,
                description: m.overview ? m.overview.slice(0, 400) : undefined,
                episodes, totalSeasons, seasons: seasonsData, keywords: tmdbKeywords, source: 'tmdb',
              };
            })
          );
          rawResults = [...rawResults, ...detailedResults.filter((r): r is MediaItem => !!r && hasValidCover(r))];
        }
      }

      if (controller.signal.aborted) return;

      if (type === 'all' || type === 'game') {
        const res = await fetch('/api/igdb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ search: cleanTerm }),
          signal: controller.signal,
        });
        if (res.ok) {
          const gameResults: MediaItem[] = (await res.json()).map((g: any) => ({ ...g, source: 'igdb' as const }));
          rawResults = [...rawResults, ...gameResults.filter(hasValidCover)];
        }
      }

      if (controller.signal.aborted) return;

      if (type === 'all' || type === 'boardgame') {
        const res = await fetch(`/api/boardgames?search=${encodeURIComponent(cleanTerm)}`, { signal: controller.signal });
        if (res.ok) {
          const json = await res.json();
          const bggResults: MediaItem[] = (json.results || []).map((g: any) => ({ ...g, source: 'bgg' as const }));
          rawResults = [...rawResults, ...bggResults.filter(hasValidCover)];
        }
      }

      if (controller.signal.aborted) return;

      const uniqueResults = rawResults.filter((item, index, self) => index === self.findIndex((t) => t.id === item.id));
      if (type === 'all') {
        uniqueResults.sort((a, b) => (TYPE_ORDER[a.type] ?? 99) - (TYPE_ORDER[b.type] ?? 99));
      }
      setResults(uniqueResults);

    } catch (err: any) {
      if (err.name === 'AbortError') return; // Cancelled — don't update state
      console.error('Errore ricerca:', err);
      setSearchError('Errore durante la ricerca. Verifica la connessione o riprova tra qualche secondo.');
    }

    setLoading(false);
  }, [tmdbToken]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchTerm.trim().length >= 2 || activeType === 'game') {
        searchMedia(searchTerm, activeType);
      } else {
        setResults([]);
      }
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchTerm, activeType, searchMedia]);

  const toggleWishlist = async (media: MediaItem) => {
    haptic(30);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (wishlistIds.includes(media.id)) {
      await supabase.from('wishlist').delete().eq('user_id', user.id).eq('external_id', media.id);
      setWishlistIds(prev => prev.filter(id => id !== media.id));
      showToast(d.wishlistRemove);
    } else {
      await supabase.from('wishlist').upsert({
        user_id: user.id, title: media.title, type: media.type,
        cover_image: media.coverImage, external_id: media.id,
      }, { onConflict: 'user_id,external_id' });
      setWishlistIds(prev => [...prev, media.id]);
      showToast(d.wishlistAdd);
    }
  };

  const handleAdd = async (media: MediaItem) => {
    haptic(50);
    if (alreadyAdded.includes(media.id)) return;
    setSelectedMedia(media);
    setModalRating(0);
    setSelectedSeason(1);
    setCurrentEpisode('');
  };

  const addDirectly = async (media: MediaItem, rating: number = 0) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const isMovie = media.type === 'movie';
    const isBoardgame = media.type === 'boardgame';
    const { error } = await supabase.from('user_media_entries').insert({
      user_id: user.id, external_id: media.id, title: media.title, type: media.type,
      cover_image: media.coverImage, status: isMovie ? 'completed' : 'watching',
      current_episode: isBoardgame ? 0 : 1, episodes: media.episodes || null, rating: rating || null,
      genres: media.genres || [], tags: media.tags || [], keywords: media.keywords || [],
      themes: media.themes || [], player_perspectives: media.player_perspectives || [],
      game_modes: media.game_modes || [],
      ...(isBoardgame && { keywords: [...(media.keywords || []), ...(media.mechanics || [])], themes: [...(media.themes || []), ...(media.categories || [])] }),
    });
    if (error) {
      if (error.code === '23505') { showToast(d.alreadyAdded); setAlreadyAdded(prev => [...prev, media.id]); }
    } else {
      haptic([50, 30, 50]);
      setAlreadyAdded(prev => [...prev, media.id]);
      const { logActivity } = await import('@/lib/activity');
      await logActivity({ type: 'media_added', media_id: media.id, media_title: media.title, media_type: media.type, media_cover: media.coverImage });
    }
  };

  const confirmAdd = async () => {
    if (!selectedMedia) return;
    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAdding(false); return; }

    if (selectedMedia.type === 'movie' || selectedMedia.type === 'game' || selectedMedia.type === 'boardgame' || !selectedMedia.episodes || selectedMedia.episodes <= 1) {
      await addDirectly(selectedMedia, modalRating);
      setSelectedMedia(null);
      setModalRating(0);
      setAdding(false);
      return;
    }

    if (!currentEpisode || Number(currentEpisode) < 1) { setAdding(false); return; }
    const maxEpisodes = selectedMedia.seasons?.[selectedSeason]?.episode_count || 9999;
    if (Number(currentEpisode) > maxEpisodes) { setAdding(false); return; }

    const finalEpisode = Math.min(Number(currentEpisode), maxEpisodes);
    const { error } = await supabase.from('user_media_entries').insert({
      user_id: user.id, external_id: selectedMedia.id, title: selectedMedia.title,
      type: selectedMedia.type, cover_image: selectedMedia.coverImage, status: 'watching',
      current_season: selectedMedia.type === 'tv' ? selectedSeason : null, current_episode: finalEpisode,
      episodes: selectedMedia.episodes || null, season_episodes: selectedMedia.seasons || null,
      rating: modalRating || null, genres: selectedMedia.genres || [], tags: selectedMedia.tags || [],
      keywords: selectedMedia.keywords || [], themes: selectedMedia.themes || [],
      player_perspectives: selectedMedia.player_perspectives || [], game_modes: selectedMedia.game_modes || [],
    });

    if (error) {
      if (error.code === '23505') { showToast(d.alreadyAdded); setAlreadyAdded(prev => [...prev, selectedMedia.id]); }
    } else {
      haptic([50, 30, 50]);
      setAlreadyAdded(prev => [...prev, selectedMedia.id]);
      const { logActivity } = await import('@/lib/activity');
      await logActivity({ type: 'media_added', media_id: selectedMedia.id, media_title: selectedMedia.title, media_type: selectedMedia.type, media_cover: selectedMedia.coverImage });
    }
    setSelectedMedia(null);
    setCurrentEpisode('');
    setSelectedSeason(1);
    setModalRating(0);
    setAdding(false);
  };

  const groupedResults = activeType === 'all'
    ? Object.entries(results.reduce((acc: Record<string, MediaItem[]>, item) => {
        if (!acc[item.type]) acc[item.type] = [];
        acc[item.type].push(item);
        return acc;
      }, {})).sort(([a], [b]) => (TYPE_ORDER[a] ?? 99) - (TYPE_ORDER[b] ?? 99))
    : null;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-8 pb-20 max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
            Discover
          </h1>
          <p className="text-zinc-400 mt-3">Anime, manga, giochi, film, serie e board game</p>
        </div>

        {/* Filtri tipo */}
        <div className="flex flex-wrap gap-3 justify-center mb-8">
          {typeFilters.map((tf) => {
            const Icon = tf.icon;
            return (
              <button key={tf.id} onClick={() => { haptic(30); setActiveType(tf.id); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-medium transition haptic-press ${activeType === tf.id ? 'bg-violet-600 text-white' : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-700'}`}>
                <Icon size={18} />
                {tf.label}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto mb-12">
          <div className="relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-500" size={24} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={d.searchPlaceholder}
              className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 pl-16 pr-6 py-5 rounded-3xl text-lg placeholder-zinc-500 focus:outline-none"
            />
            {searchTerm && (
              <button onClick={() => { setSearchTerm(''); setResults([]); }} className="absolute right-6 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        {loading && <p className="text-center text-zinc-400">{d.searching}</p>}

        {/* Risultati */}
        {activeType === 'all' && groupedResults && groupedResults.length > 0 ? (
          <div className="space-y-10">
            {groupedResults.map(([type, items]) => (
              <div key={type}>
                <div className="flex items-center gap-3 mb-4">
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${TYPE_COLORS[type] || 'text-zinc-400 border-zinc-700 bg-zinc-800'}`}>
                    {TYPE_LABELS[type] || type}
                  </span>
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-xs text-zinc-600">{items.length} risultati</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {items.map((item, index) => (
                    <ResultCard key={`${item.id}-${item.source}-${index}`} item={item}
                      isAdded={alreadyAdded.includes(item.id)} inWishlist={wishlistIds.includes(item.id)}
                      onAdd={() => handleAdd(item)} onWishlist={() => toggleWishlist(item)}
                      onOpenDetails={() => setDrawerMedia(toMediaDetails(item))} d={d} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {results.map((item, index) => (
              <ResultCard key={`${item.id}-${item.source}-${index}`} item={item}
                isAdded={alreadyAdded.includes(item.id)} inWishlist={wishlistIds.includes(item.id)}
                onAdd={() => handleAdd(item)} onWishlist={() => toggleWishlist(item)}
                onOpenDetails={() => setDrawerMedia(toMediaDetails(item))} d={d} />
            ))}
          </div>
        )}

        {searchError && <p className="text-center text-red-400 mt-6 text-sm">{searchError}</p>}
        {results.length === 0 && !loading && searchTerm.length > 0 && searchTerm.length < 2 && activeType !== 'game' && (
          <p className="text-center text-zinc-500 mt-12 text-sm">{d.minChars}</p>
        )}
        {results.length === 0 && !loading && searchTerm.length >= 2 && (
          <p className="text-center text-zinc-500 mt-12">{d.noResults}</p>
        )}
      </div>

      {/* Modal Aggiungi */}
      {selectedMedia && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-md w-full p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">{d.addProgress}</h3>
              <button onClick={() => setSelectedMedia(null)} className="text-zinc-400 hover:text-white"><X size={28} /></button>
            </div>
            <div className="flex gap-5 mb-6">
              {selectedMedia.coverImage && <img src={selectedMedia.coverImage} alt={`Copertina di ${selectedMedia.title}`} className="w-24 h-36 object-cover rounded-2xl flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-lg">{selectedMedia.title}</p>
                <p className="text-sm text-zinc-500 mb-2">{selectedMedia.year} • {selectedMedia.type}</p>
                {selectedMedia.genres && selectedMedia.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedMedia.genres.slice(0, 4).map((g: any) => (
                      <span key={typeof g === 'string' ? g : g.name} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{typeof g === 'string' ? g : g.name}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mb-8 space-y-6">
              <div>
                <p className="text-sm text-zinc-400 mb-3">Voto (opzionale)</p>
                <StarRating value={modalRating} onChange={setModalRating} />
              </div>
              {selectedMedia.type !== 'movie' && selectedMedia.type !== 'game' && selectedMedia.episodes && selectedMedia.episodes > 1 && (
                <>
                  {selectedMedia.type === 'tv' && selectedMedia.seasons && Object.keys(selectedMedia.seasons).length > 0 && (
                    <div>
                      <p className="text-sm text-zinc-400 mb-2">Stagione</p>
                      <select value={selectedSeason} onChange={(e) => { setSelectedSeason(Number(e.target.value)); setCurrentEpisode(''); }} className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-6 py-4 text-lg focus:outline-none focus:border-violet-500">
                        {Object.keys(selectedMedia.seasons).map((key) => {
                          const num = parseInt(key);
                          const count = selectedMedia.seasons?.[num]?.episode_count || 0;
                          return <option key={num} value={num}>Stagione {num} ({count} episodi)</option>;
                        })}
                      </select>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-zinc-400 mb-2">Episodio corrente</p>
                    <input type="number" min="1" max={selectedMedia.seasons?.[selectedSeason]?.episode_count || selectedMedia.episodes || 9999}
                      value={currentEpisode} onChange={(e) => setCurrentEpisode(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Numero episodio"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-6 py-5 text-3xl text-center focus:outline-none focus:border-violet-500 appearance-none no-spinner" />
                  </div>
                </>
              )}
              {selectedMedia.type === 'movie' && <div className="bg-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-400">Il film verrà aggiunto come completato.</div>}
              {selectedMedia.type === 'boardgame' && <div className="bg-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-400">Il board game verrà aggiunto alla tua collezione.</div>}
            </div>

            <button onClick={confirmAdd} disabled={adding || !!(selectedMedia.type !== 'movie' && selectedMedia.type !== 'game' && selectedMedia.episodes && selectedMedia.episodes > 1 && (!currentEpisode || Number(currentEpisode) < 1 || Number(currentEpisode) > (selectedMedia.seasons?.[selectedSeason]?.episode_count || selectedMedia.episodes || 9999)))}
              className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-2xl font-semibold text-lg hover:brightness-110 disabled:opacity-50 transition haptic-press">
              {adding ? d.adding : d.add}
            </button>
          </div>
        </div>
      )}

      <MediaDetailsDrawer media={drawerMedia} onClose={() => setDrawerMedia(null)} />
    </div>
  );
}

function ResultCard({ item, isAdded, inWishlist, onAdd, onWishlist, onOpenDetails, d }: {
  item: MediaItem; isAdded: boolean; inWishlist: boolean;
  onAdd: () => void; onWishlist: () => void; onOpenDetails: () => void; d: any;
}) {
  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden hover:border-violet-500/50 transition group">
      <div className="relative h-64 bg-zinc-900 cursor-pointer" onClick={onOpenDetails} title="Vedi dettagli">
        <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-xs font-semibold px-3 py-1.5 rounded-full">Dettagli →</span>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-semibold line-clamp-2 mb-1 text-sm leading-tight cursor-pointer hover:text-violet-300 transition-colors" onClick={onOpenDetails}>
          {item.title}
        </h3>
        <p className="text-xs text-zinc-500 mb-3 capitalize">{item.type}</p>
        <div className="flex gap-2">
          <button onClick={onAdd} disabled={isAdded}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition haptic-press ${isAdded ? 'bg-emerald-600 text-white cursor-default' : 'bg-zinc-800 hover:bg-violet-600 border border-zinc-700 hover:border-violet-500'}`}>
            {isAdded ? <>{d.added}</> : <><Plus size={14} /> {d.add}</>}
          </button>
          <button onClick={onWishlist} title={inWishlist ? d.removeFromWishlist : d.addToWishlist}
            className={`p-2.5 rounded-xl border transition-all haptic-press ${inWishlist ? 'bg-violet-600 border-violet-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-violet-400 hover:border-violet-500'}`}>
            {inWishlist ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}