'use client'
// src/components/ui/ErrorState.tsx

import { AlertTriangle, WifiOff, RefreshCw, ShieldAlert, Inbox } from 'lucide-react'
import { useLocale } from '@/lib/locale'

interface ErrorStateProps {
  error: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({ error, onRetry, className = '' }: ErrorStateProps) {
  const { locale } = useLocale()
  const copy = locale === 'en' ? { title: 'Something went wrong', retry: 'Retry' } : { title: 'Qualcosa è andato storto', retry: 'Riprova' }
  const isOffline = error.toLowerCase().includes('offline') || error.toLowerCase().includes('connessione')
  const isAuth = error.toLowerCase().includes('permessi') || error.toLowerCase().includes('sessione')
  const Icon = isOffline ? WifiOff : isAuth ? ShieldAlert : AlertTriangle

  return (
    <div className={`gk-empty-actionable flex flex-col items-center justify-center px-6 py-14 text-center ${className}`} data-no-swipe="true">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[22px] border border-red-500/24 bg-red-500/10">
        <Icon size={24} className="text-red-400" />
      </div>
      <p className="gk-title mb-1 text-[var(--text-primary)]">{copy.title}</p>
      <p className="gk-body max-w-xs">{error}</p>
      {onRetry && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={(event) => { event.stopPropagation(); onRetry() }}
          onPointerDown={event => event.stopPropagation()}
          className="mt-5 flex items-center gap-2 rounded-2xl border border-[rgba(230,255,61,0.22)] bg-[rgba(230,255,61,0.07)] px-4 py-2 text-sm font-black text-[var(--accent)] transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
        >
          <RefreshCw size={14} />
          {copy.retry}
        </button>
      )}
    </div>
  )
}

export function InlineError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  const { locale } = useLocale()
  const retryLabel = locale === 'en' ? 'Retry' : 'Riprova'
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm" data-no-swipe="true">
      <AlertTriangle size={16} className="flex-shrink-0 text-red-400" />
      <span className="flex-1 text-red-300">{error}</span>
      {onRetry && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={(event) => { event.stopPropagation(); onRetry() }}
          onPointerDown={event => event.stopPropagation()}
          className="flex-shrink-0 text-red-400 transition-colors hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/35 rounded-lg p-1"
          aria-label={retryLabel}
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
  title,
  description,
  action,
  className = '',
}: EmptyStateProps) {
  const { locale } = useLocale()
  const resolvedTitle = title || (locale === 'en' ? 'No content' : 'Nessun contenuto')
  return (
    <div className={`gk-empty-actionable flex flex-col items-center justify-center px-6 py-14 text-center ${className}`} data-no-swipe="true">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[22px] border border-[rgba(230,255,61,0.22)] bg-[rgba(230,255,61,0.07)]">
        <Inbox size={24} className="text-[var(--accent)]" />
      </div>
      <p className="gk-title mb-1 text-[var(--text-primary)]">{resolvedTitle}</p>
      {description && <p className="gk-body max-w-xs">{description}</p>}
      {action && (
        <button
          type="button"
          data-no-swipe="true"
          onClick={(event) => { event.stopPropagation(); action.onClick() }}
          onPointerDown={event => event.stopPropagation()}
          className="gk-primary-cta mt-5 rounded-2xl px-4 py-2 text-sm font-black transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35"
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
  const SIZE = 32
  const R = 11
  const STROKE = 2
  const circumference = 2 * Math.PI * R
  const dashOffset = refreshing ? 0 : circumference * (1 - progress * 0.85)
  const opacity = refreshing ? 1 : Math.min(Math.max((progress - 0.1) / 0.6, 0), 1)
  const NAVBAR_H = 53
  const maxTravel = threshold * 0.55
  const travel = refreshing ? Math.min(distance * 0.55, maxTravel) : distance * 0.55
  const topPx = NAVBAR_H + travel

  return (
    <>
      <style>{`@keyframes ptr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div
        className="pointer-events-none fixed left-0 right-0 z-[99] flex justify-center md:hidden"
        style={{
          top: topPx,
          opacity,
          transition: refreshing ? 'opacity 0.15s ease' : 'opacity 0.08s linear',
          ...(distance === 0 && !refreshing ? { opacity: 0, transition: 'opacity 0.25s ease, transform 0.25s ease', transform: 'translateY(-4px) scale(0.85)' } : {}),
        }}
      >
        <div
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: '50%',
            background: 'var(--bg-secondary)',
            border: '1px solid rgba(230,255,61,0.20)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.5), 0 0 22px rgba(230,255,61,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${refreshing ? 1 : 0.7 + progress * 0.3})`,
            transition: refreshing ? 'transform 0.2s ease' : 'transform 0.05s linear',
          }}
        >
          <svg width={SIZE - 8} height={SIZE - 8} viewBox={`0 0 ${SIZE - 8} ${SIZE - 8}`} style={{ animation: refreshing ? 'ptr-spin 0.75s linear infinite' : 'none', display: 'block' }}>
            <circle cx={(SIZE - 8) / 2} cy={(SIZE - 8) / 2} r={R} fill="none" stroke="rgba(230,255,61,0.12)" strokeWidth={STROKE} />
            <circle
              cx={(SIZE - 8) / 2}
              cy={(SIZE - 8) / 2}
              r={R}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={refreshing ? undefined : `rotate(${-90 + progress * 140} ${(SIZE-8)/2} ${(SIZE-8)/2})`}
              style={{ transition: refreshing ? 'none' : 'stroke-dashoffset 0.04s linear' }}
            />
          </svg>
        </div>
      </div>
    </>
  )
}
