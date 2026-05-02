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
    <div className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`} data-no-swipe="true">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
        <Icon size={24} className="text-red-400" />
      </div>
      <p className="mb-1 text-sm font-medium text-zinc-300">Qualcosa è andato storto</p>
      <p className="max-w-xs text-xs text-zinc-500">{error}</p>
      {onRetry && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={(event) => { event.stopPropagation(); onRetry() }}
          onPointerDown={event => event.stopPropagation()}
          className="mt-5 flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition-all hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/35"
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
    <div className="flex items-center gap-3 rounded-2xl border border-red-800/50 bg-red-950/40 px-4 py-3 text-sm" data-no-swipe="true">
      <AlertTriangle size={16} className="flex-shrink-0 text-red-400" />
      <span className="flex-1 text-red-300">{error}</span>
      {onRetry && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={(event) => { event.stopPropagation(); onRetry() }}
          onPointerDown={event => event.stopPropagation()}
          className="flex-shrink-0 text-red-400 transition-colors hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/35 rounded-lg p-1"
          aria-label="Riprova"
        >
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
    <div className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`} data-no-swipe="true">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900">
        <Inbox size={24} className="text-zinc-600" />
      </div>
      <p className="mb-1 text-sm font-medium text-zinc-400">{title}</p>
      {description && <p className="max-w-xs text-xs text-zinc-600">{description}</p>}
      {action && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={(event) => { event.stopPropagation(); action.onClick() }}
          onPointerDown={event => event.stopPropagation()}
          className="mt-5 rounded-2xl px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
          style={{ background: 'var(--accent)', color: '#0B0B0F' }}
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
        className="pointer-events-none fixed left-0 right-0 z-[99] flex justify-center md:hidden"
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
