'use client'
// src/app/profile/setup/page.tsx
// Pagina obbligatoria per chi si registra senza username.
// Raggiunta da /profile/me se username è null.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Zap, Check, X, Loader2, AtSign } from 'lucide-react'

const USERNAME_REGEX = /^[a-z0-9_]+$/
const MIN = 3
const MAX = 30

type ValidationState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

export default function ProfileSetupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [validState, setValidState] = useState<ValidationState>('idle')
  const [validationMessage, setValidationMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      // Se ha già uno username, mandiamolo al profilo
      supabase.from('profiles').select('username').eq('id', user.id).single().then(({ data }) => {
        if (data?.username) router.push(`/profile/${data.username}`)
      })
    })
  }, [])

  const checkUsername = useCallback(async (value: string) => {
    const v = value.trim().toLowerCase()
    if (v.length < MIN) {
      setValidState('invalid')
      setValidationMessage(`Minimo ${MIN} caratteri`)
      return
    }
    if (v.length > MAX) {
      setValidState('invalid')
      setValidationMessage(`Massimo ${MAX} caratteri`)
      return
    }
    if (!USERNAME_REGEX.test(v)) {
      setValidState('invalid')
      setValidationMessage('Solo lettere minuscole, numeri e underscore ( _ )')
      return
    }
    const reserved = ['admin', 'geekore', 'support', 'api', 'me', 'root', 'null', 'undefined']
    if (reserved.includes(v)) {
      setValidState('invalid')
      setValidationMessage('Username non disponibile')
      return
    }

    setValidState('checking')
    setValidationMessage('Controllo disponibilità...')

    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', v)
      .maybeSingle()

    if (data) {
      setValidState('taken')
      setValidationMessage('Username già in uso')
    } else {
      setValidState('available')
      setValidationMessage('Disponibile!')
    }
  }, [supabase])

  useEffect(() => {
    if (!username) { setValidState('idle'); setValidationMessage(''); return }
    const timer = setTimeout(() => checkUsername(username), 500)
    return () => clearTimeout(timer)
  }, [username, checkUsername])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || validState !== 'available' || saving) return

    setSaving(true)
    setError('')

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        username: username.trim().toLowerCase(),
        display_name: displayName.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (updateError) {
      if (updateError.code === '23505') {
        setError('Username già in uso, scegline un altro')
        setValidState('taken')
        setValidationMessage('Username già in uso')
      } else {
        setError('Errore nel salvataggio. Riprova.')
      }
      setSaving(false)
      return
    }

    router.push('/onboarding')
  }

  const getInputBorderClass = () => {
    if (validState === 'available') return 'border-emerald-500 focus:border-emerald-400'
    if (validState === 'taken' || validState === 'invalid') return 'border-red-500 focus:border-red-400'
    return 'border-zinc-700 focus:border-zinc-600'
  }

  const getValidationIcon = () => {
    if (validState === 'checking') return <Loader2 size={16} className="animate-spin text-zinc-400" />
    if (validState === 'available') return <Check size={16} className="text-emerald-400" />
    if (validState === 'taken' || validState === 'invalid') return <X size={16} className="text-red-400" />
    return null
  }

  const getValidationTextClass = () => {
    if (validState === 'available') return 'text-emerald-400'
    if (validState === 'taken' || validState === 'invalid') return 'text-red-400'
    return 'text-zinc-500'
  }

  const canSubmit = validState === 'available' && !saving

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <Zap size={20} className="text-black" />
          </div>
          <span className="text-2xl font-bold tracking-tighter text-white">geekore</span>
        </div>

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-black tracking-tighter text-white mb-2">
            Scegli il tuo username
          </h1>
          <p className="text-zinc-400">
            Prima di iniziare, hai bisogno di un nome univoco. Potrai cambiarlo in seguito dalle impostazioni.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Username <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
                <AtSign size={18} />
              </div>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, MAX))}
                placeholder="il_tuo_nome"
                className={`w-full bg-zinc-900 border ${getInputBorderClass()} rounded-2xl pl-10 pr-10 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors`}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                {getValidationIcon()}
              </div>
            </div>
            {validationMessage && (
              <p className={`text-xs mt-2 ${getValidationTextClass()}`}>
                {validationMessage}
              </p>
            )}
            {!validationMessage && (
              <p className="text-xs mt-2 text-zinc-600">
                Solo lettere minuscole, numeri e underscore. {MIN}–{MAX} caratteri.
              </p>
            )}
          </div>

          {/* Display name (opzionale) */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Nome visualizzato <span className="text-zinc-600 font-normal">(opzionale)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value.slice(0, 50))}
              placeholder="Come ti chiami?"
              className="w-full bg-zinc-900 border border-zinc-700 focus:border-zinc-600 rounded-2xl px-4 py-3.5 text-white placeholder-zinc-600 focus:outline-none transition-colors"
            />
            <p className="text-xs mt-2 text-zinc-600">
              Il nome che vedranno gli altri. Puoi cambiarlo quando vuoi.
            </p>
          </div>

          {error && (
            <div className="bg-red-950/60 border border-red-800/50 text-red-400 px-4 py-3 rounded-2xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-4 rounded-2xl font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            style={{ background: 'var(--accent)', color: '#0B0B0F' }}
          >
            {saving ? (
              <><Loader2 size={20} className="animate-spin" /> Salvataggio...</>
            ) : (
              'Continua'
            )}
          </button>
        </form>

        <p className="text-center text-zinc-600 text-xs mt-8">
          Registrandoti accetti i nostri{' '}
          <a href="/terms" className="hover:text-zinc-400 transition-colors underline">Termini di servizio</a>
          {' '}e la{' '}
          <a href="/privacy" className="hover:text-zinc-400 transition-colors underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  )
}
