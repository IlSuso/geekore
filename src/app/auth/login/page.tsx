'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError("Email o password errati. Controlla anche di aver confermato l'email se richiesto.")
      setLoading(false)
    } else {
      // Importante: il refresh serve a far leggere i nuovi cookie al proxy.ts
      router.push('/feed')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-[#16161e] p-8 rounded-2xl border border-white/10 shadow-2xl">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">Bentornato</h1>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#0a0a0f] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-[#7c6af7] outline-none"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-[#0a0a0f] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-[#7c6af7] outline-none"
            required
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#7c6af7] text-white font-bold py-3 rounded-lg hover:bg-[#6b58e6] disabled:opacity-50 transition-all"
          >
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
        </form>
        
        <p className="mt-6 text-center text-gray-400 text-sm">
          Non hai un account? <Link href="/auth/register" className="text-[#7c6af7] hover:underline">Registrati</Link>
        </p>
      </div>
    </div>
  )
}
