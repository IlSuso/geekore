'use client'
// src/components/import/XboxImport.tsx
// Import giochi Xbox via OpenXBL — usa XUID diretto
// Il piano gratuito OpenXBL non permette la ricerca per gamertag di altri utenti,
// quindi chiediamo lo XUID che l'utente trova su xboxgamertag.com

import { useState } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, ExternalLink, Info } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'

function XboxIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4.102 20.202C5.794 21.816 8.052 23 12 23c3.948 0 6.206-1.184 7.898-2.798C22.752 17.648 24 14.58 24 12c0-6.627-5.373-12-12-12S0 5.373 0 12c0 2.58 1.248 5.648 4.102 8.202zM12 2.4c1.56 0 3.12.54 4.5 1.44C13.98 5.16 12 7.38 12 7.38S10.02 5.16 7.5 3.84C8.88 2.94 10.44 2.4 12 2.4zm-9.3 9.6c0-1.8.48-3.48 1.32-4.92.78.54 1.56 1.26 2.34 2.22C5.1 10.68 4.38 12.18 4.02 14.1 3.48 13.08 2.7 11.4 2.7 12zm1.86 4.68c.42-2.22 1.44-4.02 2.7-5.16.9 1.44 2.1 2.76 3.6 3.54.36.18.72.3 1.08.42L12 19.8s-5.04-1.62-7.44-3.52zm14.88 0C16.86 18.18 12 19.8 12 19.8l-.06-4.14c.36-.12.72-.24 1.08-.42 1.5-.78 2.7-2.1 3.6-3.54 1.26 1.14 2.28 2.94 2.7 5.16zm1.86-4.68c0 1.8-.48 3.48-1.32 4.92C19.62 15.78 18.9 14.1 18.3 12c.78-.96 1.56-1.68 2.34-2.22.84 1.44 1.32 3.12 1.32 4.92-.3-.36-.42 0-.42 0z"/>
    </svg>
  )
}

const XUID_REGEX = /^\d{16}$/

interface ImportResult {
  imported: number
  skipped: number
  total: number
  gamertag: string
}

export function XboxImport() {
  const [xuid, setXuid] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)

  const isValidXuid = XUID_REGEX.test(xuid.trim())

  const handleImport = async () => {
    const id = xuid.trim()
    if (!id || !isValidXuid) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(`/api/xbox/games?xuid=${encodeURIComponent(id)}`)
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Errore durante l'importazione")
        return
      }

      setResult(data)
      showToast(`${data.imported} giochi Xbox importati!`)
    } catch {
      setError('Errore di rete. Riprova.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-3xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-[#107c10] rounded-2xl flex items-center justify-center">
          <XboxIcon size={22} className="text-white" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Xbox</h3>
          <p className="text-xs text-zinc-500">Importa i tuoi giochi Xbox tramite XUID</p>
        </div>
        <a
          href="https://www.xboxgamertag.com"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
        >
          Trova il tuo XUID <ExternalLink size={11} />
        </a>
      </div>

      {result ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-4 bg-emerald-950/30 border border-emerald-800/40 rounded-2xl">
            <CheckCircle size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">
                Importazione completata
                {result.gamertag && <span className="text-emerald-400"> per {result.gamertag}</span>}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {result.imported} nuovi · {result.skipped} già presenti · {result.total} totali
              </p>
            </div>
          </div>
          <button
            onClick={() => { setResult(null); setXuid('') }}
            className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl text-sm text-zinc-400 transition"
          >
            Importa un altro account
          </button>
        </div>
      ) : (
        <div className="space-y-3">

          {/* Help accordion */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowHelp(v => !v)}
              className="w-full flex items-center gap-2 px-4 py-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <Info size={13} className="text-violet-400 flex-shrink-0" />
              <span>Come trovo il mio XUID?</span>
              <span className="ml-auto text-zinc-600">{showHelp ? '▲' : '▼'}</span>
            </button>
            {showHelp && (
              <div className="px-4 pb-4 text-xs text-zinc-500 space-y-1.5 border-t border-zinc-800 pt-3">
                <p>1. Vai su <a href="https://www.xboxgamertag.com" target="_blank" rel="noopener noreferrer" className="text-violet-400 underline">xboxgamertag.com</a></p>
                <p>2. Cerca il tuo Gamertag Xbox nel campo di ricerca</p>
                <p>3. Copia il numero a 16 cifre sotto il tuo nome</p>
                <p className="text-zinc-600">Es: <span className="font-mono text-zinc-500">2535416081689610</span></p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Il tuo XUID (16 cifre)</label>
            <input
              type="text"
              value={xuid}
              onChange={e => setXuid(e.target.value.replace(/\D/g, '').slice(0, 16))}
              onKeyDown={e => e.key === 'Enter' && !loading && isValidXuid && handleImport()}
              placeholder="es. 2535416081689610"
              className={`w-full bg-zinc-900 border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none transition font-mono ${
                xuid && !isValidXuid
                  ? 'border-red-800 focus:border-red-600'
                  : 'border-zinc-800 focus:border-[#107c10]'
              }`}
              disabled={loading}
              inputMode="numeric"
            />
            {xuid && !isValidXuid && (
              <p className="text-[10px] text-red-400 mt-1">Lo XUID deve essere esattamente 16 cifre</p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-950/30 border border-red-800/40 rounded-xl">
              <AlertCircle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={loading || !isValidXuid}
            className="w-full flex items-center justify-center gap-2 py-3 bg-[#107c10] hover:bg-[#0d6b0d] disabled:opacity-40 rounded-2xl text-sm font-semibold text-white transition"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Importazione in corso...' : 'Importa giochi Xbox'}
          </button>

          <p className="text-[10px] text-zinc-600 text-center">
            I dati di gioco devono essere pubblici su{' '}
            <a href="https://privacy.xbox.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">
              privacy.xbox.com
            </a>
          </p>
        </div>
      )}
    </div>
  )
}