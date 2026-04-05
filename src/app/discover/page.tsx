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

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-6 pb-20 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
            Discover
          </h1>
          <p className="text-zinc-400 mt-2 text-sm sm:text-base">Cerca anime, manga, giochi e molto altro</p>
        </div>

        {/* Type filters — horizontal scroll on mobile */}
        <div className="scroll-x-hide mb-6 sm:mb-8 -mx-4 sm:mx-0 px-4 sm:px-0">
          <div className="flex gap-2 sm:flex-wrap sm:justify-center w-max sm:w-auto">
            {typeFilters.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveType(t.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium transition whitespace-nowrap shrink-0 ${
                    activeType === t.id ? 'bg-violet-600 text-white' : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-700'
                  }`}
                >
                  <Icon size={16} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-w-2xl mx-auto mb-8 sm:mb-12">
          <div className="relative">
            <Search className="absolute left-4 sm:left-6 top-1/2 -translate-y-1/2 text-zinc-500" size={20} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca titolo..."
              className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 pl-12 sm:pl-16 pr-4 sm:pr-6 py-4 sm:py-5 rounded-3xl text-base sm:text-lg placeholder-zinc-500 focus:outline-none"
            />
          </div>
        </div>

        {loading && <p className="text-center text-zinc-400">Ricerca in corso...</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-6">
          {results.map((item, index) => {
            const isAdded = alreadyAdded.includes(item.id);
            const uniqueKey = `${item.id}-${item.source}-${index}`;

            return (
              <div
                key={uniqueKey}
                className="bg-zinc-950 border border-zinc-800 rounded-2xl sm:rounded-3xl overflow-hidden hover:border-violet-500/50 transition group"
              >
                <div className="relative h-48 sm:h-64 bg-zinc-900">
                  <img
                    src={item.coverImage}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>

                <div className="p-4">
                  <h3 className="font-semibold line-clamp-2 mb-1 text-sm leading-tight">{item.title}</h3>
                  <p className="text-xs text-zinc-500 mb-3 capitalize">
                    {item.type}
                    {item.totalSeasons && item.type === 'tv' && ` • ${item.totalSeasons} stagioni`}
                  </p>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAdd(item)}
                      disabled={isAdded}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        isAdded
                          ? 'bg-emerald-600 text-white cursor-default'
                          : 'bg-zinc-800 hover:bg-violet-600 border border-zinc-700 hover:border-violet-500'
                      }`}
                    >
                      {isAdded ? <>✓ Aggiunto</> : <><Plus size={14} /> Aggiungi</>}
                    </button>
                    <button
                      onClick={() => toggleWishlist(item)}
                      title={wishlistIds.includes(item.id) ? 'Rimuovi dalla wishlist' : 'Aggiungi alla wishlist'}
                      className={`p-2.5 rounded-xl border transition-all ${
                        wishlistIds.includes(item.id)
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-violet-400 hover:border-violet-500'
                      }`}
                    >
                      {wishlistIds.includes(item.id) ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {results.length === 0 && !loading && searchTerm.length >= 2 && (
          <p className="text-center text-zinc-500 mt-12">
            Nessun risultato con copertina valida trovato.
          </p>
        )}
      </div>

      {/* Modal Aggiungi */}
      {selectedMedia && (
        <div className="fixed inset-0 bg-black/90 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 sm:p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5 sm:mb-6">
              <h3 className="text-lg sm:text-xl font-semibold">Aggiungi ai progressi</h3>
              <button onClick={() => setSelectedMedia(null)} className="text-zinc-400 hover:text-white p-1">
                <X size={24} />
              </button>
            </div>

            <div className="flex gap-4 sm:gap-5 mb-6 sm:mb-8">
              {selectedMedia.coverImage && (
                <img src={selectedMedia.coverImage} alt="" className="w-20 h-28 sm:w-24 sm:h-36 object-cover rounded-xl sm:rounded-2xl flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className="font-semibold text-lg">{selectedMedia.title}</p>
                <p className="text-sm text-zinc-500">
                  {selectedMedia.year} • {selectedMedia.type}
                  {selectedMedia.totalSeasons && ` • ${selectedMedia.totalSeasons} stagioni`}
                </p>
              </div>
            </div>

            <div className="mb-6 sm:mb-8 space-y-5 sm:space-y-6">

              {/* Voto — sempre visibile */}
              <div>
                <p className="text-sm text-zinc-400 mb-3">Voto (opzionale)</p>
                <StarRating value={modalRating} onChange={setModalRating} />
                {modalRating > 0 && (
                  <p className="text-xs text-zinc-500 mt-2">{modalRating} / 5 stelle</p>
                )}
              </div>

              {/* Stagione + Episodio — solo per serie TV e anime con episodi */}
              {selectedMedia.type !== 'movie' && selectedMedia.type !== 'game' &&
               selectedMedia.episodes && selectedMedia.episodes > 1 && (

                <>
                  {selectedMedia.type === 'tv' && selectedMedia.seasons && Object.keys(selectedMedia.seasons).length > 0 && (
                    <div>
                      <p className="text-sm text-zinc-400 mb-2">Stagione</p>
                      <select
                        value={selectedSeason}
                        onChange={(e) => {
                          setSelectedSeason(Number(e.target.value));
                          setCurrentEpisode('');
                        }}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg focus:outline-none focus:border-violet-500"
                      >
                        {Object.keys(selectedMedia.seasons).map((key) => {
                          const num = parseInt(key);
                          const count = selectedMedia.seasons?.[num]?.episode_count || 0;
                          return (
                            <option key={num} value={num}>
                              Stagione {num} ({count} episodi)
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-zinc-400 mb-2">Episodio corrente</p>
                    <input
                      type="number"
                      min="1"
                      max={selectedMedia.seasons?.[selectedSeason]?.episode_count || selectedMedia.episodes || 9999}
                      value={currentEpisode}
                      onChange={(e) => setCurrentEpisode(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="Numero episodio"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-4 sm:py-5 text-2xl sm:text-3xl text-center focus:outline-none focus:border-violet-500 appearance-none no-spinner"
                    />
                    {currentEpisode && Number(currentEpisode) > (selectedMedia.seasons?.[selectedSeason]?.episode_count || selectedMedia.episodes || 9999) && (
                      <p className="text-xs text-red-400 mt-2">
                        Numero episodio non valido
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Messaggio per film */}
              {selectedMedia.type === 'movie' && (
                <div className="bg-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-400">
                  Il film verrà aggiunto come completato.
                </div>
              )}

              {/* Messaggio per boardgame */}
              {selectedMedia.type === 'boardgame' && (
                <div className="bg-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-400">
                  Il board game verrà aggiunto alla tua collezione. Potrai aggiornare le partite giocate dal profilo.
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
              className="w-full py-3.5 sm:py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-2xl font-semibold text-base sm:text-lg hover:brightness-110 disabled:opacity-50 transition"
            >
              {adding ? 'Aggiungendo...' : 'Aggiungi'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}