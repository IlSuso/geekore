'use client';

import { useState, useEffect } from 'react';
import { Search, Plus, X, Film, Tv, Gamepad2, BookOpen, Dices, Bookmark, BookmarkCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { StarRating } from '@/components/ui/StarRating';
import { showToast } from '@/components/ui/Toast';

type MediaItem = {
  id: string;
  title: string;
  type: string;
  coverImage?: string;
  year?: number;
  episodes?: number;
  totalSeasons?: number;
  seasons?: Record<number, { episode_count: number }>;
  source: 'anilist' | 'tmdb' | 'igdb' | 'bgg';
};

function hasValidCover(item: any): item is MediaItem & { coverImage: string } {
  if (!item?.coverImage || typeof item.coverImage !== 'string') return false;
  const url = item.coverImage.trim();
  if (url.length < 10) return false;
  if (url.includes('N/A') || url.includes('placeholder') || url.includes('no-image')) return false;
  return true;
}

export default function DiscoverPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeType, setActiveType] = useState<string>('all');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [currentEpisode, setCurrentEpisode] = useState('');
  const [adding, setAdding] = useState(false);
  const [alreadyAdded, setAlreadyAdded] = useState<string[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [modalRating, setModalRating] = useState(0);

  const supabase = createClient();
  const tmdbToken = process.env.NEXT_PUBLIC_TMDB_API_KEY;

  const typeFilters = [
    { id: 'all', label: 'Tutto', icon: Search },
    { id: 'anime', label: 'Anime', icon: Film },
    { id: 'manga', label: 'Manga', icon: BookOpen },
    { id: 'movie', label: 'Film', icon: Film },
    { id: 'tv', label: 'Serie TV', icon: Tv },
    { id: 'game', label: 'Videogiochi', icon: Gamepad2 },
    { id: 'boardgame', label: 'Board Game', icon: Dices },
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

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchTerm.trim().length >= 2 || activeType === 'game') searchMedia();
      else setResults([]);
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchTerm, activeType]);

  const searchMedia = async () => {
    if (searchTerm.trim().length < 2 && activeType !== 'game') return;

    setLoading(true);
    setResults([]);

    const term = searchTerm.trim();
    let rawResults: MediaItem[] = [];

    try {
      // AniList — Anime
      if (activeType === 'all' || activeType === 'anime') {
        const query = `query ($search: String) {
          Page(page: 1, perPage: 20) {
            media(search: $search, type: ANIME, sort: [POPULARITY_DESC, SCORE_DESC]) {
              id title { romaji english } coverImage { large } seasonYear episodes type
            }
          }
        }`;
        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { search: term } }),
        });
        const json = await res.json();
        const aniResults = (json.data?.Page?.media || [])
          .map((m: any): MediaItem => ({
            id: `anilist-anime-${m.id}`,
            title: m.title.romaji || m.title.english || 'Senza titolo',
            type: 'anime',
            coverImage: m.coverImage?.large,
            year: m.seasonYear,
            episodes: m.episodes,
            source: 'anilist',
          }))
          .filter(hasValidCover);
        rawResults = [...rawResults, ...aniResults];
      }

      // AniList — Manga + Light Novel
      if (activeType === 'all' || activeType === 'manga') {
        // Manga
        const mangaQuery = `query ($search: String) {
          Page(page: 1, perPage: 15) {
            media(search: $search, type: MANGA, format_in: [MANGA, ONE_SHOT], sort: [POPULARITY_DESC, SCORE_DESC]) {
              id title { romaji english } coverImage { large } seasonYear chapters type
            }
          }
        }`;
        const novelQuery = `query ($search: String) {
          Page(page: 1, perPage: 5) {
            media(search: $search, type: MANGA, format_in: [NOVEL], sort: [POPULARITY_DESC, SCORE_DESC]) {
              id title { romaji english } coverImage { large } seasonYear chapters type
            }
          }
        }`;

        const [mangaRes, novelRes] = await Promise.all([
          fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: mangaQuery, variables: { search: term } }),
          }),
          fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: novelQuery, variables: { search: term } }),
          }),
        ]);

        const [mangaJson, novelJson] = await Promise.all([mangaRes.json(), novelRes.json()]);

        const mangaResults = (mangaJson.data?.Page?.media || [])
          .map((m: any): MediaItem => ({
            id: `anilist-manga-${m.id}`,
            title: m.title.romaji || m.title.english || 'Senza titolo',
            type: 'manga',
            coverImage: m.coverImage?.large,
            year: m.seasonYear,
            episodes: m.chapters,
            source: 'anilist',
          }))
          .filter(hasValidCover);

        const novelResults = (novelJson.data?.Page?.media || [])
          .map((m: any): MediaItem => ({
            id: `anilist-novel-${m.id}`,
            title: m.title.romaji || m.title.english || 'Senza titolo',
            type: 'manga', // mostriamo i novel come manga nel profilo
            coverImage: m.coverImage?.large,
            year: m.seasonYear,
            episodes: m.chapters,
            source: 'anilist',
          }))
          .filter(hasValidCover);

        rawResults = [...rawResults, ...mangaResults, ...novelResults];
      }

      // TMDb
      if (tmdbToken && (activeType === 'all' || activeType === 'movie' || activeType === 'tv')) {
        const mediaType = activeType === 'tv' ? 'tv' : 'movie';
        const searchRes = await fetch(
          `https://api.themoviedb.org/3/search/${mediaType}?query=${encodeURIComponent(term)}&language=it-IT&page=1`,
          {
            method: 'GET',
            headers: {
              'accept': 'application/json',
              'Authorization': `Bearer ${tmdbToken}`
            }
          }
        );

        const searchJson = await searchRes.json();

        if (searchJson.results) {
          const detailedResults = await Promise.all(
            searchJson.results.map(async (m: any) => {
              let episodes = undefined;
              let totalSeasons = undefined;
              let seasonsData: Record<number, { episode_count: number }> = {};

              if (mediaType === 'tv') {
                const detailRes = await fetch(
                  `https://api.themoviedb.org/3/tv/${m.id}?language=it-IT`,
                  {
                    method: 'GET',
                    headers: {
                      'accept': 'application/json',
                      'Authorization': `Bearer ${tmdbToken}`
                    }
                  }
                );

                if (detailRes.ok) {
                  const detailJson = await detailRes.json();
                  totalSeasons = detailJson.number_of_seasons;
                  episodes = detailJson.number_of_episodes;

                  if (detailJson.seasons) {
                    detailJson.seasons.forEach((s: any) => {
                      if (s.season_number > 0) {
                        seasonsData[s.season_number] = {
                          episode_count: s.episode_count || 0
                        };
                      }
                    });
                  }
                }
              }

              return {
                id: m.id.toString(),
                title: m.name || m.title || 'Senza titolo',
                type: mediaType,
                coverImage: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : undefined,
                year: m.first_air_date ? parseInt(m.first_air_date.substring(0,4)) : m.release_date ? parseInt(m.release_date.substring(0,4)) : undefined,
                episodes,
                totalSeasons,
                seasons: seasonsData,
                source: 'tmdb',
              };
            })
          );

          const filteredTmdb = detailedResults.filter(hasValidCover);
          rawResults = [...rawResults, ...filteredTmdb];
        }
      }

      // IGDB
      if (activeType === 'all' || activeType === 'game') {
        const res = await fetch('/api/igdb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ search: term }),
        });

        if (res.ok) {
          const gameResults: MediaItem[] = await res.json();
          rawResults = [...rawResults, ...gameResults.filter(hasValidCover)];
        }
      }

      // BoardGameGeek
      if (activeType === 'boardgame' && term.length >= 2) {
        const res = await fetch(`/api/boardgames?search=${encodeURIComponent(term)}`);
        if (res.ok) {
          const json = await res.json();
          const bggResults: MediaItem[] = (json.results || []).map((g: any) => ({
            id: g.id,
            title: g.title,
            type: 'boardgame',
            coverImage: g.coverImage,
            year: g.year,
            source: 'bgg' as const,
          }));
          rawResults = [...rawResults, ...bggResults.filter(hasValidCover)];
        }
      }

      const uniqueResults = rawResults.filter((item, index, self) =>
        index === self.findIndex((t) => t.id === item.id)
      );

      setResults(uniqueResults);
    } catch (err) {
      console.error('Errore ricerca:', err);
    }

    setLoading(false);
  };

  const toggleWishlist = async (media: MediaItem) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (wishlistIds.includes(media.id)) {
      await supabase.from('wishlist').delete().eq('user_id', user.id).eq('external_id', media.id);
      setWishlistIds(prev => prev.filter(id => id !== media.id));
      showToast('Rimosso dalla wishlist');
    } else {
      await supabase.from('wishlist').upsert({
        user_id: user.id, title: media.title, type: media.type,
        cover_image: media.coverImage, external_id: media.id,
      }, { onConflict: 'user_id,external_id' });
      setWishlistIds(prev => [...prev, media.id]);
      showToast('Aggiunto alla wishlist');
    }
  };

  const handleAdd = async (media: MediaItem) => {
    if (alreadyAdded.includes(media.id)) return;

    // Apri sempre il modal per permettere di votare subito
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
      user_id: user.id,
      external_id: media.id,
      title: media.title,
      type: media.type,
      cover_image: media.coverImage,
      status: isMovie ? 'completed' : 'watching',
      current_episode: isBoardgame ? 0 : 1,
      progress: 1,
      episodes: media.episodes || null,
      rating: rating || null,
    });

    if (!error) setAlreadyAdded(prev => [...prev, media.id]);
  };

  const confirmAdd = async () => {
    if (!selectedMedia) return;

    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAdding(false); return; }

    // Film, gioco, boardgame senza episodi: aggiunto direttamente
    if (selectedMedia.type === 'movie' || selectedMedia.type === 'game' || selectedMedia.type === 'boardgame' || (selectedMedia.episodes === 1 || !selectedMedia.episodes)) {
      await addDirectly(selectedMedia, modalRating);
      setSelectedMedia(null);
      setModalRating(0);
      setAdding(false);
      return;
    }

    // Serie/Anime: serve episodio
    if (!currentEpisode || Number(currentEpisode) < 1) {
      setAdding(false);
      return;
    }

    const maxEpisodes = selectedMedia.seasons?.[selectedSeason]?.episode_count || 9999;
    if (Number(currentEpisode) > maxEpisodes) {
      setAdding(false);
      return;
    }

    const finalEpisode = Math.min(Number(currentEpisode), maxEpisodes);

    const { error } = await supabase.from('user_media_entries').insert({
      user_id: user.id,
      external_id: selectedMedia.id,
      title: selectedMedia.title,
      type: selectedMedia.type,
      cover_image: selectedMedia.coverImage,
      status: 'watching',
      current_season: selectedMedia.type === 'tv' ? selectedSeason : null,
      current_episode: finalEpisode,
      progress: finalEpisode,
      episodes: selectedMedia.episodes || null,
      season_episodes: selectedMedia.seasons || null,
      rating: modalRating || null,
    });

    if (!error) {
      setAlreadyAdded(prev => [...prev, selectedMedia.id]);
      setSelectedMedia(null);
      setCurrentEpisode('');
      setSelectedSeason(1);
      setModalRating(0);
    }
    setAdding(false);
  };

  const TYPE_LABELS: Record<string, string> = {
    anime: 'Anime', manga: 'Manga', movie: 'Film', tv: 'Serie', game: 'Gioco', boardgame: 'Board'
  }
  const TYPE_COLORS: Record<string, string> = {
    anime: 'bg-sky-500', manga: 'bg-orange-500', movie: 'bg-red-500',
    tv: 'bg-purple-500', game: 'bg-green-600', boardgame: 'bg-yellow-500'
  }

  return (
    <div className="min-h-screen bg-[#080810] text-white">
      <div className="pt-6 pb-24 md:pb-10 max-w-6xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <p className="text-[10px] tracking-[0.3em] text-violet-500 font-bold uppercase mb-1">Esplora</p>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter">
            <span className="grad-text">Discover</span>
          </h1>
          <p className="text-zinc-600 mt-2 text-sm">Cerca anime, manga, giochi e molto altro</p>
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto mb-6">
          <div className="relative">
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${loading ? 'text-violet-400 animate-pulse' : 'text-zinc-500'}`} size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca un titolo..."
              className="w-full bg-zinc-900/60 border border-white/8 focus:border-violet-500/50 pl-11 pr-4 py-4 rounded-2xl text-base placeholder-zinc-600 focus:outline-none transition-colors backdrop-blur-sm"
            />
          </div>
        </div>

        {/* Type filters */}
        <div className="scroll-x-hide mb-8 -mx-4 sm:mx-0 px-4 sm:px-0">
          <div className="flex gap-2 sm:flex-wrap w-max sm:w-auto">
            {typeFilters.map((t) => {
              const Icon = t.icon;
              const isActive = activeType === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveType(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                      : 'bg-zinc-900/60 border border-white/6 text-zinc-400 hover:text-white hover:border-violet-500/30'
                  }`}
                >
                  <Icon size={14} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Results grid */}
        {loading && results.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-12 text-zinc-500 text-sm">
            <span className="w-4 h-4 border-2 border-zinc-700 border-t-violet-500 rounded-full animate-spin" />
            Ricerca in corso...
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {results.map((item, index) => {
            const isAdded = alreadyAdded.includes(item.id);
            const inWishlist = wishlistIds.includes(item.id);
            const uniqueKey = `${item.id}-${item.source}-${index}`;

            return (
              <div
                key={uniqueKey}
                className="group bg-zinc-900/50 border border-white/6 rounded-2xl overflow-hidden hover:border-violet-500/30 hover:bg-zinc-900/80 transition-all duration-300 card-hover"
              >
                {/* Cover */}
                <div className="relative overflow-hidden" style={{ aspectRatio: '2/3' }}>
                  <img
                    src={item.coverImage}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* Type badge */}
                  <span className={`absolute top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white ${TYPE_COLORS[item.type] || 'bg-zinc-600'}`}>
                    {TYPE_LABELS[item.type] || item.type}
                  </span>

                  {/* Year badge */}
                  {item.year && (
                    <span className="absolute top-2 right-2 text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-black/60 text-zinc-300 backdrop-blur-sm">
                      {item.year}
                    </span>
                  )}

                  {/* Hover actions overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-2 flex gap-1.5 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                    <button
                      onClick={() => handleAdd(item)}
                      disabled={isAdded}
                      className={`flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition backdrop-blur-sm ${
                        isAdded
                          ? 'bg-emerald-600/90 text-white cursor-default'
                          : 'bg-violet-600/90 hover:bg-violet-500 text-white'
                      }`}
                    >
                      {isAdded ? '✓ Aggiunto' : <><Plus size={12} /> Aggiungi</>}
                    </button>
                    <button
                      onClick={() => toggleWishlist(item)}
                      title={inWishlist ? 'Rimuovi dalla wishlist' : 'Aggiungi alla wishlist'}
                      className={`p-2 rounded-xl backdrop-blur-sm transition-all ${
                        inWishlist ? 'bg-violet-600/90 text-white' : 'bg-black/60 text-zinc-300 hover:text-violet-400'
                      }`}
                    >
                      {inWishlist ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
                    </button>
                  </div>
                </div>

                {/* Info */}
                <div className="p-2.5">
                  <h3 className="font-semibold line-clamp-1 text-xs leading-tight text-white">{item.title}</h3>
                  {item.totalSeasons && item.type === 'tv' && (
                    <p className="text-[10px] text-zinc-600 mt-0.5">{item.totalSeasons} stagioni</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {results.length === 0 && !loading && searchTerm.length >= 2 && (
          <div className="text-center py-16">
            <Search className="mx-auto mb-3 text-zinc-700" size={32} />
            <p className="text-zinc-600 text-sm">Nessun risultato con copertina valida trovato.</p>
          </div>
        )}

        {results.length === 0 && !loading && searchTerm.length < 2 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-zinc-600 text-sm">Inizia a digitare per cercare...</p>
          </div>
        )}
      </div>

      {/* Modal Aggiungi */}
      {selectedMedia && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) setSelectedMedia(null); }}>
          <div className="bg-zinc-900 border border-white/10 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 sm:p-7 max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Handle bar on mobile */}
            <div className="sm:hidden w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-5" />

            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold">Aggiungi ai progressi</h3>
              <button onClick={() => setSelectedMedia(null)} className="p-1.5 text-zinc-500 hover:text-white hover:bg-white/5 rounded-xl transition-all">
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-4 mb-6">
              {selectedMedia.coverImage && (
                <img src={selectedMedia.coverImage} alt="" className="w-20 h-28 object-cover rounded-xl flex-shrink-0 shadow-xl" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base leading-tight">{selectedMedia.title}</p>
                <p className="text-sm text-zinc-500 mt-1">
                  {selectedMedia.year && `${selectedMedia.year} · `}{selectedMedia.type}
                  {selectedMedia.totalSeasons && ` · ${selectedMedia.totalSeasons} stagioni`}
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Rating */}
              <div>
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Voto (opzionale)</p>
                <StarRating value={modalRating} onChange={setModalRating} />
                {modalRating > 0 && (
                  <p className="text-xs text-zinc-600 mt-2">{modalRating} / 5 stelle</p>
                )}
              </div>

              {/* Season + Episode */}
              {selectedMedia.type !== 'movie' && selectedMedia.type !== 'game' &&
               selectedMedia.episodes && selectedMedia.episodes > 1 && (
                <>
                  {selectedMedia.type === 'tv' && selectedMedia.seasons && Object.keys(selectedMedia.seasons).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Stagione</p>
                      <select
                        value={selectedSeason}
                        onChange={(e) => { setSelectedSeason(Number(e.target.value)); setCurrentEpisode(''); }}
                        className="w-full bg-zinc-800 border border-white/8 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 text-white"
                      >
                        {Object.keys(selectedMedia.seasons).map((key) => {
                          const num = parseInt(key);
                          const count = selectedMedia.seasons?.[num]?.episode_count || 0;
                          return <option key={num} value={num}>Stagione {num} ({count} ep.)</option>;
                        })}
                      </select>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Episodio corrente</p>
                    <input
                      type="number"
                      min="1"
                      max={selectedMedia.seasons?.[selectedSeason]?.episode_count || selectedMedia.episodes || 9999}
                      value={currentEpisode}
                      onChange={(e) => setCurrentEpisode(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="—"
                      className="w-full bg-zinc-800 border border-white/8 rounded-xl px-4 py-3 text-2xl text-center focus:outline-none focus:border-violet-500 appearance-none no-spinner font-bold"
                    />
                    {currentEpisode && Number(currentEpisode) > (selectedMedia.seasons?.[selectedSeason]?.episode_count || selectedMedia.episodes || 9999) && (
                      <p className="text-xs text-red-400 mt-2">Numero episodio non valido</p>
                    )}
                  </div>
                </>
              )}

              {selectedMedia.type === 'movie' && (
                <div className="bg-zinc-800/60 border border-white/5 rounded-xl px-4 py-3 text-sm text-zinc-500">
                  Il film verrà aggiunto come completato.
                </div>
              )}

              {selectedMedia.type === 'boardgame' && (
                <div className="bg-zinc-800/60 border border-white/5 rounded-xl px-4 py-3 text-sm text-zinc-500">
                  Il board game verrà aggiunto alla tua collezione.
                </div>
              )}
            </div>

            <button
              onClick={confirmAdd}
              disabled={adding || (
                selectedMedia.type !== 'movie' &&
                selectedMedia.type !== 'game' &&
                selectedMedia.episodes && selectedMedia.episodes > 1 && (
                  !currentEpisode ||
                  Number(currentEpisode) < 1 ||
                  Number(currentEpisode) > (selectedMedia.seasons?.[selectedSeason]?.episode_count || selectedMedia.episodes || 9999)
                )
              ) as boolean}
              className="w-full mt-6 py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-2xl font-bold text-base hover:brightness-110 disabled:opacity-40 transition-all shadow-lg shadow-violet-500/20"
            >
              {adding ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Aggiungendo...
                </span>
              ) : 'Aggiungi'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}