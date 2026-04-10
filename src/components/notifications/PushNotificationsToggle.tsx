'use client'
// src/components/notifications/PushNotificationsToggle.tsx
// Permette all'utente di abilitare/disabilitare le notifiche push PWA.
// Integrare in /settings o /notifications.

import { useState, useEffect } from 'react'
import { Bell, BellOff, Loader2, Smartphone } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'

// VAPID public key — impostare in .env.local come NEXT_PUBLIC_VAPID_PUBLIC_KEY
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0)))
}

type PushState = 'unsupported' | 'default' | 'granted' | 'denied' | 'loading'

export function PushNotificationsToggle() {
  const [state, setState] = useState<PushState>('loading')
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)

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
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as Uint8Array<ArrayBuffer>,,
      })

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })

      if (res.ok) {
        setSubscription(sub)
        setState('granted')
        showToast('Notifiche attivate! 🔔')
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
            Abilita le notifiche nelle impostazioni del browser, poi ricarica la pagina.
          </p>
        </div>
      </div>
    )
  }

  return (
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
  )
}