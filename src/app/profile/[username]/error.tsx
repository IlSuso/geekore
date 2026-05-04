"use client";
// src/app/profile/[username]/error.tsx
// Error boundary specifico per le pagine profilo.

import { useEffect } from "react";
import { useLocale } from "@/lib/locale";
import { UserX, RefreshCw, Search } from "lucide-react";

const PROFILE_ERROR_COPY = {
  it: {
    title: "Profilo non disponibile",
    body: "Non riusciamo a caricare questo profilo. Potrebbe essere un problema temporaneo.",
    retry: "Riprova",
    searchUsers: "Cerca utenti",
  },
  en: {
    title: "Profile unavailable",
    body: "We cannot load this profile. It may be a temporary issue.",
    retry: "Try again",
    searchUsers: "Search users",
  },
} as const;

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useLocale();
  const copy = PROFILE_ERROR_COPY[locale];

  useEffect(() => {
    console.error("[Profile Error]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-white px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <UserX size={32} className="text-zinc-500" />
        </div>
        <h2 className="text-xl font-bold mb-2">{copy.title}</h2>
        <p className="text-zinc-500 text-sm mb-8">{copy.body}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-medium transition-all"
            style={{ background: "var(--accent)", color: "#0B0B0F" }}
          >
            <RefreshCw size={16} />
            {copy.retry}
          </button>
          <a
            href="/explore"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-medium transition-all"
          >
            <Search size={16} />
            {copy.searchUsers}
          </a>
        </div>
      </div>
    </div>
  );
}
