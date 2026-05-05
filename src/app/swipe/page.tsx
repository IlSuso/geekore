"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Shuffle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SwipeMode } from "@/components/for-you/SwipeMode";
import type { SwipeItem } from "@/components/for-you/SwipeMode";
import { profileInvalidateBridge } from "@/hooks/profileInvalidateBridge";
import { useLocale } from "@/lib/locale";
import { useTabActive } from "@/context/TabActiveContext";
import { cleanDescriptionForDisplay } from "@/lib/text/descriptionCleanup";

const SWIPE_PAGE_COPY = {
  it: {
    preparing: "Preparazione Swipe",
    loadingBest: "Sto cercando i titoli migliori per te…",
  },
  en: {
    preparing: "Preparing Swipe",
    loadingBest: "Finding the best titles for you…",
  },
} as const;

type SwipePageCache = {
  locale: "it" | "en" | null;
  userId: string | null;
  items: SwipeItem[];
  ts: number;
};

const SWIPE_CACHE_TTL_MS = 1000 * 60 * 20;

const swipePageCache: SwipePageCache = {
  locale: null,
  userId: null,
  items: [],
  ts: 0,
};

function isSwipeCacheFresh(locale: "it" | "en", userId?: string | null): boolean {
  if (swipePageCache.locale !== locale) return false;
  if (userId && swipePageCache.userId && swipePageCache.userId !== userId) return false;
  if (!Array.isArray(swipePageCache.items) || swipePageCache.items.length === 0) return false;
  return Date.now() - swipePageCache.ts < SWIPE_CACHE_TTL_MS;
}

function writeSwipeCache(locale: "it" | "en", userId: string | null, items: SwipeItem[]) {
  if (!Array.isArray(items)) return;
  swipePageCache.locale = locale;
  swipePageCache.userId = userId;
  swipePageCache.items = items;
  swipePageCache.ts = Date.now();
}

function removeSwipeCacheItem(id: string) {
  if (!id) return;
  swipePageCache.items = swipePageCache.items.filter((item) => item.id !== id);
  swipePageCache.ts = Date.now();
}

function appendSwipeCacheItems(locale: "it" | "en", userId: string | null, items: SwipeItem[]) {
  if (!Array.isArray(items) || items.length === 0) return;
  if (swipePageCache.locale !== locale || (userId && swipePageCache.userId && swipePageCache.userId !== userId)) {
    writeSwipeCache(locale, userId, items);
    return;
  }

  const seen = new Set(swipePageCache.items.map((item) => item.id));
  const next = [...swipePageCache.items];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  writeSwipeCache(locale, userId, next);
}

function triggerTasteDelta(options: {
  action: "rating" | "status_change" | "wishlist_add" | "rewatch" | "progress";
  mediaId: string;
  mediaType: string;
  genres: string[];
  rating?: number;
  prevRating?: number;
  status?: string;
  prevStatus?: string;
}) {
  fetch("/api/taste/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  }).catch(() => {});
}

const QUEUE_TABLE_MAP: Record<string, string> = {
  all: "swipe_queue_all",
  anime: "swipe_queue_anime",
  manga: "swipe_queue_manga",
  movie: "swipe_queue_movie",
  tv: "swipe_queue_tv",
  game: "swipe_queue_game",
  boardgame: "swipe_queue_boardgame",
};

const MIXED_SWIPE_TYPES = [
  "anime",
  "manga",
  "movie",
  "tv",
  "game",
  "boardgame",
] as const;

type MixedSwipeType = (typeof MIXED_SWIPE_TYPES)[number];

function isMixedSwipeType(type: unknown): type is MixedSwipeType {
  return typeof type === "string" && MIXED_SWIPE_TYPES.includes(type as MixedSwipeType);
}

function countTypes(items: Array<{ type?: unknown }>): Map<MixedSwipeType, number> {
  const counts = new Map<MixedSwipeType, number>();
  for (const type of MIXED_SWIPE_TYPES) counts.set(type, 0);
  for (const item of items) {
    if (!isMixedSwipeType(item.type)) continue;
    counts.set(item.type, (counts.get(item.type) || 0) + 1);
  }
  return counts;
}

function typeDiversity(items: Array<{ type?: unknown }>): number {
  return [...countTypes(items).values()].filter((count) => count > 0).length;
}

function prioritizeFreshForAll<T extends { type?: unknown }>(
  freshItems: T[],
  existingItems: Array<{ type?: unknown }>,
  limit: number,
): T[] {
  if (limit <= 0) return [];

  const buckets = new Map<MixedSwipeType, T[]>();
  for (const type of MIXED_SWIPE_TYPES) buckets.set(type, []);
  for (const item of freshItems) {
    if (!isMixedSwipeType(item.type)) continue;
    buckets.get(item.type)!.push(item);
  }

  const counts = countTypes(existingItems);
  const out: T[] = [];

  while (out.length < limit) {
    const nextType = [...MIXED_SWIPE_TYPES]
      .filter((type) => (buckets.get(type)?.length || 0) > 0)
      .sort((a, b) => (counts.get(a) || 0) - (counts.get(b) || 0))[0];

    if (!nextType) break;
    const next = buckets.get(nextType)!.shift();
    if (!next) break;

    out.push(next);
    counts.set(nextType, (counts.get(nextType) || 0) + 1);
  }

  return out;
}

function rowToSwipeItem(row: any, locale: "it" | "en"): SwipeItem {
  const localized = row?.localized && typeof row.localized === "object" ? row.localized : {};
  const localeNode = localized?.[locale] || {};
  const fallbackLocale = locale === "it" ? "en" : "it";
  const fallbackNode = localized?.[fallbackLocale] || {};
  const description = cleanDescriptionForDisplay(localeNode.description)
    || cleanDescriptionForDisplay(locale === "it" ? row.description_it : row.description_en)
    || cleanDescriptionForDisplay(row.description)
    || cleanDescriptionForDisplay(fallbackNode.description)
    || cleanDescriptionForDisplay(locale === "it" ? row.description_en : row.description_it);

  return {
    id: row.external_id,
    title: localeNode.title || (locale === "it" ? row.title_it : row.title_en) || row.title,
    title_original: row.title_original,
    title_en: row.title_en,
    title_it: row.title_it,
    type: row.type as SwipeItem["type"],
    coverImage: localeNode.coverImage || localeNode.cover_image || row.cover_image,
    year: row.year,
    genres: row.genres || [],
    score: row.score,
    description,
    description_en: cleanDescriptionForDisplay(row.description_en),
    description_it: cleanDescriptionForDisplay(row.description_it),
    localized,
    why: row.why,
    matchScore: row.match_score || 0,
    episodes: row.episodes,
    authors: row.authors,
    developers: row.developers,
    platforms: row.platforms,
    isAwardWinner: row.is_award_winner,
    isDiscovery: row.is_discovery,
    source: row.source,
  };
}

function toQueueRow(r: any, userId: string) {
  return {
    user_id: userId,
    external_id: r.id,
    title: r.title,
    title_original: r.title_original || r.title,
    title_en: r.title_en || r.localized?.en?.title || r.title,
    title_it: r.title_it || r.localized?.it?.title || null,
    type: r.type,
    cover_image: r.coverImage || r.cover_image,
    year: r.year,
    genres: r.genres || [],
    score: r.score ?? null,
    description: cleanDescriptionForDisplay(r.description) ?? null,
    description_en: cleanDescriptionForDisplay(r.description_en || r.localized?.en?.description) ?? null,
    description_it: cleanDescriptionForDisplay(r.description_it || r.localized?.it?.description) ?? null,
    localized: r.localized || {},
    why: r.why ?? null,
    match_score: r.matchScore || 0,
    episodes: r.episodes ?? null,
    authors: r.authors || [],
    developers: r.developers || [],
    platforms: r.platforms || [],
    is_award_winner: r.isAwardWinner || false,
    is_discovery: r.isDiscovery || false,
    source: r.source ?? null,
  };
}

async function localizeSwipeItems(
  items: SwipeItem[],
  locale: string,
): Promise<SwipeItem[]> {
  if (items.length === 0) return items;
  const res = await fetch(`/api/media/localize?lang=${locale}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, mode: "full" }),
  }).catch(() => null);
  if (!res?.ok) return items;
  const json = await res.json().catch(() => null);
  const localized = Array.isArray(json?.items) ? json.items : items;
  return localized.map((item: any) => ({
    ...item,
    description: cleanDescriptionForDisplay(item.localized?.[locale]?.description)
      || cleanDescriptionForDisplay(locale === "it" ? item.description_it : item.description_en)
      || cleanDescriptionForDisplay(item.description)
      || cleanDescriptionForDisplay(locale === "it" ? item.description_en : item.description_it),
    description_en: cleanDescriptionForDisplay(item.description_en),
    description_it: cleanDescriptionForDisplay(item.description_it),
  }));
}

export default function SwipePage() {
  const supabase = createClient();
  const router = useRouter();
  const { locale } = useLocale();
  const isTabActive = useTabActive();
  const copy = SWIPE_PAGE_COPY[locale];
  const addedTitlesRef = useRef<Set<string>>(new Set());
  const addedIdsRef = useRef<Set<string>>(new Set());
  const requestSeqRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const initialCachedItems = isSwipeCacheFresh(locale) ? swipePageCache.items : [];
  const [initialItems, setInitialItems] = useState<SwipeItem[]>(initialCachedItems);
  const [loading, setLoading] = useState(initialCachedItems.length === 0);

  useEffect(() => {
    if (!isTabActive && initialItems.length > 0) return;

    async function init() {
      const requestSeq = ++requestSeqRef.current;
      const hasFreshCacheBeforeAuth = isSwipeCacheFresh(locale);

      if (hasFreshCacheBeforeAuth) {
        setInitialItems(swipePageCache.items);
        setLoading(false);
      } else {
        setLoading(true);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (requestSeq !== requestSeqRef.current) return;
      if (!user) {
        router.push("/login");
        return;
      }
      userIdRef.current = user.id;

      if (isSwipeCacheFresh(locale, user.id)) {
        setInitialItems(swipePageCache.items);
        setLoading(false);
        return;
      }

      addedTitlesRef.current = new Set();
      addedIdsRef.current = new Set();
      const { data: entries } = await supabase
        .from("user_media_entries")
        .select("external_id, title")
        .eq("user_id", user.id);
      for (const e of entries || []) {
        if (e.title)
          addedTitlesRef.current.add((e.title as string).toLowerCase());
        if ((e as any).external_id)
          addedIdsRef.current.add(String((e as any).external_id));
      }

      const { data: skippedRows } = await supabase
        .from("swipe_skipped")
        .select("external_id")
        .eq("user_id", user.id);
      const skippedSet = new Set(
        (skippedRows || []).map((r: any) => r.external_id as string),
      );

      const { data: queueRows } = await supabase
        .from("swipe_queue_all")
        .select("*")
        .eq("user_id", user.id)
        .order("inserted_at", { ascending: true });

      const existingRows = (queueRows || []).filter(
        (r: any) => !skippedSet.has(r.external_id),
      );

      const existingDiversity = typeDiversity(existingRows);
      const allQueueIsDiverseEnough = existingDiversity >= 4;

      if (existingRows.length >= 10 && allQueueIsDiverseEnough) {
        const localized = await localizeSwipeItems(
          existingRows.map((row: any) => rowToSwipeItem(row, locale)),
          locale,
        );
        if (requestSeq !== requestSeqRef.current) return;
        setInitialItems(localized);
        writeSwipeCache(locale, user.id, localized);
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/recommendations?type=all&lang=${locale}`);
        if (res.ok) {
          const json = await res.json();
          const freshRecs = (
            Object.values(json.recommendations || {}) as any[][]
          ).flat();
          const existingIds = new Set(
            existingRows.map((r: any) => r.external_id as string),
          );
          const validTypes = [
            "anime",
            "manga",
            "movie",
            "tv",
            "game",
            "boardgame",
          ];
          const candidateRecs = freshRecs.filter(
            (r: any) =>
              validTypes.includes(r.type) &&
              !skippedSet.has(r.id) &&
              !existingIds.has(r.id) &&
              !addedIdsRef.current.has(String(r.id)) &&
              !addedTitlesRef.current.has((r.title as string)?.toLowerCase()),
          );
          const newRecs = prioritizeFreshForAll(
            candidateRecs,
            existingRows,
            allQueueIsDiverseEnough ? Math.max(0, 50 - existingRows.length) : 50,
          );

          if (newRecs.length > 0) {
            const rows = newRecs.map((r: any) => toQueueRow(r, user.id));
            await fetch("/api/swipe/queue", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ queue: "all", rows, mirrorByType: true }),
            }).catch(() => null);
          }

          const localized = await localizeSwipeItems(
            [
              ...existingRows.map((row: any) => rowToSwipeItem(row, locale)),
              ...newRecs.map((r: any) => ({
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
                title_original: r.title_original,
                title_en: r.title_en,
                title_it: r.title_it,
                description_en: r.description_en,
                description_it: r.description_it,
                localized: r.localized,
                isDiscovery: r.isDiscovery,
                source: r.source,
              })),
            ],
            locale,
          );
          if (requestSeq !== requestSeqRef.current) return;
          setInitialItems(localized);
          writeSwipeCache(locale, user.id, localized);
        }
      } catch {}

      if (requestSeq === requestSeqRef.current) setLoading(false);
    }
    init();
  }, [locale, isTabActive]); // eslint-disable-line

  const removeFromPool = useCallback(
    async (_userId: string, _externalId: string) => {
      fetch("/api/recommendations?invalidateCache=true", {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
    },
    [],
  );

  const handleSwipeSeen = useCallback(
    async (item: SwipeItem, rating: number | null, skipPersist = false) => {
      if (!skipPersist && addedTitlesRef.current.has(item.title.toLowerCase()))
        return;

      const uid = userIdRef.current;
      if (!uid) return;

      removeSwipeCacheItem(item.id);
      setInitialItems((prev) => {
        const next = prev.filter((cached) => cached.id !== item.id);
        writeSwipeCache(locale, uid, next);
        return next;
      });

      if (skipPersist) {
        removeSwipeCacheItem(item.id);
        setInitialItems((prev) => {
          const next = prev.filter((cached) => cached.id !== item.id);
          writeSwipeCache(locale, uid, next);
          return next;
        });
        removeFromPool(uid, item.id);
        fetch("/api/recommendations/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rec_id: item.id,
            rec_type: item.type,
            rec_genres: item.genres,
            action: "added",
          }),
        }).catch(() => {});
        return;
      }

      const isBoardgame = item.type === "boardgame";
      const bggAchievementData =
        isBoardgame &&
        ((item as any).complexity != null ||
          (item as any).min_players != null ||
          (item as any).playing_time != null)
          ? {
              bgg: {
                score: (item as any).score ?? null,
                complexity: (item as any).complexity ?? null,
                min_players: (item as any).min_players ?? null,
                max_players: (item as any).max_players ?? null,
                playing_time: (item as any).playing_time ?? null,
              },
            }
          : null;
      const insertData: any = {
        external_id: item.id,
        title: item.title,
        type: item.type,
        cover_image: item.coverImage,
        genres: item.genres,
        tags: isBoardgame ? (item as any).mechanics || [] : [],
        authors: isBoardgame ? (item as any).designers || [] : [],
        ...(bggAchievementData ? { achievement_data: bggAchievementData } : {}),
        status: "completed",
        display_order: Date.now(),
        upsert: true,
      };
      if (rating !== null) insertData.rating = rating;

      fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(insertData),
      })
        .then(async (res) => {
          if (res.ok) {
            addedTitlesRef.current.add(item.title.toLowerCase());
            addedIdsRef.current.add(String(item.id));
            removeSwipeCacheItem(item.id);
          }
          fetch("/api/recommendations/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              rec_id: item.id,
              rec_type: item.type,
              rec_genres: item.genres,
              action: "added",
            }),
          }).catch(() => {});
          fetch("/api/recommendations?invalidateCache=true", {
            method: "POST",
            keepalive: true,
          }).catch(() => {});
          if (res.ok) profileInvalidateBridge.invalidate();
        })
        .catch(() => {});

      removeFromPool(uid, item.id);
      if (item.genres.length > 0) {
        triggerTasteDelta({
          action: "status_change",
          mediaId: item.id,
          mediaType: item.type,
          genres: item.genres,
          status: "completed",
        });
        if (rating)
          triggerTasteDelta({
            action: "rating",
            mediaId: item.id,
            mediaType: item.type,
            genres: item.genres,
            rating,
          });
      }
    },
    [removeFromPool],
  );

  const handleSwipeSkip = useCallback((item: SwipeItem) => {
    const uid = userIdRef.current;
    removeSwipeCacheItem(item.id);
    setInitialItems((prev) => {
      const next = prev.filter((cached) => cached.id !== item.id);
      writeSwipeCache(locale, uid, next);
      return next;
    });
  }, [locale]);

  const handleSwipeUndo = useCallback(async (item: SwipeItem) => {
    if (!addedTitlesRef.current.has(item.title.toLowerCase())) return;
    const uid = userIdRef.current;
    if (!uid) return;
    const res = await fetch("/api/collection", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ external_id: item.id }),
    }).catch(() => null);
    if (!res?.ok) return;
    addedTitlesRef.current.delete(item.title.toLowerCase());
    addedIdsRef.current.delete(String(item.id));
    profileInvalidateBridge.invalidate();
  }, []);

  const handleSwipeRequestMore = useCallback(
    async (filter: string = "all"): Promise<SwipeItem[]> => {
      const uid = userIdRef.current;
      if (!uid) return [];
      const user = { id: uid };

      const table = QUEUE_TABLE_MAP[filter] ?? "swipe_queue_all";
      const TARGET = 50;
      const REFILL_TRIGGER = 20;

      const { data: skippedRows } = await supabase
        .from("swipe_skipped")
        .select("external_id")
        .eq("user_id", user.id);
      const skippedSet = new Set(
        (skippedRows || []).map((r: any) => r.external_id as string),
      );

      const { data: queueRows } = await supabase
        .from(table)
        .select("*")
        .eq("user_id", user.id)
        .order("inserted_at", { ascending: true });
      const existingRows = (queueRows || []).filter(
        (r: any) => !skippedSet.has(r.external_id),
      );
      const existingIds = new Set(
        existingRows.map((r: any) => r.external_id as string),
      );

      const existingDiversity = typeDiversity(existingRows);
      const allQueueIsDiverseEnough = filter !== "all" || existingDiversity >= 4;

      if (existingRows.length >= REFILL_TRIGGER && allQueueIsDiverseEnough) {
        return localizeSwipeItems(existingRows.map((row: any) => rowToSwipeItem(row, locale)), locale);
      }

      try {
        const apiFilter = filter === "all" ? "all" : filter;
        const res = await fetch(
          `/api/recommendations?type=${apiFilter}&refresh=1&lang=${locale}`,
        );
        if (!res.ok)
          return localizeSwipeItems(existingRows.map((row: any) => rowToSwipeItem(row, locale)), locale);
        const json = await res.json();

        let freshRecs: any[] = [];
        if (filter === "all") {
          freshRecs = (
            Object.values(json.recommendations || {}) as any[][]
          ).flat();
        } else {
          const typed = (json.recommendations?.[filter] || []) as any[];
          freshRecs =
            typed.length > 0
              ? typed
              : (Object.values(json.recommendations || {}) as any[][])
                  .flat()
                  .filter((r: any) => r.type === filter);
        }

        const validTypes = [
          "anime",
          "manga",
          "movie",
          "tv",
          "game",
          "boardgame",
        ];
        const candidateRecs = freshRecs.filter(
          (r: any) =>
            validTypes.includes(r.type) &&
            !skippedSet.has(r.id) &&
            !existingIds.has(r.id) &&
            !addedIdsRef.current.has(String(r.id)) &&
            !addedTitlesRef.current.has((r.title as string)?.toLowerCase()),
        );
        const newRecs =
          filter === "all"
            ? prioritizeFreshForAll(
                candidateRecs,
                existingRows,
                allQueueIsDiverseEnough ? Math.max(0, TARGET - existingRows.length) : TARGET,
              )
            : candidateRecs.slice(0, TARGET - existingRows.length);

        if (newRecs.length > 0) {
          const rows = newRecs.map((r: any) => toQueueRow(r, user.id));
          await fetch("/api/swipe/queue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              queue: filter === "all" ? "all" : filter,
              rows,
            }),
          }).catch(() => null);
        }

        const moreItems = await localizeSwipeItems(
          [
            ...existingRows.map((row: any) => rowToSwipeItem(row, locale)),
            ...newRecs.map((r: any) => ({
              id: r.id,
              title: r.title,
              title_original: r.title_original,
              title_en: r.title_en,
              title_it: r.title_it,
              type: r.type as SwipeItem["type"],
              coverImage: r.coverImage,
              year: r.year,
              genres: r.genres || [],
              score: r.score,
              description: r.description,
              description_en: r.description_en,
              description_it: r.description_it,
              localized: r.localized,
              why: r.why,
              matchScore: r.matchScore || 0,
              episodes: r.episodes,
              authors: r.authors,
              developers: r.developers,
              platforms: r.platforms,
              isAwardWinner: r.isAwardWinner,
              isDiscovery: r.isDiscovery,
              source: r.source,
            })),
          ],
          locale,
        );
        appendSwipeCacheItems(locale, user.id, moreItems);
        return moreItems;
      } catch {
        return localizeSwipeItems(existingRows.map((row: any) => rowToSwipeItem(row, locale)), locale);
      }
    },
    [supabase, locale],
  );

  if (loading) {
    return (
      <div className="fixed inset-0 md:pt-16 bg-black flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="relative">
            <div
              className="absolute inset-0 w-16 h-16 rounded-3xl blur-xl"
              style={{ background: "rgba(230,255,61,0.2)" }}
            />
            <div
              className="relative w-16 h-16 rounded-3xl flex items-center justify-center shadow-2xl"
              style={{ background: "var(--accent)" }}
            >
              <Shuffle size={28} className="text-black" />
            </div>
          </div>
          <div>
            <p className="text-white font-semibold">{copy.preparing}</p>
            <p className="text-zinc-500 text-sm mt-1">{copy.loadingBest}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SwipeMode
      key={`swipe-${locale}`}
      standalone
      items={initialItems}
      userId={userIdRef.current ?? undefined}
      onSeen={handleSwipeSeen}
      onSkip={handleSwipeSkip}
      onUndo={handleSwipeUndo}
      onRequestMore={handleSwipeRequestMore}
      onClose={() => router.push("/for-you")}
    />
  );
}
