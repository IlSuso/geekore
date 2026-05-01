// src/app/not-found.tsx
// M7: 404 custom con glitch effect, messaggio geek, CTA rapidi
// Fix: rimosso styled-jsx (non funziona in Server Component) → animazioni inline

import Link from 'next/link'
import { Home, Search, User } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-white px-6">

      {/* Glitch 404 */}
      <div className="relative select-none mb-2">
        <h1
          className="text-[140px] sm:text-[180px] font-black leading-none text-transparent bg-clip-text bg-gradient-to-b from-violet-400 to-violet-700"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          404
        </h1>

        {/* Glitch layer 1 — fuchsia, clip top */}
        <h1
          aria-hidden
          className="absolute inset-0 text-[140px] sm:text-[180px] font-black leading-none text-fuchsia-500/30"
          style={{
            clipPath: 'inset(20% 0 60% 0)',
            transform: 'translateX(-4px)',
            animation: 'geekore-glitch-1 3s infinite',
          }}
        >
          404
        </h1>

        {/* Glitch layer 2 — cyan, clip bottom */}
        <h1
          aria-hidden
          className="absolute inset-0 text-[140px] sm:text-[180px] font-black leading-none text-cyan-500/20"
          style={{
            clipPath: 'inset(60% 0 20% 0)',
            transform: 'translateX(4px)',
            animation: 'geekore-glitch-2 3s infinite 0.5s',
          }}
        >
          404
        </h1>
      </div>

      {/* Keyframes iniettati una volta sola via <style> tag (valido in Server Component) */}
      <style>{`
        @keyframes geekore-glitch-1 {
          0%,100% { transform: translateX(-4px); opacity: .3; }
          25%      { transform: translateX( 4px); opacity: .5; }
          50%      { transform: translateX(-2px); opacity: .2; }
          75%      { transform: translateX( 2px); opacity: .4; }
        }
        @keyframes geekore-glitch-2 {
          0%,100% { transform: translateX( 4px); opacity: .2; }
          25%      { transform: translateX(-4px); opacity: .4; }
          50%      { transform: translateX( 2px); opacity: .3; }
          75%      { transform: translateX(-2px); opacity: .2; }
        }
      `}</style>

      {/* Messaggio geek */}
      <p className="text-xl sm:text-2xl font-semibold mb-3 text-center">
        Questo contenuto è stato isekai'd
      </p>
      <p className="text-zinc-500 mb-10 max-w-sm mx-auto text-center leading-relaxed">
        La pagina che cerchi è finita in un'altra dimensione. Probabilmente sta guardando anime anche lei.
      </p>

      {/* 3 CTA rapidi */}
      <div className="flex flex-wrap gap-3 justify-center">
        <Link
          href="/home"
          className="flex items-center gap-2 px-6 py-3 rounded-full font-semibold transition-all hover:scale-105 text-sm"
          style={{ background: '#E6FF3D', color: '#0B0B0F' }}
        >
          <Home size={16} /> Home
        </Link>
        <Link
          href="/discover"
          className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full font-semibold transition-all hover:scale-105 text-sm"
        >
          <Search size={16} /> Discover
        </Link>
        <Link
          href="/profile/me"
          className="flex items-center gap-2 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full font-semibold transition-all hover:scale-105 text-sm"
        >
          <User size={16} /> Il mio profilo
        </Link>
      </div>
    </div>
  )
}