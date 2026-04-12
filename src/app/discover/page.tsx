'use client';
// src/app/discover/page.tsx
// V3: Search Intent Tracking + Wishlist Amplifier + Taste Delta updates

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, X, Film, Tv, Gamepad2, BookOpen, Dices, Bookmark, BookmarkCheck, Mic, MicOff, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { StarRating } from '@/components/ui/StarRating';
import { showToast } from '@/components/ui/Toast';
import { useLocale } from '@/lib/locale';
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { SkeletonDiscoverCard } from '@/components/ui/SkeletonCard';
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer';

type MediaItem = {
  id: string; title: string; type: string; coverImage?: string; year?: number;
  episodes?: number; totalSeasons?: number; seasons?: Record<number, { episode_count: number }>;
  description?: string; genres?: string[]; source: 'anilist' | 'tmdb' | 'igdb' | 'bgg';
  tags?: string[]; keywords?: string[]; themes?: string[]; player_perspectives?: string[];
  game_modes?: string[]; developers?: string[]; categories?: string[]; mechanics?: string[];
  designers?: string[]; min_players?: number; max_players?: number; playing_time?: number;
  complexity?: number; bgg_rating?: number; score?: number;
};

const TYPE_ORDER: Record<string, number> = { anime: 0, manga: 1, movie: 2, tv: 3, game: 4, boardgame: 5 };

function hasValidCover(item: any): item is MediaItem & { coverImage: string } {
  if (!item?.coverImage || typeof item.coverImage !== 'string') return false;
  const url = item.coverImage.trim();
  return url.length >= 10 && !url.includes('N/A') && !url.includes('placeholder') && !url.includes('no-image');
}

const TYPE_LABELS: Record<string, string> = { anime: 'Anime', manga: 'Manga', movie: 'Film', tv: 'Serie TV', game: 'Videogiochi', boardgame: 'Board Game' };
const TYPE_COLORS: Record<string, string> = {
  anime: 'text-sky-400 border-sky-500/30 bg-sky-500/10', manga: 'text-orange-400 border-orange-500/30 bg-orange-500/10',
  movie: 'text-red-400 border-red-500/30 bg-red-500/10', tv: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  game: 'text-green-400 border-green-500/30 bg-green-500/10', boardgame: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
};

function toMediaDetails(item: MediaItem): MediaDetails {
  return { id: item.id, title: item.title, type: item.type, coverImage: item.coverImage, year: item.year, episodes: item.episodes, description: item.description, genres: item.genres, source: item.source, score: item.score, min_players: item.min_players, max_players: item.max_players, playing_time: item.playing_time, complexity: item.complexity, bgg_rating: item.bgg_rating, mechanics: item.mechanics, designers: item.designers, developers: item.developers, themes: item.themes };
}

function haptic(duration: number | number[] = 50) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(duration);
}

function useVoiceSearch(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recRef = useRef<any>(null);

  useEffect(() => {
    setIsSupported(!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);
  }, []);

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    haptic(40);
    const rec = new SR();
    recRef.current = rec;
    rec.lang = 'it-IT'; rec.interimResults = false; rec.maxAlternatives = 1; rec.continuous = false;
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e: any) => {
      const t = e.results[0]?.[0]?.transcript?.trim();
      if (t) { haptic([30, 20, 30]); onResult(t); }
    };
    rec.onerror = (e: any) => { if (e.error !== 'aborted') showToast('Riconoscimento vocale non riuscito'); setIsListening(false); };
    rec.onend = () => setIsListening(false);
    rec.start();
  }, [onResult]);

  const stopListening = useCallback(() => { recRef.current?.stop(); setIsListening(false); }, []);
  const toggle = useCallback(() => { if (isListening) stopListening(); else startListening(); }, [isListening, startListening, stopListening]);

  return { isListening, isSupported, toggle };
}

const DEBOUNCE_MS = 350;

const FILTERS = [
  { id: 'all', label: 'Tutti', icon: null },
  { id: 'anime', label: 'Anime', icon: '🎌' },
  { id: 'manga', label: 'Manga', icon: '📖' },
  { id: 'movie', label: 'Film', icon: '🎬' },
  { id: 'tv', label: 'Serie', icon: '📺' },
  { id: 'game', label: 'Giochi', icon: '🎮' },
  { id: 'boardgame', label: 'Board', icon: '🎲' },
];

// ── V3: Search tracking helpers (fire-and-forget, non blocca l'UI) ─────────

function trackSearchQuery(query: string, mediaType?: string) {
  if (!query || query.trim().length < 2) return;
  fetch('/api/search/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query.trim(), media_type: mediaType || null }),
  }).catch(() => {});
}

function trackSearchClick(query: string, item: MediaItem) {
  fetch('/api/search/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: query.trim(),
      media_type: item.type,
      result_clicked_id: item.id,
      result_clicked_type: item.type,
      result_clicked_genres: item.genres || [],
    }),
  }).catch(() => {});
}

function triggerTasteDelta(options: {
  action: 'rating' | 'status_change' | 'wishlist_add' | 'rewatch' | 'progress';
  mediaId: string;
  mediaType: string;
  genres: string[];
  rating?: number;
  prevRating?: number;
  status?: string;
  prevStatus?: string;
}) {
  fetch('/api/taste/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeType, setActiveType] = useState<string>('all');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [currentEpisode, setCurrentEpisode] = useState('');
  const [adding, setAdding] = useState(false);
  const [alreadyAdded, setAlreadyAdded] = useState<string[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [modalRating, setModalRating] = useState(0);
  const [drawerMedia, setDrawerMedia] = useState<MediaDetails | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // V3: ref per il debounce del search tracking (800ms, più lungo del debounce UI)
  const trackDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTrackedQueryRef = useRef<string>('');

  const supabase = createClient();
  const { t } = useLocale();
  const d = t.discover;

  const { isListening, isSupported: voiceSupported, toggle: toggleVoice } = useVoiceSearch(
    (transcript) => setSearchTerm(transcript)
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('wishlist').select('external_id').eq('user_id', user.id).then(({ data }) => { if (data) setWishlistIds(data.map((w: any) => w.external_id)); });
      supabase.from('user_media_entries').select('external_id').eq('user_id', user.id).then(({ data }) => { if (data) setAlreadyAdded(data.map((e: any) => e.external_id)); });
    });
  }, []);

  const search = useCallback(async (term: string, type: string) => {
    if (!term.trim() || term.trim().length < 2) { setResults([]); setSearchError(null); setIsPending(false); return; }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true); setIsPending(false); setSearchError(null);
    try {
      const reqs: Promise<Response>[] = [];
      if (type === 'all' || type === 'anime' || type === 'manga') reqs.push(fetch(`/api/anilist?q=${encodeURIComponent(term)}${type !== 'all' ? `&type=${type}` : ''}`, { signal: controller.signal }));
      if (type === 'all' || type === 'movie' || type === 'tv') reqs.push(fetch(`/api/tmdb?q=${encodeURIComponent(term)}${type !== 'all' ? `&type=${type}` : ''}`, { signal: controller.signal }));
      if (type === 'all' || type === 'game') reqs.push(fetch(`/api/igdb?q=${encodeURIComponent(term)}`, { signal: controller.signal }));
      if (type === 'all' || type === 'boardgame') reqs.push(fetch(`/api/boardgames?q=${encodeURIComponent(term)}`, { signal: controller.signal }));
      const responses = await Promise.allSettled(reqs);
      if (controller.signal.aborted) return;
      const all: MediaItem[] = [];
      for (const r of responses) { if (r.status === 'fulfilled' && r.value.ok) { try { const data = await r.value.json(); if (Array.isArray(data)) all.push(...data); else if (data.results) all.push(...data.results); } catch {} } }
      if (controller.signal.aborted) return;
      const seen = new Set<string>();
      const deduped = all.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
      const filtered = type !== 'all' ? deduped.filter(i => i.type === type) : deduped;
      setResults(filtered);

      // V3: traccia la ricerca dopo che i risultati sono tornati
      // Deduplica: non tracciare la stessa query due volte di fila
      const trimmed = term.trim();
      if (trimmed !== lastTrackedQueryRef.current && trimmed.length >= 2) {
        lastTrackedQueryRef.current = trimmed;
        trackSearchQuery(trimmed, type !== 'all' ? type : undefined);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setSearchError(d.searchError || 'Errore durante la ricerca'); setResults([]);
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [supabase, d]);

  useEffect(() => {
    if (!searchTerm.trim() || searchTerm.trim().length < 2) {
      setResults([]); setIsPending(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (trackDebounceRef.current) clearTimeout(trackDebounceRef.current);
      return;
    }
    setIsPending(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      search(searchTerm, activeType);
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchTerm, activeType, search]);

  // V3: Wishlist con generi salvati + delta profilo gusti
  const toggleWishlist = async (media: MediaItem) => {
    haptic(30);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { showToast('Devi essere loggato per continuare'); return; }
    if (wishlistIds.includes(media.id)) {
      await supabase.from('wishlist').delete().match({ user_id: user.id, external_id: media.id });
      setWishlistIds(prev => prev.filter(id => id !== media.id));
      showToast(d.wishlistRemove);
    } else {
      // V3: salva i generi nella wishlist per amplificazione profilo
      await supabase.from('wishlist').insert({
        user_id: user.id,
        external_id: media.id,
        title: media.title,
        type: media.type,
        cover_image: media.coverImage,
        genres: media.genres || [],        // V3: generi per amplificazione
        media_type: media.type,            // V3: tipo per slot corretti
      });
      setWishlistIds(prev => [...prev, media.id]);
      showToast(d.wishlistAdd);

      // V3: aggiorna il profilo gusti in real-time
      if ((media.genres || []).length > 0) {
        triggerTasteDelta({
          action: 'wishlist_add',
          mediaId: media.id,
          mediaType: media.type,
          genres: media.genres || [],
        });
      }
    }
  };

  // V3: handleResultClick — traccia il click sul risultato
  const handleResultClick = useCallback((item: MediaItem) => {
    haptic(30);
    // V3: traccia il click solo se c'era una ricerca attiva
    if (searchTerm.trim().length >= 2) {
      trackSearchClick(searchTerm, item);
    }
    setDrawerMedia(toMediaDetails(item));
  }, [searchTerm]);

  const addDirectly = async (media: MediaItem, rating: number) => {
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const isMovie = media.type === 'movie', isBoardgame = media.type === 'boardgame';
    await supabase.from('user_media_entries').insert({
      user_id: user.id,
      external_id: media.id,
      title: media.title,
      type: media.type,
      cover_image: media.coverImage,
      status: isMovie ? 'completed' : 'watching',
      current_episode: isBoardgame ? 0 : 1,
      episodes: media.episodes || null,
      rating: rating || null,
      genres: media.genres || [],
    });
    setAlreadyAdded(prev => [...prev, media.id]);
    showToast(d.added || `"${media.title}" aggiunto!`);

    // V3: aggiorna il profilo gusti dopo l'aggiunta
    if ((media.genres || []).length > 0) {
      triggerTasteDelta({
        action: 'status_change',
        mediaId: media.id,
        mediaType: media.type,
        genres: media.genres || [],
        status: isMovie ? 'completed' : 'watching',
        ...(rating > 0 ? { rating } : {}),
      });
      // Se c'è anche un rating, applica anche il delta rating separato
      if (rating > 0) {
        triggerTasteDelta({
          action: 'rating',
          mediaId: media.id,
          mediaType: media.type,
          genres: media.genres || [],
          rating,
        });
      }
    }

    setSelectedMedia(null); setModalRating(0); setCurrentEpisode('');
  };

  const grouped = Object.entries(
    results.reduce((acc, item) => {
      if (!acc[item.type]) acc[item.type] = [];
      acc[item.type].push(item);
      return acc;
    }, {} as Record<string, MediaItem[]>)
  ).sort(([a], [b]) => (TYPE_ORDER[a] ?? 99) - (TYPE_ORDER[b] ?? 99));

  const showingResults = !loading && !searchError && results.length > 0;

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-5xl mx-auto px-4 pt-8">

        {/* Search bar */}
        <div className="relative mb-4">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder={isListening ? '🎤 In ascolto...' : (d.searchPlaceholder || 'Cerca anime, film, giochi, manga...')}
            className={`w-full bg-zinc-900 border rounded-2xl pl-11 py-4 text-base text-white placeholder-zinc-600 focus:outline-none transition-colors ${isListening ? 'border-red-500 pr-20' : 'border-zinc-800 focus:border-violet-500 pr-20'}`}
            autoFocus
          />
          {searchTerm && !isListening && (
            <button onClick={() => { setSearchTerm(''); setResults([]); setIsPending(false); lastTrackedQueryRef.current = ''; }} className="absolute right-12 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"><X size={16} /></button>
          )}
          {voiceSupported && (
            <button onClick={toggleVoice} title={isListening ? 'Ferma' : 'Ricerca vocale'}
              className={`absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-violet-400'}`}>
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
        </div>

        {isPending && !loading && searchTerm.trim().length >= 2 && (
          <div className="flex items-center gap-2 mb-4 px-4 py-2 bg-zinc-900/60 border border-zinc-800 rounded-xl w-fit">
            <Loader2 size={13} className="animate-spin text-violet-400" />
            <span className="text-xs text-zinc-500">Ricerca in corso…</span>
          </div>
        )}

        {isListening && (
          <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-2xl">
            <div className="flex gap-1 items-end">
              {[12, 18, 14].map((h, i) => <div key={i} className="w-1 bg-red-400 rounded-full animate-bounce" style={{ height: h, animationDelay: `${i * 0.1}s` }} />)}
            </div>
            <span className="text-sm text-red-300 font-medium">In ascolto... parla ora</span>
            <button onClick={toggleVoice} className="ml-auto text-xs text-red-400 hover:text-red-300">Annulla</button>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-6">
          {FILTERS.map(tf => (
            <button key={tf.id} onClick={() => { haptic(30); setActiveType(tf.id); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-all flex-shrink-0 ${activeType === tf.id ? 'bg-violet-600 border-violet-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'}`}>
              {tf.icon}{tf.label}
            </button>
          ))}
        </div>

        {/* Skeleton loading */}
        {loading && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <SkeletonDiscoverCard key={i} />
            ))}
          </div>
        )}

        {searchError && !loading && <div className="text-center py-12 text-zinc-500">{searchError}</div>}

        {!loading && !searchError && results.length === 0 && searchTerm.trim().length >= 2 && !isPending && (
          <div className="text-center py-20 text-zinc-600">
            <Search size={40} className="mx-auto mb-4 opacity-30" />
            <p>{d.noResults}</p>
          </div>
        )}

        {!loading && !searchTerm.trim() && (
          <div className="text-center py-20 text-zinc-600">
            <Search size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium text-zinc-500">{'Inizia a cercare'}</p>
            <p className="text-sm mt-1">{'Cerca tra anime, manga, film, serie TV, giochi e board game…'}</p>
          </div>
        )}

        {/* Results */}
        {showingResults && grouped.map(([type, items]) => items.length === 0 ? null : (
          <div key={type} className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${TYPE_COLORS[type] || 'text-zinc-400 border-zinc-700 bg-zinc-800'}`}>
                {TYPE_LABELS[type] || type}
              </span>
              <span className="text-zinc-600 text-xs">{items.length} risultati</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  className="group cursor-pointer"
                  style={{ animationDelay: `${i * 40}ms` }}
                  onClick={() => handleResultClick(item)}  // V3: usa handleResultClick con tracking
                >
                  <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-800 mb-2">
                    {hasValidCover(item)
                      ? <img src={item.coverImage} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-3xl">{type === 'game' ? '🎮' : type === 'boardgame' ? '🎲' : type === 'manga' ? '📖' : '📺'}</div>
                    }
                    {/* Wishlist button */}
                    <button
                      onClick={e => { e.stopPropagation(); toggleWishlist(item); }}
                      className="absolute top-2 right-2 w-7 h-7 bg-black/60 backdrop-blur-sm rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {wishlistIds.includes(item.id)
                        ? <BookmarkCheck size={13} className="text-violet-400" />
                        : <Bookmark size={13} className="text-white" />}
                    </button>
                    {/* Add button */}
                    {!alreadyAdded.includes(item.id) && (
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedMedia(item); setModalRating(0); setCurrentEpisode(''); }}
                        className="absolute bottom-2 right-2 w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Plus size={13} className="text-white" />
                      </button>
                    )}
                    {alreadyAdded.includes(item.id) && (
                      <div className="absolute bottom-2 right-2 w-7 h-7 bg-emerald-500/20 border border-emerald-500/40 rounded-lg flex items-center justify-center">
                        <span className="text-emerald-400 text-xs">✓</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium text-zinc-300 line-clamp-2 leading-snug">{item.title}</p>
                  {item.year && <p className="text-[10px] text-zinc-600 mt-0.5">{item.year}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* MediaDetailsDrawer */}
      {drawerMedia && (
        <MediaDetailsDrawer
          media={drawerMedia}
          onClose={() => setDrawerMedia(null)}
          onAdd={(media) => { setSelectedMedia(results.find(r => r.id === media.id) || null); setDrawerMedia(null); }}
        />
      )}

      {/* Add modal */}
      {selectedMedia && (
        <BottomSheet open={!!selectedMedia} onClose={() => setSelectedMedia(null)} title={`Aggiungi: ${selectedMedia.title}`}>
          <div className="p-6 space-y-5">
            <StarRating value={modalRating} onChange={setModalRating} size={28} />
            <button
              onClick={() => addDirectly(selectedMedia, modalRating)}
              disabled={adding}
              className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold text-sm transition-all disabled:opacity-60"
            >
              {adding ? 'Aggiunta...' : `Aggiungi alla collezione`}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}