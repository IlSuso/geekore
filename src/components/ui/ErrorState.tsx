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
  distance: number
  refreshing: boolean
  threshold?: number
}

// Spinner Instagram-style: appare sotto l'header mentre la pagina scende
export function PullToRefreshIndicator({
  distance,
  refreshing,
  threshold = 70,
}: PullIndicatorProps) {
  const visible = distance > 4 || refreshing
  if (!visible) return null

  const progress = Math.min(distance / threshold, 1)
  const ready = progress > 0.75
  const strokeDash = 2 * Math.PI * 9 // circonferenza r=9
  const strokeOffset = strokeDash * (1 - (refreshing ? 1 : progress * 0.85))

  return (
    <div
      className="fixed left-0 right-0 z-[98] flex justify-center pointer-events-none md:hidden"
      style={{
        top: 56,
        transform: `translateY(${refreshing ? Math.min(distance, threshold * 0.9) : distance * 0.9}px)`,
        transition: refreshing ? 'none' : 'none',
        opacity: Math.min(progress * 2.5, 1),
      }}
    >
      <div className="w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center"
        style={{ marginTop: -16 }}>
        <svg width="20" height="20" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none" stroke="#e4e4e7" strokeWidth="2.5" />
          <circle
            cx="12" cy="12" r="9" fill="none"
            stroke={ready || refreshing ? '#7c3aed' : '#a1a1aa'}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={strokeDash}
            strokeDashoffset={strokeOffset}
            transform="rotate(-90 12 12)"
            style={{
              animation: refreshing ? 'ptr-spin 0.7s linear infinite' : 'none',
              transformOrigin: '12px 12px',
            }}
          />
        </svg>
      </div>
    </div>
  )
}: PullIndicatorProps) {
  if (pullDistance <= 0 && !isRefreshing) return null

  const progress = Math.min(pullDistance / threshold, 1)
  const isReady = progress >= 0.75
  // Spinner: ruota col progresso, gira continuo quando refreshing
  const rotation = isRefreshing ? undefined : progress * 270

  return (
    <>
      {/* Sposta fisicamente il contenuto della pagina verso il basso */}
      <div
        className="fixed inset-0 z-[98] pointer-events-none md:hidden"
        style={{
          transform: isRefreshing
            ? 'translateY(52px)'
            : `translateY(${pullDistance}px)`,
          transition: isRefreshing ? 'transform 0.2s ease' : 'none',
        }}
      />

      {/* Spinner che appare sotto l'header mentre tiri */}
      <div
        className="fixed left-0 right-0 z-[97] flex justify-center pointer-events-none md:hidden"
        style={{
          top: '56px', // sotto MobileHeader (h-14)
          transform: isRefreshing
            ? 'translateY(4px)'
            : `translateY(${Math.min(pullDistance * 0.7, 48) - 32}px)`,
          transition: isRefreshing ? 'transform 0.2s ease' : 'none',
          opacity: isRefreshing ? 1 : Math.min(progress * 2, 1),
        }}
      >
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow-xl transition-colors ${
          isReady || isRefreshing ? 'bg-white' : 'bg-zinc-800'
        }`}>
          <svg
            width="18" height="18"
            viewBox="0 0 24 24" fill="none"
            stroke={isReady || isRefreshing ? '#7c3aed' : '#71717a'}
            strokeWidth={2.5}
            strokeLinecap="round" strokeLinejoin="round"
            style={{
              transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
              animation: isRefreshing ? 'spin 0.7s linear infinite' : 'none',
            }}
          >
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
        </div>
      </div>
    </>
  )
}