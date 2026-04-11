'use client'
// src/components/ui/ErrorState.tsx
// Componente riutilizzabile per stati di errore e stati vuoti.
// Roadmap #4 — elimina pagine bianche su errori API/DB.

import { AlertTriangle, WifiOff, RefreshCw, ShieldAlert, Inbox } from 'lucide-react'

interface ErrorStateProps {
  /** Messaggio di errore da mostrare */
  error: string
  /** Callback per riprovare (mostra bottone "Riprova") */
  onRetry?: () => void
  /** Classe CSS aggiuntiva per il wrapper */
  className?: string
}

export function ErrorState({ error, onRetry, className = '' }: ErrorStateProps) {
  // Sceglie l'icona in base al tipo di errore
  const isOffline = error.toLowerCase().includes('offline') || error.toLowerCase().includes('connessione')
  const isAuth = error.toLowerCase().includes('permessi') || error.toLowerCase().includes('sessione')

  const Icon = isOffline ? WifiOff : isAuth ? ShieldAlert : AlertTriangle

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}>
      <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mb-4">
        <Icon size={24} className="text-red-400" />
      </div>
      <p className="text-zinc-300 text-sm font-medium mb-1">Qualcosa è andato storto</p>
      <p className="text-zinc-500 text-xs max-w-xs">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-5 flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-2xl text-sm text-zinc-300 transition-all"
        >
          <RefreshCw size={14} />
          Riprova
        </button>
      )}
    </div>
  )
}

// ── Variante inline (per errori dentro card) ─────────────────────────────────
export function InlineError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-red-950/40 border border-red-800/50 rounded-2xl text-sm">
      <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
      <span className="text-red-300 flex-1">{error}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0">
          <RefreshCw size={14} />
        </button>
      )}
    </div>
  )
}

// ── Stato vuoto generico ─────────────────────────────────────────────────────
interface EmptyStateProps {
  title?: string
  description?: string
  action?: { label: string; onClick: () => void }
  className?: string
}

export function EmptyState({
  title = 'Nessun contenuto',
  description,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 px-6 text-center ${className}`}>
      <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center mb-4">
        <Inbox size={24} className="text-zinc-600" />
      </div>
      <p className="text-zinc-400 text-sm font-medium mb-1">{title}</p>
      {description && <p className="text-zinc-600 text-xs max-w-xs">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-2xl text-sm text-white font-medium transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// ── PullToRefresh indicator ───────────────────────────────────────────────────
// Componente visivo per il pull-to-refresh (roadmap #10)
interface PullIndicatorProps {
  pullDistance: number
  isRefreshing: boolean
  threshold?: number
}

export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold = 80,
}: PullIndicatorProps) {
  if (pullDistance <= 0 && !isRefreshing) return null

  const progress = Math.min(pullDistance / (threshold * 0.4), 1)
  const isReady = pullDistance >= threshold * 0.4

  return (
    <div
      className="fixed top-16 left-0 right-0 z-50 flex justify-center pointer-events-none transition-all duration-150"
      style={{ transform: `translateY(${Math.min(pullDistance * 0.5, 40)}px)` }}
    >
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium shadow-lg transition-all ${
        isRefreshing
          ? 'bg-violet-600 text-white'
          : isReady
            ? 'bg-violet-600/90 text-white'
            : 'bg-zinc-800 text-zinc-400'
      }`}>
        <svg
          className={`w-4 h-4 transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
          style={{ transform: isRefreshing ? undefined : `rotate(${progress * 360}deg)` }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {isRefreshing ? 'Aggiornamento...' : isReady ? 'Rilascia per aggiornare' : 'Tira per aggiornare'}
      </div>
    </div>
  )
}