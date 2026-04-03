'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username,
          display_name: username,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      alert('Registrazione completata! Controlla la mail o prova ad accedere.')
      router.push('/auth/login')
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-[#16161e] p-8 rounded-2xl border border-white/10 shadow-2xl">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">Unisciti a noi</h1>
        
        <form onSubmit={handleRegister} className="space-y-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-[#0a0a0f] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-[#7c6af7] outline-none"
            required
          />
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
            placeholder="Password (min. 6 caratteri)"
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
            {loading ? 'Registrazione...' : 'Crea Account'}
          </button>
        </form>
        
        <p className="mt-6 text-center text-gray-400 text-sm">
          Hai già un account? <Link href="/auth/login" className="text-[#7c6af7] hover:underline">Accedi</Link>
        </p>
      </div>
    </div>
  )
}
