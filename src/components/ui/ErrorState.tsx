'use client'
// src/components/ui/ErrorState.tsx

import { AlertTriangle, WifiOff, RefreshCw, ShieldAlert, Inbox } from 'lucide-react'

interface ErrorStateProps {
  error: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({ error, onRetry, className = '' }: ErrorStateProps) {
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
          className="mt-5 px-4 py-2 rounded-2xl text-sm font-semibold transition-all"
          style={{ background: '#E6FF3D', color: '#0B0B0F' }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

// ── PullToRefresh indicator — stile Instagram ─────────────────────────────────
interface PullIndicatorProps {
  distance: number
  refreshing: boolean
  threshold?: number
}

export function PullToRefreshIndicator({
  distance,
  refreshing,
  threshold = 70,
}: PullIndicatorProps) {
  const visible = distance > 2 || refreshing
  if (!visible) return null

  const progress = Math.min(distance / threshold, 1)

  // Dimensioni pill — come Instagram: più grande, più leggibile
  const SIZE = 32
  const R = 11
  const STROKE = 2
  const circumference = 2 * Math.PI * R

  // Arco che cresce con il pull, cerchio completo durante il refresh
  const dashOffset = refreshing ? 0 : circumference * (1 - progress * 0.85)

  // Opacità: sale smooth dopo il 10% del pull
  const opacity = refreshing ? 1 : Math.min(Math.max((progress - 0.1) / 0.6, 0), 1)

  // Posizione Y: esce da SOTTO la navbar (53px) seguendo il dito.
  // Resistenza progressiva: a fine corsa si ferma a ~20px sotto la navbar.
  // Durante il refresh rimane fermo nella posizione di rilascio.
  const NAVBAR_H = 53
  const INDICATOR_H = SIZE
  const maxTravel = threshold * 0.55  // quanto scende al massimo
  const travel = refreshing
    ? Math.min(distance * 0.55, maxTravel)
    : distance * 0.55
  // top finale = bordo inferiore navbar + travel + metà indicatore (centrato)
  const topPx = NAVBAR_H + travel

  return (
    <>
      <style>{`
        @keyframes ptr-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>

      <div
        className="fixed left-0 right-0 z-[99] flex justify-center pointer-events-none md:hidden"
        style={{
          top: topPx,
          opacity,
          // Transizione opacity fluida, nessun salto di posizione
          transition: refreshing ? 'opacity 0.15s ease' : 'opacity 0.08s linear',
          // Uscita: fade + leggero scale down per scomparire elegante
          ...(distance === 0 && !refreshing ? {
            opacity: 0,
            transition: 'opacity 0.25s ease, transform 0.25s ease',
            transform: 'translateY(-4px) scale(0.85)',
          } : {}),
        }}
      >
        {/* Pill con sfondo coerente con tema Geekore */}
        <div
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: '50%',
            background: 'var(--bg-secondary, #18181b)',
            border: '1px solid rgba(167, 139, 250, 0.15)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,58,237,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // Scale: parte piccolo e cresce — dà senso di "emergere"
            transform: `scale(${refreshing ? 1 : 0.7 + progress * 0.3})`,
            transition: refreshing ? 'transform 0.2s ease' : 'transform 0.05s linear',
          }}
        >
          <svg
            width={SIZE - 8}
            height={SIZE - 8}
            viewBox={`0 0 ${SIZE - 8} ${SIZE - 8}`}
            style={{
              animation: refreshing ? 'ptr-spin 0.75s linear infinite' : 'none',
              display: 'block',
            }}
          >
            {/* Traccia di sfondo grigia */}
            <circle
              cx={(SIZE - 8) / 2}
              cy={(SIZE - 8) / 2}
              r={R}
              fill="none"
              stroke="rgba(167,139,250,0.12)"
              strokeWidth={STROKE}
            />
            {/* Arco viola Geekore */}
            <circle
              cx={(SIZE - 8) / 2}
              cy={(SIZE - 8) / 2}
              r={R}
              fill="none"
              stroke="#a78bfa"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              // Rotazione statica durante il pull per dare senso di avanzamento
              transform={refreshing ? undefined : `rotate(${-90 + progress * 140} ${(SIZE-8)/2} ${(SIZE-8)/2})`}
              style={{
                transition: refreshing ? 'none' : 'stroke-dashoffset 0.04s linear',
              }}
            />
          </svg>
        </div>
      </div>
    </>
  )
}