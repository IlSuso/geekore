"use client";
// src/app/discover/error.tsx

import { useEffect } from "react";
import { useLocale } from "@/lib/locale";
import { Search, RefreshCw } from "lucide-react";

const DISCOVER_ERROR_COPY = {
  it: {
    title: "Discover non disponibile",
    body: "Si è verificato un problema. Le API esterne potrebbero essere temporaneamente irraggiungibili.",
    retry: "Riprova",
  },
  en: {
    title: "Discover unavailable",
    body: "Something went wrong. External APIs may be temporarily unreachable.",
    retry: "Try again",
  },
} as const;

export default function DiscoverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useLocale();
  const copy = DISCOVER_ERROR_COPY[locale];

  useEffect(() => {
    console.error("[Discover Error]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-white px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Search size={32} className="text-zinc-500" />
        </div>
        <h2 className="text-xl font-bold mb-2">{copy.title}</h2>
        <p className="text-zinc-500 text-sm mb-8">{copy.body}</p>
        <button
          onClick={reset}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-medium transition-all"
          style={{ background: "var(--accent)", color: "#0B0B0F" }}
        >
          <RefreshCw size={16} />
          {copy.retry}
        </button>
      </div>
    </div>
  );
}
