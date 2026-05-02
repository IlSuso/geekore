'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Zap, CheckCircle, Loader2 } from 'lucide-react'

function ResetContent() {
  const router = useRouter()
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [sessionReady, setSessionReady] = useState(false)

  useEffect(() => {
    // Supabase scrive la sessione nei cookie quando arriva il token dall'URL
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setSessionReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) { setError('La password deve essere almeno 6 caratteri.'); return }
    if (password !== confirm) { setError('Le password non coincidono.'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError('Errore nel reset. Il link potrebbe essere scaduto.')
    } else {
      setDone(true)
      setTimeout(() => router.push('/login'), 2500)
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
        <div className="text-center">
          <CheckCircle size={56} className="mx-auto mb-6 text-emerald-400" />
          <h1 className="text-2xl font-bold text-white mb-2">Password aggiornata!</h1>
          <p className="text-zinc-400">Ti stiamo portando al login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: '#E6FF3D' }}>
            <Zap size={20} className="text-black" />
          </div>
          <span className="text-2xl font-bold tracking-tighter text-white">geekore</span>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Nuova password</h1>
          <p className="text-zinc-500">Scegli una nuova password per il tuo account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Nuova password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Almeno 6 caratteri"
                minLength={6}
                required
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-2xl px-5 py-3.5 pr-12 text-white placeholder-zinc-600 focus:outline-none transition-colors"
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Conferma password</label>
            <input
              type={showPw ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Ripeti la password"
              required
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-600 rounded-2xl px-5 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors"
            />
          </div>

          {error && (
            <div className="bg-red-950/60 border border-red-800/50 text-red-400 px-5 py-3.5 rounded-2xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl font-semibold text-lg transition-all disabled:opacity-60"
            style={{ background: '#E6FF3D', color: '#0B0B0F' }}
          >
            {loading ? 'Aggiornamento...' : 'Aggiorna password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    }>
      <ResetContent />
    </Suspense>
  )
}