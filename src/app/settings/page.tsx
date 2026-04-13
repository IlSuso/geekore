// N1: Aura aggiunto nel ciclo temi
'use client'
// src/app/settings/page.tsx
// M5: Sezione "Sicurezza" con cambio password, logout da tutti i dispositivi, ultimo accesso
// #22: Sezione importazione Xbox aggiunta
// #24: Toggle digest email settimanale

import { useState, useEffect } from 'react'
import { useLocale } from '@/lib/locale'
import { useTheme } from '@/lib/theme'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/components/ui/Toast'
import {
  Settings, Globe, Sun, Moon, List, TrendingUp, BarChart3, Bell,
  Shield, KeyRound, LogOut, Eye, EyeOff, Loader2, ChevronDown, ChevronUp,
  Circle, Sparkles, Mail, Check, Heart,
} from 'lucide-react'
import { PushNotificationsToggle } from '@/components/notifications/PushNotificationsToggle'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── M5: Sezione cambio password ─────────────────────────────────────────────

function ChangePasswordSheet() {
  const [open, setOpen] = useState(false)
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPass.length < 8) {
      showToast('La nuova password deve avere almeno 8 caratteri')
      return
    }
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Utente non trovato')

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPass,
      })
      if (signInError) {
        showToast('Password attuale non corretta')
        return
      }

      const { error } = await supabase.auth.updateUser({ password: newPass })
      if (error) throw error

      showToast('Password aggiornata con successo')
      setOpen(false)
      setCurrentPass('')
      setNewPass('')
    } catch {
      showToast('Errore durante il cambio password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-500/20 rounded-xl flex items-center justify-center">
            <KeyRound size={15} className="text-violet-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-white">Cambia password</p>
            <p className="text-xs text-zinc-500">Aggiorna le credenziali di accesso</p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-3 border-t border-zinc-800 pt-4">
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              placeholder="Password attuale"
              value={currentPass}
              onChange={e => setCurrentPass(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
              required
            />
            <button type="button" onClick={() => setShowCurrent(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              placeholder="Nuova password (min. 8 caratteri)"
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-violet-500 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
              minLength={8}
              required
            />
            <button type="button" onClick={() => setShowNew(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? 'Aggiornamento...' : 'Aggiorna password'}
          </button>
        </form>
      )}
    </div>
  )
}

// ─── M5: Logout globale ───────────────────────────────────────────────────────

function GlobalLogoutButton() {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const handleGlobalLogout = async () => {
    if (!confirm('Verrai disconnesso da tutti i dispositivi. Continuare?')) return
    setLoading(true)
    try {
      await supabase.auth.signOut({ scope: 'global' })
      router.push('/login')
    } catch {
      showToast('Errore durante il logout globale')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleGlobalLogout}
      disabled={loading}
      className="w-full flex items-center gap-3 p-4 border border-zinc-800 rounded-2xl hover:border-red-500/40 hover:bg-red-500/5 transition-all group"
    >
      <div className="w-8 h-8 bg-red-500/20 rounded-xl flex items-center justify-center">
        {loading
          ? <Loader2 size={15} className="text-red-400 animate-spin" />
          : <LogOut size={15} className="text-red-400" />}
      </div>
      <div className="text-left">
        <p className="text-sm font-medium text-white group-hover:text-red-400 transition-colors">Esci da tutti i dispositivi</p>
        <p className="text-xs text-zinc-500">Invalida tutte le sessioni attive</p>
      </div>
    </button>
  )
}

// ─── M5: Ultimo accesso ───────────────────────────────────────────────────────

function LastAccessInfo() {
  const [info, setInfo] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      const ts = (user as any)?.last_sign_in_at
      if (ts) {
        setInfo(new Date(ts).toLocaleString('it-IT', {
          day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }))
      }
    })
  }, [])

  if (!info) return null

  return (
    <p className="text-xs text-zinc-600 px-4 pb-3">
      Sessione corrente iniziata il {info}
    </p>
  )
}

// ─── #24 Toggle digest email settimanale ─────────────────────────────────────

function DigestToggle() {
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // Gestisce digest=off da URL (link unsubscribe nelle email)
      const params = new URLSearchParams(window.location.search)
      if (params.get('digest') === 'off') {
        await supabase.from('user_preferences').upsert({
          user_id: user.id,
          digest_enabled: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        setEnabled(false)
        setLoading(false)
        showToast('Digest settimanale disattivato')
        // Rimuovi il param dall'URL senza ricaricare la pagina
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      const { data } = await supabase
        .from('user_preferences')
        .select('digest_enabled')
        .eq('user_id', user.id)
        .single()

      // Default true se il campo non esiste ancora
      setEnabled(data?.digest_enabled !== false)
      setLoading(false)
    }
    load()
  }, [])

  const toggle = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const next = !enabled
    setEnabled(next)

    await supabase.from('user_preferences').upsert({
      user_id: user.id,
      digest_enabled: next,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    showToast(next ? 'Digest settimanale attivato' : 'Digest settimanale disattivato')
  }

  return (
    <div className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-violet-500/20 rounded-xl flex items-center justify-center">
          <Mail size={15} className="text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">Digest settimanale</p>
          <p className="text-xs text-zinc-500">Riepilogo ogni lunedì: gusti, completati, trending</p>
        </div>
      </div>

      {loading ? (
        <Loader2 size={18} className="text-zinc-600 animate-spin" />
      ) : (
        <button
          onClick={toggle}
          className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
            enabled ? 'bg-violet-600' : 'bg-zinc-700'
          }`}
          aria-label={enabled ? 'Disattiva digest' : 'Attiva digest'}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      )}
    </div>
  )
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function SettingsPage() {
  const { locale, setLocale, t } = useLocale()
  const { theme, setTheme } = useTheme()

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-xl mx-auto px-6 pt-10 pb-24 space-y-6">

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center">
            <Settings size={20} className="text-violet-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{t.settings.title}</h1>
        </div>

        {/* Lingua */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Globe size={15} className="text-zinc-500" />
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">{t.settings.language}</h2>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <p className="text-sm text-zinc-500 px-5 pt-4 pb-3">{t.settings.languageDesc}</p>
            <div className="flex p-3 gap-2">
              {(['it', 'en'] as const).map(lang => (
                <button
                  key={lang}
                  onClick={() => setLocale(lang)}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all ${
                    locale === lang
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  {lang === 'it' ? t.settings.italian : t.settings.english}
                  {locale === lang && <Check size={12} className="text-violet-300" />}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Tema */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            {theme === 'dark' ? <Moon size={15} className="text-zinc-500" /> : <Sun size={15} className="text-zinc-500" />}
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Tema</h2>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-2 gap-2 p-3">
              {([
                { id: 'dark'  as const, label: 'Scuro',   Icon: Moon     },
                { id: 'light' as const, label: 'Chiaro',  Icon: Sun      },
                { id: 'oled'  as const, label: 'OLED',    Icon: Circle   },
                { id: 'aura'  as const, label: 'Aura', Icon: Sparkles },
              ]).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all ${
                    theme === id
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  <Icon size={14} /> {label}
                  {theme === id && <Check size={12} className="text-violet-300" />}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* M5: Sicurezza */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Shield size={15} className="text-zinc-500" />
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Sicurezza</h2>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden space-y-0 divide-y divide-zinc-800">
            <ChangePasswordSheet />
            <div className="p-4">
              <GlobalLogoutButton />
            </div>
            <LastAccessInfo />
          </div>
        </section>

        {/* Notifiche push + digest */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Bell size={15} className="text-zinc-500" />
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Notifiche</h2>
          </div>
          <div className="space-y-3">
            <PushNotificationsToggle />
            <DigestToggle />
          </div>
        </section>

        {/* Link utili */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={15} className="text-zinc-500" />
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Altro</h2>
          </div>
          <div className="space-y-2">
            {[
              { href: '/stats', icon: BarChart3, color: 'bg-violet-500/20', iconColor: 'text-violet-400', label: 'Tempo sprecato', desc: 'Calcola quante ore hai speso' },
              { href: '/trending', icon: TrendingUp, color: 'bg-fuchsia-500/20', iconColor: 'text-fuchsia-400', label: 'Trending community', desc: 'I più aggiunti questa settimana' },
              { href: '/lists', icon: List, color: 'bg-emerald-500/20', iconColor: 'text-emerald-400', label: 'Le mie liste', desc: 'Crea e condividi liste tematiche' },
            ].map(({ href, icon: Icon, color, iconColor, label, desc }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center`}>
                    <Icon size={16} className={iconColor} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{label}</p>
                    <p className="text-xs text-zinc-500">{desc}</p>
                  </div>
                </div>
                <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
              </Link>
            ))}
          </div>
        </section>

        <div className="text-center text-zinc-700 text-xs pt-4">
          <span className="inline-flex items-center gap-1">Geekore · {locale === 'it' ? 'Fatto con' : 'Made with'} <Heart size={11} className="text-red-500 fill-red-500" /> {locale === 'it' ? 'per i nerd' : 'for nerds'}</span>
        </div>
      </div>
    </div>
  )
}