"use client";

import { memo, useState } from "react";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Flame,
  Search,
  Bookmark,
  Sparkles,
  Star,
} from "lucide-react";
import { useLocale } from "@/lib/locale";

type MediaType = "anime" | "manga" | "movie" | "tv" | "game" | "boardgame";

export interface TasteProfile {
  globalGenres: Array<{ genre: string; score: number }>;
  topGenres: Record<MediaType, Array<{ genre: string; score: number }>>;
  collectionSize: Record<string, number>;
  recentWindow?: number;
  deepSignals?: {
    topThemes: string[];
    topTones: string[];
    topSettings: string[];
  };
  discoveryGenres?: string[];
  negativeGenres?: string[];
  creatorScores?: {
    topStudios: Array<{ name: string; score: number }>;
    topDirectors: Array<{ name: string; score: number }>;
  };
  bingeProfile?: {
    isBinger: boolean;
    avgCompletionDays: number;
    bingeGenres: string[];
    slowGenres: string[];
  };
  wishlistGenres?: string[];
  searchIntentGenres?: string[];
  lowConfidence?: boolean;
  totalEntries?: number;
}

type DNAWidgetProps = {
  tasteProfile?: Partial<TasteProfile> | null;
  profile?: Partial<TasteProfile> | null;
  totalEntries?: number;
  compact?: boolean;
};

const DNA_COPY = {
  it: {
    badge: "Il tuo DNA",
    building: "Gusto in costruzione",
    titlesMonths: (entries: number, months: number) =>
      `${entries} titoli · ultimi ${months} mesi`,
    addMedia: "Aggiungi media per calcolare il DNA",
    dominantGenres: "Generi dominanti",
    buildingTitle: "DNA in costruzione",
    buildingDesc:
      "Aggiungi e valuta più media per vedere generi, creator e segnali di gusto più precisi.",
    tonesSettings: "Toni e ambientazioni",
    favoriteTones: "Toni preferiti",
    lovedSettings: "Setting amati",
    recentSignals: "Segnali recenti",
    bingeWatch: "Binge watch",
    frequentSearches: "Cerchi spesso",
    fromWishlist: "Dalla wishlist",
    toExplore: "Da esplorare",
    bingeMode: "binge mode",
  },
  en: {
    badge: "Your DNA",
    building: "Taste in progress",
    titlesMonths: (entries: number, months: number) =>
      `${entries} titles · last ${months} months`,
    addMedia: "Add media to calculate your DNA",
    dominantGenres: "Dominant genres",
    buildingTitle: "DNA in progress",
    buildingDesc:
      "Add and rate more media to see more precise genres, creators and taste signals.",
    tonesSettings: "Tones and settings",
    favoriteTones: "Favorite tones",
    lovedSettings: "Loved settings",
    recentSignals: "Recent signals",
    bingeWatch: "Binge watch",
    frequentSearches: "Frequent searches",
    fromWishlist: "From wishlist",
    toExplore: "To explore",
    bingeMode: "binge mode",
  },
} as const;

const MEDIA_ORDER: MediaType[] = [
  "anime",
  "game",
  "tv",
  "manga",
  "movie",
  "boardgame",
];

const MEDIA_LABEL: Record<MediaType, string> = {
  anime: "Anime",
  game: "Game",
  tv: "TV",
  manga: "Manga",
  movie: "Film",
  boardgame: "Board",
};

const MEDIA_CLASS: Record<MediaType, string> = {
  anime: "gk-chip-anime",
  game: "gk-chip-game",
  tv: "gk-chip-tv",
  manga: "gk-chip-manga",
  movie: "gk-chip-movie",
  boardgame: "gk-chip-board",
};

const EMPTY_PROFILE: TasteProfile = {
  globalGenres: [],
  topGenres: {
    anime: [],
    manga: [],
    movie: [],
    tv: [],
    game: [],
    boardgame: [],
  },
  collectionSize: {},
  recentWindow: 6,
  deepSignals: { topThemes: [], topTones: [], topSettings: [] },
  discoveryGenres: [],
  negativeGenres: [],
  creatorScores: { topStudios: [], topDirectors: [] },
  bingeProfile: {
    isBinger: false,
    avgCompletionDays: 0,
    bingeGenres: [],
    slowGenres: [],
  },
  wishlistGenres: [],
  searchIntentGenres: [],
  lowConfidence: true,
  totalEntries: 0,
};

function normalizeTasteProfile(
  profile?: Partial<TasteProfile> | null,
): TasteProfile {
  const deepSignals = profile?.deepSignals;
  return {
    ...EMPTY_PROFILE,
    ...(profile || {}),
    globalGenres: Array.isArray(profile?.globalGenres)
      ? profile.globalGenres
      : [],
    topGenres: { ...EMPTY_PROFILE.topGenres, ...(profile?.topGenres || {}) },
    collectionSize: profile?.collectionSize || {},
    deepSignals: {
      topThemes: Array.isArray(deepSignals?.topThemes)
        ? deepSignals.topThemes
        : [],
      topTones: Array.isArray(deepSignals?.topTones)
        ? deepSignals.topTones
        : [],
      topSettings: Array.isArray(deepSignals?.topSettings)
        ? deepSignals.topSettings
        : [],
    },
    discoveryGenres: Array.isArray(profile?.discoveryGenres)
      ? profile.discoveryGenres
      : [],
    negativeGenres: Array.isArray(profile?.negativeGenres)
      ? profile.negativeGenres
      : [],
    creatorScores: {
      topStudios: Array.isArray(profile?.creatorScores?.topStudios)
        ? profile.creatorScores.topStudios
        : [],
      topDirectors: Array.isArray(profile?.creatorScores?.topDirectors)
        ? profile.creatorScores.topDirectors
        : [],
    },
    bingeProfile: {
      ...EMPTY_PROFILE.bingeProfile!,
      ...(profile?.bingeProfile || {}),
      bingeGenres: Array.isArray(profile?.bingeProfile?.bingeGenres)
        ? profile.bingeProfile.bingeGenres
        : [],
      slowGenres: Array.isArray(profile?.bingeProfile?.slowGenres)
        ? profile.bingeProfile.slowGenres
        : [],
    },
    wishlistGenres: Array.isArray(profile?.wishlistGenres)
      ? profile.wishlistGenres
      : [],
    searchIntentGenres: Array.isArray(profile?.searchIntentGenres)
      ? profile.searchIntentGenres
      : [],
    totalEntries:
      typeof profile?.totalEntries === "number" ? profile.totalEntries : 0,
  };
}

function uniqueStrings(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const clean = typeof value === "string" ? value.trim() : "";
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }
  return result;
}

function formatPercent(value: number, total: number): number {
  if (!total) return 0;
  return Math.max(1, Math.round((value / total) * 100));
}

export const DNAWidget = memo(function DNAWidget({
  tasteProfile,
  profile: legacyProfile,
  totalEntries,
  compact = false,
}: DNAWidgetProps) {
  const { locale } = useLocale();
  const dc = DNA_COPY[locale];
  const sourceProfile = tasteProfile || legacyProfile || null;
  const profile = normalizeTasteProfile(sourceProfile);
  const resolvedTotalEntries =
    typeof totalEntries === "number"
      ? totalEntries
      : typeof profile.totalEntries === "number"
        ? profile.totalEntries
        : 0;

  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    if (!localStorage.getItem("dna_widget_seen")) {
      localStorage.setItem("dna_widget_seen", "1");
      return true;
    }
    return false;
  });

  const maxGenreScore = profile.globalGenres[0]?.score || 1;
  const dominantGenres = profile.globalGenres
    .filter(
      (g, index, arr) => arr.findIndex((x) => x.genre === g.genre) === index,
    )
    .slice(0, 4);

  const collectionTotal = Object.values(profile.collectionSize || {}).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  const mediaBreakdown = MEDIA_ORDER.map((type) => ({
    type,
    count: Number(profile.collectionSize?.[type] || 0),
  })).filter((item) => item.count > 0);

  const topTones = uniqueStrings(profile.deepSignals?.topTones);
  const topSettings = uniqueStrings(profile.deepSignals?.topSettings);
  const bingeGenres = uniqueStrings(profile.bingeProfile?.bingeGenres);
  const searchIntentGenres = uniqueStrings(profile.searchIntentGenres);
  const wishlistGenres = uniqueStrings(profile.wishlistGenres);
  const discoveryGenres = uniqueStrings(profile.discoveryGenres);

  return (
    <section
      className={`gk-dna-wide mb-8 w-full max-w-none overflow-hidden rounded-[28px] border border-[rgba(230,255,61,0.20)] bg-[linear-gradient(160deg,rgba(230,255,61,0.07),var(--bg-secondary))] shadow-[0_18px_60px_rgba(0,0,0,0.28)] ${compact ? "md:mb-6" : ""}`}
    >
      <button
        type="button"
        data-no-swipe="true"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 pb-4 pt-5 text-left md:px-6 md:pt-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.35)] bg-[rgba(230,255,61,0.08)] px-3 py-1 font-mono-data text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
              <Star size={11} fill="currentColor" /> {dc.badge}
            </div>

            {dominantGenres.length > 0 ? (
              <h2 className="mb-2 font-display text-[18px] font-black leading-tight tracking-[-0.03em] text-[var(--text-primary)] md:text-[22px]">
                {dominantGenres.map((g) => g.genre).join(" · ")}
              </h2>
            ) : (
              <h2 className="mb-2 font-display text-[18px] font-black leading-tight tracking-[-0.03em] text-[var(--text-primary)] md:text-[22px]">
                {dc.building}
              </h2>
            )}

            <p className="gk-caption">
              {dc.titlesMonths(resolvedTotalEntries, profile.recentWindow || 6)}
              {profile.bingeProfile?.isBinger && (
                <span className="ml-2 inline-flex items-center gap-0.5 text-orange-400">
                  <Flame size={10} className="inline" /> {dc.bingeMode}
                </span>
              )}
            </p>
          </div>

          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)] text-[#0B0B0F] shadow-[0_0_32px_rgba(230,255,61,0.25)]">
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </button>

      <div className="px-5 pb-5 md:px-6">
        {dominantGenres.length > 0 && (
          <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-black/30 ring-1 ring-white/5">
            {dominantGenres.map(({ genre, score }, index) => (
              <div
                key={`dna-bar-${genre}-${index}`}
                className="h-full flex-shrink-0"
                style={{
                  width: `${Math.max(
                    8,
                    formatPercent(
                      score,
                      dominantGenres.reduce((sum, g) => sum + g.score, 0),
                    ),
                  )}%`,
                  background: [
                    "var(--accent)",
                    "var(--type-anime)",
                    "var(--type-game)",
                    "var(--type-movie)",
                  ][index % 4],
                }}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {mediaBreakdown.length > 0 ? (
            mediaBreakdown.map(({ type, count }) => (
              <span key={type} className={`gk-chip ${MEDIA_CLASS[type]}`}>
                {MEDIA_LABEL[type]} {formatPercent(count, collectionTotal)}%
              </span>
            ))
          ) : (
            <span className="gk-chip gk-chip-match">{dc.addMedia}</span>
          )}
        </div>
      </div>

      {open && (
        <div className="space-y-6 border-t border-[rgba(255,255,255,0.06)] px-5 pb-5 pt-5 md:px-6">
          {profile.globalGenres.length > 0 ? (
            <div>
              <p className="gk-label mb-3">{dc.dominantGenres}</p>
              <div className="space-y-2.5">
                {profile.globalGenres
                  .slice(0, 6)
                  .map(({ genre, score }, index) => {
                    const pct = Math.round((score / maxGenreScore) * 100);
                    return (
                      <div
                        key={`global-${genre}-${index}`}
                        className="flex items-center gap-3"
                      >
                        <span className="w-28 truncate text-xs font-semibold text-zinc-300">
                          {genre}
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/30">
                          <div
                            className="h-full rounded-full bg-[var(--accent)]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-8 text-right font-mono-data text-[10px] font-bold text-zinc-400">
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-black/18 p-4">
              <p className="gk-label mb-1 text-[var(--accent)]">
                {dc.buildingTitle}
              </p>
              <p className="gk-caption">{dc.buildingDesc}</p>
            </div>
          )}

          {(topTones.length > 0 || topSettings.length > 0) && (
            <div>
              <p className="gk-label mb-3">{dc.tonesSettings}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {topTones.length > 0 && (
                  <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
                    <p className="gk-caption mb-2">{dc.favoriteTones}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {topTones.slice(0, 6).map((tone, index) => (
                        <span
                          key={`tone-${tone}-${index}`}
                          className="gk-chip gk-chip-match"
                        >
                          {tone}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {topSettings.length > 0 && (
                  <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
                    <p className="gk-caption mb-2">{dc.lovedSettings}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {topSettings.slice(0, 6).map((setting, index) => (
                        <span
                          key={`setting-${setting}-${index}`}
                          className="gk-chip"
                        >
                          {setting}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(bingeGenres.length > 0 ||
            searchIntentGenres.length > 0 ||
            wishlistGenres.length > 0 ||
            discoveryGenres.length > 0) && (
            <div>
              <p className="gk-label mb-3">{dc.recentSignals}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {bingeGenres.length > 0 && (
                  <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
                    <p className="mb-2 flex items-center gap-1 gk-caption">
                      <Flame size={10} className="text-orange-400" />{" "}
                      {dc.bingeWatch}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {bingeGenres.slice(0, 4).map((g, i) => (
                        <span
                          key={`binge-${g}-${i}`}
                          className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-300"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {searchIntentGenres.length > 0 && (
                  <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
                    <p className="mb-2 flex items-center gap-1 gk-caption">
                      <Search size={10} /> {dc.frequentSearches}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {searchIntentGenres.slice(0, 4).map((g, i) => (
                        <span
                          key={`search-${g}-${i}`}
                          className="rounded-full border border-amber-500/15 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {wishlistGenres.length > 0 && (
                  <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
                    <p className="mb-2 flex items-center gap-1 gk-caption">
                      <Bookmark size={10} /> {dc.fromWishlist}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {wishlistGenres.slice(0, 4).map((g, i) => (
                        <span
                          key={`wishlist-${g}-${i}`}
                          className="rounded-full border border-emerald-500/15 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {discoveryGenres.length > 0 && (
                  <div className="rounded-2xl bg-black/18 p-3 ring-1 ring-white/5">
                    <p className="mb-2 flex items-center gap-1 gk-caption">
                      <Sparkles size={10} /> {dc.toExplore}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {discoveryGenres.slice(0, 4).map((g, i) => (
                        <span
                          key={`discovery-${g}-${i}`}
                          className="rounded-full border border-teal-500/15 bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-teal-300"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
});
