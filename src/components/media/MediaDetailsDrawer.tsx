"use client";
// DESTINAZIONE: src/components/media/MediaDetailsDrawer.tsx
// V5: + boardgame (meccaniche, designer, link BGG)

import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { gestureState } from "@/hooks/gestureState";
import { androidBack } from "@/hooks/androidBack";
import {
  ExternalLink,
  Star,
  Clock,
  Users,
  Layers,
  Gamepad2,
  Film,
  Tv,
  Clapperboard,
  Check,
  Bookmark,
  Sparkles,
  Monitor,
  Dices,
  Hash,
  FileText,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { StarRating } from "@/components/ui/StarRating";
import { translateGenre } from "@/lib/genres";
import {
  MediaDetailsHero,
  MediaDetailsSection,
  MediaDetailsTag,
} from "@/components/media/MediaDetailsPrimitives";
import { optimizeCover } from "@/lib/imageOptimizer";
import { useLocale } from "@/lib/locale";
import {
  getCachedLocalizedMediaRow,
  hasCachedLocalizedMediaRow,
  localizeMediaRows,
} from "@/lib/i18n/clientMediaLocalization";
import {
  appCopy,
  typeLabel,
  genreLabel,
  relationLabels,
} from "@/lib/i18n/uiCopy";

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface MediaDetails {
  id: string;
  title: string;
  title_en?: string;
  title_it?: string;
  description_en?: string;
  description_it?: string;
  cover_image?: string;
  cover_image_en?: string;
  cover_image_it?: string;
  external_id?: string;
  localized?: Record<string, any>;
  type: string;
  coverImage?: string;
  year?: number;
  episodes?: number;
  description?: string;
  genres?: string[];
  source?: string;
  // Stats generali
  score?: number;
  playing_time?: number;
  // Boardgame specifics
  min_players?: number;
  max_players?: number;
  complexity?: number;
  mechanics?: string[];
  designers?: string[];
  // Game / Anime / TV
  developers?: string[];
  themes?: string[];
  platforms?: string[];
  cast?: string[];
  watchProviders?: string[];
  italianSupportTypes?: string[];
  studios?: string[];
  directors?: string[];
  // Manga
  authors?: string[];
  pages?: number;
  isbn?: string;
  publisher?: string;
  // Per Te
  externalUrl?: string;
  why?: string;
  matchScore?: number;
  isAwardWinner?: boolean;
  relations?: Array<{
    relationType: string;
    id: string;
    type: string;
    title: string;
    coverImage?: string;
    year?: number;
    genres: string[];
  }>;
}

interface MediaDetailsDrawerProps {
  media: MediaDetails | null;
  onClose: () => void;
  isOwner?: boolean;
  onAdd?: (media: MediaDetails) => void;
  /**
   * Stato già noto dalla pagina che apre il drawer.
   * Serve a evitare il flash sbagliato "Aggiungi" -> "In collezione" mentre parte la verifica Supabase.
   */
  initialInCollection?: boolean;
  initialInWishlist?: boolean;
}

// Piattaforma — calcolata una sola volta
const IS_IOS =
  typeof navigator !== "undefined" &&
  /iphone|ipad|ipod/i.test(navigator.userAgent);
// Su iOS: swipe dal bordo sinistro segue il dito (interattivo, come Instagram).
// Su Android: la back gesture è un evento di sistema — non intercettiamo il touch.
const IOS_EDGE_SWIPE_ZONE = 30; // px dal bordo sinistro che attiva lo swipe su iOS
const IOS_DISMISS_THRESHOLD = 80; // px di dx per confermare chiusura
const MOBILE_SWIPE_DOWN_THRESHOLD = 86; // px verso il basso per chiudere il drawer su mobile

// ─── Helpers ───────────────────────────────────────────────────────────────────


function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    hellip: "…",
    rsquo: "’",
    lsquo: "‘",
    rdquo: "”",
    ldquo: "“",
    ndash: "–",
    mdash: "—",
  };

  // Alcune sorgenti, soprattutto BGG, arrivano doppio-encodate:
  // "&amp;hellip;" deve diventare "…", non restare "&hellip;".
  let decoded = value;
  for (let i = 0; i < 3; i += 1) {
    const next = decoded.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
      const key = entity.toLowerCase();
      if (key[0] === "#") {
        const isHex = key[1] === "x";
        const code = Number.parseInt(key.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return named[key] ?? match;
    });
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = decodeHtmlEntities(value).replace(/\u00a0/g, " ").trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function guessDescriptionLocale(text: string): "it" | "en" | null {
  const sample = ` ${text.toLowerCase()} `;
  const itHits = [" il ", " lo ", " la ", " gli ", " le ", " un ", " una ", " che ", " per ", " con ", " della ", " dello ", " degli ", " sono ", " viene ", " nella ", " questo ", " questa "]
    .filter(token => sample.includes(token)).length;
  const enHits = [" the ", " and ", " with ", " for ", " from ", " this ", " that ", " into ", " your ", " their ", " story ", " game ", " players ", " season "]
    .filter(token => sample.includes(token)).length;

  if (itHits >= 2 && itHits > enHits) return "it";
  if (enHits >= 2 && enHits > itHits) return "en";
  return null;
}

function safeGenericDescription(media: MediaDetails, locale: "it" | "en"): string | undefined {
  const value = cleanText((media as any).description);
  if (!value) return undefined;

  // Usiamo la description generica solo se sembra già nella lingua corrente oppure
  // se non riusciamo a determinarla. Questo evita flicker IT→EN, ma non nasconde
  // descrizioni già corrette arrivate dal payload della card.
  const guessed = guessDescriptionLocale(value);
  if (!guessed || guessed === locale) return value;
  return undefined;
}



function asStringArray(value: unknown): string[] {
  if (!value) return [];
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[;,|]/g)
      : [];

  const out: string[] = [];
  for (const item of raw) {
    const text = typeof item === "string" ? item.trim() : String(item ?? "").trim();
    if (!text || text === "null" || text === "undefined" || text === "(Uncredited)") continue;
    if (!out.some(existing => existing.toLowerCase() === text.toLowerCase())) out.push(text);
  }
  return out;
}

function firstArray(...values: unknown[]): string[] {
  for (const value of values) {
    const arr = asStringArray(value);
    if (arr.length > 0) return arr;
  }
  return [];
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function shouldHideSeriesProgressInfo(type?: string): boolean {
  return type === "tv" || type === "anime";
}

function shouldShowChapterCount(type?: string): boolean {
  return type === "manga";
}

function normalizeDrawerDetailMedia(base: MediaDetails, original: MediaDetails): MediaDetails {
  const b: any = base || {};
  const o: any = original || {};
  const details = b.details || o.details || {};
  const bgg = b.bgg || o.bgg || details.bgg || o.achievement_data?.bgg || b.achievement_data?.bgg || {};

  const mechanics = firstArray(
    b.mechanics,
    details.mechanics,
    bgg.mechanics,
    b.tags,
    details.tags,
    o.mechanics,
    o.tags,
    o.achievement_data?.mechanics,
  );

  const designers = firstArray(
    b.designers,
    details.designers,
    bgg.designers,
    b.authors,
    details.authors,
    o.designers,
    o.authors,
    o.achievement_data?.designers,
  );

  const genres = firstArray(b.genres, details.genres, bgg.genres, o.genres);

  const normalized = {
    ...o,
    ...b,
    genres: genres.length ? genres : b.genres,
    mechanics: mechanics.length ? mechanics : b.mechanics,
    designers: designers.length ? designers : b.designers,
    authors: firstArray(b.authors, details.authors, o.authors),
    developers: firstArray(b.developers, details.developers, o.developers),
    platforms: firstArray(b.platforms, details.platforms, o.platforms),
    cast: firstArray(b.cast, details.cast, o.cast),
    watchProviders: firstArray(b.watchProviders, details.watchProviders, o.watchProviders),
    italianSupportTypes: firstArray(b.italianSupportTypes, details.italianSupportTypes, o.italianSupportTypes),
    year: firstNumber(b.year, b.release_year, details.year, details.release_year, o.year) as any,
    score: firstNumber(b.score, b.rating, b.avg_rating, details.score, details.rating, details.avg_rating, bgg.score, o.score) as any,
    min_players: firstNumber(b.min_players, details.min_players, bgg.min_players, o.min_players),
    max_players: firstNumber(b.max_players, details.max_players, bgg.max_players, o.max_players),
    playing_time: firstNumber(b.playing_time, details.playing_time, bgg.playing_time, o.playing_time),
    complexity: firstNumber(b.complexity, details.complexity, bgg.complexity, o.complexity),
    pages: firstNumber(b.pages, details.pages, o.pages),
  } as MediaDetails;

  if (shouldHideSeriesProgressInfo(normalized.type)) {
    delete (normalized as any).episodes;
    delete (normalized as any).totalSeasons;
    delete (normalized as any).seasons;
  }

  return normalized;
}

function pickLocalizedField(media: MediaDetails, locale: "it" | "en", field: "title" | "description" | "coverImage"): string | undefined {
  const anyMedia = media as any;
  const localized = anyMedia.localized && typeof anyMedia.localized === "object" ? anyMedia.localized : null;
  const localeNode = localized?.[locale] && typeof localized[locale] === "object" ? localized[locale] : null;

  if (field === "title") {
    return cleanText(localeNode?.title)
      || cleanText(anyMedia[`title_${locale}`])
      || cleanText(locale === "en" ? anyMedia.title_en : anyMedia.title_it)
      || cleanText(media.title);
  }

  if (field === "description") {
    return cleanText(localeNode?.description)
      || cleanText(anyMedia[`description_${locale}`])
      || cleanText(locale === "en" ? anyMedia.description_en : anyMedia.description_it)
      || cleanText(media.description);
  }

  return cleanText(localeNode?.coverImage)
    || cleanText(localeNode?.cover_image)
    || cleanText(anyMedia[`cover_image_${locale}`])
    || cleanText(anyMedia[`coverImage_${locale}`])
    || cleanText(media.coverImage);
}

function pickStrictLocalizedField(media: MediaDetails, locale: "it" | "en", field: "title" | "description" | "coverImage"): string | undefined {
  const anyMedia = media as any;
  const localized = anyMedia.localized && typeof anyMedia.localized === "object" ? anyMedia.localized : null;
  const localeNode = localized?.[locale] && typeof localized[locale] === "object" ? localized[locale] : null;

  if (field === "title") {
    return cleanText(localeNode?.title)
      || cleanText(anyMedia[`title_${locale}`])
      || cleanText(locale === "en" ? anyMedia.title_en : anyMedia.title_it);
  }

  if (field === "description") {
    return cleanText(localeNode?.description)
      || cleanText(anyMedia[`description_${locale}`])
      || cleanText(locale === "en" ? anyMedia.description_en : anyMedia.description_it);
  }

  return cleanText(localeNode?.coverImage)
    || cleanText(localeNode?.cover_image)
    || cleanText(anyMedia[`cover_image_${locale}`])
    || cleanText(anyMedia[`coverImage_${locale}`]);
}

function buildExternalUrl(media: MediaDetails): string | undefined {
  if (media.externalUrl) return media.externalUrl;
  const id = media.id;
  // BGG
  if (id.startsWith("bgg-"))
    return `https://boardgamegeek.com/boardgame/${id.replace("bgg-", "")}`;
  // AniList
  if (id.startsWith("anilist-anime-"))
    return `https://anilist.co/anime/${id.replace("anilist-anime-", "")}`;
  if (id.startsWith("anilist-manga-") || id.startsWith("anilist-novel-"))
    return `https://anilist.co/manga/${id.replace(/anilist-(manga|novel)-/, "")}`;
  // TMDB
  if (id.startsWith("tmdb-anime-"))
    return `https://www.themoviedb.org/tv/${id.replace("tmdb-anime-", "")}`;
  if (media.source === "tmdb" && media.type === "movie")
    return `https://www.themoviedb.org/movie/${id}`;
  if (media.source === "tmdb" && media.type === "tv")
    return `https://www.themoviedb.org/tv/${id}`;
  return undefined;
}

function buildSourceLabel(media: MediaDetails): string {
  const id = media.id;
  if (id.startsWith("bgg-")) return "BGG";
  if (id.startsWith("anilist-")) return "AniList";
  if (id.startsWith("igdb-")) return "IGDB";
  return "TMDb";
}

function triggerTasteDelta(options: {
  action: "rating" | "status_change" | "wishlist_add";
  mediaId: string;
  mediaType: string;
  genres: string[];
  rating?: number;
  status?: string;
}) {
  fetch("/api/taste/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  }).catch(() => {});
}

const TYPE_ICON: Record<string, React.ElementType> = {
  anime: Film,
  manga: Layers,
  game: Gamepad2,
  tv: Tv,
  movie: Film,
  boardgame: Dices,
};

const RELATION_LABEL: Record<string, string> = {
  SEQUEL: "Sequel",
  PREQUEL: "Prequel",
  SIDE_STORY: "Side story",
  SPIN_OFF: "Spin-off",
  ALTERNATIVE: "Alternative",
};

const DRAWER_LOCALIZATION_OPTIONS = {
  titleKeys: ["title"],
  coverKeys: ["coverImage", "cover_image"],
  idKeys: ["external_id", "id"],
  typeKeys: ["type"],
  descriptionKeys: ["description"],
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function MediaDetailsDrawer({
  media,
  onClose,
  isOwner,
  onAdd,
  initialInCollection,
  initialInWishlist,
}: MediaDetailsDrawerProps) {
  const getKnownCollectionState = useCallback((item: MediaDetails | null): boolean | undefined => {
    if (typeof initialInCollection === "boolean") return initialInCollection;
    if (!item) return undefined;

    const raw = item as any;
    if (typeof raw.inCollection === "boolean") return raw.inCollection;
    if (typeof raw.in_collection === "boolean") return raw.in_collection;
    if (typeof raw.added === "boolean") return raw.added;
    if (typeof raw.isAdded === "boolean") return raw.isAdded;
    if (typeof raw.isInCollection === "boolean") return raw.isInCollection;
    if (typeof raw.collection_id === "string" && raw.collection_id.length > 0) return true;
    if (typeof raw.entry_id === "string" && raw.entry_id.length > 0) return true;
    if (typeof raw.user_media_entry_id === "string" && raw.user_media_entry_id.length > 0) return true;
    return undefined;
  }, [initialInCollection]);

  const getKnownWishlistState = useCallback((item: MediaDetails | null): boolean | undefined => {
    if (typeof initialInWishlist === "boolean") return initialInWishlist;
    if (!item) return undefined;

    const raw = item as any;
    if (typeof raw.inWishlist === "boolean") return raw.inWishlist;
    if (typeof raw.in_wishlist === "boolean") return raw.in_wishlist;
    if (typeof raw.wishlisted === "boolean") return raw.wishlisted;
    if (typeof raw.isWishlisted === "boolean") return raw.isWishlisted;
    if (typeof raw.wishlist_id === "string" && raw.wishlist_id.length > 0) return true;
    return undefined;
  }, [initialInWishlist]);

  const [inCollection, setInCollection] = useState(() => getKnownCollectionState(media) ?? false);
  const [inWishlist, setInWishlist] = useState(() => getKnownWishlistState(media) ?? false);
  const [checkDone, setCheckDone] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState(false);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formRating, setFormRating] = useState<number>(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const { locale } = useLocale();
  const drawerUi = appCopy[locale].drawer;
  const ui = appCopy[locale].drawer;
  const commonUi = appCopy[locale].common;
  const pathname = usePathname();

  const [localizedMedia, setLocalizedMedia] = useState<MediaDetails | null>(null);
  const [localizingMedia, setLocalizingMedia] = useState(false);

  useEffect(() => {
    if (!media) {
      setLocalizedMedia(null);
      setLocalizingMedia(false);
      return;
    }

    let cancelled = false;
    const payload = {
      ...media,
      id: media.id,
      external_id: (media as any).external_id || media.id,
      title: media.title,
      type: media.type,
      coverImage: media.coverImage,
      cover_image: (media as any).cover_image || media.coverImage,
      description: media.description,
    };

    const cached = getCachedLocalizedMediaRow(payload, locale, DRAWER_LOCALIZATION_OPTIONS) as MediaDetails | null;
    const hasCached = hasCachedLocalizedMediaRow(payload, locale, DRAWER_LOCALIZATION_OPTIONS);
    const hasStrictDescription = Boolean(pickStrictLocalizedField(cached || media, locale, "description"));

    setLocalizedMedia(cached ? ({ ...media, ...cached } as MediaDetails) : null);
    setLocalizingMedia(!hasStrictDescription);

    localizeMediaRows([payload], locale, { ...DRAWER_LOCALIZATION_OPTIONS, mode: 'full', requireDescription: true }, { force: !hasStrictDescription, mode: 'full' })
      .then((items) => {
        if (cancelled) return;
        const next = items?.[0];
        setLocalizedMedia(next ? ({ ...media, ...next } as MediaDetails) : (cached ? ({ ...media, ...cached } as MediaDetails) : null));
        setLocalizingMedia(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLocalizedMedia(cached ? ({ ...media, ...cached } as MediaDetails) : null);
          setLocalizingMedia(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [media?.id, media?.external_id, media?.type, locale]);

  const historyPushedRef = useRef(false);
  const closingRef = useRef(false); // true while our own history.back() is in flight
  const isClosingRef = useRef(false); // guards against double-close
  const onCloseRef = useRef(onClose);
  const routeAtOpenRef = useRef<string | null>(null);
  onCloseRef.current = onClose;
  const [drawerOffset, setDrawerOffset] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 450,
  );
  const [drawerYOffset, setDrawerYOffset] = useState(0);
  const [drawerAnimate, setDrawerAnimate] = useState(false);

  // iOS edge-swipe refs (dichiarati dentro il componente come richiesto da React)
  const iosSwipeTouchId = useRef<number | null>(null);
  const iosSwipeStartX = useRef(0);
  const iosSwipeStartY = useRef(0);
  const iosSwipeConfirmed = useRef(false);

  // Mobile swipe-down refs
  const verticalSwipeTouchId = useRef<number | null>(null);
  const verticalSwipeStartX = useRef(0);
  const verticalSwipeStartY = useRef(0);
  const verticalSwipeConfirmed = useRef(false);

  const closeInstant = useCallback((options?: { syncHistory?: boolean }) => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const syncHistory = options?.syncHistory !== false;
    const shouldPopDrawerHistory =
      syncHistory &&
      typeof window !== "undefined" &&
      historyPushedRef.current &&
      Boolean(window.history.state?.gkDrawer);

    // Chiudi prima la UI. La X non deve aspettare la History API.
    setDrawerAnimate(false);
    setDrawerOffset(typeof window !== "undefined" ? window.innerWidth : 450);
    setDrawerYOffset(0);
    routeAtOpenRef.current = null;
    onCloseRef.current();

    if (shouldPopDrawerHistory) {
      historyPushedRef.current = false;
      closingRef.current = true;
      window.setTimeout(() => {
        try {
          window.history.back();
        } catch {
          closingRef.current = false;
        }
      }, 0);
    }

    window.setTimeout(() => {
      isClosingRef.current = false;
    }, 0);
  }, []);

  const closeWithSwipeDownAnimation = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setDrawerAnimate(true);
    setDrawerYOffset(typeof window !== "undefined" ? window.innerHeight : 760);
    window.setTimeout(() => {
      routeAtOpenRef.current = null;
      isClosingRef.current = false;
      onCloseRef.current();
    }, 180);
  }, []);

  const handleClose = useCallback(() => closeInstant(), [closeInstant]);

  useEffect(() => {
    if (media) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [media]);

  useEffect(() => {
    if (!media) {
      routeAtOpenRef.current = null;
      return;
    }

    if (routeAtOpenRef.current === null) {
      routeAtOpenRef.current = pathname;
      return;
    }

    if (routeAtOpenRef.current !== pathname) {
      closeInstant({ syncHistory: false });
    }
  }, [media?.id, pathname, closeInstant]);

  useEffect(() => {
    setShowAddForm(false);
    setFormRating(0);
    setDescExpanded(false);
    setAddingToCollection(false);
    setWishlistBusy(false);
  }, [media?.id]);

  useEffect(() => {
    if (showAddForm && formRef.current) {
      formRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [showAddForm]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeInstant();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeInstant]);

  useEffect(() => {
    if (!media) {
      setInCollection(false);
      setInWishlist(false);
      setCheckDone(false);
      return;
    }

    // Stato immediato: se la pagina che apre il drawer conosce già collection/wishlist,
    // usiamolo subito. Così non compare mai "Aggiungi" per poi diventare "In collezione".
    const knownCollection = getKnownCollectionState(media);
    const knownWishlist = getKnownWishlistState(media);

    setInCollection(knownCollection ?? false);
    setInWishlist(knownWishlist ?? false);
    setCheckDone(false);

    let cancelled = false;
    const check = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setCheckDone(true);
        return;
      }
      const [{ data: col }, { data: wish }] = await Promise.all([
        supabase
          .from("user_media_entries")
          .select("id")
          .eq("user_id", user.id)
          .eq("external_id", media.id)
          .maybeSingle(),
        supabase
          .from("wishlist")
          .select("id")
          .eq("user_id", user.id)
          .eq("external_id", media.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setInCollection(!!col);
      setInWishlist(!!wish);
      setCheckDone(true);
    };
    check();

    return () => {
      cancelled = true;
    };
  }, [media?.id, initialInCollection, initialInWishlist, getKnownCollectionState, getKnownWishlistState]);

  const handleAddToCollection = useCallback(
    async (opts?: { rating?: number }) => {
      if (!media || addingToCollection || inCollection) return;
      setAddingToCollection(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAddingToCollection(false);
        return;
      }

      const isMovie = media.type === "movie";
      const isBoardgame = detailMedia.type === "boardgame";

      const status = isMovie || isBoardgame ? "completed" : "watching";

      // Per i boardgame: mappa i campi BGG sulle colonne disponibili
      const bggAchievementData =
        isBoardgame &&
        (media.complexity != null ||
          media.min_players != null ||
          media.playing_time != null)
          ? {
              bgg: {
                score: (media as any).score ?? null,
                complexity: media.complexity ?? null,
                min_players: media.min_players ?? null,
                max_players: media.max_players ?? null,
                playing_time: media.playing_time ?? null,
              },
            }
          : null;

      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_id: media.id,
          title: media.title,
          title_en: media.title_en || media.title,
          title_original: (media as any).title_original || media.title,
          title_it: (media as any).title_it || null,
          description_en:
            (media as any).description_en || media.description || null,
          description_it: (media as any).description_it || null,
          localized: (media as any).localized || null,
          type: media.type,
          cover_image: media.coverImage,
          genres: media.genres || [],
          // boardgame: meccaniche in tags, designer in authors
          tags: isBoardgame ? media.mechanics || [] : [],
          authors: isBoardgame
            ? media.designers || media.authors || []
            : media.authors || [],
          keywords: isBoardgame ? [] : [],
          status,
          rating: opts?.rating ?? null,
          studios: isBoardgame ? [] : media.studios || [],
          directors: isBoardgame ? [] : media.directors || [],
          developer: isBoardgame ? null : media.developers?.[0] || null,
          achievement_data: bggAchievementData,
          display_order:
            Date.now() + Math.round((opts?.rating ?? 0) * 1_000_000),
        }),
      }).catch(() => null);
      if (res?.ok) {
        setInCollection(true);
        setShowAddForm(false);
        onAdd?.(media);
        // Invalida la memCache così la prossima apertura di Per Te rigenera il pool
        fetch("/api/recommendations?invalidateCache=true", {
          method: "POST",
          keepalive: true,
        }).catch(() => {});
        if ((media.genres || []).length > 0) {
          triggerTasteDelta({
            action: "status_change",
            mediaId: media.id,
            mediaType: media.type,
            genres: media.genres || [],
            status,
          });
          if (opts?.rating) {
            triggerTasteDelta({
              action: "rating",
              mediaId: media.id,
              mediaType: media.type,
              genres: media.genres || [],
              rating: opts.rating,
            });
          }
        }
      }
      setAddingToCollection(false);
    },
    [media, onAdd, addingToCollection, inCollection],
  );

  const handleToggleWishlist = useCallback(async () => {
    if (!media || wishlistBusy) return;
    setWishlistBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setWishlistBusy(false);
      return;
    }
    if (inWishlist) {
      const res = await fetch("/api/wishlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ external_id: media.id }),
      }).catch(() => null);
      if (res?.ok) setInWishlist(false);
      setWishlistBusy(false);
    } else {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          external_id: media.id,
          title: media.title,
          type: media.type,
          cover_image: media.coverImage,
          title_original: (media as any).title_original || media.title,
          title_en: (media as any).title_en || media.title,
          title_it: (media as any).title_it || null,
          description_en:
            (media as any).description_en || media.description || null,
          description_it: (media as any).description_it || null,
          localized: (media as any).localized || null,
        }),
      }).catch(() => null);
      if (!res?.ok) {
        setWishlistBusy(false);
        return;
      }
      setInWishlist(true);
      if ((media.genres || []).length > 0) {
        triggerTasteDelta({
          action: "wishlist_add",
          mediaId: media.id,
          mediaType: media.type,
          genres: media.genres || [],
        });
      }
      setWishlistBusy(false);
    }
  }, [media, inWishlist, wishlistBusy]);

  // Back action: quando il drawer è aperto, indietro deve chiudere SOLO il drawer.
  useEffect(() => {
    if (!media || typeof window === "undefined") {
      gestureState.drawerActive = false;
      return;
    }

    gestureState.drawerActive = true;

    window.history.pushState({ ...(window.history.state || {}), gkDrawer: true }, "", window.location.href);
    historyPushedRef.current = true;

    const closeDrawerFromBack = () => {
      if (!historyPushedRef.current) return;
      historyPushedRef.current = false;
      closeInstant({ syncHistory: false });
    };

    androidBack.push(closeDrawerFromBack);

    const onPop = (e: PopStateEvent) => {
      if (closingRef.current) {
        closingRef.current = false;
        e.stopImmediatePropagation();
        return;
      }

      if (!historyPushedRef.current) return;

      e.stopImmediatePropagation();
      closeDrawerFromBack();
    };

    window.addEventListener("popstate", onPop, { capture: true });

    return () => {
      gestureState.drawerActive = false;
      androidBack.pop(closeDrawerFromBack);
      window.removeEventListener("popstate", onPop, { capture: true });
      historyPushedRef.current = false;
    };
  }, [media?.id, closeInstant]);

  // Slide-in animation whenever a new item opens
  useEffect(() => {
    if (!media) {
      setDrawerAnimate(false);
      return;
    }
    setDrawerAnimate(false);
    setDrawerOffset(typeof window !== "undefined" ? window.innerWidth : 450);
    setDrawerYOffset(0);
    const frame = requestAnimationFrame(() => {
      setDrawerAnimate(true);
      setDrawerOffset(0);
      setDrawerYOffset(0);
    });
    return () => cancelAnimationFrame(frame);
  }, [media?.id]);

  // ── iOS edge-swipe per chiudere il drawer (segue il dito, come Instagram) ──
  // Su Android questo blocco non fa nulla perché IS_IOS è false.
  useEffect(() => {
    if (!IS_IOS || !media) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t.clientX > IOS_EDGE_SWIPE_ZONE) return; // non parte dal bordo sinistro
      iosSwipeTouchId.current = t.identifier;
      iosSwipeStartX.current = t.clientX;
      iosSwipeStartY.current = t.clientY;
      iosSwipeConfirmed.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (iosSwipeTouchId.current === null) return;
      const t = Array.from(e.touches).find(
        (tt) => tt.identifier === iosSwipeTouchId.current,
      );
      if (!t) return;
      const dx = t.clientX - iosSwipeStartX.current;
      const dy = t.clientY - iosSwipeStartY.current;

      if (!iosSwipeConfirmed.current) {
        // Aspetta abbastanza movimento per distinguere H da V
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          // Movimento verticale → abbandona, non è uno swipe di chiusura
          iosSwipeTouchId.current = null;
          return;
        }
        iosSwipeConfirmed.current = true;
      }

      if (dx < 0) return; // non permettiamo swipe verso sinistra (drawer già a destra)
      e.stopPropagation(); // evita che SwipeablePageContainer catturi questo touch
      setDrawerAnimate(false);
      setDrawerOffset(dx);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (iosSwipeTouchId.current === null) return;
      const ended = Array.from(e.changedTouches).find(
        (tt) => tt.identifier === iosSwipeTouchId.current,
      );
      if (!ended) return;
      iosSwipeTouchId.current = null;

      const dx = ended.clientX - iosSwipeStartX.current;
      if (iosSwipeConfirmed.current && dx >= IOS_DISMISS_THRESHOLD) {
        closeInstant();
      } else {
        // Snap back
        setDrawerAnimate(true);
        setDrawerOffset(0);
      }
      iosSwipeConfirmed.current = false;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [media?.id, closeInstant]);

  if (!media || typeof document === "undefined") return null;

  const localizedSource = localizedMedia || media;
  const strictTitle = pickStrictLocalizedField(localizedSource, locale, "title");
  const strictDescription = pickStrictLocalizedField(localizedSource, locale, "description");
  const strictCoverImage = pickStrictLocalizedField(localizedSource, locale, "coverImage");
  const displayTitle = strictTitle || pickLocalizedField(localizedSource, locale, "title") || media.title;
  const displayDescription = strictDescription || safeGenericDescription(localizedSource, locale);
  const displayCoverImage = strictCoverImage || pickLocalizedField(localizedSource, locale, "coverImage") || media.coverImage;
  const displayMedia = {
    ...localizedSource,
    title: displayTitle,
    description: displayDescription,
    coverImage: displayCoverImage,
  } as MediaDetails;

  const detailMedia = normalizeDrawerDetailMedia(displayMedia, media);
  const Icon = TYPE_ICON[detailMedia.type] || Film;
  const externalUrl = buildExternalUrl(detailMedia);
  const sourceLabel = buildSourceLabel(detailMedia);

  const isManga = detailMedia.type === "manga";
  const isBoardgame = detailMedia.type === "boardgame";
  // Autori/creatori priorità per tipo
  const creatorList = isManga
    ? detailMedia.authors?.length
      ? detailMedia.authors
      : detailMedia.developers?.length
        ? detailMedia.developers
        : detailMedia.studios?.length
          ? detailMedia.studios
          : null
    : detailMedia.studios?.length
      ? detailMedia.studios
      : detailMedia.directors?.length
        ? detailMedia.directors
        : detailMedia.authors?.length
          ? detailMedia.authors
          : null;

  const creatorLabel = creatorList?.slice(0, 2).join(", ") ?? null;
  const creatorTitle = isManga
    ? detailMedia.authors?.length
      ? ui.authors
      : ui.publishers
    : detailMedia.studios?.length
      ? ui.studios
      : detailMedia.directors?.length
        ? ui.directors
        : ui.authors;

  const continuityRelations = (detailMedia.relations || [])
    .filter((r) =>
      ["SEQUEL", "PREQUEL", "SIDE_STORY", "SPIN_OFF"].includes(r.relationType),
    )
    .slice(0, 4);

  const isLongDesc = (detailMedia.description?.length ?? 0) > 350;
  const timeLabel =
    detailMedia.type === "anime" || detailMedia.type === "tv"
      ? commonUi.minutesPerEpisode
      : commonUi.minutesShort;

  const isMobileViewport =
    typeof window !== "undefined" && window.innerWidth < 768;

  const handleDrawerTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileViewport) return;
    const touch = event.touches[0];
    verticalSwipeTouchId.current = touch.identifier;
    verticalSwipeStartX.current = touch.clientX;
    verticalSwipeStartY.current = touch.clientY;
    verticalSwipeConfirmed.current = false;
  };

  const handleDrawerTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileViewport || verticalSwipeTouchId.current === null) return;
    const touch = Array.from(event.touches).find(
      (item) => item.identifier === verticalSwipeTouchId.current,
    );
    if (!touch) return;

    const dx = touch.clientX - verticalSwipeStartX.current;
    const dy = touch.clientY - verticalSwipeStartY.current;
    if (dy <= 0) return;

    const target = event.target as Element | null;
    const scrollRoot = target?.closest?.('[data-scroll-root="media-details"]') as HTMLElement | null;
    const canDismissFromScroll = !scrollRoot || scrollRoot.scrollTop <= 2;

    if (!verticalSwipeConfirmed.current) {
      if (Math.abs(dx) < 7 && Math.abs(dy) < 7) return;
      if (Math.abs(dx) > Math.abs(dy) || !canDismissFromScroll) {
        verticalSwipeTouchId.current = null;
        return;
      }
      verticalSwipeConfirmed.current = true;
    }

    event.preventDefault();
    event.stopPropagation();
    setDrawerAnimate(false);
    setDrawerYOffset(Math.min(dy, 260));
  };

  const handleDrawerTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobileViewport || verticalSwipeTouchId.current === null) return;
    const touch = Array.from(event.changedTouches).find(
      (item) => item.identifier === verticalSwipeTouchId.current,
    );
    verticalSwipeTouchId.current = null;
    if (!touch) return;

    const dy = touch.clientY - verticalSwipeStartY.current;
    if (verticalSwipeConfirmed.current && dy >= MOBILE_SWIPE_DOWN_THRESHOLD) {
      verticalSwipeConfirmed.current = false;
      closeWithSwipeDownAnimation();
      return;
    }

    verticalSwipeConfirmed.current = false;
    setDrawerAnimate(true);
    setDrawerYOffset(0);
  };

  // Portal to body so the drawer is in the root stacking context.
  // z-[80]: below MobileHeader (z-99) and Navbar (z-100) — they overlay the edges.
  // top/bottom in the style prop account for header + bottom-nav heights so
  // the drawer content is never hidden behind those elements.
  return createPortal(
    <>
      {/* Backdrop — below MobileHeader (z-99) and Navbar (z-100) */}
      <div
        data-no-swipe="true"
        className="fixed inset-0 z-[119] bg-black/34 backdrop-blur-[1px]"
        onMouseDown={handleClose}
        aria-hidden
      />

      {/* Drawer — sits behind MobileHeader/Navbar; top/bottom account for their heights */}
      <div
        data-no-swipe="true"
        className="fixed right-0 z-[120] flex flex-col shadow-[0_0_56px_rgba(0,0,0,0.50)]"
        role="dialog"
        data-drawer="media-details"
        aria-modal
        aria-label={displayTitle}
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={handleDrawerTouchStart}
        onTouchMove={handleDrawerTouchMove}
        onTouchEnd={handleDrawerTouchEnd}
        onTouchCancel={handleDrawerTouchEnd}
        style={{
          background: "var(--bg-primary)",
          border: "1px solid rgba(230,255,61,0.13)",
          borderRadius:
            typeof window !== "undefined" && window.innerWidth >= 768
              ? "22px 0 0 22px"
              : "22px 22px 0 0",
          overflow: "hidden",
          width: "min(456px, calc(100vw - 18px))",
          maxWidth: "none",
          left: "auto",
          top: "calc(env(safe-area-inset-top, 0px) + 10px)",
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
          transform: `translate3d(${drawerOffset}px, ${drawerYOffset}px, 0)`,
          transition: drawerAnimate
            ? "transform 0.26s cubic-bezier(0.22, 1, 0.36, 1)"
            : "none",
          willChange: drawerOffset > 0 || drawerYOffset > 0 ? "transform" : "auto",
        }}
      >
        <MediaDetailsHero
          media={{
            title: displayTitle,
            type: detailMedia.type,
            coverImage: displayCoverImage,
            year: detailMedia.year,
            score: detailMedia.score != null ? detailMedia.score.toFixed(1) : null,
            matchScore: detailMedia.matchScore,
            isAwardWinner: detailMedia.isAwardWinner,
          }}
          fallbackIcon={<Icon size={28} />}
          subtitle={
            creatorLabel ? (
              <span className="inline-flex min-w-0 items-center gap-1 text-sky-300">
                <Clapperboard size={11} />{" "}
                <span className="truncate">{creatorLabel}</span>
              </span>
            ) : null
          }
          meta={
            <>
              {shouldShowChapterCount(detailMedia.type) && detailMedia.episodes != null && detailMedia.episodes > 1 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-black/20 px-2 py-0.5 font-mono-data text-[10px] font-bold text-[var(--text-secondary)]">
                  <Layers size={10} /> {detailMedia.episodes} {commonUi.chapters}
                </span>
              )}
              {(detailMedia.min_players != null || detailMedia.max_players != null) && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-black/20 px-2 py-0.5 font-mono-data text-[10px] font-bold text-[var(--text-secondary)]">
                  <Users size={10} />
                  {detailMedia.min_players === detailMedia.max_players
                    ? detailMedia.min_players
                    : `${detailMedia.min_players ?? "?"}–${detailMedia.max_players ?? "?"}`}
                </span>
              )}
              {detailMedia.playing_time != null && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-black/20 px-2 py-0.5 font-mono-data text-[10px] font-bold text-[var(--text-secondary)]">
                  <Clock size={10} /> {detailMedia.playing_time}
                  {timeLabel}
                </span>
              )}
              {detailMedia.complexity != null && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-black/20 px-2 py-0.5 font-mono-data text-[10px] font-bold text-[var(--text-secondary)]">
                  <Dices size={10} /> {detailMedia.complexity.toFixed(1)}/5
                </span>
              )}
            </>
          }
          onClose={handleClose}
        />

        {/* ── CONTENUTO SCORREVOLE ───────────────────────────────────── */}
        <div
          className="gk-media-details-body flex-1 overflow-y-auto overscroll-contain bg-[var(--bg-primary)]"
          data-scroll-root="media-details"
          data-no-swipe="true"
          onWheel={(event) => event.stopPropagation()}
          onTouchMove={(event) => { handleDrawerTouchMove(event); event.stopPropagation(); }}
        >
          <div className="gk-media-details-content grid gap-2.5 p-3 md:grid-cols-1">
            {/* Generi */}
            {detailMedia.genres && detailMedia.genres.length > 0 && (
              <MediaDetailsSection title={ui.genres} icon={<Hash size={13} />}>
                <div className="flex flex-wrap gap-1.5">
                  {detailMedia.genres.map((g) => (
                    <MediaDetailsTag key={g} accent>
                      {genreLabel(genreLabel(g, locale), locale)}
                    </MediaDetailsTag>
                  ))}
                </div>
              </MediaDetailsSection>
            )}

            {/* Stats grid */}
            {(() => {
              const cells: React.ReactElement[] = [];
              if (detailMedia.matchScore != null)
                cells.push(
                  <div
                    key="match"
                    className="rounded-2xl bg-black/18 p-3 text-center ring-1 ring-white/5"
                  >
                    <p className="gk-label mb-1">{commonUi.match}</p>
                    <p
                      className="font-mono-data text-[18px] font-black"
                      style={{ color: "var(--accent)" }}
                    >
                      {detailMedia.matchScore}%
                    </p>
                  </div>,
                );
              if (detailMedia.score != null)
                cells.push(
                  <div
                    key="score"
                    className="rounded-2xl bg-black/18 p-3 text-center ring-1 ring-white/5"
                  >
                    <p className="gk-label mb-1">{commonUi.score}</p>
                    <div className="flex items-center justify-center gap-1">
                      <Star
                        size={11}
                        className="text-yellow-400 fill-yellow-400"
                      />
                      <p className="font-mono-data text-[18px] font-black text-[var(--text-primary)]">
                        {detailMedia.score!.toFixed(1)}
                      </p>
                      <span className="text-[10px] text-[var(--text-muted)]">
                        /5
                      </span>
                    </div>
                  </div>,
                );
              if (detailMedia.year)
                cells.push(
                  <div
                    key="year"
                    className="rounded-2xl bg-black/18 p-3 text-center ring-1 ring-white/5"
                  >
                    <p className="gk-label mb-1">{commonUi.year}</p>
                    <p className="font-mono-data text-[18px] font-black text-[var(--text-primary)]">
                      {detailMedia.year}
                    </p>
                  </div>,
                );
              if (shouldShowChapterCount(detailMedia.type) && detailMedia.episodes != null && detailMedia.episodes > 1)
                cells.push(
                  <div
                    key="eps"
                    className="rounded-2xl bg-black/18 p-3 text-center ring-1 ring-white/5"
                  >
                    <p className="gk-label mb-1">
                      {commonUi.chapters}
                    </p>
                    <p className="font-mono-data text-[18px] font-black text-[var(--text-primary)]">
                      {detailMedia.episodes}
                    </p>
                  </div>,
                );
              if (detailMedia.playing_time)
                cells.push(
                  <div
                    key="time"
                    className="rounded-2xl bg-black/18 p-3 text-center ring-1 ring-white/5"
                  >
                    <p className="gk-label mb-1">{commonUi.duration}</p>
                    <p className="font-mono-data text-[18px] font-black text-[var(--text-primary)]">
                      {detailMedia.playing_time}
                      <span className="ml-0.5 text-[10px] text-[var(--text-muted)]">
                        m
                      </span>
                    </p>
                  </div>,
                );
              if (detailMedia.complexity)
                cells.push(
                  <div
                    key="cmplx"
                    className="rounded-2xl bg-black/18 p-3 text-center ring-1 ring-white/5"
                  >
                    <p className="gk-label mb-1">{commonUi.difficulty}</p>
                    <p className="font-mono-data text-[18px] font-black text-[var(--text-primary)]">
                      {detailMedia.complexity.toFixed(1)}
                      <span className="text-[10px] text-[var(--text-muted)]">
                        /5
                      </span>
                    </p>
                  </div>,
                );
              if (detailMedia.min_players != null || detailMedia.max_players != null)
                cells.push(
                  <div
                    key="players"
                    className="rounded-2xl bg-black/18 p-3 text-center ring-1 ring-white/5"
                  >
                    <p className="gk-label mb-1">{commonUi.players}</p>
                    <p className="font-mono-data text-[18px] font-black text-[var(--text-primary)]">
                      {detailMedia.min_players === detailMedia.max_players
                        ? detailMedia.min_players
                        : `${detailMedia.min_players ?? "?"}–${detailMedia.max_players ?? "?"}`}
                    </p>
                  </div>,
                );
              if (detailMedia.pages)
                cells.push(
                  <div
                    key="pages"
                    className="rounded-2xl bg-black/18 p-3 text-center ring-1 ring-white/5"
                  >
                    <p className="gk-label mb-1">{commonUi.pages}</p>
                    <p className="text-lg font-bold text-white">
                      {detailMedia.pages}
                    </p>
                  </div>,
                );
              if (cells.length === 0) return null;
              return (
                <div
                  className={`grid gap-2 ${cells.length <= 2 ? "grid-cols-2" : "grid-cols-3"}`}
                >
                  {cells}
                </div>
              );
            })()}

            {/* Descrizione — testo completo, scrollabile, senza taglio.
                Se la localizzazione è in corso, non mostriamo per un istante
                la descrizione nella lingua sbagliata: resta uno skeleton breve. */}
            {(displayDescription || localizingMedia) && (
              <MediaDetailsSection
                title={drawerUi?.description || commonUi.description}
                icon={<FileText size={13} />}
              >
                {displayDescription ? (
                  <div className="gk-description-full">
                    <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">
                      {displayDescription}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 py-1" aria-hidden="true">
                    <div className="h-3.5 w-full animate-pulse rounded-full bg-white/8" />
                    <div className="h-3.5 w-11/12 animate-pulse rounded-full bg-white/8" />
                    <div className="h-3.5 w-8/12 animate-pulse rounded-full bg-white/8" />
                  </div>
                )}
              </MediaDetailsSection>
            )}

            {/* Autori / Studio / Registi */}
            {creatorList && creatorList.length > 0 && (
              <div>
                <h3 className="gk-label mb-2.5 flex items-center gap-1">
                  <Clapperboard size={10} />
                  {creatorTitle}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {creatorList.slice(0, 5).map((name) => (
                    <span
                      key={name}
                      className="inline-flex rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-sky-300"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── BOARDGAME: {ui.mechanics} ─────────────────────────────── */}
            {isBoardgame && detailMedia.mechanics && detailMedia.mechanics.length > 0 && (
              <div>
                <h3 className="gk-label mb-2.5 flex items-center gap-1">
                  <Dices size={10} />
                  {ui.mechanics}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {detailMedia.mechanics.slice(0, 10).map((m) => (
                    <span
                      key={m}
                      className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-300"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── BOARDGAME: Designer ───────────────────────────────── */}
            {isBoardgame && detailMedia.designers && detailMedia.designers.length > 0 && (
              <div>
                <h3 className="gk-label mb-2.5">{ui.designers}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {detailMedia.designers.map((d) => (
                    <span
                      key={d}
                      className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* {ui.developers} (games) */}
            {detailMedia.developers && detailMedia.developers.length > 0 && !isManga && (
              <div>
                <h3 className="gk-label mb-2.5">{ui.developers}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {detailMedia.developers.slice(0, 4).map((name) => (
                    <span
                      key={name}
                      className="inline-flex rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-sky-300"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Cast */}
            {detailMedia.cast && detailMedia.cast.length > 0 && (
              <div>
                <h3 className="gk-label mb-2.5">{ui.cast}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {detailMedia.cast.map((name) => (
                    <span
                      key={name}
                      className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* {ui.platforms} (gaming) */}
            {detailMedia.platforms && detailMedia.platforms.length > 0 && (
              <div>
                <h3 className="gk-label mb-2.5 flex items-center gap-1">
                  <Monitor size={10} />
                  {ui.platforms}
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {detailMedia.platforms.slice(0, 8).map((p) => (
                    <span
                      key={p}
                      className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* {ui.availableOn} */}
            {detailMedia.watchProviders && detailMedia.watchProviders.length > 0 && (
              <div>
                <h3 className="gk-label mb-2.5">{ui.availableOn}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {detailMedia.watchProviders.map((p) => (
                    <span
                      key={p}
                      className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300"
                    >
                      {p}
                    </span>
                  ))}
                </div>
                <p className="gk-mono text-[var(--text-muted)] mt-1.5">
                  {ui.poweredBy("JustWatch")}
                </p>
              </div>
            )}

            {/* Supporto italiano */}
            {detailMedia.italianSupportTypes &&
              detailMedia.italianSupportTypes.length > 0 && (
                <div>
                  <h3 className="gk-label mb-2.5">{ui.italianLanguage}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {detailMedia.italianSupportTypes.map((t) => (
                      <span
                        key={t}
                        className="inline-flex rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs font-bold text-green-300"
                      >
                        🇮🇹 {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            {/* Continuity / Relations */}
            {continuityRelations.length > 0 && (
              <div>
                <h3 className="gk-label mb-2">{ui.sameSeries}</h3>
                <div
                  className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide"
                  data-no-swipe="true"
                >
                  {continuityRelations.map((rel) => (
                    <div key={rel.id} className="flex-shrink-0 w-16">
                      <div className="relative mb-1 h-24 overflow-hidden rounded-2xl bg-[var(--bg-card)] ring-1 ring-white/5">
                        {rel.coverImage ? (
                          <img
                            src={optimizeCover(
                              rel.coverImage,
                              "drawer-related",
                            )}
                            alt={rel.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
                            <Tv size={28} />
                          </div>
                        )}
                        <div className="absolute top-1 left-1 bg-amber-500/90 text-[7px] font-bold px-1 py-0.5 rounded text-white">
                          {relationLabels[locale]?.[rel.relationType] || rel.relationType}
                        </div>
                      </div>
                      <p className="line-clamp-2 text-[10px] font-bold leading-tight text-[var(--text-secondary)]">
                        {rel.title}
                      </p>
                      {rel.year && (
                        <p className="text-[8px] text-[var(--text-muted)]">
                          {rel.year}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Form aggiunta */}
            {showAddForm && (
              <div
                ref={formRef}
                data-no-swipe="true"
                className="rounded-[22px] border border-white/8 bg-white/[0.035] px-4 py-3 shadow-[0_14px_36px_rgba(0,0,0,.22)]"
              >
                <div className="flex items-center justify-between gap-4">
                  <p className="gk-label whitespace-nowrap">{ui.yourRatingOptional}</p>

                  <div data-no-swipe="true" className="flex min-h-9 items-center justify-end">
                    <StarRating
                      value={formRating}
                      onChange={setFormRating}
                      size={26}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── FOOTER STICKY ────────────────────────────────────────── */}
        <div
          className="gk-media-details-footer relative z-10 flex-shrink-0 space-y-2 border-t border-[var(--border)] bg-[rgba(11,11,15,0.94)] p-3 backdrop-blur-xl"
          data-no-swipe="true"
        >
          {showAddForm ? (
            <div className="flex gap-2">
              <button
                type="button"
                data-no-swipe="true"
                onClick={() => setShowAddForm(false)}
                className="flex-1 rounded-2xl border border-[var(--border)] py-2.5 text-sm font-bold text-[var(--text-secondary)] transition-all hover:border-[rgba(230,255,61,0.45)] hover:text-[var(--text-primary)]"
              >
                {commonUi.cancel}
              </button>
              <button
                type="button"
                data-no-swipe="true"
                disabled={addingToCollection}
                onClick={() =>
                  handleAddToCollection({
                    rating: formRating || undefined,
                  })
                }
                className="flex-1 rounded-2xl py-2.5 text-sm font-black transition-all disabled:opacity-40"
                style={{ background: "var(--accent)", color: "#0B0B0F" }}
              >
                {addingToCollection ? ui.adding : ui.confirm}
              </button>
            </div>
          ) : !checkDone && getKnownCollectionState(media) === undefined ? (
            <div
              aria-label={commonUi.collectionStatusCheck}
              className="flex h-[42px] w-full items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] opacity-80"
            >
              <span className="h-3 w-32 animate-pulse rounded-full bg-white/10" />
            </div>
          ) : !inCollection ? (
            <button
              type="button"
              data-no-swipe="true"
              disabled={addingToCollection}
              onClick={() => setShowAddForm(true)}
              className="w-full rounded-2xl py-2.5 text-sm font-black transition-all shadow-[0_0_24px_rgba(230,255,61,0.12)] disabled:cursor-default disabled:opacity-80"
              style={{ background: "var(--accent)", color: "#0B0B0F" }}
            >
              {ui.addToCollection}
            </button>
          ) : (
            <div className="flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/12 py-2.5 text-center text-sm font-black text-emerald-300">
              <Check size={14} /> {ui.inCollection}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              data-no-swipe="true"
              onClick={handleToggleWishlist}
              disabled={!checkDone || wishlistBusy}
              className={`flex-1 py-2 rounded-2xl text-xs font-bold border transition-all disabled:cursor-default disabled:opacity-70 flex items-center justify-center gap-1.5 ${
                inWishlist
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[rgba(230,255,61,0.45)]"
              }`}
            >
              <Bookmark
                size={12}
                fill={inWishlist ? "currentColor" : "none"}
              />
              {inWishlist ? ui.inWishlist : ui.wishlist}
            </button>

            {externalUrl && (
              <a
                data-no-swipe="true"
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 rounded-2xl text-xs font-bold bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[rgba(230,255,61,0.45)] transition-all flex items-center justify-center gap-1.5"
              >
                <ExternalLink size={12} />
                {sourceLabel}
              </a>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
