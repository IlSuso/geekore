'use client'
// src/app/profile/[username]/error.tsx
// Error boundary specifico per le pagine profilo.

import { useEffect } from 'react'
import { UserX, RefreshCw, Search } from 'lucide-react'

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Profile Error]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-white px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <UserX size={32} className="text-zinc-500" />
        </div>
        <h2 className="text-xl font-bold mb-2">Profilo non disponibile</h2>
        <p className="text-zinc-500 text-sm mb-8">
          Non riusciamo a caricare questo profilo. Potrebbe essere un problema temporaneo.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-medium transition-all"
            style={{ background: '#E6FF3D', color: '#0B0B0F' }}
          >
            <RefreshCw size={16} />
            Riprova
          </button>
          <a
            href="/explore"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-medium transition-all"
          >
            <Search size={16} />
            Cerca utenti
          </a>
        </div>
      </div>
    </div>
  )
}