'use client'
// src/components/import/SteamImport.tsx

import { useState, useEffect } from 'react'
import { useLocale } from '@/lib/locale'
import { createClient } from '@/lib/supabase/client'
import { SteamIcon } from '@/components/icons/SteamIcon'
import { CheckCircle, AlertTriangle, Loader2, Download, Unlink } from 'lucide-react'

interface Props {
  onImportDone?: () => void
}

type ProgressState = { message: string } | null


const STEAM_COPY = {
  it: {
    fetchError: 'Errore durante il recupero dei giochi', noneFound: 'Nessun gioco trovato (la libreria potrebbe essere privata).', imported: (count: number, cp?: unknown) => `${count} giochi Steam importati!${cp != null ? ` Core Power: ${cp}.` : ''}`,
    networkError: 'Errore di rete. Riprova tra qualche secondo.', disconnectError: 'Impossibile scollegare Steam. Riprova.', disconnected: 'Account Steam scollegato', steamId: 'Steam ID', unlinkTitle: 'Scollega Steam', unlink: 'Scollega', importing: 'Importazione in corso...', importGames: 'Importa giochi Steam', connectText1: 'Connetti il tuo account Steam per importare la tua libreria con ore giocate e achievement.', connectText2: 'La libreria deve essere pubblica nelle impostazioni privacy di Steam.', connect: 'Connetti Steam'
  },
  en: {
    fetchError: 'Error while fetching games', noneFound: 'No games found (your library may be private).', imported: (count: number, cp?: unknown) => `${count} Steam games imported!${cp != null ? ` Core Power: ${cp}.` : ''}`,
    networkError: 'Network error. Try again in a few seconds.', disconnectError: 'Could not disconnect Steam. Try again.', disconnected: 'Steam account disconnected', steamId: 'Steam ID', unlinkTitle: 'Disconnect Steam', unlink: 'Disconnect', importing: 'Importing...', importGames: 'Import Steam games', connectText1: 'Connect your Steam account to import your library with played hours and achievements.', connectText2: 'Your library must be public in Steam privacy settings.', connect: 'Connect Steam'
  },
} as const

export function SteamImport({ onImportDone }: Props) {
  const supabase = createClient()
  const { locale } = useLocale()
  const t = STEAM_COPY[locale]

  const [steamAccount, setSteamAccount] = useState<any>(null)
  const [loadingAccount, setLoadingAccount] = useState(true)
  const [importing, setImporting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [progress, setProgress] = useState<ProgressState>(null)
  const [result, setResult] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoadingAccount(false); return }
      const { data } = await supabase
        .from('steam_accounts')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()
      setSteamAccount(data)
      setLoadingAccount(false)
    }
    load()
  }, [])

  const handleImport = async () => {
    if (!steamAccount?.steam_id64 || importing) return
    setImporting(true)
    setResult(null)
    setProgress(null)

    try {
      const res = await fetch('/api/steam/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steamid: steamAccount.steam_id64 }),
      })

      if (!res.ok) {
        try {
          const data = await res.json()
          setResult({ text: data.error || t.fetchError, type: 'error' })
        } catch {
          setResult({ text: t.fetchError, type: 'error' })
        }
        setImporting(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            if (event.type === 'progress') {
              setProgress({ message: event.message })
            } else if (event.type === 'done') {
              setProgress(null)
              if (!event.success || !event.count) {
                setResult({ text: t.noneFound, type: 'error' })
              } else {
                setResult({ text: t.imported(event.count, event.core_power), type: 'success' })
                onImportDone?.()
              }
            } else if (event.type === 'error') {
              setProgress(null)
              setResult({ text: event.message || t.fetchError, type: 'error' })
            }
          } catch {}
        }
      }
    } catch {
      setResult({ text: t.networkError, type: 'error' })
    }

    setImporting(false)
    setProgress(null)
  }

  const handleDisconnect = async () => {
    if (disconnecting) return
    setDisconnecting(true)
    try {
      const res = await fetch('/api/steam/connect', { method: 'DELETE' }).catch(() => null)
      if (!res?.ok) {
        setResult({ text: t.disconnectError, type: 'error' })
        return
      }
      setSteamAccount(null)
      setResult({ text: t.disconnected, type: 'success' })
    } finally {
      setDisconnecting(false)
    }
  }

  if (loadingAccount) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex items-center justify-center min-h-[120px]">
        <Loader2 size={20} className="animate-spin text-zinc-500" />
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
      {/* Header */}
      {steamAccount ? (
        <>
          {/* Account connesso */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 mb-5 flex items-center gap-3">
            {steamAccount.avatar_url && (
              <img src={steamAccount.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {steamAccount.display_name || steamAccount.steam_id64}
              </p>
              <p className="text-xs text-zinc-500">{t.steamId}: {steamAccount.steam_id64}</p>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting || importing}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-400 transition disabled:opacity-50 flex-shrink-0"
              title={t.unlinkTitle}
            >
              {disconnecting
                ? <Loader2 size={13} className="animate-spin" />
                : <Unlink size={13} />}
              Scollega
            </button>
          </div>

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

          {/* Progress */}
          {importing && progress && (
            <div className="space-y-1.5 mb-4">
              <p className="text-xs text-zinc-400">{progress.message}</p>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-[#66C0F4]/60 rounded-full animate-pulse w-full" />
              </div>
            </div>
          )}

          {/* Import button */}
          <button
            onClick={handleImport}
            disabled={importing}
            className="w-full py-3.5 bg-[#1b2838] hover:bg-[#243a54] border border-[#66C0F4]/30 hover:border-[#66C0F4]/60 disabled:opacity-40 rounded-2xl font-semibold text-sm text-white transition flex items-center justify-center gap-2"
          >
            {importing
              ? <><Loader2 size={16} className="animate-spin" />{t.importing}</>
              : <><Download size={16} />{t.importGames}</>}
          </button>
        </>
      ) : (
        <>
          {/* Non connesso */}
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl p-4 mb-5 text-xs text-zinc-500 space-y-1">
            <p>{t.connectText1}</p>
            <p>{t.connectText2}</p>
          </div>

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

          <a
            href="/api/steam/connect"
            className="w-full py-3.5 bg-[#1b2838] hover:bg-[#243a54] border border-[#66C0F4]/30 hover:border-[#66C0F4]/60 rounded-2xl font-semibold text-sm text-white transition flex items-center justify-center gap-2"
          >
            <SteamIcon size={20} />
            {t.connect}
          </a>
        </>
      )}
    </div>
  )
}
