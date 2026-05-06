"use client";
// src/components/ui/SwipeableCard.tsx
// A8: Swipe gesture sulle card della collezione
// Swipe LEFT  >80px → pannello rosso "Elimina" con conferma
// Swipe RIGHT >80px → segna completato con animazione verde ✓
// Haptic feedback su entrambi — nessun effetto su desktop (pointer: fine)

import { useRef, useState, useCallback, ReactNode } from "react";
import { Trash2, CheckCircle } from "lucide-react";
import { useLocale } from "@/lib/locale";

const SWIPEABLE_COPY = {
  it: {
    delete: "Elimina",
    complete: "Completa",
    confirmDelete: "Eliminare dalla collezione?",
    cancel: "Annulla",
  },
  en: {
    delete: "Delete",
    complete: "Complete",
    confirmDelete: "Remove from collection?",
    cancel: "Cancel",
  },
} as const;

function haptic(pattern: number | number[] = 40) {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

const SWIPE_THRESHOLD = 80; // px minimi per attivare
const MAX_SWIPE = 120; // px massimi di offset visivo
const DIRECTION_LOCK_THRESHOLD = 8; // px prima di decidere la direzione

interface SwipeableCardProps {
  children: ReactNode;
  onDelete?: () => void;
  onComplete?: () => void;
  disabled?: boolean; // disabilita swipe (es. durante drag dnd-kit)
  className?: string;
}

export function SwipeableCard({
  children,
  onDelete,
  onComplete,
  disabled = false,
  className = "",
}: SwipeableCardProps) {
  const { locale } = useLocale();
  const copy = SWIPEABLE_COPY[locale];
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const currentXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const [swipeState, setSwipeState] = useState<"idle" | "left" | "right">(
    "idle",
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isTouchDevice = useCallback(() => {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none)").matches
    );
  }, []);

  const applyTransform = useCallback((dx: number) => {
    const el = containerRef.current;
    if (!el) return;
    const clamped = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, dx));
    el.style.transform = `translateX(${clamped}px)`;
    el.style.transition = "none";
  }, []);

  const resetTransform = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.style.transform = "translateX(0)";
    el.style.transition = "transform 0.3s ease";
    setSwipeState("idle");
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || !isTouchDevice()) return;
      const touch = e.touches[0];
      startXRef.current = touch.clientX;
      startYRef.current = touch.clientY;
      currentXRef.current = 0;
      isDraggingRef.current = false;
    },
    [disabled, isTouchDevice],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startXRef.current;
      const dy = touch.clientY - startYRef.current;

      // Aspetta abbastanza movimento prima di decidere la direzione
      if (
        !isDraggingRef.current &&
        Math.abs(dx) < DIRECTION_LOCK_THRESHOLD &&
        Math.abs(dy) < DIRECTION_LOCK_THRESHOLD
      )
        return;

      // Se movimento verticale dominante → scroll normale, non intercettare
      if (!isDraggingRef.current && Math.abs(dy) >= Math.abs(dx)) return;

      // Solo swipe orizzontale chiaro (dx deve essere dominante)
      if (!isDraggingRef.current && Math.abs(dx) < Math.abs(dy) * 2) return;

      isDraggingRef.current = true;
      currentXRef.current = dx;

      // Aggiorna direzione visiva
      if (dx < -20 && onDelete) {
        setSwipeState("left");
      } else if (dx > 20 && onComplete) {
        setSwipeState("right");
      } else {
        setSwipeState("idle");
      }

      // rAF per performance
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => applyTransform(dx));

      // Previeni scroll solo se stiamo swipando orizzontalmente con sicurezza
      if (Math.abs(dx) > DIRECTION_LOCK_THRESHOLD) e.preventDefault();
    },
    [disabled, onDelete, onComplete, applyTransform],
  );

  const onTouchEnd = useCallback(() => {
    if (disabled || !isDraggingRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const dx = currentXRef.current;

    if (dx < -SWIPE_THRESHOLD && onDelete) {
      // Swipe LEFT → mostra conferma elimina
      haptic([60, 30]);
      resetTransform();
      setShowDeleteConfirm(true);
    } else if (dx > SWIPE_THRESHOLD && onComplete) {
      // Swipe RIGHT → segna completato
      haptic([40, 20, 40]);
      resetTransform();
      onComplete();
    } else {
      // Swipe troppo corto → torna a idle
      resetTransform();
    }

    isDraggingRef.current = false;
    currentXRef.current = 0;
  }, [disabled, onDelete, onComplete, resetTransform]);

  const handleDeleteConfirm = useCallback(() => {
    haptic(60);
    setShowDeleteConfirm(false);
    onDelete?.();
  }, [onDelete]);

  return (
    <div className={`relative overflow-hidden rounded-3xl ${className}`}>
      {/* Pannello rosso SINISTRA (swipe left → elimina) */}
      {onDelete && (
        <div
          className={`absolute inset-0 flex items-center justify-end pr-5 rounded-3xl transition-opacity duration-200 ${
            swipeState === "left"
              ? "bg-red-600/90 opacity-100"
              : "bg-red-600/90 opacity-0"
          }`}
        >
          <div className="flex flex-col items-center gap-1 text-white">
            <Trash2 size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wide">
              {copy.delete}
            </span>
          </div>
        </div>
      )}

      {/* Pannello verde DESTRA (swipe right → completa) */}
      {onComplete && (
        <div
          className={`absolute inset-0 flex items-center justify-start pl-5 rounded-3xl transition-opacity duration-200 ${
            swipeState === "right"
              ? "bg-emerald-600/90 opacity-100"
              : "bg-emerald-600/90 opacity-0"
          }`}
        >
          <div className="flex flex-col items-center gap-1 text-white">
            <CheckCircle size={24} />
            <span className="text-[10px] font-bold uppercase tracking-wide">
              {copy.complete}
            </span>
          </div>
        </div>
      )}

      {/* Card con touch handlers */}
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative z-10 touch-pan-y"
        style={{ willChange: "transform" }}
      >
        {children}
      </div>

      {/* Overlay conferma eliminazione */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 z-20 bg-black/85 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center gap-4 p-6">
          <div className="w-12 h-12 bg-red-500/20 rounded-2xl flex items-center justify-center">
            <Trash2 size={22} className="text-red-400" />
          </div>
          <p className="text-sm font-semibold text-white text-center">
            {copy.confirmDelete}
          </p>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-sm font-medium transition-colors"
            >
              {copy.cancel}
            </button>
            <button
              onClick={handleDeleteConfirm}
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 rounded-2xl text-sm font-semibold transition-colors"
            >
              {copy.delete}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
