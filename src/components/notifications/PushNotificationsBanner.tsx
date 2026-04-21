'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Bell, X } from 'lucide-react'
import { showToast } from '@/components/ui/Toast'

const SKIP_PATHS = ['/login', '/register', '/forgot-password', '/onboarding', '/auth']

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const DISMISSED_KEY = 'push-banner-dismissed-v1'
const PWA_HANDLED_KEY = 'pwa-handled'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}

export function PushNotificationsBanner() {
  const pathname = usePathname()
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (SKIP_PATHS.some(p => pathname.startsWith(p))) return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (!VAPID_PUBLIC_KEY) return
    if (Notification.permission !== 'default') return
    if (localStorage.getItem(DISMISSED_KEY)) return

    // Appare solo DOPO che la PWA è stata gestita (installata o dismissata)
    // e solo dopo 30 secondi per non sovrapporsi
    const checkAndShow = () => {
      const pwaHandled = localStorage.getItem(PWA_HANDLED_KEY)
      const pwaShowing = localStorage.getItem('pwa-showing')
      if (!pwaHandled || pwaShowing) {
        // PWA non ancora gestita o ancora visibile — riprova tra 5 secondi
        setTimeout(checkAndShow, 5000)
        return
      }
      // PWA gestita e non più visibile → aspetta 10s poi mostra notifiche
      setTimeout(() => setShow(true), 10_000)
    }

    // Inizia il check dopo 15 secondi dal mount
    const t = setTimeout(checkAndShow, 15_000)
    return () => clearTimeout(t)
  }, [])

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  const handleEnable = async () => {
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        showToast('Permesso negato — puoi abilitarle dalle impostazioni', 'error')
        dismiss()
        return
      }
      const reg = await navigator.serviceWorker.ready
      const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
      const jsonSub = sub.toJSON()
      const subscriptionForServer = {
        endpoint: sub.endpoint,
        keys: { p256dh: jsonSub.keys?.p256dh ?? '', auth: jsonSub.keys?.auth ?? '' },
      }
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscriptionForServer }),
      })
      if (res.ok) {
        showToast('Notifiche attivate!')
        localStorage.setItem(DISMISSED_KEY, '1')
        setShow(false)
      } else {
        showToast('Errore nell\'attivazione', 'error')
      }
    } catch (e: any) {
      showToast('Errore: ' + (e.message || 'riprova'), 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!show) return null

  return (
    <div className="fixed bottom-24 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-80 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-violet-500/20 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
            <Bell size={16} className="text-violet-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Abilita le notifiche</p>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              Ricevi avvisi per follow, like e commenti anche con l'app chiusa.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={handleEnable} disabled={loading}
                className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 rounded-xl text-xs font-semibold text-white transition-colors">
                {loading ? 'Attivazione…' : 'Attiva'}
              </button>
              <button onClick={dismiss}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-xs text-zinc-400 transition-colors">
                Dopo
              </button>
            </div>
          </div>
          <button onClick={dismiss} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}