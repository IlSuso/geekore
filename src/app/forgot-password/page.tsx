'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Mail, Zap, CheckCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://geekore.it/auth/reset-password',
    })
    if (error) {
      setError('Errore nell\'invio. Controlla l\'email e riprova.')
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={36} className="text-emerald-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Email inviata!</h1>
          <p className="text-zinc-400 mb-2">Abbiamo inviato un link per reimpostare la password a</p>
          <p className="text-white font-semibold mb-8">{email}</p>
          <p className="text-zinc-500 text-sm mb-8">Controlla anche la cartella spam. Il link scade dopo 1 ora.</p>
          <Link href="/login" className="inline-flex items-center gap-2 px-8 py-3 border border-zinc-700 hover:border-zinc-500 rounded-full text-sm font-medium transition-colors text-zinc-300">
            Torna al login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tighter text-white">geekore</span>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Password dimenticata?</h1>
          <p className="text-zinc-500">Inserisci la tua email e ti mandiamo un link per reimpostarla.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tuo@email.com"
                required
                className="w-full bg-zinc-900 border border-zinc-800 focus:border-transparent focus:shadow-[0_0_0_2px_rgb(139,92,246)] focus:outline-none rounded-2xl pl-12 pr-5 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-950/60 border border-red-800/50 text-red-400 px-5 py-3.5 rounded-2xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold text-lg transition-all disabled:opacity-60"
          >
            {loading ? 'Invio in corso...' : 'Invia link di reset'}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-sm mt-8">
          Ricordi la password?{' '}
          <Link href="/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
            Accedi
          </Link>
        </p>
      </div>
    </div>
  )
}