'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import { Search, Plus } from 'lucide-react';

type Media = {
  id: number;
  title: string;
  type: string;
  coverImage?: string;
  year?: number;
  episodes?: number;
};

export default function DiscoverPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);

  const searchAniList = async () => {
    if (!searchTerm.trim()) return;
    setLoading(true);

    const query = `
      query ($search: String) {
        Page(page: 1, perPage: 12) {
          media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
            id
            title { romaji english }
            coverImage { large }
            seasonYear
            episodes
          }
        }
      }
    `;

    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { search: searchTerm } }),
      });
      const { data } = await res.json();
      const media = data.Page.media.map((m: any) => ({
        id: m.id,
        title: m.title.romaji || m.title.english,
        type: 'anime',
        coverImage: m.coverImage?.large,
        year: m.seasonYear,
        episodes: m.episodes,
      }));
      setResults(media);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />
      <div className="pt-24 pb-20 max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">Discover</h1>
          <p className="text-xl text-zinc-400 mt-3">Trova nuovi anime, manga, film e giochi</p>
        </div>

        <div className="max-w-2xl mx-auto mb-12">
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500" size={24} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchAniList()}
              placeholder="Cerca anime (es. Solo Leveling, Jujutsu Kaisen...)"
              className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 pl-14 pr-6 py-5 rounded-3xl text-lg placeholder-zinc-500 focus:outline-none"
            />
          </div>
          <button onClick={searchAniList} className="mt-4 w-full bg-violet-600 py-4 rounded-2xl font-semibold">Cerca su AniList</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {results.map((media) => (
            <div key={media.id} className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden hover:border-violet-500/50 transition group">
              <div className="relative h-64">
                {media.coverImage ? (
                  <img src={media.coverImage} alt={media.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-zinc-900 flex items-center justify-center text-6xl">📺</div>
                )}
                <div className="absolute top-3 right-3 bg-black/70 px-3 py-1 rounded-full text-xs">
                  {media.year}
                </div>
              </div>
              <div className="p-5">
                <h3 className="font-semibold line-clamp-2">{media.title}</h3>
                <p className="text-sm text-zinc-500 mt-1">{media.episodes ? `${media.episodes} episodi` : ''}</p>
                <button className="mt-4 w-full bg-zinc-900 hover:bg-violet-600 border border-zinc-700 hover:border-violet-500 py-2.5 rounded-2xl text-sm flex items-center justify-center gap-2 transition">
                  <Plus size={18} /> Aggiungi alla mia lista
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}