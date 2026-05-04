'use client'
// src/components/import/BGGImport.tsx
// Importa la collezione BGG di un utente tramite username pubblico.
// BGG non richiede login per leggere collezioni pubbliche.
// API: /xmlapi2/collection?username=NAME&stats=1&own=1

import { useState } from 'react'
import { useLocale } from '@/lib/locale'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, AlertTriangle, Loader2, Download, Dices, ExternalLink } from 'lucide-react'

interface Props {
  onImportDone?: () => void
}

interface ImportResult {
  imported: number
  skipped: number
  errors: number
}


const BGG_COPY = {
  it: {
    connecting: 'Connessione a BoardGameGeek…', loginRequired: 'Devi essere loggato', fetching: 'Recupero collezione da BGG…', preparing: 'BGG sta preparando la collezione, riprovo…', empty: "Nessun gioco trovato. Assicurati che l'username BGG sia corretto e la collezione sia pubblica.", importing: (n: number) => `Importazione di ${n} giochi…`, imported: (n: number, e: number) => `${n} giochi da tavolo importati da BGG!${e > 0 ? ` (${e} errori)` : ''}`, noResponse: 'BGG non ha risposto dopo 5 tentativi. Riprova tra qualche minuto.', importError: "Errore durante l'importazione", subtitle: 'Importa la tua collezione di giochi da tavolo', info1: 'Inserisci il tuo username BGG. La collezione deve essere', publicWord: 'pubblica', info2: 'nelle impostazioni BGG.', findUsername: 'Trova il tuo username su BGG', username: 'Username BGG', placeholder: 'es. mionome_bgg', loading: 'Importazione in corso…', importFrom: 'Importa da BGG'
  },
  en: {
    connecting: 'Connecting to BoardGameGeek…', loginRequired: 'You must be logged in', fetching: 'Fetching collection from BGG…', preparing: 'BGG is preparing the collection, retrying…', empty: 'No games found. Make sure your BGG username is correct and your collection is public.', importing: (n: number) => `Importing ${n} games…`, imported: (n: number, e: number) => `${n} board games imported from BGG!${e > 0 ? ` (${e} errors)` : ''}`, noResponse: 'BGG did not respond after 5 attempts. Try again in a few minutes.', importError: 'Import failed', subtitle: 'Import your board game collection', info1: 'Enter your BGG username. Your collection must be', publicWord: 'public', info2: 'in BGG settings.', findUsername: 'Find your username on BGG', username: 'BGG username', placeholder: 'e.g. my_bgg_name', loading: 'Importing…', importFrom: 'Import from BGG'
  },
} as const

export function BGGImport({ onImportDone }: Props) {
  const supabase = createClient()
  const { locale } = useLocale()
  const t = BGG_COPY[locale]
  const [bggUsername, setBggUsername] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const handleImport = async () => {
    const username = bggUsername.trim()
    if (!username || importing) return
    setImporting(true)
    setResult(null)
    setProgress(t.connecting)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setResult({ text: t.loginRequired, type: 'error' }); return }

      setProgress(t.fetching)

      // Step 1: scarica XML collection con retry (BGG restituisce 202 se la
      // richiesta è in coda — va riprovata fino a 200)
      const xmlUrl = `https://boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username)}&stats=1&own=1`
      let xml = ''
      let attempts = 0
      while (attempts < 5) {
        const res = await fetch(`/api/bgg/collection?username=${encodeURIComponent(username)}`)
        if (res.status === 202) {
          setProgress(t.preparing)
          await new Promise(r => setTimeout(r, 3000))
          attempts++
          continue
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Errore BGG: ${res.status}`)
        }
        const data = await res.json()
        if (data.retrying) {
          setProgress(t.preparing)
          await new Promise(r => setTimeout(r, 3000))
          attempts++
          continue
        }
        if (!data.items || data.items.length === 0) {
          setResult({ text: t.empty, type: 'error' })
          return
        }

        // Step 2: l'arricchimento avviene server-side nella route /api/bgg/collection
        // (le richieste a BGG devono essere server-side per policy BGG)
        const enrichMap: Record<string, any> = {}
        if (data.enriched) {
          for (const item of data.enriched) {
            enrichMap[item.objectid] = item
          }
        }

        // Step 3: inserisci nel DB
        setProgress(t.importing(data.items.length))
        const stats: ImportResult = { imported: 0, skipped: 0, errors: 0 }

        for (const item of data.items) {
          const enrich = enrichMap[item.objectid] || {}
          const bggAchievementData = (enrich.bggScore != null || enrich.complexity != null)
            ? { bgg: { score: enrich.bggScore ?? null, complexity: enrich.complexity ?? null, min_players: enrich.min_players ?? item.minplayers ?? null, max_players: enrich.max_players ?? item.maxplayers ?? null, playing_time: enrich.playing_time ?? item.playingtime ?? null } }
            : null
          const res = await fetch('/api/collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              external_id: `bgg-${item.objectid}`,
              title: item.name,
              title_en: item.name,
              type: 'boardgame',
              cover_image: item.thumbnail || null,
              genres: item.categories || [],
              tags: enrich.mechanics || [],
              authors: enrich.designers || [],
              status: 'completed',
              rating: item.rating ? Math.round(item.rating * 2) : null,
              current_episode: item.numplays || null,
              current_season: null,
              episodes: null,
              season_episodes: null,
              studios: [],
              directors: [],
              developer: null,
              achievement_data: bggAchievementData,
              display_order: Date.now(),
              upsert: true,
            }),
          }).catch(() => null)

          if (!res?.ok) stats.errors++
          else stats.imported++
        }

        const msg = t.imported(stats.imported, stats.errors)
        setResult({ text: msg, type: 'success' })
        onImportDone?.()
        return
      }

      throw new Error(t.noResponse)
    } catch (err: any) {
      setResult({ text: err.message || t.importError, type: 'error' })
    } finally {
      setImporting(false)
      setProgress(null)
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-amber-500/15 rounded-2xl flex items-center justify-center flex-shrink-0">
          <Dices size={20} className="text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">BoardGameGeek</p>
          <p className="text-xs text-zinc-500">{t.subtitle}</p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 mb-5 space-y-2">
        <p className="text-xs text-zinc-400">
          {t.info1} <span className="text-amber-300 font-medium">{t.publicWord}</span> {t.info2}
        </p>
        <a
          href="https://boardgamegeek.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-amber-400/70 hover:text-amber-300 flex items-center gap-1 transition-colors"
        >
          <ExternalLink size={10} />Trova il tuo username su BGG
        </a>
      </div>

      {/* Input username */}
      <div className="mb-4">
        <label className="text-xs text-zinc-500 mb-2 block">{t.username}</label>
        <input
          type="text"
          value={bggUsername}
          onChange={e => setBggUsername(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleImport() }}
          placeholder={t.placeholder}
          disabled={importing}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500/60 disabled:opacity-50 transition-colors"
        />
      </div>

      {/* Progress */}
      {importing && progress && (
        <div className="space-y-1.5 mb-4">
          <p className="text-xs text-zinc-400">{progress}</p>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500/60 rounded-full animate-pulse w-full" />
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl text-sm mb-4 ${
          result.type === 'success'
            ? 'bg-emerald-950/40 border border-emerald-800/50 text-emerald-400'
            : 'bg-red-950/40 border border-red-800/50 text-red-400'
        }`}>
          {result.type === 'success'
            ? <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
            : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
          <span>{result.text}</span>
        </div>
      )}

      {/* Button */}
      <button
        onClick={handleImport}
        disabled={importing || !bggUsername.trim()}
        className="w-full py-3.5 bg-amber-600/90 hover:bg-amber-500/90 disabled:opacity-40 border border-amber-500/30 rounded-2xl font-semibold text-sm text-white transition flex items-center justify-center gap-2"
      >
        {importing
          ? <><Loader2 size={16} className="animate-spin" />{t.loading}</>
          : <><Download size={16} />{t.importFrom}</>}
      </button>
    </div>
  )
}
