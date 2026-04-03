'use client';

import Navbar from '@/components/Navbar';
import { Search, Filter } from 'lucide-react';
import { useState } from 'react';

export default function DiscoverPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = [
    { id: 'all', label: 'Tutto' },
    { id: 'anime', label: 'Anime' },
    { id: 'manga', label: 'Manga' },
    { id: 'movie', label: 'Film' },
    { id: 'tv', label: 'Serie TV' },
    { id: 'game', label: 'Videogiochi' },
    { id: 'boardgame', label: 'Giochi da Tavolo' },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="pt-24 pb-20 max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">
            Discover
          </h1>
          <p className="text-xl text-zinc-400 mt-3">Trova nuovi anime, manga, film, giochi e tanto altro</p>
        </div>

        {/* Barra di ricerca */}
        <div className="relative max-w-2xl mx-auto mb-12">
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500">
            <Search size={24} />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cerca anime, manga, giochi... (es. Solo Leveling, Elden Ring)"
            className="w-full bg-zinc-900 border border-zinc-700 focus:border-violet-500 pl-14 pr-6 py-5 rounded-3xl text-lg placeholder-zinc-500 focus:outline-none"
          />
        </div>

        {/* Filtri categorie */}
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-6 py-3 rounded-2xl font-medium transition-all ${
                activeCategory === cat.id
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/50'
                  : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Area contenuti (placeholder per ora) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden hover:border-violet-500/50 transition group"
            >
              <div className="h-64 bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center">
                <span className="text-6xl opacity-30">🎬</span>
              </div>
              <div className="p-6">
                <div className="h-6 bg-zinc-800 rounded mb-3 w-3/4"></div>
                <div className="h-4 bg-zinc-800 rounded w-1/2"></div>
                <div className="mt-6 flex justify-between text-sm">
                  <span className="text-violet-400">Anime</span>
                  <span className="text-zinc-500">2025</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-16 text-zinc-500">
          La ricerca reale con AniList, IGDB e Steam arriverà nel prossimo passo
        </div>
      </div>
    </div>
  );
}