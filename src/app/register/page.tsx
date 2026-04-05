'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName || email.split('@')[0],
          },
        },
      })

      if (error) {
        setError(error.message)
        return
      }

      setSuccess(true)
    } catch (err: any) {
      setError('Errore durante la registrazione. Riprova più tardi.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="mb-8 text-7xl">📧</div>
          <h1 className="text-4xl font-bold tracking-tighter mb-4">
            Controlla la tua email
          </h1>
          <p className="text-zinc-400 text-lg mb-8">
            Abbiamo inviato un link di conferma a{' '}
            <strong>{email}</strong>.<br />
            Clicca sul link per attivare il tuo account.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-3 border border-zinc-700 hover:border-zinc-500 rounded-full text-sm font-medium transition-colors"
          >
            Torna al Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center pb-20">
      <div className="max-w-md w-full mx-auto px-6">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-bold tracking-tighter mb-3">
            Crea il tuo account
          </h1>
          <p className="text-zinc-400">Unisciti alla community di Geekore</p>
        </div>

        <form onSubmit={handleRegister} className="space-y-6">
          <div>
            <label className="block text-sm text-zinc-400 mb-2">
              Nome visualizzato
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Il tuo nome o nickname"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3 focus:outline-none focus:border-zinc-500 placeholder:text-zinc-500"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tuo@email.com"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3 focus:outline-none focus:border-zinc-500 placeholder:text-zinc-500"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Almeno 6 caratteri"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3 focus:outline-none focus:border-zinc-500 placeholder:text-zinc-500"
            />
          </div>

          {error && (
            <div className="bg-red-950/50 border border-red-900 text-red-400 px-5 py-3 rounded-2xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-white hover:bg-zinc-100 transition-colors text-black font-semibold rounded-2xl disabled:opacity-70"
          >
            {loading ? 'Creazione in corso...' : 'Crea account'}
          </button>
        </form>

        <div className="text-center mt-8 text-zinc-400">
          Hai già un account?{' '}
          <Link href="/login" className="text-white underline">
            Accedi qui
          </Link>
        </div>
      </div>
    </div>
  )
}