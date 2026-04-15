'use client'
// ⚠️ COMPONENTE TEMPORANEO DI DEBUG — rimuovere dopo il fix
// Aggiungilo nella pagina /settings o /notifications:
//
//   import { PushDebugPanel } from '@/components/PushDebugPanel'
//   ...
//   <PushDebugPanel />
//
// Mostra un pannello visibile sullo schermo che diagnostica
// tutto il sistema push senza bisogno di DevTools.

import { useState } from 'react'

interface LogEntry {
  type: 'ok' | 'error' | 'warn' | 'info'
  msg: string
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0)))
}

export function PushDebugPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [running, setRunning] = useState(false)

  const log = (type: LogEntry['type'], msg: string) =>
    setLogs(prev => [...prev, { type, msg }])

  const runDiagnostic = async () => {
    setLogs([])
    setRunning(true)

    // 1. VAPID key
    log('info', '── 1. VAPID PUBLIC KEY ──')
    if (!VAPID_PUBLIC_KEY) {
      log('error', '❌ NEXT_PUBLIC_VAPID_PUBLIC_KEY è VUOTA! La variabile non è configurata su Vercel o non inizia con NEXT_PUBLIC_')
    } else {
      log('ok', `✅ VAPID key presente: ${VAPID_PUBLIC_KEY.slice(0, 20)}...`)
    }

    // 2. Service Worker support
    log('info', '── 2. SERVICE WORKER ──')
    if (!('serviceWorker' in navigator)) {
      log('error', '❌ Service Worker NON supportato da questo browser')
      setRunning(false)
      return
    }
    log('ok', '✅ Service Worker supportato')

    // 3. SW registrato?
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      if (!reg) {
        log('error', '❌ Nessun Service Worker registrato su scope /  → il componente ServiceWorkerRegistrar non ha funzionato')
      } else {
        log('ok', `✅ SW registrato. Scope: ${reg.scope}`)
        log('info', `   Stato: ${reg.active ? 'active' : reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'unknown'}`)
        log('info', `   Script: ${reg.active?.scriptURL || 'n/a'}`)
      }
    } catch (e: any) {
      log('error', `❌ Errore getRegistration: ${e.message}`)
    }

    // 4. PushManager support
    log('info', '── 3. PUSH MANAGER ──')
    if (!('PushManager' in window)) {
      log('error', '❌ PushManager NON supportato → su iOS devi usare Safari 16.4+ e installare la PWA')
      setRunning(false)
      return
    }
    log('ok', '✅ PushManager supportato')

    // 5. Permesso notifiche
    log('info', '── 4. PERMESSO NOTIFICHE ──')
    const permission = Notification.permission
    if (permission === 'denied') {
      log('error', '❌ Permesso NEGATO — vai in Impostazioni > App > Chrome > Notifiche e abilitale')
    } else if (permission === 'default') {
      log('warn', '⚠️ Permesso non ancora chiesto (default) — premi "Attiva" nel toggle notifiche')
    } else {
      log('ok', `✅ Permesso: ${permission}`)
    }

    // 6. Subscription attiva?
    log('info', '── 5. PUSH SUBSCRIPTION ──')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) {
        log('error', '❌ Nessuna subscription push attiva → premi "Attiva" nel toggle notifiche')
      } else {
        log('ok', `✅ Subscription attiva`)
        log('info', `   Endpoint: ${sub.endpoint.slice(0, 60)}...`)
        log('info', `   p256dh: ${sub.toJSON().keys?.p256dh ? '✅ presente' : '❌ MANCANTE'}`)
        log('info', `   auth: ${sub.toJSON().keys?.auth ? '✅ presente' : '❌ MANCANTE'}`)
      }
    } catch (e: any) {
      log('error', `❌ Errore getSubscription: ${e.message}`)
    }

    // 7. Test subscribe con VAPID key (solo se non già iscritto)
    log('info', '── 6. TEST SUBSCRIBE VAPID ──')
    if (VAPID_PUBLIC_KEY) {
      try {
        const reg = await navigator.serviceWorker.ready
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          log('ok', '✅ Già iscritto — skip test subscribe')
        } else {
          const testSub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as Uint8Array<ArrayBuffer>,
          })
          log('ok', `✅ Subscribe con VAPID riuscito! Endpoint: ${testSub.endpoint.slice(0, 60)}...`)
          // Non disiscrivo — lo lasciamo attivo
        }
      } catch (e: any) {
        log('error', `❌ Subscribe fallito: ${e.message}`)
        if (e.message?.includes('applicationServerKey')) {
          log('error', '   → La VAPID key è malformata o non corrisponde a quella del server')
        }
        if (e.message?.includes('permission')) {
          log('error', '   → Permesso notifiche mancante')
        }
      }
    } else {
      log('warn', '⚠️ Skip test subscribe — VAPID key mancante')
    }

    // 8. Test chiamata API /api/push/subscribe
    log('info', '── 7. TEST API /api/push/subscribe ──')
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: { endpoint: 'debug-test', keys: {} } }),
      })
      if (res.status === 401) {
        log('error', '❌ API risponde 401 → utente non autenticato')
      } else if (res.status === 400) {
        log('ok', '✅ API raggiungibile (400 = subscription non valida, ma il server risponde)')
      } else if (res.status === 200) {
        log('ok', '✅ API raggiungibile e funzionante')
      } else {
        log('warn', `⚠️ API risponde: ${res.status}`)
      }
    } catch (e: any) {
      log('error', `❌ API non raggiungibile: ${e.message}`)
    }

    // 9. PWA / display mode
    log('info', '── 8. MODALITÀ DISPLAY ──')
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const isStandaloneNav = (window.navigator as any).standalone === true
    if (isStandalone || isStandaloneNav) {
      log('ok', '✅ App installata come PWA (standalone) — ottimo per notifiche Android')
    } else {
      log('warn', '⚠️ App aperta nel browser, NON installata come PWA → su Android le notifiche potrebbero non arrivare. Installa la PWA: Chrome → ⋮ → Aggiungi a schermata Home')
    }

    // 10. User Agent
    log('info', '── 9. USER AGENT ──')
    log('info', navigator.userAgent)

    setRunning(false)
  }

  const colorMap = {
    ok: '#4ade80',
    error: '#f87171',
    warn: '#fbbf24',
    info: '#94a3b8',
  }

  return (
    <div style={{
      margin: '16px',
      padding: '16px',
      background: '#0f0f0f',
      border: '1px solid #333',
      borderRadius: '12px',
      fontFamily: 'monospace',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ color: '#a78bfa', fontWeight: 'bold', fontSize: '14px' }}>🔔 Push Debug</span>
        <button
          onClick={runDiagnostic}
          disabled={running}
          style={{
            background: '#7c3aed',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '6px 14px',
            fontSize: '12px',
            cursor: running ? 'not-allowed' : 'pointer',
            opacity: running ? 0.6 : 1,
          }}
        >
          {running ? 'Analisi...' : 'Avvia Diagnosi'}
        </button>
      </div>

      {logs.length === 0 && (
        <p style={{ color: '#555', fontSize: '12px', margin: 0 }}>
          Premi "Avvia Diagnosi" per vedere il report completo
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {logs.map((entry, i) => (
          <span key={i} style={{ fontSize: '11px', color: colorMap[entry.type], lineHeight: 1.5 }}>
            {entry.msg}
          </span>
        ))}
      </div>
    </div>
  )
}