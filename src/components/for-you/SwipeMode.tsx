"use client";
// DESTINAZIONE: src/components/for-you/SwipeMode.tsx
// v9 — fix definitivi:
//   1. RATING: SwipeMode NON scrive più su user_media_entries (doppia scrittura eliminata).
//              Il rating viene letto dal ref e passato a onSeen → handleSwipeSeen in page.tsx
//              che è l'UNICO punto di scrittura. Zero race condition.
//   2. FLASH:  queue parte con initialItems già puliti (filtro skipped asincrono in background).
//              Le card sono visibili SUBITO. La pulizia skipped avviene silenziosamente.
//   3. RESET RATING: il rating si azzera quando cambia la card in cima, MA solo DOPO
//              che handleSwipe ha già letto il valore dal ref.

import { useState, useRef, useCallback, useEffect } from "react";

// ─── useTouchPress ─────────────────────────────────────────────────────────────
// Illumina il bottone IMMEDIATAMENTE su touchstart (iOS/Android ignorano :active
// durante il riconoscimento gesto). Si spegne su touchend/touchcancel oppure
// se il dito si muove > MOVE_CANCEL px (= sta iniziando uno swipe → non è un tap).
// Restituisce { pressProps, pressed } — pressed serve per la classe glow.
const MOVE_CANCEL = 10; // px di movimento prima di cancellare il press

function useTouchPress() {
  const [pressed, setPressed] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    setPressed(true);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startRef.current) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - startRef.current.x);
    const dy = Math.abs(t.clientY - startRef.current.y);
    if (dx > MOVE_CANCEL || dy > MOVE_CANCEL) {
      setPressed(false);
      startRef.current = null;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    setPressed(false);
    startRef.current = null;
  }, []);

  const onTouchCancel = useCallback(() => {
    setPressed(false);
    startRef.current = null;
  }, []);

  return {
    pressProps: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel },
    pressed,
  };
}
import {
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Star,
  Gamepad2,
  Tv,
  Film,
  Layers,
  Swords,
  RotateCcw,
  Dices,
  Bookmark,
} from "lucide-react";
import { MediaDetailsDrawer } from "@/components/media/MediaDetailsDrawer";
import type { MediaDetails } from "@/components/media/MediaDetailsDrawer";
import { createClient } from "@/lib/supabase/client";
import { profileInvalidateBridge } from "@/hooks/profileInvalidateBridge";
import { gestureState } from "@/hooks/gestureState";
import { swipeNavBridge } from "@/hooks/swipeNavBridge";

import { useTabActive } from "@/context/TabActiveContext";
import { optimizeCover } from "@/lib/imageOptimizer";
import { useLocale } from '@/lib/locale'
import { appCopy, typeLabel, genreLabel } from '@/lib/i18n/uiCopy'

type SwipeMediaType = "anime" | "manga" | "movie" | "tv" | "game" | "boardgame";

export interface SwipeItem {
  id: string;
  title: string;
  title_original?: string;
  title_en?: string;
  title_it?: string;
  type: SwipeMediaType;
  coverImage?: string;
  year?: number;
  genres: string[];
  score?: number;
  description?: string;
  description_en?: string;
  description_it?: string;
  localized?: Record<string, { title?: string; description?: string; coverImage?: string }>;
  why?: string;
  matchScore: number;
  episodes?: number;
  authors?: string[];
  developers?: string[];
  platforms?: string[];
  isAwardWinner?: boolean;
  source?: string;
  isDiscovery?: boolean;
}

type CategoryFilter = "all" | SwipeMediaType;

interface SwipeModeProps {
  items: SwipeItem[];
  userId?: string;
  onSeen: (
    item: SwipeItem,
    rating: number | null,
    skipPersist?: boolean,
  ) => void;
  onSkip: (item: SwipeItem) => void;
  onWishlist?: (item: SwipeItem) => void;
  onClose: () => void;
  onRequestMore: (filter?: CategoryFilter) => Promise<SwipeItem[]>;
  standalone?: boolean;
  isOnboarding?: boolean;
  onOnboardingComplete?: () => void;
  onOnboardingBack?: () => void;
  onUndo?: (item: SwipeItem) => void;
  onUndoWishlist?: (item: SwipeItem) => void;
}

const TYPE_ICONS: Record<SwipeMediaType, React.ElementType> = {
  anime: Swords,
  manga: Layers,
  movie: Film,
  tv: Tv,
  game: Gamepad2,
  boardgame: Dices,
};
const TYPE_LABEL_FALLBACK: Record<SwipeMediaType, string> = {
  anime: "Anime",
  manga: "Manga",
  movie: "Movie",
  tv: "TV Show",
  game: "Game",
  boardgame: "Board Game",
};

function swipeTypeLabel(type: SwipeMediaType, locale: "it" | "en") {
  return typeLabel(type, locale) || TYPE_LABEL_FALLBACK[type] || type;
}
const TYPE_COLORS: Record<SwipeMediaType, string> = {
  anime: "from-sky-500 to-blue-600",
  manga: "from-orange-500 to-red-500",
  movie: "from-red-500 to-rose-600",
  tv: "from-purple-500 to-violet-600",
  game: "from-emerald-500 to-green-600",
  boardgame: "from-amber-500 to-yellow-600",
};
const CATEGORY_KEYS: CategoryFilter[] = [
  "all",
  "anime",
  "manga",
  "movie",
  "tv",
  "game",
  "boardgame",
];

const SWIPE_FEEDBACK_DISTANCE = 150;
const SWIPE_COMPLETE_MIN = 120;
const SWIPE_COMPLETE_MAX = 220;
const SWIPE_COMPLETE_RATIO = 0.32;
const SWIPE_FLING_MIN_DISTANCE = 82;
const SWIPE_FLING_VELOCITY = 1.15; // px/ms: solo un gesto veloce e intenzionale completa sotto soglia
const ROTATION_FACTOR = 0.08;
const REFILL_THRESHOLD = 25;
const PRELOAD_TARGET = 50;
// GPU-friendly: text-shadow via CSS class, no filter: drop-shadow (each one = offscreen GPU buffer)
// TEXT_SHADOW kept as lightweight single shadow only (no stacked multi-shadow)
const TEXT_SHADOW = { textShadow: "0 1px 8px rgba(0,0,0,0.95)" };
// ICON_DROP removed — buttons are on dark bg, legible without filter.
// Use ICON_DROP only on the glowing star (amber glow is worth it there).
const ICON_DROP = {} as React.CSSProperties;

function normalizePositiveNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
}

function cleanDisplayGenres(genres: unknown): string[] {
  if (!Array.isArray(genres)) return [];

  const seen = new Set<string>();
  const blocked = new Set(["0", "null", "undefined", "nan", "none", "n/a"]);

  return genres
    .map((genre) => String(genre ?? "").trim())
    .filter((genre) => {
      if (!genre) return false;
      const normalized = genre.toLowerCase();
      if (blocked.has(normalized)) return false;
      // Evita di mostrare ID numerici o placeholder arrivati dalle API/queue.
      if (/^\d+$/.test(normalized)) return false;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

// Interleave by type — pure fn, stable, never reorders existing items at render time.
// Only called at write-time (initial state + loadMore) so card positions never jump.
function interleaveByType(items: SwipeItem[]): SwipeItem[] {
  const buckets = new Map<string, SwipeItem[]>();
  for (const item of items) {
    if (!buckets.has(item.type)) buckets.set(item.type, []);
    buckets.get(item.type)!.push(item);
  }
  const cols = Array.from(buckets.values());
  const out: SwipeItem[] = [];
  const max = Math.max(0, ...cols.map((c) => c.length));
  for (let i = 0; i < max; i++) {
    for (const col of cols) {
      if (i < col.length) out.push(col[i]);
    }
  }
  return out;
}

// ─── LoadingScreen ─────────────────────────────────────────────────────────────

function LoadingScreen({
  message = "Caricamento nuovi titoli",
}: {
  message?: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-7 px-8 text-center"
      style={{ animation: "sw-enter 0.45s cubic-bezier(0.22,1,0.36,1) both" }}
    >
      <style>{`
        @keyframes sw-enter { from{opacity:0;transform:scale(0.96) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes sw-arc   { to{transform:rotate(360deg)} }
        @keyframes sw-logo  { 0%,100%{opacity:0.75;transform:scale(0.97)} 50%{opacity:1;transform:scale(1)} }
        @keyframes sw-shine { 0%,100%{opacity:0} 40%,60%{opacity:1} }
      `}</style>

      {/* Arc spinner + logo */}
      <div className="relative w-[88px] h-[88px] flex items-center justify-center">
        {/* Soft glow backdrop */}
        <div
          className="absolute inset-3 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(230,255,61,0.12) 0%, transparent 70%)",
          }}
        />
        {/* Single arc — calm, 1.4s */}
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
          style={{ animation: "sw-arc 1.4s linear infinite" }}
          viewBox="0 0 88 88"
        >
          <defs>
            <linearGradient id="swG" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#E6FF3D" stopOpacity="0" />
              <stop offset="60%" stopColor="#E6FF3D" />
              <stop offset="100%" stopColor="#a3e635" />
            </linearGradient>
          </defs>
          {/* Track */}
          <circle
            cx="44"
            cy="44"
            r="38"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="3"
          />
          {/* Arc */}
          <circle
            cx="44"
            cy="44"
            r="38"
            fill="none"
            stroke="url(#swG)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="155 84"
          />
        </svg>
        {/* Logo — gentle breathing */}
        <img
          src="/icons/apple-touch-icon.png"
          alt="Geekore"
          className="relative z-10 w-11 h-11 rounded-2xl"
          style={{
            animation: "sw-logo 2.2s ease-in-out infinite",
            objectFit: "cover",
          }}
        />
      </div>

      {/* Text */}
      <div className="space-y-1.5">
        <p className="text-white/85 font-medium text-[15px] tracking-tight">
          {message}
        </p>
        <p className="text-zinc-600 text-[12px]">
          Stiamo preparando le card per te
        </p>
      </div>
    </div>
  );
}

// ─── HalfStarRating ────────────────────────────────────────────────────────────

function HalfStarRating({
  rating,
  onChange,
}: {
  rating: number | null;
  onChange: (r: number | null) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<number | null>(null);
  const ratingRef = useRef<number | null>(rating);
  useEffect(() => {
    ratingRef.current = rating;
  }, [rating]);

  const displayValue = hovered !== null ? hovered : (rating ?? 0);

  // Ritorna il valore [0.5..5] dalla posizione X, oppure null se fuori sinistra
  const valueFromClientX = useCallback((clientX: number): number | null => {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    // Fuori a sinistra → null (= 0 stelle, reset)
    if (x < 0) return null;
    const clamped = Math.min(x, rect.width - 1);
    const starWidth = rect.width / 5;
    const star = Math.min(4, Math.floor(clamped / starWidth));
    return clamped - star * starWidth < starWidth / 2 ? star + 0.5 : star + 1;
  }, []);

  // Touch handlers registrati come non-passive per poter chiamare preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const v = valueFromClientX(e.touches[0].clientX);
      hoveredRef.current = v;
      setHovered(v);
    };
    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const v = valueFromClientX(e.touches[0].clientX);
      hoveredRef.current = v;
      setHovered(v);
    };
    const onEnd = (e: TouchEvent) => {
      e.preventDefault();
      const cur = hoveredRef.current;
      // null = dito finito a sinistra = reset a 0
      if (cur === null) {
        onChange(null);
      } else {
        onChange(ratingRef.current === cur ? null : cur);
      }
      hoveredRef.current = null;
      setHovered(null);
    };
    const onCancel = () => {
      hoveredRef.current = null;
      setHovered(null);
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [valueFromClientX, onChange]);

  return (
    <div
      ref={containerRef}
      className="flex items-center cursor-pointer touch-none select-none"
      onMouseMove={(e) => setHovered(valueFromClientX(e.clientX))}
      onMouseLeave={() => setHovered(null)}
      onClick={(e) => {
        e.stopPropagation();
        const v = valueFromClientX(e.clientX);
        onChange(rating === v ? null : (v ?? null));
      }}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const full = displayValue >= star;
        const half = !full && displayValue >= star - 0.5;
        return (
          <div
            key={star}
            className="flex items-center justify-center"
            style={{ width: 36, height: 36 }}
          >
            <div className="relative" style={{ width: 28, height: 28 }}>
              <Star
                size={28}
                className="absolute inset-0 text-white/50"
                fill="none"
                strokeWidth={1.5}
              />
              {full && (
                <Star
                  size={28}
                  className="absolute inset-0 text-amber-400"
                  fill="currentColor"
                  strokeWidth={0}
                  style={{
                    filter: "drop-shadow(0 0 7px rgba(251,191,36,.85))",
                  }}
                />
              )}
              {half && (
                <Star
                  size={28}
                  className="absolute inset-0 text-amber-400"
                  fill="currentColor"
                  strokeWidth={0}
                  style={{
                    clipPath: "inset(0 50% 0 0)",
                    filter: "drop-shadow(0 0 7px rgba(251,191,36,.85))",
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SwipeCard ─────────────────────────────────────────────────────────────────

interface SwipeCardProps {
  item: SwipeItem;
  isTop: boolean;
  stackIndex: number;
  onSwipe: (dir: "left" | "right", item: SwipeItem) => void;
  rating: number | null;
  onRatingChange: (r: number | null) => void;
  onDetailOpen: (item: SwipeItem) => void;
  onUndo: () => void;
  canUndo: boolean;
  onClose: () => void;
  onWishlist: (item: SwipeItem) => void;
  hideClose?: boolean;
  hideDetails?: boolean;
  detailsMobileOnly?: boolean;
  panelActive?: boolean;
  starsRef?: React.RefObject<HTMLDivElement | null>;
  // Gesture controllate dall'esterno dal container unico
  dragX?: number;
  isFlying?: boolean;
  flyDir?: "left" | "right" | "down" | null;
  isUndoEntering?: boolean;
}

function SwipeCard({
  item,
  isTop,
  stackIndex,
  onSwipe,
  rating,
  onRatingChange,
  onDetailOpen,
  onUndo,
  canUndo,
  onClose,
  onWishlist,
  hideClose,
  hideDetails = false,
  detailsMobileOnly = false,
  panelActive = true,
  starsRef,
  dragX = 0,
  isFlying = false,
  flyDir = null,
  isUndoEntering = false,
}: SwipeCardProps) {
  const Icon = TYPE_ICONS[item.type];
  const { locale } = useLocale();
  const swipeUi = appCopy[locale].swipe;
  const displayGenres = cleanDisplayGenres(item.genres).map((g) => genreLabel(g, locale));
  const episodeCount = normalizePositiveNumber(item.episodes);

  // Bottoni: glow immediato su touchstart
  const undoPress = useTouchPress();
  const skipPress = useTouchPress();
  const infoPress = useTouchPress();
  const checkPress = useTouchPress();
  const wishlistPress = useTouchPress();
  const closePress = useTouchPress();

  const triggerSwipe = useCallback(
    (dir: "left" | "right") => {
      onSwipe(dir, item);
    },
    [item, onSwipe],
  );

  const triggerWishlist = useCallback(() => {
    onWishlist(item);
  }, [item, onWishlist]);

  if (stackIndex > 2) return null;

  const stackScale = 1 - stackIndex * 0.04;
  const stackY = stackIndex * 10;
  const rotation = isFlying
    ? flyDir === "down"
      ? 0
      : flyDir === "right"
        ? 22
        : -22
    : dragX * ROTATION_FACTOR;
  const translateX = isFlying
    ? flyDir === "right"
      ? "160%"
      : flyDir === "left"
        ? "-160%"
        : "0"
    : `${dragX}px`;
  const translateY = isFlying && flyDir === "down" ? "160%" : "0";
  const swipeProgress = Math.min(Math.abs(dragX) / SWIPE_FEEDBACK_DISTANCE, 1);

  // Undo entering: card starts scaled down + offset from below, transitions to normal
  const undoTransform = isUndoEntering
    ? `translateY(40px) scale(0.88)`
    : isTop
      ? `translateX(${translateX}) translateY(${translateY}) rotate(${rotation}deg)`
      : `scale(${stackScale}) translateY(${stackY}px)`;

  return (
    <div
      className={`absolute inset-0 select-none ${isTop ? (dragX !== 0 ? "cursor-grabbing" : "cursor-grab") : "pointer-events-none"}`}
      data-testid={isTop ? "swipe-card-active" : undefined}
      data-swipe-card={isTop ? "true" : undefined}
      style={{
        transform: undoTransform,
        // Durante il drag la card segue il cursore senza transition.
        // Quando il rilascio supera la soglia, isFlying=true e la card deve
        // AUTOCOMPLETARE l'uscita con una vera animazione, partendo dalla
        // posizione attuale verso fuori schermo. Prima era disattivata perché
        // dragX restava !== 0 fino al timeout.
        transition: isFlying
          ? "transform .34s cubic-bezier(.22,1,.36,1), opacity .34s ease"
          : dragX !== 0
            ? "none"
            : "transform .38s cubic-bezier(.25,.46,.45,.94), opacity .38s ease",
        opacity: isFlying ? 0 : isUndoEntering ? 0.4 : 1 - stackIndex * 0.12,
        zIndex: 10 - stackIndex,
        willChange: isTop ? "transform" : "auto",
      }}
    >
      <div className="relative w-full h-full rounded-[28px] overflow-hidden bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.42)] ring-1 ring-white/8">
        {item.coverImage ? (
          <img
            src={optimizeCover(item.coverImage, "swipe-card")}
            alt={item.title}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
            loading="eager"
            decoding="async"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            <Icon size={64} className="text-zinc-700" />
          </div>
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, #000 0%, rgba(0,0,0,0.93) 18%, rgba(0,0,0,0.65) 36%, rgba(0,0,0,0.2) 58%, rgba(0,0,0,0.42) 100%)",
          }}
        />

        {!hideClose && (
          <button
            {...closePress.pressProps}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            data-testid="swipe-close"
            aria-label="Chiudi swipe"
            title="Chiudi"
            className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-[transform,background-color] duration-150 z-20 ${closePress.pressed
              ? "scale-90 bg-white/20 text-white"
              : "bg-zinc-900 text-white/80 hover:text-white"
              }`}
          >
            <X size={17} strokeWidth={2.5} />
          </button>
        )}

        <div className="absolute top-3 left-3 z-10">
          <div
            className={`bg-gradient-to-r ${TYPE_COLORS[item.type]} text-white text-xs font-bold px-3 py-1 rounded-full`}
            style={ICON_DROP}
          >
            {swipeTypeLabel(item.type, locale)}
          </div>
        </div>

        {!item.isDiscovery &&
          item.matchScore >= 75 &&
          item.matchScore <= 100 && (
            <div className="absolute top-12 left-3 z-10">
              <div
                className="flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-full"
                style={{
                  ...ICON_DROP,
                  background: "var(--accent)",
                  color: "#0B0B0F",
                }}
              >
                <Star size={10} fill="currentColor" />
                {item.matchScore}%
              </div>
            </div>
          )}
        {item.isDiscovery && (
          <div className="absolute top-12 left-3 z-10">
            <div
              className="flex items-center gap-1 bg-emerald-700 text-white text-xs font-bold px-2.5 py-1 rounded-full"
              style={ICON_DROP}
            >
              ✨ {locale === "it" ? "Scoperta" : "Discovery"}
            </div>
          </div>
        )}

        {isTop && (
          <>
            <div
              className="absolute top-16 left-5 border-[3px] border-emerald-400 text-emerald-400 font-black text-xl px-4 py-1.5 rounded-2xl tracking-widest uppercase rotate-[-18deg] pointer-events-none z-10"
              style={{
                opacity: dragX > 20 ? swipeProgress : 0,
                transition: "opacity .08s",
                ...TEXT_SHADOW,
              }}
            >
              {locale === "it" ? "Visto" : "Seen"} ✓
            </div>
            <div
              className="absolute top-16 right-5 border-[3px] border-red-400 text-red-400 font-black text-xl px-4 py-1.5 rounded-2xl tracking-widest uppercase rotate-[18deg] pointer-events-none z-10"
              style={{
                opacity: dragX < -20 ? swipeProgress : 0,
                transition: "opacity .08s",
                ...TEXT_SHADOW,
              }}
            >
              Skip ✗
            </div>
          </>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-5 pb-4 z-10">
          <h2
            className="text-white font-bold text-[22px] leading-tight mb-1 line-clamp-2"
            style={TEXT_SHADOW}
          >
            {item.title}
          </h2>
          <p
            className="text-white/75 text-sm mb-4 flex items-center gap-2 flex-wrap"
            style={TEXT_SHADOW}
          >
            {item.year && <span>{item.year}</span>}
            {episodeCount && item.type !== "movie" && (
              <span>
                {item.type === "manga"
                  ? `${episodeCount} cap.`
                  : `${episodeCount} ep.`}
              </span>
            )}
            {displayGenres.length > 0 && (
              <span className="text-white/50">
                · {displayGenres.slice(0, 2).join(", ")}
              </span>
            )}
          </p>
          <div
            ref={isTop ? starsRef : undefined}
            data-stars="true"
            className={`flex items-center justify-center mb-4 ${!isTop ? "opacity-0 pointer-events-none" : ""}`}
          >
            <div className="bg-zinc-950 rounded-2xl px-2 py-1 ring-1 ring-white/10">
              <HalfStarRating rating={rating} onChange={onRatingChange} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isTop && canUndo) onUndo();
              }}
              disabled={!canUndo || !isTop}
              {...undoPress.pressProps}
              data-testid="swipe-undo"
              aria-label="{swipeUi.undo} ultima azione"
              title="Z / Backspace"
              className={`w-11 h-11 md:w-10 md:h-10 flex items-center justify-center rounded-full border transition-[transform,background-color,border-color] duration-150 disabled:opacity-35 disabled:pointer-events-none ${undoPress.pressed
                ? "scale-90 bg-white/15 border-white/60 text-white"
                : "bg-zinc-900 border-white/25 text-white/85 hover:bg-zinc-800 hover:border-white/45 hover:text-white"
                }`}
            >
              <RotateCcw size={17} />
            </button>
            <div className="flex items-center gap-4">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isTop) triggerSwipe("left");
                }}
                {...skipPress.pressProps}
                data-testid="swipe-skip"
                aria-label="Salta questo titolo"
                title="Freccia sinistra"
                className={`w-14 h-14 md:w-[52px] md:h-[52px] rounded-full border-2 flex items-center justify-center transition-[transform,background-color,border-color,color] duration-150 ${!isTop ? "opacity-0 pointer-events-none" : ""} ${skipPress.pressed
                  ? "scale-90 bg-red-500/40 border-red-300 text-red-300"
                  : "bg-zinc-900 border-red-400/90 text-red-400 hover:bg-red-900/60 hover:border-red-400"
                  }`}
              >
                <X size={24} strokeWidth={3} />
              </button>
              {!hideDetails && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isTop) onDetailOpen(item);
                  }}
                  {...infoPress.pressProps}
                  data-testid="swipe-details"
                  aria-label="Apri dettagli"
                  title="Enter"
                  className={`w-10 h-10 md:w-9 md:h-9 rounded-full border flex items-center justify-center transition-[transform,background-color,border-color] duration-150 ${detailsMobileOnly ? "md:hidden" : ""} ${!isTop ? "opacity-0 pointer-events-none" : ""} ${infoPress.pressed
                    ? "scale-90 bg-white/20 border-white text-white"
                    : "bg-zinc-900 border-white/50 text-white/90 hover:bg-zinc-800 hover:text-white"
                    }`}
                >
                  <ChevronRight size={20} strokeWidth={2.5} />
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isTop) triggerSwipe("right");
                }}
                {...checkPress.pressProps}
                data-testid="swipe-seen"
                aria-label="Segna come visto"
                title="Freccia destra"
                className={`w-14 h-14 md:w-[52px] md:h-[52px] rounded-full border-2 flex items-center justify-center transition-[transform,background-color,border-color,color] duration-150 ${!isTop ? "opacity-0 pointer-events-none" : ""} ${checkPress.pressed
                  ? "scale-90 bg-emerald-500/40 border-emerald-300 text-emerald-300"
                  : "bg-zinc-900 border-emerald-400/90 text-emerald-400 hover:bg-emerald-900/60 hover:border-emerald-400"
                  }`}
              >
                <Check size={24} strokeWidth={3} />
              </button>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isTop && !isFlying) triggerWishlist();
              }}
              disabled={!isTop || isFlying}
              {...wishlistPress.pressProps}
              data-testid="swipe-wishlist"
              aria-label="Aggiungi alla wishlist"
              title="W"
              className={`w-11 h-11 md:w-10 md:h-10 flex items-center justify-center rounded-full border transition-[transform,background-color,border-color,color] duration-150 disabled:opacity-35 disabled:pointer-events-none ${wishlistPress.pressed
                ? "scale-90 bg-amber-500/20 border-amber-400/60 text-amber-400"
                : "bg-zinc-900 border-white/25 text-white/85 hover:bg-zinc-800 hover:border-white/45 hover:text-white"
                }`}
            >
              <Bookmark size={17} fill="none" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Gesture system ────────────────────────────────────────────────────────────
// Un unico container gestisce TUTTI i touch della swipe page.
// La card non ha listener propri — è puramente visiva.
// Il container decide in onTouchStart se il touch è nella "fascia page-swipe"
// (sotto il bordo inferiore del box stelline) o nella "zona card" (sopra).
// Le due zone sono mutualmente esclusive: mai in conflitto.

type GestureZone = "card" | "page" | "button" | null;

interface GestureState {
  zone: GestureZone;
  startX: number;
  startY: number;
  currentX: number;
  decided: boolean;
  isDragging: boolean;
  startTime: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
}

function useSwipeGestures(
  containerRef: React.RefObject<HTMLDivElement | null>,
  starsRef: React.RefObject<HTMLDivElement | null>,
  isActive: boolean,
  standalone: boolean,
  onCardSwipe: (dx: number) => void,
  onCardRelease: (dx: number, velocityX?: number) => void,
) {
  const emptyGesture = (): GestureState => ({
    zone: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    decided: false,
    isDragging: false,
    startTime: 0,
    lastX: 0,
    lastTime: 0,
    velocityX: 0,
  });

  const gs = useRef<GestureState>(emptyGesture());

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isActive) return;

    const getStarsBottom = (): number => {
      if (!starsRef.current) return window.innerHeight;
      return starsRef.current.getBoundingClientRect().bottom;
    };

    const now = () => performance.now();
    const makeGesture = (
      zone: GestureZone,
      startX: number,
      startY: number,
      decided = false,
      isDragging = false,
    ): GestureState => {
      const t = now();
      return {
        zone,
        startX,
        startY,
        currentX: 0,
        decided,
        isDragging,
        startTime: t,
        lastX: startX,
        lastTime: t,
        velocityX: 0,
      };
    };

    const updateVelocity = (g: GestureState, clientX: number) => {
      const t = now();
      const dt = Math.max(1, t - g.lastTime);
      const instantVelocity = (clientX - g.lastX) / dt;
      // Media mobile leggera: evita che un singolo frame rumoroso completi lo swipe.
      g.velocityX = g.velocityX * 0.65 + instantVelocity * 0.35;
      g.lastX = clientX;
      g.lastTime = t;
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      const target = e.target as HTMLElement;
      const clientY = t.clientY;
      const starsBottom = getStarsBottom();

      if (target.closest("[data-stars]")) {
        // Stelline: non intercettare mai
        gs.current = emptyGesture();
        return;
      }

      if (target.closest("button")) {
        // Bottone nella fascia (sotto le stelline): salva posizione.
        // In onMove decideremo se è un tap (lascia il click) o uno swipe di pagina.
        gs.current = makeGesture("button", t.clientX, clientY);
        return;
      }

      if (standalone && clientY > starsBottom) {
        gs.current = makeGesture("page", t.clientX, clientY);
      } else {
        gs.current = makeGesture("card", t.clientX, clientY);
      }
    };

    const onMove = (e: TouchEvent) => {
      const g = gs.current;
      if (g.zone === null) return;

      // Touch partito su un bottone: aspetta di capire se è swipe o tap
      if (g.zone === "button") {
        if (g.decided) return; // già deciso: lascia fare
        const dx = e.touches[0].clientX - g.startX;
        const dy = e.touches[0].clientY - g.startY;
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // soglia più alta per i bottoni
        g.decided = true;
        if (Math.abs(dx) > Math.abs(dy) * 1.2 && standalone) {
          // Swipe orizzontale partito da un bottone → page swipe
          g.zone = "page";
          gestureState.pageSwipeZone = true;
        }
        // Se verticale o non abbastanza orizzontale → lascia il click, zone resta 'button'
        return;
      }

      const t = e.touches[0];
      const dx = t.clientX - g.startX;
      const dy = t.clientY - g.startY;

      if (!g.decided) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        g.decided = true;
        const isHoriz = Math.abs(dx) > Math.abs(dy) * 1.2;
        if (g.zone === "page") {
          if (isHoriz) {
            gestureState.pageSwipeZone = true;
          } else {
            g.zone = null; // gesto verticale nella fascia: ignora
          }
          return;
        }
        // zona card
        if (isHoriz) {
          g.isDragging = true;
          if (el) el.style.touchAction = "none"; // blocca scroll verticale durante drag card
        } else {
          g.zone = null; // gesto verticale sulla card: lascia scroll nativo
        }
      }

      if (g.zone === "card" && g.isDragging) {
        updateVelocity(g, t.clientX);
        g.currentX = dx;
        onCardSwipe(dx);
        // passive:true listener — iOS mostra :active; scroll bloccato via touch-action CSS
      }
    };

    const onEnd = (e: TouchEvent) => {
      const g = gs.current;
      if (g.zone === "card" && g.isDragging) {
        onCardRelease(g.currentX, g.velocityX);
        if (el) el.style.touchAction = ""; // ripristina
      } else if (g.zone === "page" && gestureState.pageSwipeZone) {
        // Delega la decisione navigate/snap-back a SwipeablePageContainer via bridge.
        // Quello ha la stessa logica soglia delle altre pagine e conosce prevTab/nextTab.
        const touch = e.changedTouches[0];
        if (touch) {
          const dx = touch.clientX - g.startX;
          // Stima velocity: usiamo l'ampiezza del gesto (senza timestamp preciso).
          // Valori moderati — la soglia distanza (40% viewport) è il criterio primario.
          const vx = Math.abs(dx) > 30 ? (dx > 0 ? 0.6 : -0.6) : 0;
          swipeNavBridge.notifyResolve(dx, vx);
        }
      }
      gestureState.pageSwipeZone = false;
      gs.current = emptyGesture();
    };

    // Desktop: abilita drag col mouse stile Tinder sulla card attiva.
    // Separato dai touch listener per non interferire con mobile/page swipe.
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (!target.closest('[data-swipe-card="true"]')) return;
      if (
        target.closest(
          'button, [data-stars], input, textarea, select, [contenteditable="true"]',
        )
      )
        return;

      e.preventDefault();
      gs.current = makeGesture("card", e.clientX, e.clientY, true, true);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
    };

    const onMouseMove = (e: MouseEvent) => {
      const g = gs.current;
      if (g.zone !== "card" || !g.isDragging) return;
      const dx = e.clientX - g.startX;
      updateVelocity(g, e.clientX);
      g.currentX = dx;
      onCardSwipe(dx);
    };

    const onMouseUp = () => {
      const g = gs.current;
      if (g.zone === "card" && g.isDragging) {
        onCardRelease(g.currentX, g.velocityX);
      }
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      gs.current = emptyGesture();
    };

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true }); // passive:true → :active funziona
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [
    isActive,
    standalone,
    onCardSwipe,
    onCardRelease,
    containerRef,
    starsRef,
  ]);
}

// ─── SwipeMode ─────────────────────────────────────────────────────────────────

export function SwipeMode({
  items: initialItems,
  userId: userIdProp,
  onSeen,
  onSkip,
  onWishlist: onWishlistCallback,
  onClose,
  onRequestMore,
  standalone = false,
  isOnboarding = false,
  onOnboardingComplete,
  onOnboardingBack,
  onUndo: onUndoCallback,
  onUndoWishlist,
}: SwipeModeProps) {
  const supabase = createClient()
  const { locale } = useLocale()
  const swipeUi = appCopy[locale].swipe
  const commonUi = appCopy[locale].common
  const isTabActive = useTabActive();
  // userId risolto una sola volta al mount — evita getUser() ad ogni swipe/skip
  const userIdRef = useRef<string | null>(userIdProp ?? null);
  useEffect(() => {
    if (userIdRef.current) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) userIdRef.current = user.id;
    });
  }, []); // eslint-disable-line
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("all");

  // RATING: ref aggiornato in sincronia con lo stato — la closure del setTimeout
  // legge SEMPRE il valore corrente senza rischio di stale closure.
  const currentRatingRef = useRef<number | null>(null);
  const [currentRating, setCurrentRating] = useState<number | null>(null);
  const setRating = useCallback((r: number | null) => {
    currentRatingRef.current = r;
    setCurrentRating(r);
  }, []);

  // La queue parte già interleaved — l'ordine non cambia mai a runtime, solo in append.
  const [queue, setQueue] = useState<SwipeItem[]>(() =>
    interleaveByType(initialItems),
  );
  const [seenIds] = useState<Set<string>>(
    () => new Set(initialItems.map((i) => i.id)),
  );
  const seenIdsRef = useRef(seenIds);

  const [detailItem, setDetailItem] = useState<MediaDetails | null>(null);
  const [history, setHistory] = useState<SwipeItem[]>([]);
  // Traccia quali item nello storico erano stati aggiunti alla wishlist
  const wishlistHistoryRef = useRef<Set<string>>(new Set());
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const skippedIdsRef = useRef<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const loadingRef = useRef(false);
  const categoryQueues = useRef<Partial<Record<CategoryFilter, SwipeItem[]>>>(
    {},
  );
  const categoryLoading = useRef<Partial<Record<CategoryFilter, boolean>>>({});
  // Ogni cambio lingua / nuovo payload invalida le request async ancora in volo.
  // Senza questo, preload vecchi di TV/Giochi possono rientrare dopo lo switch e
  // riempire deck/cache con card della lingua precedente.
  const localeRunRef = useRef(0);


  // Carica skipped in background
  useEffect(() => {
    const load = async () => {
      if (!userIdRef.current) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        userIdRef.current = user.id;
      }
      const { data } = await supabase
        .from("swipe_skipped")
        .select("external_id")
        .eq("user_id", userIdRef.current);
      if (data?.length) {
        const ids = new Set(data.map((r: any) => r.external_id as string));
        skippedIdsRef.current = ids;
        setSkippedIds(ids);
      }
    };
    load();
  }, []); // eslint-disable-line

  // filteredQueue: 'all' uses queue directly (already interleaved at write-time).
  // Category filters just slice — no reordering.
  const filteredQueue =
    activeFilter === "all"
      ? queue
      : queue.filter((i) => i.type === activeFilter);

  // Reset rating quando cambia la card in cima
  // IMPORTANTE: il reset aggiorna sia lo stato che il ref, ma handleSwipe
  // legge il ref PRIMA che questo effect si esegua (la lettura avviene
  // nel corpo di handleSwipe, non in una callback asincrona)
  const prevTopIdRef = useRef<string | undefined>(undefined);
  const topId = filteredQueue[0]?.id;
  useEffect(() => {
    if (topId !== prevTopIdRef.current) {
      prevTopIdRef.current = topId;
      setRating(null);
    }
  }, [topId, setRating]);

  // preloadCategory declared before loadMore so loadMore can call it as a fast-path replenish.
  const preloadCategory = useCallback(
    async (filter: CategoryFilter) => {
      if (categoryLoading.current[filter]) return;
      if ((categoryQueues.current[filter]?.length ?? 0) >= PRELOAD_TARGET)
        return;
      const run = localeRunRef.current;
      categoryLoading.current[filter] = true;
      try {
        const items = await onRequestMore(filter);
        if (run !== localeRunRef.current) return;
        const skipped = skippedIdsRef.current;
        const fresh = items.filter((i) => !skipped.has(i.id));
        const existing = categoryQueues.current[filter] || [];
        const existingIds = new Set(existing.map((i) => i.id));
        categoryQueues.current[filter] = [
          ...existing,
          ...fresh.filter((i) => !existingIds.has(i.id)),
        ].slice(0, PRELOAD_TARGET);
      } catch { }
      finally {
        if (run === localeRunRef.current) categoryLoading.current[filter] = false;
      }
    },
    [onRequestMore],
  );

  const loadMore = useCallback(
    async (filter: CategoryFilter) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const run = localeRunRef.current;

      // ── Fast path: use preloaded cache — no loading screen, instant ──────────
      const cached = categoryQueues.current[filter] || [];
      const skipped = skippedIdsRef.current;
      const seen = seenIdsRef.current;
      const cachedFresh = cached.filter(
        (i) => !seen.has(i.id) && !skipped.has(i.id),
      );
      if (cachedFresh.length >= 10) {
        setQueue((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const newItems = cachedFresh.filter((i) => !existingIds.has(i.id));
          return [
            ...prev,
            ...(filter === "all" ? interleaveByType(newItems) : newItems),
          ];
        });
        cachedFresh.forEach((i) => seen.add(i.id));
        categoryQueues.current[filter] = [];
        loadingRef.current = false;
        // Replenish the cache in background for next refill
        preloadCategory(filter);
        return;
      }

      // ── Slow path: fetch from network ─────────────────────────────────────────
      setIsLoadingMore(true);
      try {
        const items = await onRequestMore(filter);
        if (run !== localeRunRef.current) return;
        const fresh = items.filter(
          (i) => !seen.has(i.id) && !skipped.has(i.id),
        );
        if (fresh.length) {
          setQueue((prev) => [
            ...prev,
            ...(filter === "all" ? interleaveByType(fresh) : fresh),
          ]);
          fresh.forEach((i) => seen.add(i.id));
        } else {
          // Tutti già visti: svuota seenIds e riprova
          seen.clear();
          const retryItems = await onRequestMore(filter);
          if (run !== localeRunRef.current) return;
          const retryFresh = retryItems.filter((i) => !skipped.has(i.id));
          if (retryFresh.length) {
            setQueue((prev) => [
              ...prev,
              ...(filter === "all" ? interleaveByType(retryFresh) : retryFresh),
            ]);
            retryFresh.forEach((i) => seen.add(i.id));
          }
        }
      } catch { }
      if (run === localeRunRef.current) {
        setIsLoadingMore(false);
        loadingRef.current = false;
      }
    },
    [onRequestMore, preloadCategory],
  );

  // Preload all categories after mount and after locale changes.
  // Se la lingua cambia, la cache categoria precedente non deve rientrare nel deck.
  useEffect(() => {
    const cats: CategoryFilter[] = [
      "all",
      "anime",
      "manga",
      "movie",
      "tv",
      "game",
      "boardgame",
    ];
    const timers = cats.map((cat, i) =>
      window.setTimeout(() => preloadCategory(cat), 1500 + i * 300),
    );
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [preloadCategory, locale]);

  useEffect(() => {
    if (filteredQueue.length <= REFILL_THRESHOLD && !loadingRef.current)
      loadMore(activeFilter);
  }, [filteredQueue.length, activeFilter]); // eslint-disable-line

  const handleFilterChange = useCallback(
    (filter: CategoryFilter) => {
      setActiveFilter(filter);
      setHistory([]);
      const preloaded = categoryQueues.current[filter];
      if (preloaded?.length) {
        const skipped = skippedIdsRef.current;
        setQueue((prev) => {
          const existingIds = new Set(prev.map((i) => i.id));
          const newItems = preloaded.filter(
            (i) => !existingIds.has(i.id) && !skipped.has(i.id),
          );
          return [
            ...prev,
            ...(filter === "all" ? interleaveByType(newItems) : newItems),
          ];
        });
        preloaded.forEach((i) => seenIdsRef.current.add(i.id));
        categoryQueues.current[filter] = [];
        setTimeout(() => preloadCategory(filter), 500);
      }
      const avail = (
        filter === "all" ? queue : queue.filter((i) => i.type === filter)
      ).filter((i) => !skippedIdsRef.current.has(i.id));
      if (avail.length <= REFILL_THRESHOLD) loadMore(filter);
    },
    [queue, loadMore, preloadCategory],
  );

  const persistSkipped = useCallback((item: SwipeItem) => {
    fetch("/api/swipe/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        external_id: item.id,
        title: item.title,
        type: item.type,
      }),
    }).catch(() => { });
  }, []);

  const removeSkip = useCallback((item: SwipeItem) => {
    fetch("/api/swipe/skip", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ external_id: item.id }),
    }).catch(() => { });
  }, []);

  const handleSwipe = useCallback(
    (dir: "left" | "right", item: SwipeItem, skipPersist = false) => {
      // Legge il rating DAL REF nel corpo sincrono della funzione —
      // prima che qualsiasi setState/useEffect possa azzerarlo.
      const ratingAtSwipeTime = currentRatingRef.current;

      setHistory((prev) => [item, ...prev].slice(0, 10));
      setQueue((prev) => prev.filter((i) => i.id !== item.id));
      setSkippedIds((prev) => {
        const n = new Set(prev);
        n.add(item.id);
        return n;
      });
      skippedIdsRef.current.add(item.id);

      // In onboarding gli skippati vengono gestiti in batch dal parent (OnboardingPage)
      // → non chiamiamo persistSkipped per evitare scritture real-time su swipe_skipped
      if (!isOnboarding) {
        persistSkipped(item);
      }

      if (dir === "right") {
        onSeen(item, ratingAtSwipeTime, skipPersist);
      } else {
        onSkip(item);
      }
    },
    [onSeen, onSkip, persistSkipped, isOnboarding],
  );

  const handleUndo = useCallback(() => {
    if (!history.length) return;
    const [last, ...rest] = history;
    setHistory(rest);
    setQueue((prev) => [last, ...prev]);
    setSkippedIds((prev) => {
      const n = new Set(prev);
      n.delete(last.id);
      return n;
    });
    skippedIdsRef.current.delete(last.id);
    // Revert wishlist se l'item era stato messo in wishlist
    const wasWishlisted = wishlistHistoryRef.current.has(last.id);
    if (wasWishlisted) {
      wishlistHistoryRef.current.delete(last.id);
      // Revert wishlist su Supabase (per swipe normale)
      if (!isOnboarding) {
        fetch("/api/wishlist", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ external_id: last.id }),
        }).catch(() => { });
      }
      // Notifica il parent (per onboarding)
      onUndoWishlist?.(last);
    }
    if (!isOnboarding) removeSkip(last);
    // Notifica il parent dell'undo (usato dall'onboarding per rimuovere da acceptedItemsRef)
    onUndoCallback?.(last);
    // Animazione entrata: carta appare da sotto → poi si porta in posizione normale
    setUndoEntering(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setUndoEntering(false));
    });
  }, [
    history,
    removeSkip,
    isOnboarding,
    supabase,
    onUndoCallback,
    onUndoWishlist,
  ]);

  const handleDetailOpen = useCallback((item: SwipeItem) => {
    setDetailItem({
      id: item.id,
      title: item.title,
      type: item.type,
      coverImage: item.coverImage,
      year: item.year,
      genres: item.genres,
      description: item.description,
      score: item.score,
      episodes: item.episodes,
      authors: item.authors,
      developers: item.developers,
      platforms: item.platforms,
      why: item.why,
      matchScore: item.matchScore,
      isAwardWinner: item.isAwardWinner,
      source: item.source,
    });
  }, []);

  // Swipe-pagina mobile: listener su document, nessun overlay sui bottoni
  // ── Gesture state per la card top ───────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement | null>(null);
  const starsRef = useRef<HTMLDivElement | null>(null);
  const [cardDragX, setCardDragX] = useState(0);
  const [cardFlying, setCardFlying] = useState(false);
  const [cardFlyDir, setCardFlyDir] = useState<
    "left" | "right" | "down" | null
  >(null);
  const [undoEntering, setUndoEntering] = useState(false);

  // Cambio lingua / nuovo payload: le card già montate non devono restare nella lingua vecchia.
  // Reset completo di deck, storico e cache categoria; non tocca Supabase né il pool.
  useEffect(() => {
    localeRunRef.current += 1;
    const freshQueue = interleaveByType(initialItems);
    setQueue(freshQueue);
    seenIdsRef.current = new Set(initialItems.map((i) => i.id));
    categoryQueues.current = {};
    categoryLoading.current = {};
    loadingRef.current = false;
    setHistory([]);
    wishlistHistoryRef.current.clear();
    setIsLoadingMore(false);
    setRating(null);
    setCardDragX(0);
    setCardFlying(false);
    setCardFlyDir(null);
    setUndoEntering(false);
  }, [initialItems, locale, setRating]);
  const topItem = filteredQueue[0];
  const topItemGenres = topItem ? cleanDisplayGenres(topItem.genres) : [];

  const handleWishlist = useCallback(
    (item: SwipeItem) => {
      // Anima la card verso il basso (flyDir='down') poi rimuove dalla queue.
      // In onboarding la wishlist non deve essere trattata come skip: la card
      // sparisce dalla sessione corrente, ma viene salvata dal parent come wishlist.
      wishlistHistoryRef.current.add(item.id);
      setCardFlyDir("down");
      setCardFlying(true);
      setTimeout(() => {
        if (isOnboarding && onWishlistCallback) {
          setHistory((prev) => [item, ...prev].slice(0, 10));
          setQueue((prev) => prev.filter((i) => i.id !== item.id));
          setSkippedIds((prev) => {
            const n = new Set(prev);
            n.add(item.id);
            return n;
          });
          skippedIdsRef.current.add(item.id);
          onWishlistCallback(item);
        } else {
          handleSwipe("left", item);
        }
        setCardDragX(0);
        setCardFlying(false);
        setCardFlyDir(null);
      }, 340);

      if (!isOnboarding) {
        fetch("/api/wishlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            external_id: item.id,
            title: item.title,
            type: item.type,
            cover_image: item.coverImage,
          }),
        }).catch(() => { });
      }
    },
    [handleSwipe, isOnboarding, onWishlistCallback],
  );

  const handleCardSwipe = useCallback((dx: number) => {
    setCardDragX(dx);
  }, []);

  const handleCardRelease = useCallback(
    (dx: number, velocityX = 0) => {
      const activeCard = containerRef.current?.querySelector(
        '[data-swipe-card="true"]',
      ) as HTMLElement | null;
      const cardWidth = activeCard?.getBoundingClientRect().width || 420;
      const positionThreshold = Math.max(
        SWIPE_COMPLETE_MIN,
        Math.min(SWIPE_COMPLETE_MAX, cardWidth * SWIPE_COMPLETE_RATIO),
      );
      const absDx = Math.abs(dx);
      const absVelocity = Math.abs(velocityX);
      const acceptedByPosition = absDx >= positionThreshold;
      const acceptedByFling =
        absDx >= SWIPE_FLING_MIN_DISTANCE &&
        absVelocity >= SWIPE_FLING_VELOCITY;

      if (acceptedByPosition || acceptedByFling) {
        const dir = dx > 0 ? "right" : "left";
        setCardFlyDir(dir);
        setCardFlying(true);
        setTimeout(() => {
          if (topItem) handleSwipe(dir, topItem);
          setCardDragX(0);
          setCardFlying(false);
          setCardFlyDir(null);
        }, 340);
      } else {
        // Snap-back: un trascinamento corto torna al centro e NON registra skip/visto.
        setCardDragX(0);
      }
    },
    [topItem, handleSwipe],
  );

  useSwipeGestures(
    containerRef,
    starsRef,
    isTabActive,
    standalone,
    handleCardSwipe,
    handleCardRelease,
  );

  useEffect(() => {
    if (!isTabActive || detailItem || !topItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]'))
        return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handleSwipe("left", topItem);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleSwipe("right", topItem);
      }
      if (event.key === "Enter" && !isOnboarding) {
        event.preventDefault();
        handleDetailOpen(topItem);
      }
      if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        handleWishlist(topItem);
      }
      if (
        (event.key.toLowerCase() === "z" || event.key === "Backspace") &&
        history.length > 0
      ) {
        event.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isTabActive,
    detailItem,
    topItem,
    history.length,
    handleSwipe,
    handleDetailOpen,
    handleWishlist,
    handleUndo,
    isOnboarding,
  ]);

  const topCoverImage = filteredQueue[0]?.coverImage;

  const isFullscreenSwipe = standalone || isOnboarding;
  const isMirrorOnboardingLayout = standalone && !isOnboarding;
  const containerClass = isFullscreenSwipe
    ? "gk-swipe-mode fixed inset-0 bg-[var(--bg-primary)] flex flex-col overflow-hidden"
    : "gk-swipe-mode relative flex h-[calc(100dvh-156px)] min-h-[560px] max-h-[720px] flex-col overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.16)] bg-[linear-gradient(160deg,rgba(230,255,61,0.045),var(--bg-secondary))] shadow-[0_18px_60px_rgba(0,0,0,0.22)]";
  const containerStyle = isFullscreenSwipe
    ? { contain: "layout style paint" as const }
    : { contain: "layout style paint" as const };
  return (
    <>
      <div className={containerClass} style={containerStyle}>
        {(standalone || isOnboarding) && (
          <div
            className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
            aria-hidden
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_58%_42%,rgba(37,99,235,0.13),transparent_34%),radial-gradient(circle_at_42%_55%,rgba(230,255,61,0.055),transparent_32%),linear-gradient(135deg,#050507_0%,#09090d_52%,#050507_100%)]" />
            {topCoverImage && (
              <img
                src={topCoverImage}
                alt=""
                className="absolute left-1/2 top-1/2 h-[88vh] w-[54vw] max-w-[760px] -translate-x-1/2 -translate-y-1/2 scale-110 object-cover opacity-[0.075] blur-[54px]"
                loading="eager"
                decoding="async"
              />
            )}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.28)_48%,rgba(0,0,0,0.72)_100%)]" />
          </div>
        )}

        {isOnboarding && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 right-0 z-30 hidden items-center justify-between px-5 md:flex lg:px-8"
            data-no-swipe="true"
          >
            <button
              type="button"
              onClick={onOnboardingBack ?? onClose}
              className="pointer-events-auto group flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-black/38 text-white/76 shadow-[0_18px_54px_rgba(0,0,0,0.32)] backdrop-blur-xl transition-[transform,background-color,border-color,color] hover:-translate-x-0.5 hover:border-[rgba(230,255,61,0.28)] hover:bg-black/54 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/45"
              aria-label="Torna allo step precedente"
              title="Torna indietro"
            >
              <ChevronLeft size={25} strokeWidth={2.8} />
            </button>
            <button
              type="button"
              onClick={onOnboardingComplete ?? onClose}
              className="pointer-events-auto group flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(230,255,61,0.34)] bg-[rgba(230,255,61,0.13)] text-[var(--accent)] shadow-[0_18px_54px_rgba(0,0,0,0.32)] backdrop-blur-xl transition-[transform,background-color,border-color,color] hover:translate-x-0.5 hover:border-[rgba(230,255,61,0.54)] hover:bg-[rgba(230,255,61,0.19)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/45"
              aria-label="Vai allo step successivo"
              title="Continua"
            >
              <ChevronRight size={25} strokeWidth={2.8} />
            </button>
          </div>
        )}

        {isOnboarding && (
          <div
            className="absolute bottom-5 left-4 right-4 z-30 flex items-center justify-between gap-3 md:hidden"
            data-no-swipe="true"
          >
            <button
              type="button"
              onClick={onOnboardingBack ?? onClose}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-black/38 text-sm font-black text-white/76 backdrop-blur-xl"
            >
              <ChevronLeft size={18} strokeWidth={2.8} /> Indietro
            </button>
            <button
              type="button"
              onClick={onOnboardingComplete ?? onClose}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[rgba(230,255,61,0.34)] bg-[rgba(230,255,61,0.15)] text-sm font-black text-[var(--accent)] backdrop-blur-xl"
            >
              Continua <ChevronRight size={18} strokeWidth={2.8} />
            </button>
          </div>
        )}

        {/* Onboarding: niente hero testuale; lasciamo spazio alle card, che sono il contenuto principale. */}

        {/* Filtri categoria: nell'onboarding sono pill orizzontali integrate; nello swipe normale restano invariati. */}
        <div
          className={
            isOnboarding
              ? "absolute z-20 left-3 right-3 top-5 flex justify-center md:top-7"
              : isMirrorOnboardingLayout
                ? "absolute z-20 left-3 right-3 top-5 flex justify-center md:left-[280px] md:right-0 md:top-7"
                : isFullscreenSwipe
                  ? "absolute z-20 left-3 right-3 top-3 flex justify-center md:left-[max(24px,calc(50%-500px))] md:right-auto md:top-1/2 md:-translate-y-1/2 md:w-[174px]"
                  : "relative z-20 flex-shrink-0 flex justify-center px-3 md:absolute md:left-4 md:top-4 md:bottom-4 md:w-44 md:items-start md:px-0"
          }
        >
          <div
            className={
              isOnboarding || isMirrorOnboardingLayout
                ? "flex w-full max-w-[920px] items-center justify-center"
                : isFullscreenSwipe
                  ? "flex w-full max-w-[820px] items-center justify-center md:block"
                  : "flex w-full items-center justify-center gap-2 md:h-full md:items-start"
            }
            data-no-swipe="true"
          >
            <div
              className={
                isOnboarding
                  ? "min-w-0 max-w-full overflow-x-auto rounded-[999px] bg-black/28 p-1.5 shadow-[0_14px_46px_rgba(0,0,0,0.22)] backdrop-blur-xl scrollbar-hide"
                  : isMirrorOnboardingLayout
                    ? "min-w-0 max-w-full overflow-x-auto rounded-[999px] bg-black/28 p-1.5 shadow-[0_14px_46px_rgba(0,0,0,0.22)] backdrop-blur-xl scrollbar-hide md:w-auto md:overflow-visible"
                    : isFullscreenSwipe
                      ? "min-w-0 max-w-full overflow-x-auto rounded-[22px] border border-white/5 bg-black/24 p-1.5 shadow-[0_10px_34px_rgba(0,0,0,0.18)] backdrop-blur-xl scrollbar-hide md:w-full md:overflow-visible md:rounded-[26px] md:border-[rgba(230,255,61,0.12)] md:bg-[linear-gradient(180deg,rgba(230,255,61,0.07),rgba(12,12,16,0.72))] md:p-3 md:ring-1 md:ring-white/5 md:shadow-[0_18px_54px_rgba(0,0,0,0.34)]"
                      : "min-w-0 flex-1 overflow-x-auto rounded-[24px] border border-white/5 bg-black/18 p-1.5 shadow-[0_10px_34px_rgba(0,0,0,0.18)] scrollbar-hide md:h-full md:overflow-y-auto md:overflow-x-hidden"
              }
              data-testid="swipe-filter-bar"
            >
              <div
                className={
                  isOnboarding
                    ? "flex w-max min-w-full items-center justify-start gap-1.5 md:justify-center"
                    : isMirrorOnboardingLayout
                      ? "flex w-max min-w-full items-center justify-start gap-1.5 md:w-auto md:min-w-0 md:justify-center"
                      : isFullscreenSwipe
                        ? "flex w-max min-w-full items-center justify-center gap-1.5 md:w-full md:min-w-0 md:flex-col md:items-stretch md:justify-start md:gap-2"
                        : "flex w-max min-w-full items-center justify-center gap-2 md:w-full md:min-w-0 md:flex-col md:items-stretch md:justify-start"
                }
              >
                {CATEGORY_KEYS.map((key) => {
                  const cat = { key, label: key === "all" ? swipeUi.categories.all : swipeTypeLabel(key as SwipeMediaType, locale) };
                  const active = activeFilter === cat.key;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => handleFilterChange(cat.key)}
                      data-testid={`swipe-filter-${cat.key}`}
                      aria-pressed={active}
                      className={`flex-shrink-0 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 ${isOnboarding || isMirrorOnboardingLayout ? "px-4 py-2.5 text-[13px]" : isFullscreenSwipe ? "px-3.5 py-2 md:w-full md:justify-start md:px-3.5 md:py-2.5 md:text-left md:text-[13px]" : "px-4 py-2 md:w-full md:justify-center md:px-3 md:py-2"} ${active
                        ? "bg-[var(--accent)] text-[#0B0B0F] shadow-[0_0_26px_rgba(230,255,61,0.18)]"
                        : "bg-[rgba(244,244,245,0.07)] text-[var(--text-secondary)] hover:bg-[rgba(244,244,245,0.12)] hover:text-[var(--text-primary)]"
                        }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Area card — flex-1 min-h-0 si adatta automaticamente tra filtri e spacer */}
        <div
          ref={containerRef}
          className={
            isOnboarding
              ? "relative z-10 flex-1 flex items-center justify-center px-4 min-h-0 pt-[92px] pb-4 md:pt-[98px] md:pb-6"
              : isMirrorOnboardingLayout
                ? "relative z-10 flex-1 flex items-center justify-center px-4 min-h-0 pt-[92px] pb-4 md:pt-[98px] md:pb-6 md:pl-[280px] md:pr-8"
                : isFullscreenSwipe
                  ? "relative z-10 flex-1 flex items-center justify-center px-4 min-h-0 pt-[88px] pb-4 md:py-5 md:pl-[172px]"
                  : "relative z-10 flex-1 flex items-center justify-center px-4 min-h-0 py-2 md:py-3 md:pl-52"
          }
        >
          {filteredQueue.length === 0 ? (
            isLoadingMore ? (
              <LoadingScreen message="Caricamento nuovi titoli" />
            ) : (
              <div
                className="mx-auto flex max-w-sm flex-col items-center justify-center rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] px-6 py-10 text-center shadow-[0_18px_60px_rgba(0,0,0,0.26)]"
                data-no-swipe="true"
                data-testid="swipe-empty-state"
              >
                <p className="mb-2 text-lg font-black text-[var(--text-primary)]">
                  Nessun titolo in questa categoria
                </p>
                <p className="mb-5 text-sm leading-6 text-[var(--text-muted)]">
                  Prova un altro filtro o torna alla lista Per Te.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {activeFilter !== "all" && (
                    <button
                      type="button"
                      data-no-swipe="true"
                      onClick={() => handleFilterChange("all")}
                      className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-black text-[#0B0B0F]"
                    >
                      {swipeUi.categories.all}
                    </button>
                  )}
                  {!standalone && !isOnboarding && (
                    <button
                      type="button"
                      data-no-swipe="true"
                      onClick={onClose}
                      className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:text-white"
                    >
                      {locale === "it" ? "Torna alla lista" : "Back to list"}
                    </button>
                  )}
                </div>
              </div>
            )
          ) : (
            <div
              className={
                isOnboarding
                  ? "grid w-full max-w-[1180px] items-center justify-center gap-6 md:grid-cols-[minmax(360px,440px)_minmax(430px,510px)] md:gap-10"
                  : isMirrorOnboardingLayout
                    ? "grid w-full max-w-[1100px] items-center justify-center gap-6 md:grid-cols-[minmax(340px,420px)_minmax(430px,510px)] md:gap-8"
                    : "contents"
              }
            >
              {(isOnboarding || isMirrorOnboardingLayout) && topItem && (
                <aside
                  className={
                    isOnboarding
                      ? "hidden md:flex md:h-[min(640px,calc(100dvh-150px))] md:min-h-[500px] flex-col overflow-hidden rounded-[30px] bg-black/22 p-6 shadow-[0_18px_64px_rgba(0,0,0,0.24)] ring-1 ring-[rgba(230,255,61,0.08)] backdrop-blur-xl"
                      : "hidden md:flex self-center flex-col overflow-hidden rounded-[30px] bg-black/22 p-6 shadow-[0_18px_64px_rgba(0,0,0,0.24)] ring-1 ring-[rgba(230,255,61,0.08)] backdrop-blur-xl"
                  }
                  data-no-swipe="true"
                >
                  <style>{`
                    .gk-onboarding-desc-scroll {
                      scrollbar-width: thin;
                      scrollbar-color: rgba(230,255,61,0.42) rgba(255,255,255,0.07);
                    }
                    .gk-onboarding-desc-scroll::-webkit-scrollbar {
                      width: 6px;
                    }
                    .gk-onboarding-desc-scroll::-webkit-scrollbar-track {
                      background: rgba(255,255,255,0.06);
                      border-radius: 999px;
                    }
                    .gk-onboarding-desc-scroll::-webkit-scrollbar-thumb {
                      background: linear-gradient(180deg, rgba(230,255,61,0.72), rgba(230,255,61,0.35));
                      border-radius: 999px;
                    }
                    .gk-onboarding-desc-scroll::-webkit-scrollbar-thumb:hover {
                      background: linear-gradient(180deg, rgba(230,255,61,0.86), rgba(230,255,61,0.44));
                    }
                  `}</style>
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-xs font-bold text-white/72">
                    <span
                      className={`h-2 w-2 rounded-full bg-gradient-to-r ${TYPE_COLORS[topItem.type]}`}
                    />
                    {swipeTypeLabel(topItem.type, locale)}
                    {topItem.year ? (
                      <span className="text-white/38">· {topItem.year}</span>
                    ) : null}
                  </div>
                  <h2 className="shrink-0 text-[clamp(24px,2.15vw,30px)] font-black leading-[0.98] tracking-[-0.05em] text-white">
                    {topItem.title}
                  </h2>
                  {topItem.description && (
                    <div className="mt-3 shrink-0">
                      <div className="rounded-[22px] border border-white/8 bg-white/[0.035] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                        <div className="mb-2 flex items-center gap-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/44">
                            {swipeUi.description}
                          </p>
                        </div>
                        <div className={`gk-onboarding-desc-scroll overflow-y-auto pr-2 text-sm leading-6 text-white/70 ${isOnboarding ? "max-h-[220px]" : "max-h-[150px]"}`}>
                          {topItem.description}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 shrink-0 flex flex-wrap gap-2">
                    {topItemGenres.slice(0, 3).map((genre) => (
                      <span
                        key={genre}
                        className="rounded-full border border-white/8 bg-white/6 px-3 py-1.5 text-xs font-bold text-white/64"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                  <div className={isOnboarding ? "mt-4 shrink-0 rounded-[24px] border border-[rgba(230,255,61,0.12)] bg-[rgba(230,255,61,0.055)] p-4" : "mt-4 shrink-0 rounded-[22px] border border-[rgba(230,255,61,0.10)] bg-[rgba(230,255,61,0.045)] p-3.5"}>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--accent)]">
                      {swipeUi.howItWorks}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/64">
                      {locale === "it"
                        ? "Dai una valutazione, salta ciò che non ti interessa o salva per dopo. Bastano pochi swipe per rendere i consigli più precisi."
                        : "Rate a title, skip what you do not care about or save it for later. A few swipes are enough to make recommendations sharper."}
                    </p>
                  </div>
                  <div className="mt-4 shrink-0 grid grid-cols-3 gap-2 text-center text-xs font-bold text-white/54">
                    <div className="rounded-2xl bg-white/6 px-3 py-3">
                      ← Skip
                    </div>
                    <div className="rounded-2xl bg-white/6 px-3 py-3">
                      ★ {locale === "it" ? "Voto" : "Rate"}
                    </div>
                    <div className="rounded-2xl bg-white/6 px-3 py-3">
                      → {locale === "it" ? "Visto" : "Seen"}
                    </div>
                  </div>
                </aside>
              )}

              <div
                data-no-swipe=""
                data-testid="swipe-card-stack"
                className={
                  isOnboarding || isMirrorOnboardingLayout
                    ? "relative h-[min(680px,calc(100dvh-150px))] min-h-[500px] md:h-[min(640px,calc(100dvh-150px))]"
                    : isFullscreenSwipe
                      ? "relative h-[min(660px,calc(100dvh-132px))] md:h-[min(780px,calc(100dvh-44px))]"
                      : "relative self-stretch md:self-auto md:h-[min(560px,calc(100dvh-230px))]"
                }
                style={{
                  maxWidth: isOnboarding || isMirrorOnboardingLayout
                    ? "min(510px, 92vw)"
                    : isFullscreenSwipe
                      ? "min(430px, 88vw)"
                      : "min(340px, 88vw)",
                  width: "100%",
                  margin: "0 auto",
                }}
              >
                {filteredQueue.slice(0, 3).map((item, idx) => (
                  <SwipeCard
                    key={item.id}
                    item={item}
                    isTop={idx === 0}
                    stackIndex={idx}
                    onSwipe={handleSwipe}
                    rating={idx === 0 ? currentRating : null}
                    onRatingChange={setRating}
                    onDetailOpen={handleDetailOpen}
                    onUndo={handleUndo}
                    canUndo={history.length > 0}
                    onWishlist={handleWishlist}
                    onClose={
                      isOnboarding && onOnboardingComplete
                        ? onOnboardingComplete
                        : onClose
                    }
                    hideClose={standalone || isOnboarding}
                    hideDetails={isOnboarding}
                    detailsMobileOnly={isMirrorOnboardingLayout}
                    panelActive={isTabActive}
                    starsRef={idx === 0 ? starsRef : undefined}
                    dragX={idx === 0 ? cardDragX : 0}
                    isFlying={idx === 0 ? cardFlying : false}
                    flyDir={idx === 0 ? cardFlyDir : null}
                    isUndoEntering={idx === 0 ? undoEntering : false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Spacer navbar mobile — esatto spazio sotto la card per non andare sotto la navbar */}
        {standalone && (
          <div
            className="flex-shrink-0 md:hidden"
            style={{ height: "calc(49px + env(safe-area-inset-bottom, 0px))" }}
          />
        )}
      </div>

      {detailItem && (
        <div style={{ zIndex: 10000, position: "fixed", inset: 0 }}>
          <MediaDetailsDrawer
            media={detailItem}
            onClose={() => setDetailItem(null)}
            onAdd={(media) => {
              // Dal drawer usa il ref — stessa logica di handleSwipe
              const ratingAtAcceptTime = currentRatingRef.current;
              const swipeItem: SwipeItem = queue.find(
                (i) => i.id === media.id,
              ) ?? {
                id: media.id,
                title: media.title,
                title_original: (media as any).title_original,
                title_en: (media as any).title_en,
                title_it: (media as any).title_it,
                type: media.type as SwipeMediaType,
                coverImage: (media as any).coverImage,
                year: (media as any).year,
                genres: (media as any).genres || [],
                score: (media as any).score,
                description: (media as any).description,
                description_en: (media as any).description_en,
                description_it: (media as any).description_it,
                localized: (media as any).localized,
                why: (media as any).why,
                matchScore: (media as any).matchScore || 0,
                episodes: (media as any).episodes,
                authors: (media as any).authors,
                developers: (media as any).developers,
                platforms: (media as any).platforms,
                isAwardWinner: (media as any).isAwardWinner,
              };

              // ─── DEBUG: Drawer → onAdd ───────────────────────────────────

              setDetailItem(null);
              // Aggiorna il ref col rating corrente prima di chiamare handleSwipe
              currentRatingRef.current = ratingAtAcceptTime;
              // skipPersist=true: il Drawer ha già scritto su user_media_entries,
              // handleSwipeSeen NON deve fare un secondo upsert
              handleSwipe("right", swipeItem, true);
              profileInvalidateBridge.invalidate();
            }}
          />
        </div>
      )}
    </>
  );
}
