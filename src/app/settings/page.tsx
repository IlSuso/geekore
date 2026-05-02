// N1: Aura aggiunto nel ciclo temi
'use client'
// src/app/settings/page.tsx
// M5: Sezione "Sicurezza" con cambio password, logout da tutti i dispositivi, ultimo accesso
// #22: Sezione importazione Xbox aggiunta
// #24: Toggle digest email settimanale

import { useState, useEffect } from 'react'
import { useLocale } from '@/lib/locale'
import { createClient } from '@/lib/supabase/client'
import {
  Settings, Globe, List, TrendingUp, BarChart3, Bell,
  Shield, KeyRound, LogOut, Eye, EyeOff, Loader2, ChevronDown, ChevronUp,
  Mail, Check, Heart, Tv, Monitor, Trash2,
} from 'lucide-react'
import { DeleteAccountModal } from '@/components/profile/DeleteAccountModal'
import { useCsrf } from '@/hooks/useCsrf'
import { PushNotificationsToggle } from '@/components/notifications/PushNotificationsToggle'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ─── Logout semplice ─────────────────────────────────────────────────────────

function LogoutButton() {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  const handleLogout = async () => {
    setLoading(true)
    try {
      await supabase.auth.signOut()
      document.cookie = 'geekore_onboarding_done=; path=/; max-age=0'
      router.push('/login')
    } catch {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="w-full flex items-center gap-3 p-4 hover:bg-red-500/5 transition-colors group"
    >
      <div className="w-9 h-9 bg-red-500/10 rounded-xl flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
        {loading
          ? <Loader2 size={16} className="text-red-400 animate-spin" />
          : <LogOut size={16} className="text-red-400" />}
      </div>
      <div className="text-left">
        <p className="text-sm font-medium text-white group-hover:text-red-300 transition-colors">Esci dall'account</p>
        <p className="text-xs text-zinc-500">Disconnettiti da questo dispositivo</p>
      </div>
    </button>
  )
}

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
        return
      }

      const { error } = await supabase.auth.updateUser({ password: newPass })
      if (error) throw error

      setOpen(false)
      setCurrentPass('')
      setNewPass('')
    } catch {
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
          <div className="w-8 h-8 bg-zinc-800 rounded-xl flex items-center justify-center">
            <KeyRound size={15} style={{ color: 'var(--accent)' }} />
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
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-zinc-600 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
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
              className="w-full bg-zinc-800 border border-zinc-700 focus:border-zinc-600 rounded-xl px-4 py-2.5 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none transition-colors"
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
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'var(--accent)', color: '#0B0B0F' }}
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
      document.cookie = 'geekore_onboarding_done=; path=/; max-age=0'
      router.push('/login')
    } catch {
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
        await fetch('/api/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ digest_enabled: false }),
        })
        setEnabled(false)
        setLoading(false)
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

    await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ digest_enabled: next }),
    })

  }

  return (
    <div className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-2xl">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-zinc-800 rounded-xl flex items-center justify-center">
          <Mail size={15} style={{ color: 'var(--accent)' }} />
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
          className="relative w-11 h-6 rounded-full transition-colors duration-200"
          style={{ background: enabled ? 'var(--accent)' : undefined }}
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

// ─── #8 Platform Awareness — selezione piattaforme streaming ────────────────
// TMDb provider IDs per le principali piattaforme (regione IT)
const STREAMING_PLATFORMS = [
  { id: 8,    name: 'Netflix',        color: 'bg-red-600',      textColor: 'text-red-400',     borderColor: 'border-red-500/40',   logo: '🎬' },
  { id: 119,  name: 'Prime Video',    color: 'bg-sky-600',      textColor: 'text-sky-400',     borderColor: 'border-sky-500/40',   logo: '📦' },
  { id: 337,  name: 'Disney+',        color: 'bg-blue-700',     textColor: 'text-blue-400',    borderColor: 'border-blue-500/40',  logo: '✨' },
  { id: 283,  name: 'Crunchyroll',    color: 'bg-orange-600',   textColor: 'text-orange-400',  borderColor: 'border-orange-500/40',logo: '⛩️' },
  { id: 531,  name: 'Paramount+',     color: 'bg-blue-500',     textColor: 'text-blue-300',    borderColor: 'border-blue-400/40',  logo: '⭐' },
  { id: 39,   name: 'NOW TV',         color: 'bg-lime-600',     textColor: 'text-lime-400',    borderColor: 'border-lime-500/40',  logo: '📡' },
  { id: 35,   name: 'Apple TV+',      color: 'bg-zinc-600',     textColor: 'text-zinc-300',    borderColor: 'border-zinc-500/40',  logo: '🍎' },
  { id: 2,    name: 'Apple iTunes',   color: 'bg-zinc-700',     textColor: 'text-zinc-400',    borderColor: 'border-zinc-600/40',  logo: '💾' },
  { id: 3,    name: 'Google Play',    color: 'bg-green-600',    textColor: 'text-green-400',   borderColor: 'border-green-500/40', logo: '▶️' },
  { id: 192,  name: 'YouTube',        color: 'bg-red-700',      textColor: 'text-red-400',     borderColor: 'border-red-600/40',   logo: '📺' },
  { id: 1773, name: 'MUBI',           color: 'bg-indigo-600',   textColor: 'text-indigo-400',  borderColor: 'border-indigo-500/40',logo: '🎞️' },
  { id: 188,  name: 'Sky Go',         color: 'bg-violet-700',   textColor: 'text-violet-400',  borderColor: 'border-violet-500/40',logo: '☁️' },
] as const

function StreamingPlatformsSelector() {
  const [selected, setSelected] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase
        .from('user_preferences')
        .select('streaming_platforms')
        .eq('user_id', user.id)
        .single()
      if (data?.streaming_platforms) {
        setSelected(data.streaming_platforms as number[])
      }
      setLoading(false)
    }
    load()
  }, [])

  const toggle = (id: number) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  const save = async () => {
    setSaving(true)
    await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streaming_platforms: selected }),
    })
    setSaving(false)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <p className="text-sm text-zinc-400 leading-relaxed">
          Seleziona le piattaforme che hai attivo. I consigli di film e serie verranno
          <span className="font-medium" style={{ color: 'var(--accent)' }}> boostati</span> se disponibili su queste piattaforme.
        </p>
        {selected.length === 0 && !loading && (
          <p className="text-xs text-zinc-600 mt-1">
            Nessuna piattaforma selezionata — i consigli non terranno conto della disponibilità.
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={18} className="text-zinc-600 animate-spin" />
        </div>
      ) : (
        <div className="px-3 pb-3 grid grid-cols-2 gap-2">
          {STREAMING_PLATFORMS.map(({ id, name, textColor, borderColor, logo }) => {
            const isSelected = selected.includes(id)
            return (
              <button
                key={id}
                onClick={() => toggle(id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                  isSelected
                    ? `border ${borderColor} bg-zinc-800 ${textColor}`
                    : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
                }`}
              >
                <span className="text-base leading-none">{logo}</span>
                <span className="truncate">{name}</span>
                {isSelected && <Check size={12} className="ml-auto flex-shrink-0" style={{ color: 'var(--accent)' }} />}
              </button>
            )
          })}
        </div>
      )}

      <div className="px-3 pb-3">
        <button
          onClick={save}
          disabled={saving || loading}
          className="w-full py-2.5 rounded-xl disabled:opacity-50 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          style={{ background: 'var(--accent)', color: '#0B0B0F' }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Salvataggio…' : 'Salva piattaforme'}
        </button>
      </div>
    </div>
  )
}

function DeleteAccountSection() {
  const [showModal, setShowModal] = useState(false)
  const { csrfFetch } = useCsrf()
  const supabase = createClient()

  const handleDelete = async () => {
    const res = await csrfFetch('/api/user/delete', { method: 'DELETE' })
    if (res.ok) {
      await supabase.auth.signOut()
      document.cookie = 'geekore_onboarding_done=; path=/; max-age=0'
      window.location.href = '/'
    } else {
    }
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="w-full flex items-center gap-3 p-4 hover:bg-red-500/5 transition-colors group"
      >
        <div className="w-9 h-9 bg-red-500/10 rounded-xl flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
          <Trash2 size={16} className="text-red-400" />
        </div>
        <div className="text-left">
          <p className="text-sm font-medium text-white group-hover:text-red-300 transition-colors">Elimina account</p>
          <p className="text-xs text-zinc-500">Cancella tutti i tuoi dati in modo permanente</p>
        </div>
      </button>
      {showModal && (
        <DeleteAccountModal
          onConfirm={handleDelete}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

export default function SettingsPage() {
  const { locale, setLocale, t } = useLocale()

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white">
      <div className="max-w-3xl mx-auto px-4 md:px-6 pt-3 md:pt-10 pb-28 space-y-6">

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center">
            <Settings size={20} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="hidden md:block text-3xl font-bold tracking-tight">{t.settings.title}</h1>
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
                      ? ''
                      : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                  style={locale === lang ? { background: 'var(--accent)', color: '#0B0B0F' } : {}}
                >
                  {lang === 'it' ? t.settings.italian : t.settings.english}
                  {locale === lang && <Check size={12} className="text-black" />}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Logout rapido */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <LogOut size={15} className="text-zinc-500" />
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Account</h2>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <LogoutButton />
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

        {/* #8 Piattaforme Streaming */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Tv size={15} className="text-zinc-500" />
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Piattaforme streaming</h2>
          </div>
          <StreamingPlatformsSelector />
        </section>

        {/* Link utili */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={15} className="text-zinc-500" />
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Altro</h2>
          </div>
          <div className="space-y-2">
            {[
              { href: '/stats', icon: BarChart3, color: 'bg-zinc-800', iconColor: '', iconStyle: { color: 'var(--accent)' } as React.CSSProperties, label: 'Tempo sprecato', desc: 'Calcola quante ore hai speso' },
              { href: '/trending', icon: TrendingUp, color: 'bg-zinc-800', iconColor: '', iconStyle: { color: 'var(--accent)' } as React.CSSProperties, label: 'Trending community', desc: 'I più aggiunti questa settimana' },
              { href: '/lists', icon: List, color: 'bg-emerald-500/20', iconColor: 'text-emerald-400', iconStyle: undefined as React.CSSProperties | undefined, label: 'Le mie liste', desc: 'Crea e condividi liste tematiche' },
            ].map(({ href, icon: Icon, color, iconColor, iconStyle, label, desc }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 ${color} rounded-xl flex items-center justify-center`}>
                    <Icon size={16} className={iconColor} style={iconStyle} />
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

        {/* Zona pericolosa */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Trash2 size={15} className="text-zinc-500" />
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Zona pericolosa</h2>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <DeleteAccountSection />
          </div>
        </section>

        <div className="text-center text-zinc-700 text-xs pt-4">
          <span className="inline-flex items-center gap-1">Geekore · {locale === 'it' ? 'Fatto con' : 'Made with'} <Heart size={11} className="text-red-500 fill-red-500" /> {locale === 'it' ? 'per i nerd' : 'for nerds'}</span>
        </div>

        {/* Crediti API — mostrati discretamente in fondo come fanno Letterboxd/Trakt */}
        <div className="flex flex-col items-center gap-3 pt-2 pb-2">
          <p className="text-[10px] text-zinc-700 uppercase tracking-widest">
            {locale === 'it' ? 'Dati forniti da' : 'Data provided by'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 opacity-40 hover:opacity-70 transition-opacity">
            <a href="https://boardgamegeek.com" target="_blank" rel="noopener noreferrer" aria-label="Powered by BoardGameGeek">
              <img
                src="/powered-by-bgg.svg"
                alt="Powered by BGG"
                className="h-5 w-auto"
              />
            </a>
            <span className="text-zinc-700 text-[10px]">TMDb</span>
            <span className="text-zinc-700 text-[10px]">AniList</span>
            <span className="text-zinc-700 text-[10px]">IGDB</span>
          </div>
        </div>
      </div>
    </div>
  )
}
