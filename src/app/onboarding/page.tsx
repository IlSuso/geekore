"use client";
// DESTINAZIONE: src/app/onboarding/page.tsx

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Zap,
  Gamepad2,
  Film,
  Tv,
  Check,
  Layers,
  Swords,
  ArrowRight,
  Sparkles,
  Users,
  TrendingUp,
  UploadCloud,
  Dices,
  ArrowLeft,
} from "lucide-react";
import { SwipeMode } from "@/components/for-you/SwipeMode";
import type { SwipeItem } from "@/components/for-you/SwipeMode";
import { useLocale } from "@/lib/locale";

const TOTAL_STEPS = 4;

const MEDIA_TYPES = [
  { id: "anime", label: "Anime", icon: Swords, color: "var(--type-anime)" },
  { id: "manga", label: "Manga", icon: Layers, color: "var(--type-manga)" },
  {
    id: "game",
    label: "Videogiochi",
    icon: Gamepad2,
    color: "var(--type-game)",
  },
  { id: "tv", label: "Serie TV", icon: Tv, color: "var(--type-tv)" },
  { id: "movie", label: "Film", icon: Film, color: "var(--type-movie)" },
  {
    id: "boardgame",
    label: "Boardgame",
    icon: Dices,
    color: "var(--type-board)",
  },
];

const IMPORT_SOURCES = [
  {
    id: "anilist",
    label: "AniList",
    detail: "Anime e manga già visti",
    href: "/profile/me?import=anilist",
    icon: Swords,
    color: "var(--type-anime)",
  },
  {
    id: "steam",
    label: "Steam",
    detail: "Ore giocate e libreria PC",
    href: "/profile/me?import=steam",
    icon: Gamepad2,
    color: "var(--type-game)",
  },
  {
    id: "letterboxd",
    label: "Letterboxd",
    detail: "Film e rating",
    href: "/profile/me?import=letterboxd",
    icon: Film,
    color: "var(--type-movie)",
  },
  {
    id: "bgg",
    label: "BoardGameGeek",
    detail: "Boardgame collection",
    href: "/profile/me?import=bgg",
    icon: UploadCloud,
    color: "var(--type-board)",
  },
];

const FEATURES = [
  {
    icon: Sparkles,
    label: "Raccomandazioni personalizzate basate sui tuoi gusti",
  },
  { icon: Users, label: "Segui amici e scopri cosa stanno guardando" },
  {
    icon: TrendingUp,
    label: "Traccia i progressi su tutti i tuoi media preferiti",
  },
];

type CategoryKey =
  | "all"
  | "anime"
  | "manga"
  | "movie"
  | "tv"
  | "game"
  | "boardgame";

type SuggestedUser = {
  id: string;
  username: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

const POOL_QUICK = 15;
const POOL_TARGET = 50;

function recToSwipeItem(r: any): SwipeItem {
  return {
    id: r.id,
    title: r.title,
    type: r.type as SwipeItem["type"],
    coverImage: r.coverImage,
    year: r.year,
    genres: r.genres || [],
    score: r.score,
    description: r.description,
    why: r.why,
    matchScore: r.matchScore || 0,
    episodes: r.episodes,
    authors: r.authors,
    developers: r.developers,
    platforms: r.platforms,
    isAwardWinner: r.isAwardWinner,
    isDiscovery: r.isDiscovery,
    source: r.source,
  };
}

function interleavedMix(
  byType: Record<string, SwipeItem[]>,
  limit: number,
): SwipeItem[] {
  const types = Object.keys(byType).filter((t) => byType[t].length > 0);
  const result: SwipeItem[] = [];
  let i = 0;
  while (result.length < limit) {
    let added = false;
    for (const t of types) {
      if (byType[t][i]) {
        result.push(byType[t][i]);
        added = true;
      }
      if (result.length >= limit) break;
    }
    if (!added) break;
    i++;
  }
  return result;
}

async function localizeSwipeItems(
  items: SwipeItem[],
  locale: "it" | "en",
): Promise<SwipeItem[]> {
  if (!items.length) return items;
  const res = await fetch("/api/media/localize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale, items }),
  }).catch(() => null);
  if (!res?.ok) return items;
  const json = await res.json().catch(() => null);
  return Array.isArray(json?.items) ? json.items : items;
}

async function fetchCategoryTitles(
  category: CategoryKey,
  selectedTypes: string[],
  globalSeenIds: Set<string>,
  limit: number = POOL_TARGET,
  locale: "it" | "en" = "it",
): Promise<SwipeItem[]> {
  const params = new URLSearchParams();
  if (category === "all" && selectedTypes.length > 0)
    params.set("types", selectedTypes.join(","));
  else if (category !== "all") params.set("types", category);
  try {
    params.set("lang", locale);
    const res = await fetch(
      `/api/recommendations/onboarding?${params.toString()}`,
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (category === "all") {
      const byType: Record<string, SwipeItem[]> = {};
      for (const [type, items] of Object.entries(json.recommendations || {})) {
        byType[type] = (items as any[])
          .filter((r: any) => !globalSeenIds.has(r.id))
          .sort(() => Math.random() - 0.4)
          .map(recToSwipeItem);
      }
      return await localizeSwipeItems(interleavedMix(byType, limit), locale);
    }
    let recs = (json.recommendations?.[category] || []) as any[];
    if (recs.length === 0)
      recs = (Object.values(json.recommendations || {}) as any[][])
        .flat()
        .filter((r: any) => r.type === category);
    const mapped = recs
      .sort(() => Math.random() - 0.4)
      .filter((r: any) => !globalSeenIds.has(r.id))
      .slice(0, limit)
      .map(recToSwipeItem);
    return await localizeSwipeItems(mapped, locale);
  } catch {
    return [];
  }
}

function setOnboardingCookie() {
  const maxAge = 60 * 60 * 24 * 365;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `geekore_onboarding_done=1; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

function StepDots({ current, total }: { current: number; total: number }) {
  const pct = Math.round(((current + 1) / total) * 100);
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="gk-mono text-[var(--text-muted)]">
          Passo {current + 1} di {total}
        </span>
        <span className="font-mono-data text-[11px] font-bold text-[var(--accent)]">
          {pct}%
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function BrandPanel({ step }: { step: number }) {
  const copy = [
    {
      title: ["Scegli i media", "che contano."],
      sub: "Partiamo dalle categorie che vuoi davvero tracciare.",
    },
    {
      title: ["Importa la storia,", "non ripartire da zero."],
      sub: "AniList, Steam, Letterboxd e BGG diventano il tuo cold-start intelligente.",
    },
    {
      title: ["Dai segnali forti", "al tuo DNA."],
      sub: "Valuta, salva o scarta titoli: il feed parte già con una direzione.",
    },
    {
      title: ["Preferenze pronte,", "entra nel feed."],
      sub: "Conferma il tuo profilo iniziale e scopri utenti da seguire.",
    },
  ][Math.min(step, 3)];

  return (
    <div
      className="relative flex h-full w-full flex-col justify-between overflow-hidden px-8 py-9"
      style={{
        background:
          "linear-gradient(160deg, rgba(230,255,61,0.035) 0%, var(--bg-primary) 58%)",
      }}
    >
      {/* Background decoration */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          style={{
            position: "absolute",
            top: "-10%",
            left: "-10%",
            width: "70%",
            height: "60%",
            background:
              "radial-gradient(ellipse at center, rgba(230,255,61,0.08) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "10%",
            right: "-5%",
            width: "50%",
            height: "40%",
            background:
              "radial-gradient(ellipse at center, rgba(124,58,237,0.05) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <div className="relative z-10 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[13px] bg-[var(--accent)] shadow-[0_4px_20px_rgba(230,255,61,0.18)]">
          <Zap size={18} className="text-black" />
        </div>
        <span className="font-display text-xl font-black tracking-[-0.03em] text-white">
          geekore
        </span>
      </div>
      <div className="relative z-10 space-y-5">
        <p className="gk-section-eyebrow mb-2 inline-flex">
          <Sparkles size={12} /> onboarding
        </p>
        <h2
          key={step}
          className="font-display max-w-[300px] text-[36px] font-black leading-[0.95] tracking-[-0.055em] text-white"
        >
          {copy.title.map((line, i) => (
            <span
              key={line}
              className="block"
              style={
                i === copy.title.length - 1 ? { color: "var(--accent)" } : {}
              }
            >
              {line}
            </span>
          ))}
        </h2>
        <p className="max-w-[280px] text-sm leading-6 text-[var(--text-secondary)]">
          {copy.sub}
        </p>
        {step === 0 && (
          <div className="space-y-2 pt-1">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-2xl p-3"
                style={{
                  background: "rgba(255,255,255,0.028)",
                  border: "1px solid rgba(255,255,255,0.055)",
                }}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[rgba(230,255,61,0.18)] bg-[rgba(230,255,61,0.07)]">
                  <Icon size={15} className="text-[var(--accent)]" />
                </div>
                <span className="text-xs font-medium leading-relaxed text-zinc-300">
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p
        className="relative z-10 text-xs"
        style={{ color: "rgba(255,255,255,0.15)" }}
      >
        © {new Date().getFullYear()} Geekore
      </p>
    </div>
  );
}

function UserSuggestionCard({
  user,
  followingIds,
  pendingFollowId,
  onToggleFollow,
}: {
  user: SuggestedUser;
  followingIds: Set<string>;
  pendingFollowId: string | null;
  onToggleFollow: (profileId: string) => void;
}) {
  const username = user.username || user.id;
  const name = user.display_name || user.username || "Geekore user";
  const initial = name.trim().slice(0, 1).toUpperCase() || "G";
  const isFollowing = followingIds.has(user.id);
  const isPending = pendingFollowId === user.id;

  return (
    <div className="group flex items-center gap-3 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/82 p-3 transition-colors hover:border-[rgba(230,255,61,0.22)] hover:bg-[var(--bg-card-hover)]">
      <a
        href={`/profile/${username}`}
        data-no-swipe="true"
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--bg-elevated)] font-display text-sm font-black text-[var(--accent)] ring-1 ring-white/5">
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            initial
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white transition-colors group-hover:text-[var(--accent)]">
            {name}
          </p>
          {user.username && (
            <p className="truncate font-mono-data text-[10px] text-[var(--text-muted)]">
              @{user.username}
            </p>
          )}
        </div>
      </a>
      <button
        type="button"
        data-no-swipe="true"
        onClick={() => onToggleFollow(user.id)}
        disabled={isPending}
        className="inline-flex h-9 min-w-[92px] shrink-0 items-center justify-center rounded-full border px-3 text-[11px] font-black transition-all disabled:cursor-wait disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
        style={
          isFollowing
            ? {
                borderColor: "var(--border)",
                color: "var(--text-secondary)",
                background: "var(--bg-secondary)",
              }
            : {
                borderColor: "rgba(230,255,61,0.55)",
                color: "#0B0B0F",
                background: "var(--accent)",
              }
        }
      >
        {isPending ? "Attendi" : isFollowing ? "Seguito" : "Segui"}
      </button>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const supabase = createClient();
  const [step, setStep] = useState(0);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [importSkipped, setImportSkipped] = useState(false);
  const [selectedImportSource, setSelectedImportSource] = useState<
    string | null
  >(null);
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const [poolReady, setPoolReady] = useState(false);
  const [swipePool, setSwipePool] = useState<SwipeItem[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [pendingFollowId, setPendingFollowId] = useState<string | null>(null);
  const skippedItemsRef = useRef<SwipeItem[]>([]);
  const acceptedItemsRef = useRef<
    Map<string, { item: SwipeItem; rating: number | null }>
  >(new Map());
  const wishlistItemsRef = useRef<Map<string, SwipeItem>>(new Map());

  const getQueueTable = (filter: string) =>
    ({
      all: "swipe_queue_all",
      anime: "swipe_queue_anime",
      manga: "swipe_queue_manga",
      movie: "swipe_queue_movie",
      tv: "swipe_queue_tv",
      game: "swipe_queue_game",
      boardgame: "swipe_queue_boardgame",
    })[filter] ?? "swipe_queue_all";
  const rowToSwipeItem = (row: any): SwipeItem => ({
    id: row.external_id,
    title: row.title,
    type: row.type as SwipeItem["type"],
    coverImage: row.cover_image,
    year: row.year,
    genres: row.genres || [],
    score: row.score,
    description: row.description,
    why: row.why,
    matchScore: row.match_score || 0,
    episodes: row.episodes,
    authors: row.authors,
    developers: row.developers,
    platforms: row.platforms,
    isAwardWinner: row.is_award_winner,
    isDiscovery: row.is_discovery,
    source: row.source,
  });
  const toQueueRow = (r: any, uid: string) => ({
    user_id: uid,
    external_id: r.id,
    title: r.title,
    type: r.type,
    cover_image: r.coverImage || r.cover_image,
    year: r.year,
    genres: r.genres || [],
    score: r.score ?? null,
    description: r.description ?? null,
    why: r.why ?? null,
    match_score: r.matchScore || 0,
    episodes: r.episodes ?? null,
    authors: r.authors || [],
    developers: r.developers || [],
    platforms: r.platforms || [],
    is_award_winner: r.isAwardWinner || false,
    is_discovery: r.isDiscovery || false,
    source: r.source ?? null,
  });

  const descriptionLooksMostlyEnglish = (text?: string | null) => {
    if (!text) return false;
    const sample = ` ${text.toLowerCase()} `;
    const englishHits = [
      " the ",
      " and ",
      " with ",
      " your ",
      " players ",
      " game ",
      " each ",
      " cards ",
      " board ",
      " victory ",
    ].filter((token) => sample.includes(token)).length;
    const italianHits = [
      " il ",
      " lo ",
      " la ",
      " gli ",
      " le ",
      " con ",
      " per ",
      " giocatori ",
      " partita ",
      " carte ",
    ].filter((token) => sample.includes(token)).length;
    return englishHits >= 2 && englishHits > italianHits;
  };

  const shouldRefreshQueueRow = (row: any, activeFilter: string) => {
    const type = row?.type || activeFilter;
    if (type === "boardgame")
      return (
        !row?.cover_image ||
        !row?.description ||
        descriptionLooksMostlyEnglish(row.description)
      );
    if (type === "game" || type === "manga")
      return Boolean(
        row?.description && descriptionLooksMostlyEnglish(row.description),
      );
    return false;
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push("/login");
        return;
      }
      setUserId(user.id);
      userIdRef.current = user.id;
    });
  }, [locale]); // eslint-disable-line

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    async function loadSuggestedUsers() {
      const [{ data: profilesData }, { data: followsData }] = await Promise.all(
        [
          supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url")
            .neq("id", userId)
            .not("username", "is", null)
            .limit(8),
          supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", userId),
        ],
      );

      if (cancelled) return;
      setSuggestedUsers((profilesData || []) as SuggestedUser[]);
      setFollowingIds(
        new Set(
          (followsData || []).map((row: any) => row.following_id as string),
        ),
      );
    }

    loadSuggestedUsers();
    return () => {
      cancelled = true;
    };
  }, [userId]); // eslint-disable-line

  useEffect(() => {
    const run = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const uid = user.id;
      const quickAll = await fetchCategoryTitles(
        "all",
        [],
        new Set(),
        POOL_QUICK,
        locale,
      );
      if (quickAll.length > 0) {
        await fetch("/api/swipe/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queue: "all",
            rows: quickAll.map((i) => toQueueRow(i, uid)),
            mirrorByType: true,
          }),
        }).catch(() => null);
        setSwipePool(quickAll);
        setPoolReady(true);
      }
      const specificTypes: CategoryKey[] = [
        "anime",
        "manga",
        "movie",
        "tv",
        "game",
        "boardgame",
      ];
      for (const cat of specificTypes) {
        const items = await fetchCategoryTitles(
          cat,
          [],
          new Set(),
          POOL_QUICK,
          locale,
        );
        if (items.length > 0)
          await fetch("/api/swipe/queue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              queue: cat,
              rows: items.map((i) => toQueueRow(i, uid)),
            }),
          }).catch(() => null);
      }
      for (const cat of specificTypes)
        fetchCategoryTitles(cat, [], new Set(), POOL_TARGET, locale)
          .then(async (items) => {
            if (items.length)
              await fetch("/api/swipe/queue", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  queue: cat,
                  rows: items.map((i) => toQueueRow(i, uid)),
                }),
              }).catch(() => null);
          })
          .catch(() => {});
    };
    run();
  }, []); // eslint-disable-line

  const toggleType = (id: string) =>
    setSelectedTypes((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  const getOnboardingSessionProcessedIds = useCallback(() => {
    const ids = new Set<string>();
    acceptedItemsRef.current.forEach((_, id) => ids.add(id));
    wishlistItemsRef.current.forEach((_, id) => ids.add(id));
    skippedItemsRef.current.forEach((item) => ids.add(item.id));
    return ids;
  }, []);

  const handleOnboardingSeen = useCallback(
    (item: SwipeItem, rating: number | null, skipPersist = false) => {
      if (!skipPersist) acceptedItemsRef.current.set(item.id, { item, rating });
      wishlistItemsRef.current.delete(item.id);
      skippedItemsRef.current = skippedItemsRef.current.filter(
        (i) => i.id !== item.id,
      );
    },
    [],
  );
  const handleOnboardingWishlist = useCallback((item: SwipeItem) => {
    acceptedItemsRef.current.delete(item.id);
    skippedItemsRef.current = skippedItemsRef.current.filter(
      (i) => i.id !== item.id,
    );
    wishlistItemsRef.current.set(item.id, item);
  }, []);
  const handleOnboardingUndo = useCallback((item: SwipeItem) => {
    acceptedItemsRef.current.delete(item.id);
    skippedItemsRef.current = skippedItemsRef.current.filter(
      (i) => i.id !== item.id,
    );
  }, []);
  const handleOnboardingUndoWishlist = useCallback((item: SwipeItem) => {
    wishlistItemsRef.current.delete(item.id);
    acceptedItemsRef.current.delete(item.id);
  }, []);
  const handleOnboardingSkip = useCallback((item: SwipeItem) => {
    acceptedItemsRef.current.delete(item.id);
    wishlistItemsRef.current.delete(item.id);
    if (!skippedItemsRef.current.some((i) => i.id === item.id)) {
      skippedItemsRef.current.push(item);
    }
  }, []);
  const goToConfirmation = useCallback(() => setStep(3), []);

  const handleOnboardingRequestMore = useCallback(
    async (filter: string = "all"): Promise<SwipeItem[]> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];
      const uid = user.id;
      const table = getQueueTable(filter);
      const { data: skippedRows } = await supabase
        .from("swipe_skipped")
        .select("external_id")
        .eq("user_id", uid);
      const skippedSet = new Set(
        (skippedRows || []).map((r: any) => r.external_id as string),
      );
      const sessionProcessedSet = getOnboardingSessionProcessedIds();
      const excludedSet = new Set<string>([
        ...skippedSet,
        ...sessionProcessedSet,
      ]);
      const { data: queueRows } = await supabase
        .from(table)
        .select("*")
        .eq("user_id", uid)
        .order("inserted_at", { ascending: true });
      const existingRows = (queueRows || []).filter(
        (r: any) => !excludedSet.has(r.external_id),
      );
      const isBoardgameQueue = filter === "boardgame";
      const staleRows = existingRows.filter((r: any) =>
        shouldRefreshQueueRow(r, filter),
      );
      const needsQueueRefresh = staleRows.length > 0;
      const existingIds = new Set(
        existingRows.map((r: any) => r.external_id as string),
      );
      const staleIds = new Set(
        staleRows.map((r: any) => r.external_id as string),
      );

      // Non fidarti di queue piene ma vecchie: le prime versioni potevano aver
      // salvato boardgame senza dati ricchi o descrizioni game/manga in inglese.
      // In quel caso rifacciamo fetch e permettiamo l'upsert sugli stessi external_id.
      if (existingRows.length >= 20 && !needsQueueRefresh)
        return await localizeSwipeItems(
          existingRows.map(rowToSwipeItem),
          locale,
        );

      const items = await fetchCategoryTitles(
        filter as CategoryKey,
        selectedTypes,
        excludedSet,
        50,
        locale,
      );
      const newItems = items
        .filter(
          (i) =>
            !excludedSet.has(i.id) &&
            (!existingIds.has(i.id) || staleIds.has(i.id)),
        )
        .slice(0, needsQueueRefresh ? 50 : 50 - existingRows.length);

      if (newItems.length > 0) {
        await fetch("/api/swipe/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            queue: filter === "all" ? "all" : filter,
            rows: newItems.map((i) => toQueueRow(i, uid)),
          }),
        }).catch(() => null);
      }

      const refreshedById = new Map(newItems.map((i) => [i.id, i]));
      const mergedExisting = existingRows.map(
        (row: any) => refreshedById.get(row.external_id) || rowToSwipeItem(row),
      );
      const appended = newItems.filter((i) => !existingIds.has(i.id));
      const merged = [...mergedExisting, ...appended];

      // Se dopo refresh abbiamo abbastanza boardgame ricchi, non mostrare più i vecchi placeholder.
      if (isBoardgameQueue) {
        const rich = merged.filter((i: SwipeItem) =>
          Boolean(i.coverImage && i.description),
        );
        if (rich.length >= 10) return await localizeSwipeItems(rich, locale);
      }

      return await localizeSwipeItems(merged, locale);
    },
    [supabase, selectedTypes, getOnboardingSessionProcessedIds, locale],
  );

  const toggleFollowSuggestion = useCallback(
    async (profileId: string) => {
      const uid = userIdRef.current;
      if (!uid || profileId === uid || pendingFollowId) return;

      const isFollowing = followingIds.has(profileId);
      setPendingFollowId(profileId);
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.delete(profileId);
        else next.add(profileId);
        return next;
      });

      try {
        const res = await fetch("/api/social/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_id: profileId,
            action: isFollowing ? "unfollow" : "follow",
          }),
        });
        if (!res.ok) throw new Error("follow request failed");
      } catch {
        setFollowingIds((prev) => {
          const next = new Set(prev);
          if (isFollowing) next.add(profileId);
          else next.delete(profileId);
          return next;
        });
      } finally {
        setPendingFollowId(null);
      }
    },
    [followingIds, pendingFollowId],
  );

  const completeOnboarding = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    const accepted = Array.from(acceptedItemsRef.current.values()).map(
      ({ item, rating }) => ({ item, rating }),
    );
    const wishlist = Array.from(wishlistItemsRef.current.values());
    const res = await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accepted,
        wishlist,
        skipped: skippedItemsRef.current,
        selected_types: selectedTypes,
        import_skipped: importSkipped,
      }),
    }).catch(() => null);
    if (!res?.ok) return;
    setOnboardingCookie();
    fetch(`/api/recommendations?refresh=1&onboarding=1&lang=${locale}`).catch(
      () => {},
    );
    router.push("/home");
  }, [selectedTypes, importSkipped, router, locale]);

  const onboardingSwipePool = swipePool.filter(
    (item) => !getOnboardingSessionProcessedIds().has(item.id),
  );

  if (step === 2) {
    return (
      <SwipeMode
        items={onboardingSwipePool}
        onSeen={handleOnboardingSeen}
        onSkip={handleOnboardingSkip}
        onWishlist={handleOnboardingWishlist}
        onClose={goToConfirmation}
        onRequestMore={handleOnboardingRequestMore}
        isOnboarding
        onOnboardingComplete={goToConfirmation}
        onOnboardingBack={() => setStep(1)}
        onUndo={handleOnboardingUndo}
        onUndoWishlist={handleOnboardingUndoWishlist}
      />
    );
  }

  const selectedLabels = selectedTypes
    .map((id) => MEDIA_TYPES.find((t) => t.id === id)?.label)
    .filter(Boolean);
  const signalCount = acceptedItemsRef.current.size;
  const wishlistCount = wishlistItemsRef.current.size;
  const skippedCount = skippedItemsRef.current.length;
  const hasSwipeSignals = signalCount + wishlistCount + skippedCount > 0;
  const visibleSuggestedUsers = suggestedUsers.slice(0, 4);

  return (
    <div className="gk-onboarding-page flex min-h-screen w-full bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="hidden w-[340px] shrink-0 border-r border-[var(--border)] lg:block xl:w-[380px]">
        <div className="sticky top-0 h-screen">
          <BrandPanel step={step} />
        </div>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-8 sm:px-10 lg:px-12 xl:px-16">
        <div className="mb-10 flex items-center gap-3 self-start lg:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent)]">
            <Zap size={20} className="text-black" />
          </div>
          <span className="font-display text-2xl font-black tracking-[-0.03em] text-white">
            geekore
          </span>
        </div>
        <div className="w-full max-w-[560px]">
          <div className="mb-6 rounded-[22px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/50 p-4">
            <StepDots current={step} total={TOTAL_STEPS} />
          </div>

          {step === 0 && (
            <>
              <div className="mb-5">
                <h1 className="gk-title mb-2 text-white">Cosa tracci?</h1>
                <p className="gk-body">
                  Scegli i mondi che vuoi usare per costruire il tuo primo Taste
                  DNA.
                </p>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {MEDIA_TYPES.map(({ id, label, icon: Icon, color }) => {
                  const selected = selectedTypes.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      data-no-swipe="true"
                      onClick={() => toggleType(id)}
                      className="gk-active-press relative flex min-h-[128px] flex-col justify-between rounded-[18px] border p-4 text-left transition-colors"
                      style={
                        selected
                          ? {
                              borderColor: "rgba(230,255,61,0.55)",
                              background: "rgba(230,255,61,0.06)",
                            }
                          : {
                              borderColor: "var(--border)",
                              background: "var(--bg-card)",
                            }
                      }
                      aria-pressed={selected}
                    >
                      <span
                        className="grid h-9 w-9 place-items-center rounded-xl"
                        style={{
                          background: `color-mix(in srgb, ${color} 14%, transparent)`,
                          color,
                        }}
                      >
                        <Icon size={18} />
                      </span>
                      <span className="text-sm font-black text-white">
                        {label}
                      </span>
                      {selected && (
                        <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)]">
                          <Check
                            size={11}
                            className="text-black"
                            strokeWidth={3}
                          />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedTypes.length === 0 && (
                <p className="gk-caption mb-5 text-[var(--text-muted)]">
                  Seleziona almeno un tipo media per continuare.
                </p>
              )}
              <button
                type="button"
                data-no-swipe="true"
                onClick={() => setStep(1)}
                disabled={selectedTypes.length === 0}
                className="gk-btn gk-btn-primary gk-focus-ring w-full disabled:opacity-50"
              >
                Continua <ArrowRight size={18} />
              </button>
            </>
          )}

          {step === 1 && (
            <>
              <div className="mb-7">
                <h1 className="gk-title mb-2 text-white">
                  Importa la tua storia
                </h1>
                <p className="gk-body">
                  Collega o importa le librerie che hai già. Puoi saltare e
                  farlo dopo dal profilo.
                </p>
              </div>
              <div className="mb-7 grid gap-2 sm:grid-cols-2">
                {IMPORT_SOURCES.map(
                  ({ id, label, detail, icon: Icon, color }) => {
                    const selected = selectedImportSource === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        data-no-swipe="true"
                        onClick={() => {
                          setSelectedImportSource(id);
                          setImportSkipped(false);
                        }}
                        aria-pressed={selected}
                        className="flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors hover:bg-[var(--bg-elevated)]"
                        style={
                          selected
                            ? {
                                borderColor: "rgba(230,255,61,0.42)",
                                background: "rgba(230,255,61,0.055)",
                              }
                            : {
                                borderColor: "var(--border)",
                                background: "var(--bg-card)",
                              }
                        }
                      >
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-xl"
                          style={{
                            background: `color-mix(in srgb, ${color} 14%, transparent)`,
                            color,
                          }}
                        >
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-white">
                            {label}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {detail}
                          </p>
                        </div>
                        {selected ? (
                          <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--accent)]">
                            <Check
                              size={13}
                              className="text-black"
                              strokeWidth={3}
                            />
                          </span>
                        ) : (
                          <ArrowRight
                            size={16}
                            className="text-[var(--text-muted)]"
                          />
                        )}
                      </button>
                    );
                  },
                )}
              </div>
              <div className="mb-6 rounded-[20px] border border-[rgba(230,255,61,0.13)] bg-[rgba(230,255,61,0.045)] p-4 text-sm leading-6 text-[var(--text-secondary)]">
                {selectedImportSource ? (
                  <>
                    Hai selezionato{" "}
                    <span className="font-bold text-white">
                      {
                        IMPORT_SOURCES.find(
                          (source) => source.id === selectedImportSource,
                        )?.label
                      }
                    </span>
                    . Per non interrompere l’onboarding, il collegamento vero lo
                    apriremo dal profilo dopo la configurazione iniziale.
                  </>
                ) : (
                  <>
                    Puoi selezionare una fonte da collegare più tardi, oppure
                    saltare e continuare subito con lo swipe.
                  </>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={() => setStep(0)}
                  className="gk-btn gk-btn-secondary gk-focus-ring px-5"
                >
                  <ArrowLeft size={16} /> Indietro
                </button>
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={() => {
                    setImportSkipped(true);
                    setStep(2);
                  }}
                  disabled={!poolReady}
                  className="gk-btn gk-btn-secondary gk-focus-ring flex-1 disabled:cursor-wait disabled:opacity-50"
                >
                  Salta
                </button>
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={() => {
                    setImportSkipped(false);
                    setStep(2);
                  }}
                  disabled={!poolReady}
                  className="gk-btn gk-btn-primary gk-focus-ring flex-1 disabled:cursor-wait disabled:opacity-50"
                >
                  {!poolReady ? "Caricamento…" : "Continua"}{" "}
                  <ArrowRight size={18} />
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="mb-6 overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[radial-gradient(circle_at_top_left,rgba(230,255,61,0.10),transparent_42%),rgba(255,255,255,0.035)] p-5 ring-1 ring-white/5">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.25)] bg-[rgba(230,255,61,0.08)] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
                  <Sparkles size={13} /> Geekore è pronto
                </div>
                <h1 className="font-display text-[38px] font-black leading-[0.92] tracking-[-0.055em] text-white sm:text-[46px]">
                  Il tuo profilo iniziale è configurato.
                </h1>
                <p className="mt-4 max-w-[520px] text-[15px] leading-7 text-[var(--text-secondary)]">
                  Partiremo dai mondi che hai scelto e continueremo a imparare
                  da rating, wishlist e swipe mentre usi l’app.
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {selectedLabels.length > 0 ? (
                    selectedLabels.map((label) => (
                      <span key={label} className="gk-chip gk-chip-match">
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className="gk-caption text-[var(--text-muted)]">
                      Potrai scegliere nuove categorie dal profilo.
                    </span>
                  )}
                </div>
              </div>

              <div className="mb-6 rounded-[26px] border border-[var(--border-subtle)] bg-[var(--bg-card)]/76 p-4 ring-1 ring-white/5">
                <p className="gk-label mb-3 text-[var(--accent)]">Primo DNA</p>
                {hasSwipeSignals ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-2xl bg-black/18 p-3">
                      <p className="font-mono-data text-xl font-black text-white">
                        {signalCount}
                      </p>
                      <p className="gk-mono text-[var(--text-muted)]">
                        segnali
                      </p>
                    </div>
                    <div className="rounded-2xl bg-black/18 p-3">
                      <p className="font-mono-data text-xl font-black text-white">
                        {wishlistCount}
                      </p>
                      <p className="gk-mono text-[var(--text-muted)]">
                        wishlist
                      </p>
                    </div>
                    <div className="rounded-2xl bg-black/18 p-3">
                      <p className="font-mono-data text-xl font-black text-white">
                        {skippedCount}
                      </p>
                      <p className="gk-mono text-[var(--text-muted)]">skip</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-[rgba(230,255,61,0.14)] bg-[rgba(230,255,61,0.045)] p-4">
                    <p className="text-sm font-black text-white">
                      Profilo configurato
                    </p>
                    <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                      Non hai ancora dato segnali nello swipe, quindi la home
                      partirà dalle categorie selezionate. Potrai raffinarla
                      subito con voti, salvataggi e nuovi swipe.
                    </p>
                  </div>
                )}
              </div>

              <div className="mb-7">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="gk-label text-[var(--text-secondary)]">
                      Persone da seguire
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Scegli qualcuno ora, oppure fallo più tardi da Friends.
                    </p>
                  </div>
                  <span className="font-mono-data text-[10px] text-[var(--text-muted)]">
                    {visibleSuggestedUsers.length} suggeriti
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibleSuggestedUsers.length > 0 ? (
                    visibleSuggestedUsers.map((user) => (
                      <UserSuggestionCard
                        key={user.id}
                        user={user}
                        followingIds={followingIds}
                        pendingFollowId={pendingFollowId}
                        onToggleFollow={toggleFollowSuggestion}
                      />
                    ))
                  ) : (
                    <div className="gk-empty-state sm:col-span-2">
                      <Users className="gk-empty-state-icon" />
                      <p className="gk-empty-state-title">
                        Nessun suggerimento ancora
                      </p>
                      <p className="gk-empty-state-subtitle">
                        Entrerai comunque nella home e potrai seguire utenti
                        dalla sezione Friends.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={() => setStep(2)}
                  className="gk-btn gk-btn-secondary gk-focus-ring px-5"
                >
                  <ArrowLeft size={16} /> Indietro
                </button>
                <button
                  type="button"
                  data-no-swipe="true"
                  onClick={completeOnboarding}
                  className="gk-btn gk-btn-primary gk-focus-ring flex-1"
                >
                  Entra in Geekore <ArrowRight size={18} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
