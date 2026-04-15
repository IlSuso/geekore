'use client'
// src/components/notifications/PushNotificationsToggle.tsx

import { useState, useEffect } from 'react'
import { Bell, BellOff, Loader2, Smartphone, AlertTriangle } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0)))
}

type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'loading'

// Rileva se siamo su Android
function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)
}

// Rileva se l'app è installata come PWA (standalone)
function isPWA(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true)
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
      } else {
        setState(permission === 'denied' ? 'denied' : 'default')
      }
    } catch {
      setState('default')
    }
  }

  const handleEnable = async () => {
    if (!VAPID_PUBLIC_KEY) {
      showToast('Notifiche push non configurate (VAPID key mancante)', 'error')
      return
    }

    setState('loading')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState('denied')
        showToast('Permesso notifiche negato', 'error')
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
        showToast('Notifiche attivate!')
        // Su Android non-PWA mostra il tip
        if (isAndroid() && !isPWA()) {
          setShowAndroidTip(true)
        }
      } else {
        setState('default')
        showToast('Errore nell\'attivazione delle notifiche', 'error')
      }
    } catch (e: any) {
      setState('default')
      showToast('Errore: ' + (e.message || 'impossibile attivare le notifiche'), 'error')
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
      showToast('Notifiche disattivate')
    } catch {
      setState('granted')
      showToast('Errore nella disattivazione', 'error')
    }
  }

  if (state === 'unsupported') {
    return (
      <div className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl opacity-60">
        <Smartphone size={18} className="text-zinc-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-zinc-400">Notifiche push</p>
          <p className="text-xs text-zinc-600">Non supportate su questo browser</p>
        </div>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
        <BellOff size={18} className="text-red-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-white">Notifiche bloccate</p>
          <p className="text-xs text-zinc-500">
            {isAndroid()
              ? 'Vai in Impostazioni → App → Chrome → Notifiche e abilitale, poi ricarica.'
              : 'Abilita le notifiche nelle impostazioni del browser, poi ricarica la pagina.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
        <div className={`flex-shrink-0 ${state === 'granted' ? 'text-violet-400' : 'text-zinc-500'}`}>
          {state === 'loading'
            ? <Loader2 size={18} className="animate-spin" />
            : state === 'granted'
            ? <Bell size={18} />
            : <BellOff size={18} />
          }
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-white">Notifiche push</p>
          <p className="text-xs text-zinc-500">
            {state === 'granted'
              ? 'Ricevi notifiche anche con l\'app chiusa'
              : 'Ricevi notifiche per like, commenti e follow'}
          </p>
        </div>
        <button
          onClick={state === 'granted' ? handleDisable : handleEnable}
          disabled={state === 'loading'}
          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 ${
            state === 'granted'
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              : 'bg-violet-600 hover:bg-violet-500 text-white'
          }`}
        >
          {state === 'loading' ? '...' : state === 'granted' ? 'Disattiva' : 'Attiva'}
        </button>
      </div>

      {/* FIX: tip Android per installare la PWA e ricevere notifiche native */}
      {state === 'granted' && isAndroid() && !isPWA() && (
        <div className="flex items-start gap-3 p-3 bg-amber-950/40 border border-amber-800/40 rounded-xl">
          <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300/80 leading-relaxed">
            Per ricevere notifiche con vibrazione e suono su Android, installa Geekore come app:{' '}
            <span className="font-semibold text-amber-300">
              Chrome → menu ⋮ → "Aggiungi a schermata Home"
            </span>
          </p>
        </div>
      )}

      {showAndroidTip && (
        <div className="flex items-start gap-3 p-3 bg-violet-950/40 border border-violet-800/40 rounded-xl">
          <Smartphone size={15} className="text-violet-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-violet-300/80 leading-relaxed">
            Notifiche attivate! Assicurati che Chrome abbia i permessi di notifica in{' '}
            <span className="font-semibold text-violet-300">
              Impostazioni Android → App → Chrome → Notifiche
            </span>
          </p>
        </div>
      )}
    </div>
  )
}