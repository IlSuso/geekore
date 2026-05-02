'use client'
// src/components/notifications/PushNotificationsToggle.tsx

import { useState, useEffect } from 'react'
import { Bell, BellOff, Loader2, Smartphone, AlertTriangle } from 'lucide-react'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0)))
}

type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'loading'

function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
}

function isPWA(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true)
  )
}

function StatusDot({ active, danger = false }: { active: boolean; danger?: boolean }) {
  return (
    <span
      className="h-2 w-2 rounded-full"
      style={{ background: danger ? '#f87171' : active ? 'var(--accent)' : 'var(--text-muted)' }}
    />
  )
}

export function PushNotificationsToggle() {
  const [state, setState] = useState<PushState>('loading')
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [showAndroidTip, setShowAndroidTip] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported')
      return
    }
    checkCurrentState()
  }, [])

  const checkCurrentState = async () => {
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      const permission = Notification.permission

      if (sub) {
        setSubscription(sub)
        setState('granted')
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON() }),
        }).catch(() => {})
      } else {
        setState(permission === 'denied' ? 'denied' : 'default')
      }
    } catch {
      setState('default')
    }
  }

  const handleEnable = async () => {
    if (!VAPID_PUBLIC_KEY) return

    setState('loading')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState('denied')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as Uint8Array<ArrayBuffer>,
      })

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })

      if (res.ok) {
        setSubscription(sub)
        setState('granted')
        if (isAndroid() && !isPWA()) setShowAndroidTip(true)
      } else {
        setState('default')
      }
    } catch {
      setState('default')
    }
  }

  const handleDisable = async () => {
    if (!subscription) return
    setState('loading')
    try {
      await subscription.unsubscribe()
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      })
      setSubscription(null)
      setState('default')
      setShowAndroidTip(false)
    } catch {
      setState('granted')
    }
  }

  if (state === 'unsupported') {
    return (
      <div className="rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] p-4 opacity-70">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] text-[var(--text-muted)] ring-1 ring-white/5">
            <Smartphone size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-[var(--text-secondary)]">Notifiche push</p>
            <p className="gk-caption">Non supportate su questo browser</p>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="rounded-[22px] border border-red-500/20 bg-red-500/8 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 ring-1 ring-red-500/15">
            <BellOff size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <StatusDot active={false} danger />
              <p className="text-sm font-bold text-[var(--text-primary)]">Notifiche bloccate</p>
            </div>
            <p className="text-xs leading-relaxed text-red-300/80">
              {isAndroid()
                ? 'Vai in Impostazioni → App → Chrome → Notifiche e abilitale, poi ricarica.'
                : 'Abilita le notifiche nelle impostazioni del browser, poi ricarica la pagina.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const enabled = state === 'granted'

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:bg-[var(--bg-card-hover)]">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/5"
            style={enabled
              ? { background: 'rgba(230,255,61,0.10)', color: 'var(--accent)' }
              : { background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
          >
            {state === 'loading'
              ? <Loader2 size={18} className="animate-spin" />
              : enabled
                ? <Bell size={18} />
                : <BellOff size={18} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <StatusDot active={enabled} />
              <p className="text-sm font-bold text-[var(--text-primary)]">Notifiche push</p>
            </div>
            <p className="gk-caption">
              {enabled
                ? 'Attive anche quando l’app è chiusa'
                : 'Like, commenti, follow e segnali importanti'}
            </p>
          </div>
          <button
            onClick={enabled ? handleDisable : handleEnable}
            disabled={state === 'loading'}
            className="h-9 rounded-2xl px-4 text-xs font-black transition-all disabled:opacity-50"
            style={enabled
              ? { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
              : { background: 'var(--accent)', color: '#0B0B0F' }}
          >
            {state === 'loading' ? '...' : enabled ? 'Disattiva' : 'Attiva'}
          </button>
        </div>
      </div>

      {enabled && isAndroid() && !isPWA() && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0 text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-300/80">
            Per vibrazione e suono su Android, installa Geekore come app:{' '}
            <span className="font-semibold text-amber-300">Chrome → menu ⋮ → Aggiungi a schermata Home</span>
          </p>
        </div>
      )}

      {showAndroidTip && (
        <div className="flex items-start gap-3 rounded-2xl p-3" style={{ background: 'rgba(230,255,61,0.05)', border: '1px solid rgba(230,255,61,0.15)' }}>
          <Smartphone size={15} className="mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(230,255,61,0.7)' }}>
            Notifiche attivate. Controlla anche i permessi in{' '}
            <span className="font-semibold" style={{ color: 'var(--accent)' }}>
              Impostazioni Android → App → Chrome → Notifiche
            </span>
          </p>
        </div>
      )}
    </div>
  )
}
