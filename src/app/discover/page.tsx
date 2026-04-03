'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { Search, Plus, X, Film, Tv, Gamepad2, BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type MediaItem = {
  id: string;
  title: string;
  type: string;
  coverImage?: string;
  year?: number;
  episodes?: number;
  source: 'anilist' | 'omdb';
};

export default function DiscoverPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeType, setActiveType] = useState<string>('all');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState('');
  const [adding, setAdding] = useState(false);
  const [alreadyAdded, setAlreadyAdded] = useState<string[]>([]);

  const supabase = createClient();

  const typeFilters = [
    { id: 'all', label: 'Tutto', icon: Search },
    { id: 'anime', label: 'Anime', icon: Film },
    { id: 'manga', label: 'Manga', icon: BookOpen },
    { id: 'movie', label: 'Film', icon: Film },
    { id: 'tv', label: 'Serie TV', icon: Tv },
    { id: 'game', label: 'Videogiochi', icon: Gamepad2 },
  ];

  // Carica già aggiunti
  useEffect(() => {
    const loadAdded = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('user_media_entries')
        .select('external_id')
        .eq('user_id', user.id);

      if (data) {
        setAlreadyAdded(data.map(item => item.external_id));
      }
    };
    loadAdded();
  }, []);

  // Ricerca live
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchTerm.trim().length >= 2) searchMedia();
      else setResults([]);
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchTerm, activeType]);

  const searchMedia = async () => {
    if (searchTerm.trim().length < 2) return;
    setLoading(true);
    setResults([]);

    const term = searchTerm.trim();

    try {
      let newResults: MediaItem[] = [];

      // AniList per Anime e Manga
      if (activeType === 'all' || activeType === 'anime' || activeType === 'manga') {
        const aniListType = activeType === 'manga' ? 'MANGA' : 'ANIME';

        const query = `
          query ($search: String) {
            Page(page: 1, perPage: 12) {
              media(search: $search, type: ${aniListType}, sort: [POPULARITY_DESC, SCORE_DESC]) {
                id
                title { romaji english }
                coverImage { large }
                seasonYear
                episodes
                type
              }
            }
          }
        `;

        const res = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, variables: { search: term } }),
        });

        const json = await res.json();
        const aniResults = (json.data?.Page?.media || []).map((m: any) => ({
          id: m.id.toString(),
          title: m.title.romaji || m.title.english || 'Senza titolo',
          type: (m.type || 'anime').toLowerCase(),
          coverImage: m.coverImage?.large,
          year: m.seasonYear,
          episodes: m.episodes,
          source: 'anilist' as const,
        }));

        newResults = [...newResults, ...aniResults];
      }

      // OMDb per Film e Serie TV
      if (activeType === 'all' || activeType === 'movie' || activeType === 'tv') {
        const omdbKey = process.env.NEXT_PUBLIC_OMDB_API_KEY;
        if (omdbKey) {
          const typeParam = activeType === 'movie' ? '&type=movie' : activeType === 'tv' ? '&type=series' : '';
          const url = `https://www.omdbapi.com/?s=${encodeURIComponent(term)}${typeParam}&apikey=${omdbKey}`;

          const res = await fetch(url);
          const json = await res.json();

          if (json.Search) {
            const omdbResults = json.Search.map((m: any) => ({
              id: m.imdbID,
              title: m.Title,
              type: m.Type === 'movie' ? 'movie' : 'tv',
              coverImage: m.Poster !== 'N/A' ? m.Poster : undefined,
              year: parseInt(m.Year),
              episodes: 1,
              source: 'omdb' as const,
            }));
            newResults = [...newResults, ...omdbResults];
          }
        }
      }

      // Videogiochi (placeholder)
      if (activeType === 'all' || activeType === 'game') {
        const gameExamples = ["Elden Ring", "The Witcher 3", "Cyberpunk 2077", "Hades II", "Stardew Valley", "Baldur's Gate 3"];
        const gameResults = gameExamples.map((title, i) => ({
          id: `game-${i}`,
          title,
          type: 'game',
          coverImage: undefined,
          year: 2018 + i,
          episodes: 1,
          source: 'omdb' as const,
        }));
        newResults = [...newResults, ...gameResults];
      }

      setResults(newResults);
    } catch (err) {
      console.error('Errore ricerca:', err);
    }
    setLoading(false);
  };

  const handleAdd = async (media: MediaItem) => {
    if (alreadyAdded.includes(media.id)) return;

    // Se è un film o ha 1 solo episodio → aggiungi direttamente
    if (media.episodes === 1 || !media.episodes) {
      addDirectly(media);
      return;
    }

    // Altrimenti apri modal per scegliere episodio
    setSelectedMedia(media);
    setCurrentEpisode('');
  };

  const addDirectly = async (media: MediaItem) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from('user_media_entries').insert({
      user_id: user.id,
      external_id: media.id,
      title: media.title,
      type: media.type,
      cover_image: media.coverImage,
      status: 'watching',
      season: 1,
      current_episode: 1,
      progress: 1,
    });

    if (!error) {
      setAlreadyAdded(prev => [...prev, media.id]);
    }
  };

  const confirmAdd = async () => {
    if (!selectedMedia || !currentEpisode || Number(currentEpisode) < 1) {
      alert("Inserisci un numero di episodio valido");
      return;
    }

    setAdding(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Applica il massimale reale
    const finalEpisode = Math.min(Number(currentEpisode), selectedMedia.episodes || 999);

    const { error } = await supabase.from('user_media_entries').insert({
      user_id: user.id,
      external_id: selectedMedia.id,
      title: selectedMedia.title,
      type: selectedMedia.type,
      cover_image: selectedMedia.coverImage,
      status: 'watching',
      season: 1,
      current_episode: finalEpisode,
      progress: finalEpisode,
    });

    if (!error) {
      setAlreadyAdded(prev => [...prev, selectedMedia.id]);
      setSelectedMedia(null);
      setCurrentEpisode('');
    } else {
      alert("Errore durante il salvataggio");
    }
    setAdding(false);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="pt-8 pb-20 max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
            Discover
          </h1>
          <p className="text-zinc-400 mt-3">Anime, Manga, Film, Serie TV e Videogiochi</p>
        </div>

        {/* Filtri tipo */}
        <div className="flex flex-wrap gap-3 justify-center mb-8">
          {typeFilters.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveType(t.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-medium transition ${
                  activeType === t.id 
                    ? 'bg-violet-600 text-white' 
                    : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-700'
                }`}
              >
                <Icon size={18} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="max-w-2xl mx-auto mb-12">
          <div className="relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-500" size={24} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca titolo..."
              className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 pl-16 pr-6 py-5 rounded-3xl text-lg placeholder-zinc-500 focus:outline-none"
            />
          </div>
        </div>

        {loading && <p className="text-center text-zinc-400">Ricerca in corso...</p>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {results.map((item) => {
            const isAdded = alreadyAdded.includes(item.id);
            return (
              <div key={item.id} className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden hover:border-violet-500/50 transition group">
                <div className="relative h-64 bg-zinc-900">
                  {item.coverImage ? (
                    <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-6xl">
                      {item.type === 'anime' || item.type === 'tv' ? '📺' : item.type === 'manga' ? '📖' : item.type === 'movie' ? '🎬' : '🎮'}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-semibold line-clamp-2 mb-2">{item.title}</h3>
                  <p className="text-sm text-zinc-500 mb-1 capitalize">{item.type}</p>
                  {item.episodes && item.episodes > 1 && (
                    <p className="text-xs text-zinc-400 mb-4">{item.episodes} episodi</p>
                  )}

                  <button 
                    onClick={() => handleAdd(item)}
                    disabled={isAdded}
                    className={`w-full py-3 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 transition ${
                      isAdded 
                        ? 'bg-emerald-600 text-white cursor-default' 
                        : 'bg-zinc-900 hover:bg-violet-600 border border-zinc-700 hover:border-violet-500'
                    }`}
                  >
                    {isAdded ? (
                      <>✓ Già nei progressi</>
                    ) : (
                      <>
                        <Plus size={18} /> Aggiungi
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal con massimale */}
      {selectedMedia && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-md w-full p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Aggiungi ai progressi</h3>
              <button onClick={() => setSelectedMedia(null)} className="text-zinc-400 hover:text-white">
                <X size={28} />
              </button>
            </div>

            <div className="flex gap-5 mb-8">
              {selectedMedia.coverImage && (
                <img src={selectedMedia.coverImage} alt="" className="w-24 h-36 object-cover rounded-2xl" />
              )}
              <div className="flex-1">
                <p className="font-semibold text-lg">{selectedMedia.title}</p>
                <p className="text-sm text-zinc-500">{selectedMedia.year} • {selectedMedia.episodes} episodi totali</p>
              </div>
            </div>

            <div className="mb-8">
              <p className="text-sm text-zinc-400 mb-3">A che episodio sei arrivato?</p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={currentEpisode}
                onChange={(e) => setCurrentEpisode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Inserisci il numero"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-6 py-5 text-3xl text-center focus:outline-none focus:border-violet-500"
              />
              <p className="text-xs text-zinc-500 mt-2 text-center">
                Massimo episodi: {selectedMedia.episodes || '?'}
              </p>
            </div>

            <button 
              onClick={confirmAdd}
              disabled={adding || !currentEpisode || Number(currentEpisode) < 1 || Number(currentEpisode) > (selectedMedia.episodes || 999)}
              className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-2xl font-semibold text-lg hover:brightness-110 disabled:opacity-50 transition"
            >
              {adding ? 'Aggiungendo...' : `Aggiungi (Episodio ${currentEpisode})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}