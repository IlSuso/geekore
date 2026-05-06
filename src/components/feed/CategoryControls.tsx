"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  Filter,
  Loader2,
  Search,
  Tag,
  X,
} from "lucide-react";
import { gestureState } from "@/hooks/gestureState";
import {
  CategoryIcon,
  MACRO_CATEGORIES,
  getCategoryDisplayLabel,
  getCategoryFilterDisplayLabel,
  parseCategoryString,
} from "@/components/feed/CategoryBasics";
import { useLocale } from "@/lib/locale";

const CATEGORY_CONTROLS_COPY = {
  it: {
    mediumTitle: "Media / titolo",
    chooseMedium: "Scegli medium",
    noResults: "Nessun risultato",
    filterByMedium: "Filtra per medium",
    use: "Usa",
    useOnlyMedium: (label: string) => `Usa solo medium “${label}”`,
    allActivitiesIn: (label: string) => `Tutte le activity di ${label}`,
    titleSearchIn: (label: string) => `Cerca titolo in ${label}...`,
    searchExactIn: (query: string, label: string) =>
      `Cerca «${query}» in ${label}`,
    placeholders: {
      movie: "Cerca un film...",
      tv: "Cerca una serie TV...",
      game: "Cerca un videogioco...",
      anime: "Cerca un anime...",
      manga: "Cerca un manga...",
      boardgame: "Cerca un gioco da tavolo...",
      title: "Titolo specifico...",
    },
  },
  en: {
    mediumTitle: "Media / title",
    chooseMedium: "Choose medium",
    noResults: "No results",
    filterByMedium: "Filter by medium",
    use: "Use",
    useOnlyMedium: (label: string) => `Use only “${label}”`,
    allActivitiesIn: (label: string) => `All activity in ${label}`,
    titleSearchIn: (label: string) => `Search title in ${label}...`,
    searchExactIn: (query: string, label: string) =>
      `Search “${query}” in ${label}`,
    placeholders: {
      movie: "Search for a movie...",
      tv: "Search for a TV show...",
      game: "Search for a game...",
      anime: "Search for an anime...",
      manga: "Search for a manga...",
      boardgame: "Search for a board game...",
      title: "Specific title...",
    },
  },
} as const;

const QUICK_SUBS: Record<string, string[]> = {
  Film: ["Azione", "Commedia", "Horror", "Fantascienza", "Animazione"],
  "Serie TV": ["Drama", "Commedia", "Thriller", "Fantascienza", "Reality"],
  Videogiochi: ["RPG", "FPS", "Battle Royale", "Strategia", "Indie"],
  Anime: ["Shonen", "Shojo", "Seinen", "Isekai", "Slice of Life"],
  Manga: ["Shonen", "Shojo", "Seinen", "Josei", "Webtoon"],
  "Giochi da tavolo": [
    "Eurogame",
    "Cooperativo",
    "Astratto",
    "Family",
    "Deck Building",
  ],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rankByQuery(items: SearchResult[], query: string): SearchResult[] {
  if (query.length < 2) return items;
  const q = normalize(query);
  const starts: SearchResult[] = [];
  const contains: SearchResult[] = [];
  for (const item of items) {
    const t = normalize(item.title);
    if (t.startsWith(q)) starts.push(item);
    else if (t.includes(q)) contains.push(item);
  }
  return [...starts, ...contains];
}

type SearchResult = {
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
};

async function searchByCategory(
  category: string,
  query: string,
): Promise<SearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  const q = encodeURIComponent(query.trim());

  try {
    if (category === "Film") {
      const res = await fetch(`/api/tmdb?q=${q}&type=movie`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const items = Array.isArray(data) ? data : [];
      return items
        .slice(0, 8)
        .map((item: any) => ({
          id: String(item.id || item.title),
          title: item.title || item.name || "",
          subtitle: item.year
            ? String(item.year)
            : item.releaseDate?.slice(0, 4),
          image: item.coverImage || item.poster || item.cover,
        }))
        .filter((i: SearchResult) => i.title);
    }

    if (category === "Serie TV") {
      const res = await fetch(`/api/tmdb?q=${q}&type=tv`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const items = Array.isArray(data) ? data : [];
      return items
        .slice(0, 8)
        .map((item: any) => ({
          id: String(item.id || item.title),
          title: item.title || item.name || "",
          subtitle: item.year
            ? String(item.year)
            : item.releaseDate?.slice(0, 4),
          image: item.coverImage || item.poster || item.cover,
        }))
        .filter((i: SearchResult) => i.title);
    }

    if (category === "Videogiochi") {
      const res = await fetch(`/api/igdb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search: query.trim(), limit: 8 }),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const items = Array.isArray(data)
        ? data
        : data.results || data.games || [];
      return items
        .slice(0, 8)
        .map((item: any) => ({
          id: String(item.id || item.name),
          title: item.name || item.title || "",
          subtitle: item.first_release_date
            ? new Date(item.first_release_date * 1000).getFullYear().toString()
            : item.year
              ? String(item.year)
              : undefined,
          image: item.cover?.url
            ? `https:${item.cover.url.replace("t_thumb", "t_cover_small")}`
            : item.cover,
        }))
        .filter((i: SearchResult) => i.title);
    }

    if (category === "Anime" || category === "Manga") {
      const type = category === "Anime" ? "anime" : "manga";
      const res = await fetch(`/api/anilist?search=${q}&type=${type}&lang=it`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const items = Array.isArray(data)
        ? data
        : data.results || data.media || [];
      return items
        .slice(0, 8)
        .map((item: any) => ({
          id: String(item.id),
          title: item.title || item.title?.english || item.title?.romaji || "",
          subtitle: item.year
            ? String(item.year)
            : item.seasonYear
              ? String(item.seasonYear)
              : undefined,
          image: item.coverImage || item.coverImage?.large || item.cover,
        }))
        .filter((i: SearchResult) => i.title);
    }

    if (category === "Giochi da tavolo") {
      const res = await fetch(`/api/bgg?q=${q}`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const items = Array.isArray(data) ? data : [];
      return items
        .slice(0, 8)
        .map((item: any) => ({
          id: String(item.id),
          title: item.title || "",
          subtitle: item.year ? String(item.year) : undefined,
          image: item.coverImage,
        }))
        .filter((i: SearchResult) => i.title);
    }
  } catch (err) {
    if (process.env.NODE_ENV === "development")
      console.warn("[CategorySearch] fetch error:", err);
  }
  return [];
}

function toStoredMediaType(category: string): string | null {
  if (category === "Film") return "movie";
  if (category === "Serie TV") return "tv";
  if (category === "Videogiochi") return "game";
  if (category === "Anime") return "anime";
  if (category === "Manga") return "manga";
  if (category === "Giochi da tavolo") return "boardgame";
  return null;
}

export function CategorySelector({
  value,
  onChange,
  onMediaSelect,
  alwaysExpanded = false,
  embedded = false,
}: {
  value: string;
  onChange: (val: string) => void;
  onMediaSelect?: (media: { external_id?: string | null; title: string; type?: string | null; cover_image?: string | null } | null) => void;
  alwaysExpanded?: boolean;
  embedded?: boolean;
}) {
  const { locale } = useLocale();
  const copy = CATEGORY_CONTROLS_COPY[locale];
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"macro" | "search">("macro");
  const [selectedCat, setSelectedCat] = useState("");
  const [subInput, setSubInput] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isMobileSheet, setIsMobileSheet] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || embedded || typeof window === "undefined") return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const isMobile = window.innerWidth < 768;

    // Keep the picker visually anchored. Without this, desktop scroll makes the
    // floating panel look detached, and mobile can leave the bottom sheet under
    // the fixed navigation.
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    if (isMobile) gestureState.drawerActive = true;

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      if (isMobile) gestureState.drawerActive = false;
    };
  }, [open, embedded]);

  const API_CATEGORIES = new Set([
    "Film",
    "Serie TV",
    "Videogiochi",
    "Anime",
    "Manga",
    "Giochi da tavolo",
  ]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current && !wrapRef.current.contains(target)) {
        const portalPanel = document.getElementById("category-portal-panel");
        if (!portalPanel || !portalPanel.contains(target)) setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && step === "search")
      setTimeout(() => inputRef.current?.focus(), 60);
  }, [open, step]);

  useEffect(() => {
    if (!selectedCat || !API_CATEGORIES.has(selectedCat) || step !== "search")
      return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!subInput.trim() || subInput.trim().length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchByCategory(selectedCat, subInput);
      setSuggestions(rankByQuery(results, subInput.trim()));
      setIsSearching(false);
      setActiveSuggestion(-1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [subInput, selectedCat, step]);

  const openDropup = () => {
    setIsMobileSheet(typeof window !== "undefined" ? window.innerWidth < 768 : false);
    setOpen(true);
    setStep("macro");
  };
  const close = () => {
    setOpen(false);
    setSubInput("");
    setSuggestions([]);
  };

  const selectMacro = (cat: string) => {
    setSelectedCat(cat);
    setSubInput("");
    setSuggestions([]);
    setStep("search");
  };

  const selectSuggestion = (result: SearchResult) => {
    onChange(`${selectedCat}:${result.title}`);
    onMediaSelect?.({
      external_id: result.id || null,
      title: result.title,
      type: toStoredMediaType(selectedCat),
      cover_image: result.image || null,
    });
    close();
  };

  const clearValue = () => {
    setSelectedCat("");
    setSubInput("");
    setSuggestions([]);
    onChange("");
    onMediaSelect?.(null);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeSuggestion >= 0)
        selectSuggestion(suggestions[activeSuggestion]);
    } else if (e.key === "Escape") close();
  };

  const parsed = parseCategoryString(value);
  const hasApiSupport = API_CATEGORIES.has(selectedCat);

  const searchPlaceholder =
    selectedCat === "Film"
      ? copy.placeholders.movie
      : selectedCat === "Serie TV"
        ? copy.placeholders.tv
        : selectedCat === "Videogiochi"
          ? copy.placeholders.game
          : selectedCat === "Anime"
            ? copy.placeholders.anime
            : selectedCat === "Manga"
              ? copy.placeholders.manga
              : selectedCat === "Giochi da tavolo"
                ? copy.placeholders.boardgame
                : copy.placeholders.title;

  const embeddedPortalTarget = mounted && typeof document !== "undefined"
    ? document.getElementById("composer-modal-shell")
    : null;
  const categoryPortalTarget = embedded ? embeddedPortalTarget : mounted && typeof document !== "undefined" ? document.body : null;


  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={value ? clearValue : openDropup}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium border transition-all ${
          value
            ? "bg-zinc-800 border-zinc-600 hover:border-red-500/40 hover:text-red-400"
            : "bg-zinc-800/80 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
        }`}
        style={value ? { color: "var(--accent)" } : {}}
      >
        <Tag size={14} strokeWidth={1.6} />
        {value ? (
          <span className="flex items-center gap-1 min-w-0 max-w-[130px]">
            <CategoryIcon
              category={parsed?.category || ""}
              size={12}
              className="flex-shrink-0"
            />
            <span className="truncate">
              {parsed?.subcategory
                ? parsed.subcategory.trim()
                : getCategoryDisplayLabel(parsed?.category || "", locale)}
            </span>
            <X size={11} className="flex-shrink-0 ml-0.5" />
          </span>
        ) : (
          <span>{copy.mediumTitle}</span>
        )}
      </button>

      {open &&
        mounted &&
        categoryPortalTarget &&
        createPortal(
          <>
            {!embedded && (
              <button
                type="button"
                aria-label="Close media picker"
                className="fixed inset-0 z-[2147483646] bg-black/70 backdrop-blur-[3px]"
                onClick={close}
              />
            )}
            <div
              id="category-portal-panel"
              data-no-swipe
              role="dialog"
              aria-modal="true"
              className={
                embedded
                  ? "absolute inset-x-6 bottom-[86px] z-[80] max-h-[min(420px,58vh)] overflow-y-auto overscroll-contain rounded-[28px] border border-[rgba(230,255,61,0.16)] bg-[linear-gradient(180deg,rgba(25,25,34,0.98),rgba(12,12,17,0.98))] shadow-[0_30px_90px_rgba(0,0,0,0.70),0_0_0_1px_rgba(255,255,255,0.06)]"
                  : isMobileSheet
                    ? "fixed inset-x-0 bottom-0 z-[2147483647] max-h-[78dvh] overflow-y-auto overscroll-contain rounded-t-[28px] border border-zinc-700/80 bg-zinc-950 shadow-2xl shadow-black/80"
                    : "fixed left-1/2 top-1/2 z-[2147483647] w-[min(92vw,460px)] max-h-[78vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-[28px] border border-zinc-700/80 bg-zinc-950 shadow-2xl shadow-black/80"
              }
              style={
                !embedded && isMobileSheet
                  ? { paddingBottom: "max(18px, env(safe-area-inset-bottom))" }
                  : undefined
              }
            >
              {step === "macro" && (
                <div className={isMobileSheet ? "p-4" : "p-5"}>
                  {isMobileSheet && (
                    <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-700" />
                  )}
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      {copy.chooseMedium}
                    </span>
                    <button
                      type="button"
                      onClick={close}
                      className="text-zinc-600 hover:text-zinc-400 transition-colors p-0.5"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div
                    className={
                      isMobileSheet
                        ? "grid grid-cols-2 gap-2"
                        : "grid grid-cols-3 gap-2"
                    }
                  >
                    {MACRO_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => selectMacro(cat)}
                        className={
                          isMobileSheet
                            ? "flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-3 text-left transition-all hover:border-zinc-600 hover:bg-zinc-900 active:scale-[0.99]"
                            : "group flex flex-col items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-5 transition-all hover:border-zinc-600 hover:bg-zinc-900"
                        }
                      >
                        <CategoryIcon
                          category={cat}
                          size={isMobileSheet ? 19 : 22}
                          className="flex-shrink-0 text-zinc-400 transition-colors group-hover:text-white"
                        />
                        <span
                          className={
                            isMobileSheet
                              ? "min-w-0 text-[13px] font-bold leading-tight text-zinc-100"
                              : "text-center text-[13px] font-semibold leading-tight text-zinc-200 transition-colors group-hover:text-white"
                          }
                        >
                          {getCategoryDisplayLabel(cat, locale)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === "search" &&
                (() => {
                  const header = (
                    <div className="mb-4 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setStep("macro");
                          setSuggestions([]);
                        }}
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/80 text-zinc-400 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-white"
                        aria-label="Back"
                      >
                        <ArrowLeft size={15} />
                      </button>

                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-[rgba(230,255,61,0.18)] bg-[rgba(230,255,61,0.08)]">
                          <CategoryIcon
                            category={selectedCat}
                            size={15}
                            style={{ color: "var(--accent)" }}
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                            {copy.mediumTitle}
                          </p>
                          <p className="truncate text-base font-black text-white">
                            {getCategoryDisplayLabel(selectedCat, locale)}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={close}
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white"
                        aria-label="Close"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  );
                  const inputEl = (
                    <div className="relative mb-3">
                      <Search
                        size={15}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
                      />
                      <input
                        ref={inputRef}
                        type="text"
                        value={subInput}
                        onChange={(e) => setSubInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                          hasApiSupport
                            ? searchPlaceholder
                            : copy.placeholders.title
                        }
                        className="no-nav-hide w-full rounded-2xl border border-[rgba(230,255,61,0.22)] bg-zinc-950/70 py-3.5 pl-11 pr-11 text-[15px] font-semibold text-white placeholder-zinc-600 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] transition focus:border-[rgba(230,255,61,0.45)] focus:outline-none"
                      />
                      {isSearching && (
                        <Loader2
                          size={15}
                          className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin"
                          style={{ color: "var(--accent)" }}
                        />
                      )}
                    </div>
                  );
                  const results =
                    suggestions.length > 0 ? (
                      <div className="mb-3 max-h-[38dvh] overflow-y-auto overscroll-contain rounded-3xl border border-zinc-800/80 bg-zinc-950/75 p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] sm:max-h-[260px]">
                        {suggestions.map((result, idx) => (
                          <button
                            key={result.id}
                            type="button"
                            onClick={() => selectSuggestion(result)}
                            className={`group w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all ${
                              idx === activeSuggestion
                                ? "bg-[rgba(230,255,61,0.10)]"
                                : "hover:bg-zinc-900"
                            }`}
                          >
                            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-500 transition-colors group-hover:border-[rgba(230,255,61,0.25)] group-hover:text-[var(--accent)]">
                              <CategoryIcon category={selectedCat} size={15} />
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-[14px] font-black leading-tight text-white">
                                {result.title}
                              </p>
                              {result.subtitle && (
                                <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                                  {result.subtitle}
                                </p>
                              )}
                            </div>
                            <Check
                              size={15}
                              className={`flex-shrink-0 transition-opacity ${
                                idx === activeSuggestion
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-70"
                              }`}
                              style={{ color: "var(--accent)" }}
                            />
                          </button>
                        ))}
                      </div>
                    ) : null;
                  const usaLibero =
                    subInput.trim() && !isSearching ? (
                      <button
                        type="button"
                        onClick={() => {
                          onChange(`${selectedCat}:${subInput.trim()}`);
                          onMediaSelect?.({
                            external_id: null,
                            title: subInput.trim(),
                            type: toStoredMediaType(selectedCat),
                            cover_image: null,
                          });
                          close();
                        }}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium transition mb-2"
                        style={{
                          background: "rgba(230,255,61,0.1)",
                          border: "1px solid rgba(230,255,61,0.25)",
                          color: "var(--accent)",
                        }}
                      >
                        <Check size={13} />
                        {copy.use}{" "}
                        <strong className="font-semibold">
                          "{subInput.trim()}"
                        </strong>
                      </button>
                    ) : null;
                  const nessunRis =
                    hasApiSupport &&
                    subInput.length >= 2 &&
                    !isSearching &&
                    suggestions.length === 0 ? (
                      <p className="text-[12px] text-zinc-600 text-center py-2">
                        {copy.noResults}
                      </p>
                    ) : null;
                  const chips =
                    !hasApiSupport && !subInput ? (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(QUICK_SUBS[selectedCat] || []).map((sub) => (
                          <button
                            key={sub}
                            type="button"
                            onClick={() => {
                              onChange(`${selectedCat}:${sub}`);
                              onMediaSelect?.({
                                external_id: null,
                                title: sub,
                                type: toStoredMediaType(selectedCat),
                                cover_image: null,
                              });
                              close();
                            }}
                            className="px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700/80 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-white transition-all"
                          >
                            {sub}
                          </button>
                        ))}
                      </div>
                    ) : null;
                  const usaSoloMacro = (
                    <button
                      type="button"
                      onClick={() => {
                        onChange(selectedCat);
                        onMediaSelect?.(null);
                        close();
                      }}
                      className="mt-1 w-full text-center text-[12px] text-zinc-600 hover:text-zinc-400 transition py-1"
                    >
                      {copy.useOnlyMedium(
                        getCategoryDisplayLabel(selectedCat, locale),
                      )}
                    </button>
                  );
                  if (isMobileSheet) {
                    return (
                      <div className="p-4">
                        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-700" />
                        {header}
                        {inputEl}
                        {results}
                        {usaLibero}
                        {nessunRis}
                        {chips}
                        {usaSoloMacro}
                      </div>
                    );
                  }
                  return (
                    <div className="p-5">
                      {header}
                      {inputEl}
                      {results}
                      {usaLibero}
                      {nessunRis}
                      {chips}
                      {usaSoloMacro}
                    </div>
                  );
                })()}
            </div>
          </>,
          categoryPortalTarget,
        )}
    </div>
  );
}

export function CategoryFilter({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: string;
  onFilterChange: (val: string) => void;
}) {
  const { locale } = useLocale();
  const copy = CATEGORY_CONTROLS_COPY[locale];
  const [open, setOpen] = useState(false);
  const [activeMacro, setActiveMacro] = useState("");
  const [subSearch, setSubSearch] = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const API_CATEGORIES = new Set([
    "Film",
    "Serie TV",
    "Videogiochi",
    "Anime",
    "Manga",
    "Giochi da tavolo",
  ]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (!activeMacro || !API_CATEGORIES.has(activeMacro)) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!subSearch.trim() || subSearch.trim().length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const results = await searchByCategory(activeMacro, subSearch);
      setSuggestions(rankByQuery(results, subSearch.trim()));
      setIsSearching(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [subSearch, activeMacro]);

  const handleMacro = (cat: string) => {
    if (activeMacro === cat) {
      setActiveMacro("");
      setSubSearch("");
      setSuggestions([]);
    } else {
      setActiveMacro(cat);
      setSubSearch("");
      setSuggestions([]);
    }
  };

  const applyFilter = (val: string) => {
    onFilterChange(val);
    setOpen(false);
  };

  const parsed = parseCategoryString(activeFilter);
  const displayLabel = activeFilter
    ? getCategoryFilterDisplayLabel(activeFilter, locale) || activeFilter
    : copy.filterByMedium;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold border transition-all max-w-[160px] sm:max-w-none ${
          activeFilter
            ? "border-[rgba(230,255,61,0.4)] text-[var(--accent)]"
            : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"
        }`}
      >
        <Filter size={14} className="flex-shrink-0" />
        {activeFilter && (
          <CategoryIcon
            category={parsed?.category || ""}
            size={13}
            className="flex-shrink-0"
          />
        )}
        <span className="truncate">{displayLabel}</span>
        {activeFilter && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              applyFilter("");
              setActiveMacro("");
              setSubSearch("");
            }}
            className="ml-1 hover:text-red-400 transition-colors"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed sm:absolute top-auto sm:top-full left-0 right-0 sm:left-auto sm:right-auto bottom-0 sm:bottom-auto mt-0 sm:mt-2 bg-zinc-900 border border-zinc-700 rounded-t-3xl sm:rounded-2xl shadow-2xl shadow-black/60 w-full sm:w-[300px] p-3 pb-6 sm:pb-3"
          style={{ zIndex: 20000 }}
        >
          <p className="gk-label px-1 pb-2">{copy.filterByMedium}</p>

          <div className="mb-3">
            <div className="grid grid-cols-3 gap-1.5 mb-1.5">
              {MACRO_CATEGORIES.slice(0, 3).map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleMacro(cat)}
                  className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    activeMacro === cat
                      ? "border-[rgba(230,255,61,0.5)] text-[var(--accent)]"
                      : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                  }`}
                >
                  <CategoryIcon category={cat} size={11} />
                  {getCategoryDisplayLabel(cat, locale)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MACRO_CATEGORIES.slice(3).map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleMacro(cat)}
                  className={`flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                    activeMacro === cat
                      ? "border-[rgba(230,255,61,0.5)] text-[var(--accent)]"
                      : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500"
                  }`}
                >
                  <CategoryIcon category={cat} size={11} />
                  {getCategoryDisplayLabel(cat, locale)}
                </button>
              ))}
            </div>
          </div>

          {activeMacro && (
            <>
              <button
                onClick={() => applyFilter(activeMacro)}
                className="w-full text-left px-3 py-2 rounded-xl text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition mb-2"
              >
                {copy.allActivitiesIn(activeMacro).replace(activeMacro, "")}
                <strong>{activeMacro}</strong>
              </button>

              <div className="relative mb-2">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                />
                <input
                  autoFocus
                  type="text"
                  value={subSearch}
                  onChange={(e) => setSubSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && subSearch.trim())
                      applyFilter(`${activeMacro}:${subSearch.trim()}`);
                  }}
                  placeholder={copy.titleSearchIn(activeMacro)}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-zinc-500 focus:outline-none rounded-xl pl-8 pr-8 py-2 text-sm text-white placeholder-zinc-500 transition"
                />
                {isSearching && (
                  <Loader2
                    size={13}
                    className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin"
                    style={{ color: "var(--accent)" }}
                  />
                )}
              </div>

              {suggestions.length > 0 && (
                <div className="mb-2 max-h-[38dvh] sm:max-h-[200px] overflow-y-auto overscroll-contain rounded-2xl sm:rounded-xl border border-zinc-800 sm:border-zinc-700/50 bg-zinc-950">
                  {suggestions.map((result) => (
                    <button
                      key={result.id}
                      onClick={() =>
                        applyFilter(`${activeMacro}:${result.title}`)
                      }
                      className="w-full flex items-center gap-3 px-3 py-2 text-left border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/80 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white truncate">
                          {result.title}
                        </p>
                        {result.subtitle && (
                          <p className="text-[11px] text-zinc-500">
                            {result.subtitle}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {subSearch.trim() && !isSearching && (
                <button
                  onClick={() =>
                    applyFilter(`${activeMacro}:${subSearch.trim()}`)
                  }
                  className="w-full px-3 py-2 rounded-xl text-sm font-semibold transition"
                  style={{
                    background: "rgba(230,255,61,0.1)",
                    border: "1px solid rgba(230,255,61,0.25)",
                    color: "var(--accent)",
                  }}
                >
                  {copy.searchExactIn(subSearch.trim(), activeMacro)}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
