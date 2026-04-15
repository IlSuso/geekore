'use client'
// ⚠️ COMPONENTE TEMPORANEO DI DEBUG — rimuovere dopo il fix
// Aggiungilo nella pagina /settings o /notifications:
//
//   import { PushDebugPanel } from '@/components/PushDebugPanel'
//   ...
//   <PushDebugPanel />

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
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testRunning, setTestRunning] = useState(false)

  const log = (type: LogEntry['type'], msg: string) =>
    setLogs(prev => [...prev, { type, msg }])

  const sendTestPush = async () => {
    setTestResult(null)
    setTestRunning(true)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const data = await res.json()
      setTestResult(JSON.stringify(data, null, 2))
    } catch (e: any) {
      setTestResult('❌ Fetch fallita: ' + e.message)
    }
    setTestRunning(false)
  }

  const runDiagnostic = async () => {
    setLogs([])
    setRunning(true)

    log('info', '── 1. VAPID PUBLIC KEY ──')
    if (!VAPID_PUBLIC_KEY) {
      log('error', '❌ NEXT_PUBLIC_VAPID_PUBLIC_KEY è VUOTA!')
    } else {
      log('ok', `✅ VAPID key presente: ${VAPID_PUBLIC_KEY.slice(0, 20)}...`)
    }

    log('info', '── 2. SERVICE WORKER ──')
    if (!('serviceWorker' in navigator)) {
      log('error', '❌ Service Worker NON supportato')
      setRunning(false)
      return
    }
    log('ok', '✅ Service Worker supportato')

    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      if (!reg) {
        log('error', '❌ Nessun SW registrato su scope /')
      } else {
        log('ok', `✅ SW registrato. Scope: ${reg.scope}`)
        log('info', `   Stato: ${reg.active ? 'active' : reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'unknown'}`)
        log('info', `   Script: ${reg.active?.scriptURL || 'n/a'}`)
      }
    } catch (e: any) {
      log('error', `❌ Errore getRegistration: ${e.message}`)
    }

    log('info', '── 3. PUSH MANAGER ──')
    if (!('PushManager' in window)) {
      log('error', '❌ PushManager NON supportato')
      setRunning(false)
      return
    }
    log('ok', '✅ PushManager supportato')

    log('info', '── 4. PERMESSO NOTIFICHE ──')
    const permission = Notification.permission
    if (permission === 'denied') {
      log('error', '❌ Permesso NEGATO — Impostazioni > App > Chrome > Notifiche')
    } else if (permission === 'default') {
      log('warn', '⚠️ Permesso non ancora chiesto')
    } else {
      log('ok', `✅ Permesso: ${permission}`)
    }

    log('info', '── 5. PUSH SUBSCRIPTION ──')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (!sub) {
        log('error', '❌ Nessuna subscription push attiva')
      } else {
        log('ok', `✅ Subscription attiva`)
        log('info', `   Endpoint: ${sub.endpoint.slice(0, 60)}...`)
        log('info', `   p256dh: ${sub.toJSON().keys?.p256dh ? '✅ presente' : '❌ MANCANTE'}`)
        log('info', `   auth: ${sub.toJSON().keys?.auth ? '✅ presente' : '❌ MANCANTE'}`)
      }
    } catch (e: any) {
      log('error', `❌ Errore getSubscription: ${e.message}`)
    }

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
          log('ok', `✅ Subscribe riuscito: ${testSub.endpoint.slice(0, 60)}...`)
        }
      } catch (e: any) {
        log('error', `❌ Subscribe fallito: ${e.message}`)
        if (e.message?.includes('applicationServerKey')) {
          log('error', '   → VAPID key malformata o non corrisponde al server')
        }
      }
    } else {
      log('warn', '⚠️ Skip — VAPID key mancante')
    }

    log('info', '── 7. TEST API /api/push/subscribe ──')
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: { endpoint: 'debug-test', keys: {} } }),
      })
      if (res.status === 401) {
        log('error', '❌ 401 → utente non autenticato')
      } else if (res.status === 400) {
        log('ok', '✅ API raggiungibile (400 atteso per subscription di test)')
      } else if (res.status === 200) {
        log('ok', '✅ API raggiungibile e funzionante')
      } else {
        log('warn', `⚠️ API risponde: ${res.status}`)
      }
    } catch (e: any) {
      log('error', `❌ API non raggiungibile: ${e.message}`)
    }

    log('info', '── 8. MODALITÀ DISPLAY ──')
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const isStandaloneNav = (window.navigator as any).standalone === true
    if (isStandalone || isStandaloneNav) {
      log('ok', '✅ App installata come PWA (standalone)')
    } else {
      log('warn', '⚠️ Aperta nel browser, NON come PWA')
    }

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
      {/* Header + pulsanti */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ color: '#a78bfa', fontWeight: 'bold', fontSize: '14px' }}>🔔 Push Debug</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={runDiagnostic}
            disabled={running}
            style={{
              background: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              cursor: running ? 'not-allowed' : 'pointer',
              opacity: running ? 0.6 : 1,
            }}
          >
            {running ? 'Analisi...' : 'Avvia Diagnosi'}
          </button>
          <button
            onClick={sendTestPush}
            disabled={testRunning}
            style={{
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              cursor: testRunning ? 'not-allowed' : 'pointer',
              opacity: testRunning ? 0.6 : 1,
            }}
          >
            {testRunning ? 'Invio...' : '🚀 Manda Notifica Test'}
          </button>
        </div>
      </div>

      {/* Risultato test push */}
      {testResult && (
        <pre style={{
          background: '#111',
          border: '1px solid #2d2d2d',
          borderRadius: '8px',
          padding: '10px',
          fontSize: '10px',
          color: testResult.includes('success') ? '#4ade80' : '#f87171',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          marginBottom: '12px',
        }}>
          {testResult}
        </pre>
      )}

      {/* Log diagnosi */}
      {logs.length === 0 && !testResult && (
        <p style={{ color: '#555', fontSize: '12px', margin: 0 }}>
          Premi "Avvia Diagnosi" per il report, o "Manda Notifica Test" per testare l'invio server.
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