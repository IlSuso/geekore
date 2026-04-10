'use client'
// src/app/discover/error.tsx

import { useEffect } from 'react'
import { Search, RefreshCw } from 'lucide-react'

export default function DiscoverError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Discover Error]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-white px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center mx-auto mb-6">
          <Search size={32} className="text-zinc-500" />
        </div>
        <h2 className="text-xl font-bold mb-2">Discover non disponibile</h2>
        <p className="text-zinc-500 text-sm mb-8">
          Si è verificato un problema. Le API esterne potrebbero essere temporaneamente irraggiungibili.
        </p>
        <button
          onClick={reset}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl font-medium transition-all"
        >
          <RefreshCw size={16} />
          Riprova
        </button>
      </div>
    </div>
  )
}