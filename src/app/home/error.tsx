"use client";
// src/app/feed/error.tsx
// Error boundary specifico per la sezione Feed.

import { useEffect } from "react";
import { useLocale } from "@/lib/locale";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

const FEED_ERROR_COPY = {
  it: {
    title: "Il feed non è disponibile",
    body: "Si è verificato un problema nel caricamento del feed. Puoi riprovare o tornare alla home.",
    retry: "Riprova",
    home: "Home",
  },
  en: {
    title: "Feed unavailable",
    body: "Something went wrong while loading the feed. You can try again or go back home.",
    retry: "Try again",
    home: "Home",
  },
} as const;

export default function FeedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useLocale();
  const copy = FEED_ERROR_COPY[locale];

  useEffect(() => {
    console.error("[Feed Error]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-white px-4">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-amber-950/50 border border-amber-800/50 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <AlertTriangle size={32} className="text-amber-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">{copy.title}</h2>
        <p className="text-zinc-500 text-sm mb-8">{copy.body}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-medium transition-all"
            style={{ background: "var(--accent)", color: "#0B0B0F" }}
          >
            <RefreshCw size={16} />
            {copy.retry}
          </button>
          <a
            href="/"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-medium transition-all"
          >
            <Home size={16} />
            {copy.home}
          </a>
        </div>
      </div>
    </div>
  );
}
