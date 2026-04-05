// DESTINAZIONE: src/app/not-found.tsx

import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white px-6">
      <div className="text-center">
        <h1 className="text-[160px] font-black leading-none text-transparent bg-clip-text bg-gradient-to-b from-violet-400 to-violet-700 select-none">
          404
        </h1>
        <p className="text-2xl font-semibold mt-2 mb-3">Pagina non trovata</p>
        <p className="text-zinc-500 mb-10 max-w-sm mx-auto">
          Questa pagina non esiste o è stata spostata.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-8 py-3 bg-violet-600 hover:bg-violet-500 rounded-full font-semibold transition-all hover:scale-105"
        >
          Torna alla home
        </Link>
      </div>
    </div>
  )
}