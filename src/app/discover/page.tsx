'use client';
// src/app/discover/page.tsx
// V4: + Boardgame (BGG) + Libri (Google Books) — News rimossa

import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import {
  Search, Plus, X, Film, Tv, Gamepad2, Bookmark, BookmarkCheck,
  Mic, MicOff, Loader2, Swords, Check, Layers, Dices, BookOpen,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { showToast } from '@/components/ui/Toast';
import { useLocale } from '@/lib/locale';
import { MediaDetailsDrawer } from '@/components/media/MediaDetailsDrawer';
import { SkeletonDiscoverCard } from '@/components/ui/SkeletonCard';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/ui/ErrorState';
import type { MediaDetails } from '@/components/media/MediaDetailsDrawer';

type MediaItem = {
  id: string; title: string; title_en?: string; type: string; coverImage?: string; year?: number;
  episodes?: number; totalSeasons?: number; seasons?: Record<number, { episode_count: number }>;
  description?: string; genres?: string[]; source: 'anilist' | 'tmdb' | 'igdb' | 'bgg';
  tags?: string[]; keywords?: string[]; themes?: string[]; player_perspectives?: string[];
  game_modes?: string[]; developers?: string[]; categories?: string[]; mechanics?: string[];
  designers?: string[]; min_players?: number; max_players?: number; playing_time?: number;
  complexity?: number; score?: number; authors?: string[]; pages?: number;
  isbn?: string; publisher?: string;
};

// Ordine sezioni nei risultati raggruppati
const TYPE_ORDER: Record<string, number> = {
  anime: 0, manga: 1, movie: 2, tv: 3, game: 4, boardgame: 5,
};

function hasValidCover(item: any): item is MediaItem & { coverImage: string } {
  if (!item?.coverImage || typeof item.coverImage !== 'string') return false;
  const url = item.coverImage.trim();
  return url.length >= 10 && !url.includes('N/A') && !url.includes('placeholder') && !url.includes('no-image');
}

const TYPE_LABELS: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', movie: 'Film', tv: 'Serie TV',
  game: 'Videogiochi', boardgame: 'Giochi da tavolo',
};

const TYPE_COLORS: Record<string, string> = {
  anime:     'text-sky-400 border-sky-500/30 bg-sky-500/10',
  manga:     'text-orange-400 border-orange-500/30 bg-orange-500/10',
  movie:     'text-red-400 border-red-500/30 bg-red-500/10',
  tv:        'text-purple-400 border-purple-500/30 bg-purple-500/10',
  game:      'text-green-400 border-green-500/30 bg-green-500/10',
  boardgame: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
};

// Icona placeholder nelle card senza copertina
const TYPE_PLACEHOLDER_ICON: Record<string, React.ReactNode> = {
  game:      <Gamepad2 size={28} />,
  boardgame: <Dices size={28} />,
  manga:     <Layers size={28} />  anime:     <Swords size={28} />,
  movie:     <Film size={28} />,
  tv:        <Tv size={28} />,
};

function toMediaDetails(item: MediaItem): MediaDetails {
  return {
    id: item.id,
    title: item.title,
    title_en: item.title_en,
    type: item.type,
    coverImage: item.coverImage,
    year: item.year,
    episodes: item.episodes,
    totalSeasons: item.totalSeasons,
    seasons: item.seasons,
    description: item.description,
    genres: item.genres,
    source: item.source,
    score: item.score,
    min_players: item.min_players,
    max_players: item.max_players,
    playing_time: item.playing_time,
    complexity: item.complexity,
    mechanics: item.mechanics,
    designers: item.designers,
    developers: item.developers,
    themes: item.themes,
    authors: item.authors,
    // campi libro
    ...(item.pages ? { pages: item.pages } as any : {}),
    ...(item.isbn ? { isbn: item.isbn } as any : {}),
    ...(item.publisher ? { publisher: item.publisher } as any : {}),
  };
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

const FILTERS: { id: string; label: string; icon: React.ReactNode }[] = [
  { id: 'all',       label: 'Tutti',    icon: null },
  { id: 'anime',     label: 'Anime',    icon: <Swords size={13} /> },
  { id: 'manga',     label: 'Manga',    icon: <Layers size={13} /> },
  { id: 'movie',     label: 'Film',     icon: <Film size={13} /> },
  { id: 'tv',        label: 'Serie',    icon: <Tv size={13} /> },
  { id: 'game',      label: 'Giochi',   icon: <Gamepad2 size={13} /> },
  { id: 'boardgame', label: 'Tavolo',   icon: <Dices size={13} /> },
   /> },
];

// ── V3: Search tracking helpers (fire-and-forget) ────────────────────────────

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
  mediaId: string; mediaType: string; genres: string[];
  rating?: number; prevRating?: number; status?: string; prevStatus?: string;
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
  const [alreadyAdded, setAlreadyAdded] = useState<string[]>([]);
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [drawerMedia, setDrawerMedia] = useState<MediaDetails | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const trackDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTrackedQueryRef = useRef<string>('');

  const supabase = createClient();
  const { t, locale } = useLocale();
  const d = t.discover;

  const { isListening, isSupported: voiceSupported, toggle: toggleVoice } = useVoiceSearch(
    (transcript) => setSearchTerm(transcript)
  );

  useEffect(() => {
    if (window.innerWidth >= 768) searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('wishlist').select('external_id').eq('user_id', user.id)
        .then(({ data }) => { if (data) setWishlistIds(data.map((w: any) => w.external_id)); });
      supabase.from('user_media_entries').select('external_id').eq('user_id', user.id)
        .then(({ data }) => { if (data) setAlreadyAdded(data.map((e: any) => e.external_id)); });
    });
  }, []);

  const search = useCallback(async (term: string, type: string, lang: string) => {
    if (!term.trim() || term.trim().length < 2) {
      setResults([]); setSearchError(null); setIsPending(false); return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true); setIsPending(false); setSearchError(null);

    try {
      const reqs: Promise<Response>[] = [];

      // Anime / Manga — AniList
      if (type === 'all' || type === 'anime' || type === 'manga')
        reqs.push(fetch(
          `/api/anilist?q=${encodeURIComponent(term)}${type !== 'all' ? `&type=${type}` : ''}&lang=${lang}`,
          { signal: controller.signal }
        ));

      // Film / Serie — TMDB
      if (type === 'all' || type === 'movie' || type === 'tv')
        reqs.push(fetch(
          `/api/tmdb?q=${encodeURIComponent(term)}${type !== 'all' ? `&type=${type}` : ''}&lang=${lang}`,
          { signal: controller.signal }
        ));

      // Videogiochi — IGDB
      if (type === 'all' || type === 'game')
        reqs.push(fetch(`/api/igdb?q=${encodeURIComponent(term)}&lang=${lang}`, { signal: controller.signal }));

      // Giochi da tavolo — BGG
      if (type === 'all' || type === 'boardgame')
        reqs.push(fetch(`/api/bgg?q=${encodeURIComponent(term)}`, { signal: controller.signal }));

      const responses = await Promise.allSettled(reqs);
      if (controller.signal.aborted) return;

      const all: MediaItem[] = [];
      for (const r of responses) {
        if (r.status === 'fulfilled' && r.value.ok) {
          try {
            const data = await r.value.json();
            if (Array.isArray(data)) all.push(...data);
          } catch {}
        }
      }
      if (controller.signal.aborted) return;

      // Deduplicazione
      const seen = new Set<string>();
      const deduped = all.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });

      // Filtra per cover valida
      const withCover = deduped.filter(hasValidCover);
      const filtered = type !== 'all' ? withCover.filter(i => i.type === type) : withCover;
      setResults(filtered);

      // Traccia query
      const trimmed = term.trim();
      if (trimmed !== lastTrackedQueryRef.current && trimmed.length >= 2) {
        lastTrackedQueryRef.current = trimmed;
        trackSearchQuery(trimmed, type !== 'all' ? type : undefined);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setSearchError(d.searchError || 'Errore durante la ricerca');
      setResults([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [supabase, d, locale]);

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
      search(searchTerm, activeType, locale);
    }, DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchTerm, activeType, search, locale]);

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
      await supabase.from('wishlist').insert({
        user_id: user.id,
        external_id: media.id,
        title: media.title,
        type: media.type,
        cover_image: media.coverImage,
        genres: media.genres || [],
        media_type: media.type,
      });
      setWishlistIds(prev => [...prev, media.id]);
      showToast(d.wishlistAdd);
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

  const handleResultClick = useCallback((item: MediaItem) => {
    haptic(30);
    if (searchTerm.trim().length >= 2) trackSearchClick(searchTerm, item);
    setDrawerMedia(toMediaDetails(item));
  }, [searchTerm]);

  const grouped = Object.entries(
    results.reduce((acc, item) => {
      if (!acc[item.type]) acc[item.type] = [];
      acc[item.type].push(item);
      return acc;
    }, {} as Record<string, MediaItem[]>)
  ).sort(([a], [b]) => (TYPE_ORDER[a] ?? 99) - (TYPE_ORDER[b] ?? 99));

  const handlePullRefresh = async () => {
    if (searchTerm.trim().length >= 2) {
      setResults([]);
      const term = searchTerm;
      setSearchTerm('');
      setTimeout(() => setSearchTerm(term), 50);
    }
  };
  const { distance: pullDistance, refreshing: isPullRefreshing } = usePullToRefresh({ onRefresh: handlePullRefresh });

  const showingResults = !loading && !searchError && results.length > 0;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] pb-24">
      <PullToRefreshIndicator distance={pullDistance} refreshing={isPullRefreshing} />
      <div className="max-w-screen-2xl mx-auto px-4 pt-2 md:pt-6">

        {/* Search bar */}
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
          />
          <input
            data-testid="search-input"
            type="text"
            value={searchTerm}
            ref={searchInputRef}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={isListening ? 'In ascolto...' : 'Cerca anime, film, giochi, libri...'}
            className={`w-full rounded-xl pl-10 pr-20 py-2.5 text-[15px] outline-none transition-colors ${
              isListening
                ? 'bg-red-500/10 border border-red-500/40 text-[var(--text-primary)] placeholder-red-400/60'
                : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:border-violet-500/60'
            }`}
            autoFocus={false}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {searchTerm && !isListening && (
              <button
                onClick={() => { setSearchTerm(''); setResults([]); setIsPending(false); lastTrackedQueryRef.current = ''; }}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-[var(--text-muted)] text-[var(--bg-primary)]"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            )}
            {voiceSupported && (
              <button
                onClick={toggleVoice}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                  isListening ? 'bg-red-500 text-white' : 'text-[var(--text-secondary)] hover:text-violet-400'
                }`}
              >
                {isListening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
            )}
          </div>
        </div>

        {/* Listening indicator */}
        {isListening && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-500/8 border border-red-500/20 rounded-xl">
            <div className="flex gap-0.5 items-end">
              {[10, 16, 12].map((h, i) => (
                <div key={i} className="w-0.5 bg-red-400 rounded-full animate-bounce" style={{ height: h, animationDelay: `${i * 0.12}s` }} />
              ))}
            </div>
            <span className="text-[13px] text-red-400 font-medium flex-1">In ascolto...</span>
            <button onClick={toggleVoice} className="text-[12px] text-red-400 hover:text-red-300">Annulla</button>
          </div>
        )}

        {/* Filtri tipo — scroll orizzontale */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 mb-5 -mx-4 px-4">
          {FILTERS.map(tf => (
            <button
              key={tf.id}
              data-testid={`filter-${tf.id}`}
              onClick={() => { haptic(30); setActiveType(tf.id); }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all flex-shrink-0 border ${
                activeType === tf.id
                  ? 'bg-violet-600 border-violet-500 text-white'
                  : 'bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:border-violet-500/40 hover:text-[var(--text-primary)]'
              }`}
            >
              {tf.icon}{tf.label}
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 12 }).map((_, i) => <SkeletonDiscoverCard key={i} />)}
          </div>
        )}

        {/* Pending indicator */}
        {isPending && !loading && searchTerm.trim().length >= 2 && (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 size={16} className="animate-spin text-violet-400" />
            <span className="text-[13px] text-[var(--text-secondary)]">Ricerca in corso…</span>
          </div>
        )}

        {searchError && !loading && (
          <p className="text-center py-12 text-[var(--text-muted)] text-[14px]">{searchError}</p>
        )}

        {/* Empty state */}
        {!loading && !searchTerm.trim() && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <div className="w-16 h-16 rounded-full bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center mb-4">
              <Search size={26} className="text-[var(--text-muted)]" />
            </div>
            <p className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">Cerca qualcosa</p>
            <p className="text-[14px] text-[var(--text-secondary)]">
              Anime, manga, film, serie TV, videogiochi, giochi da tavolo e libri.
            </p>
          </div>
        )}

        {/* No results */}
        {!loading && !searchError && results.length === 0 && searchTerm.trim().length >= 2 && !isPending && (
          <div className="flex flex-col items-center justify-center py-20 text-center px-8">
            <p className="text-[16px] font-semibold text-[var(--text-primary)] mb-1">Nessun risultato</p>
            <p className="text-[14px] text-[var(--text-secondary)]">{d.noResults}</p>
          </div>
        )}

        {/* Risultati raggruppati per tipo */}
        {showingResults && grouped.map(([type, items]) => items.length === 0 ? null : (
          <div key={type} className="mb-8">
            {/* Header sezione */}
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-[12px] font-semibold px-2.5 py-1 rounded-full"
                style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '0.5px solid var(--border)' }}
              >
                {TYPE_LABELS[type] || type}
              </span>
              <span className="text-[12px] text-[var(--text-muted)]">{items.length} risultati</span>
            </div>

            {/* Grid 3 colonne */}
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  className="group cursor-pointer relative"
                  style={{ animationDelay: `${i * 30}ms` }}
                  onClick={() => handleResultClick(item)}
                >
                  <div className="aspect-[2/3] overflow-hidden bg-[var(--bg-card)] rounded-xl">
                    {hasValidCover(item)
                      ? <img
                          src={item.coverImage}
                          alt={item.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                          onError={e => {
                            const el = e.currentTarget;
                            if (el.src.includes('zoom=3')) {
                              el.src = el.src.replace('zoom=3', 'zoom=1').replace('fife=w400', 'fife=w200');
                            } else {
                              el.style.display = 'none';
                              const fb = el.nextElementSibling as HTMLElement | null;
                              if (fb) fb.style.display = 'flex';
                            }
                          }}
                        />
                      : null}
                    {/* Placeholder icon */}
                    <div
                      className="w-full h-full items-center justify-center text-[var(--text-muted)]"
                      style={{ display: hasValidCover(item) ? 'none' : 'flex' }}
                    >
                      {TYPE_PLACEHOLDER_ICON[type] ?? <Film size={28} />}
                    </div>

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />

                    {/* Action buttons on hover */}
                    <div className="absolute inset-0 flex flex-col justify-between p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex justify-end">
                        <button
                          onClick={e => { e.stopPropagation(); toggleWishlist(item); }}
                          className="w-6 h-6 bg-black/70 backdrop-blur-sm rounded-md flex items-center justify-center"
                        >
                          {wishlistIds.includes(item.id)
                            ? <BookmarkCheck size={11} className="text-violet-400" />
                            : <Bookmark size={11} className="text-white" />}
                        </button>
                      </div>
                      <div className="flex justify-end">
                        {!alreadyAdded.includes(item.id) ? (
                          <button
                            onClick={e => { e.stopPropagation(); setDrawerMedia(toMediaDetails(item)); }}
                            className="w-6 h-6 bg-violet-600 rounded-md flex items-center justify-center"
                          >
                            <Plus size={11} className="text-white" />
                          </button>
                        ) : (
                          <div className="w-6 h-6 bg-emerald-500/30 border border-emerald-500/50 rounded-md flex items-center justify-center">
                            <Check size={11} className="text-emerald-400" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Titolo sotto */}
                  <p className="text-[11px] font-medium text-[var(--text-primary)] line-clamp-2 leading-snug mt-1 px-0.5">
                    {locale === 'en' && item.title_en ? item.title_en : item.title}
                  </p>
                  {item.year && <p className="text-[10px] text-[var(--text-muted)] px-0.5">{item.year}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {drawerMedia && (
        <MediaDetailsDrawer
          media={drawerMedia}
          onClose={() => setDrawerMedia(null)}
          onAdd={(media) => { setAlreadyAdded(prev => [...prev, media.id]); setDrawerMedia(null); }}
        />
      )}
    </div>
  );
}