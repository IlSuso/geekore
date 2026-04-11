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

// ── FIX TS2345: accetta sia number che number[] (VibratePattern) ─────────────
function haptic(duration: number | number[] = 50) {
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
  const { t } = useLocale();
  const d = t.discover;

  // Carica wishlist IDs all'avvio
  useEffect(() => {
    const loadWishlist = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('wishlist')
        .select('external_id')
        .eq('user_id', user.id);
      if (data) setWishlistIds(data.map((w: any) => w.external_id));
    };
    loadWishlist();
  }, []);

  // Carica già aggiunti all'avvio
  useEffect(() => {
    const loadAdded = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('user_media_entries')
        .select('external_id')
        .eq('user_id', user.id);
      if (data) setAlreadyAdded(data.map((e: any) => e.external_id));
    };
    loadAdded();
  }, []);

  const search = useCallback(async (term: string, type: string) => {
    if (!term.trim() || term.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setSearchError(null);

    try {
      const typeParam = type !== 'all' ? `&type=${type}` : '';
      const searchRequests: Promise<Response>[] = [];

      if (type === 'all' || type === 'anime' || type === 'manga') {
        searchRequests.push(
          fetch(`/api/anilist?q=${encodeURIComponent(term)}${type !== 'all' ? `&type=${type}` : ''}`, { signal: controller.signal })
        );
      }
      if (type === 'all' || type === 'movie' || type === 'tv') {
        searchRequests.push(
          fetch(`/api/tmdb?q=${encodeURIComponent(term)}${type !== 'all' ? `&type=${type}` : ''}`, { signal: controller.signal })
        );
      }
      if (type === 'all' || type === 'game') {
        searchRequests.push(
          fetch(`/api/igdb?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        );
      }
      if (type === 'all' || type === 'boardgame') {
        searchRequests.push(
          fetch(`/api/boardgames?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        );
      }

      const responses = await Promise.allSettled(searchRequests);
      if (controller.signal.aborted) return;

      const allResults: MediaItem[] = [];
      for (const response of responses) {
        if (response.status === 'fulfilled' && response.value.ok) {
          try {
            const data = await response.value.json();
            if (Array.isArray(data)) allResults.push(...data);
            else if (data.results && Array.isArray(data.results)) allResults.push(...data.results);
          } catch { /* parsing fallito */ }
        }
      }

      if (controller.signal.aborted) return;

      // Deduplicazione per id
      const seen = new Set<string>();
      const deduped = allResults.filter(item => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });

      // Filtra per tipo attivo
      const filtered = type !== 'all'
        ? deduped.filter(item => item.type === type)
        : deduped;

      setResults(filtered);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setSearchError(d.searchError || 'Errore durante la ricerca');
      setResults([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [supabase, d]);

  // Debounce 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      search(searchTerm, activeType);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm, activeType, search]);

  const toggleWishlist = async (media: MediaItem) => {
    haptic(30);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('Devi essere loggato per continuare'); return; }

    const isInWishlist = wishlistIds.includes(media.id);
    if (isInWishlist) {
      await supabase.from('wishlist').delete().match({ user_id: user.id, external_id: media.id });
      setWishlistIds(prev => prev.filter(id => id !== media.id));
      showToast(d.wishlistRemove);
    } else {
      await supabase.from('wishlist').insert({
        user_id: user.id, external_id: media.id, title: media.title,
        type: media.type, cover_image: media.coverImage,
      });
      setWishlistIds(prev => [...prev, media.id]);
      showToast(d.wishlistAdd);
    }
  };

  const addDirectly = async (media: MediaItem, rating: number) => {
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
      // ── FIX TS2345: passa array number[] — già corretto ora che haptic accetta number | number[]
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
      // ── FIX TS2345
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
    : [[activeType, results]] as [string, MediaItem[]][];

  const TYPE_FILTERS = [
    { id: 'all', label: d.all || 'Tutto', icon: null },
    { id: 'anime', label: 'Anime', icon: <Tv size={14} /> },
    { id: 'manga', label: 'Manga', icon: <BookOpen size={14} /> },
    { id: 'movie', label: 'Film', icon: <Film size={14} /> },
    { id: 'tv', label: 'Serie TV', icon: <Tv size={14} /> },
    { id: 'game', label: 'Giochi', icon: <Gamepad2 size={14} /> },
    { id: 'boardgame', label: 'Board Game', icon: <Dices size={14} /> },
  ];

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-5xl mx-auto px-4 pt-8">
        {/* Search bar */}
        <div className="relative mb-6">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={d.searchPlaceholder || 'Cerca anime, film, giochi, manga...'}
            className="w-full bg-zinc-900 border border-zinc-800 focus:border-violet-500 rounded-2xl pl-11 pr-10 py-4 text-base text-white placeholder-zinc-600 focus:outline-none transition-colors"
            autoFocus
          />
          {searchTerm && (
            <button
              onClick={() => { setSearchTerm(''); setResults([]); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Type filters */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-6">
          {TYPE_FILTERS.map(tf => (
            <button
              key={tf.id}
              onClick={() => { haptic(30); setActiveType(tf.id); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-all flex-shrink-0 ${
                activeType === tf.id
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
              }`}
            >
              {tf.icon}
              {tf.label}
            </button>
          ))}
        </div>

        {/* Results */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {searchError && !loading && (
          <div className="text-center py-12 text-zinc-500">{searchError}</div>
        )}

        {!loading && !searchError && results.length === 0 && searchTerm.trim().length >= 2 && (
          <div className="text-center py-20 text-zinc-600">
            <Search size={40} className="mx-auto mb-4 opacity-30" />
            <p>{d.noResults || 'Nessun risultato trovato'}</p>
          </div>
        )}

        {!loading && !searchTerm.trim() && (
          <div className="text-center py-20 text-zinc-600">
            <Search size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg">{d.minChars}</p>
          </div>
        )}

        {!loading && groupedResults.map(([type, items]) => (
          items.length === 0 ? null : (
            <div key={type} className="mb-10">
              {activeType === 'all' && (
                <div className="flex items-center gap-3 mb-4">
                  <h2 className={`text-sm font-bold uppercase tracking-wider ${TYPE_COLORS[type]?.split(' ')[0] || 'text-zinc-400'}`}>
                    {TYPE_LABELS[type] || type}
                  </h2>
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-xs text-zinc-600">{items.length}</span>
                </div>
              )}

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {items.map(item => {
                  const isAdded = alreadyAdded.includes(item.id);
                  const isWishlisted = wishlistIds.includes(item.id);

                  return (
                    <div
                      key={item.id}
                      className="group relative flex flex-col gap-2"
                    >
                      {/* Cover */}
                      <div
                        className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-900 cursor-pointer border border-zinc-800 hover:border-violet-500/50 transition-all duration-200"
                        onClick={() => setDrawerMedia(toMediaDetails(item))}
                      >
                        {hasValidCover(item) ? (
                          <img
                            src={item.coverImage}
                            alt={item.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600 text-3xl">
                            {type === 'game' ? '🎮' : type === 'boardgame' ? '🎲' : type === 'manga' ? '📖' : '📺'}
                          </div>
                        )}

                        {/* Overlay on hover */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200" />

                        {/* Already added badge */}
                        {isAdded && (
                          <div className="absolute top-2 left-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center z-10">
                            <span className="text-[10px] text-white font-bold">✓</span>
                          </div>
                        )}

                        {/* Wishlist button */}
                        <button
                          onClick={e => { e.stopPropagation(); toggleWishlist(item); }}
                          className={`absolute top-2 right-2 w-7 h-7 rounded-xl flex items-center justify-center z-10 transition-all ${
                            isWishlisted
                              ? 'bg-violet-600 opacity-100'
                              : 'bg-black/50 opacity-0 group-hover:opacity-100 hover:bg-violet-600/80'
                          }`}
                        >
                          {isWishlisted ? <BookmarkCheck size={13} className="text-white" /> : <Bookmark size={13} className="text-white" />}
                        </button>

                        {/* Add button */}
                        {!isAdded && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              haptic(50);
                              setSelectedMedia(item);
                              setSelectedSeason(1);
                              setCurrentEpisode('');
                              setModalRating(0);
                            }}
                            className="absolute bottom-2 inset-x-2 bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold py-1.5 rounded-xl flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                          >
                            <Plus size={12} /> Aggiungi
                          </button>
                        )}
                      </div>

                      {/* Title */}
                      <p className="text-xs text-zinc-300 line-clamp-2 leading-snug px-0.5">{item.title}</p>

                      {/* Meta */}
                      <div className="flex items-center gap-1 px-0.5">
                        {item.year && <span className="text-[10px] text-zinc-600">{item.year}</span>}
                        {item.score && item.score > 0 && (
                          <span className="text-[10px] text-yellow-500 ml-auto">★ {item.score.toFixed(1)}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ))}
      </div>

      {/* Add modal */}
      {selectedMedia && (
        <div className="fixed inset-0 bg-black/85 flex items-end sm:items-center justify-center z-[60] p-4" onClick={() => setSelectedMedia(null)}>
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden bottom-sheet sm:rounded-3xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-4 p-5 border-b border-zinc-800">
              {hasValidCover(selectedMedia) && (
                <img src={selectedMedia.coverImage} alt={selectedMedia.title} className="w-12 h-16 object-cover rounded-xl flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base leading-tight line-clamp-2">{selectedMedia.title}</h3>
                <span className={`text-xs mt-1 inline-block px-2 py-0.5 rounded-full border ${TYPE_COLORS[selectedMedia.type] || ''}`}>
                  {TYPE_LABELS[selectedMedia.type] || selectedMedia.type}
                </span>
              </div>
              <button onClick={() => setSelectedMedia(null)} className="text-zinc-500 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Stagione (solo TV con più stagioni) */}
              {selectedMedia.type === 'tv' && selectedMedia.seasons && Object.keys(selectedMedia.seasons).length > 1 && (
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">Stagione</label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setSelectedSeason(s => Math.max(1, s - 1))}
                      disabled={selectedSeason <= 1}
                      className="w-9 h-9 bg-zinc-800 hover:bg-zinc-700 rounded-xl flex items-center justify-center text-emerald-400 font-bold disabled:opacity-30"
                    >−</button>
                    <span className="flex-1 text-center font-semibold">Stagione {selectedSeason}</span>
                    <button
                      onClick={() => setSelectedSeason(s => Math.min(Object.keys(selectedMedia.seasons!).length, s + 1))}
                      disabled={selectedSeason >= Object.keys(selectedMedia.seasons).length}
                      className="w-9 h-9 bg-zinc-800 hover:bg-zinc-700 rounded-xl flex items-center justify-center text-emerald-400 font-bold disabled:opacity-30"
                    >+</button>
                  </div>
                </div>
              )}

              {/* Episodio (solo anime/tv con più episodi) */}
              {(selectedMedia.type === 'anime' || selectedMedia.type === 'tv') && selectedMedia.episodes && selectedMedia.episodes > 1 && (
                <div>
                  <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">
                    Episodio corrente (max {selectedMedia.seasons?.[selectedSeason]?.episode_count || selectedMedia.episodes})
                  </label>
                  <input
                    type="number"
                    value={currentEpisode}
                    onChange={e => setCurrentEpisode(e.target.value)}
                    min={1}
                    max={selectedMedia.seasons?.[selectedSeason]?.episode_count || selectedMedia.episodes}
                    placeholder="Es. 1"
                    className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-xl px-4 py-3 text-white no-spinner focus:outline-none transition-colors"
                  />
                </div>
              )}

              {/* Rating */}
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-wider block mb-2">Voto (opzionale)</label>
                <StarRating value={modalRating} onChange={setModalRating} size={24} />
              </div>
            </div>

            {/* Actions */}
            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => setSelectedMedia(null)}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-sm font-medium transition"
              >
                Annulla
              </button>
              <button
                onClick={confirmAdd}
                disabled={adding || ((selectedMedia.type === 'anime' || selectedMedia.type === 'tv') && !!selectedMedia.episodes && selectedMedia.episodes > 1 && !currentEpisode)}
                className="flex-1 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-2xl text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {adding ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <><Plus size={16} /> Aggiungi</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Details Drawer */}
      {drawerMedia && (
        <MediaDetailsDrawer
          media={drawerMedia}
          onClose={() => setDrawerMedia(null)}
        />
      )}
    </div>
  );
}