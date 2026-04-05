// DESTINAZIONE: src/app/error.tsx
'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white px-6">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-red-950 border border-red-800 rounded-3xl flex items-center justify-center">
            <AlertTriangle size={40} className="text-red-400" />
          </div>
        </div>
        <h1 className="text-3xl font-bold mb-3">Qualcosa è andato storto</h1>
        <p className="text-zinc-500 mb-10">
          Si è verificato un errore inaspettato. Puoi riprovare o tornare alla home.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-8 py-3 bg-violet-600 hover:bg-violet-500 rounded-full font-semibold transition-all hover:scale-105"
          >
            Riprova
          </button>
          <a
            href="/"
            className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-full font-semibold transition-all"
          >
            Torna alla home
          </a>
        </div>
      </div>
    </div>
  )
}