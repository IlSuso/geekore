// N1: Aura aggiunto nel ciclo temi
'use client'
// src/app/settings/page.tsx
// M5: Sezione "Sicurezza" con cambio password, logout da tutti i dispositivi, ultimo accesso
// #22: Sezione importazione Xbox aggiunta
// #24: Toggle digest email settimanale

import { useState, useEffect } from 'react'
import { useLocale } from '@/lib/locale'
import { appCopy } from '@/lib/i18n/appCopy'
import { createClient } from '@/lib/supabase/client'
import {
  Globe, List, TrendingUp, BarChart3, Bell,
  Shield, KeyRound, LogOut, Eye, EyeOff, Loader2, ChevronDown, ChevronUp,
  Mail, Check, Heart, Tv, Trash2,
} from 'lucide-react'
import { DeleteAccountModal } from '@/components/profile/DeleteAccountModal'
import { useCsrf } from '@/hooks/useCsrf'
import { PushNotificationsToggle } from '@/components/notifications/PushNotificationsToggle'
import { PageScaffold } from '@/components/ui/PageScaffold'
import { SettingsControlHero } from '@/components/settings/SettingsControlHero'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[var(--text-muted)]">{icon}</span>
        <h2 className="gk-label">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function SettingsCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--bg-card)] ${className}`}>
      {children}
    </div>
  )
}

function ActionIcon({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  return (
    <div
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl ring-1 ring-white/5 transition-colors"
      style={danger
        ? { background: 'rgba(248,113,113,0.10)', color: '#f87171' }
        : { background: 'rgba(230,255,61,0.08)', color: 'var(--accent)' }}
    >
      {children}
    </div>
  )
}

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
      type="button"
      data-no-swipe="true"
      onClick={handleLogout}
      disabled={loading}
      className="group flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-red-500/5 disabled:opacity-60"
    >
      <ActionIcon danger>
        {loading ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
      </ActionIcon>
      <div>
        <p className="text-sm font-bold text-[var(--text-primary)] transition-colors group-hover:text-red-300">Esci dall'account</p>
        <p className="gk-caption">Disconnettiti da questo dispositivo</p>
      </div>
    </button>
  )
}

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
    if (newPass.length < 8) return
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) throw new Error('Utente non trovato')

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPass,
      })
      if (signInError) return

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
    <div className="overflow-hidden rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)]">
      <button
        type="button"
        data-no-swipe="true"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between p-4 transition-colors hover:bg-[var(--bg-card-hover)]"
      >
        <div className="flex items-center gap-3">
          <ActionIcon><KeyRound size={15} /></ActionIcon>
          <div className="text-left">
            <p className="text-sm font-bold text-[var(--text-primary)]">Cambia password</p>
            <p className="gk-caption">Aggiorna le credenziali di accesso</p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-[var(--text-muted)]" /> : <ChevronDown size={16} className="text-[var(--text-muted)]" />}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-[var(--border)] px-4 pb-4 pt-4">
          <div className="relative">
            <input
              data-no-swipe="true"
              type={showCurrent ? 'text' : 'password'}
              placeholder="Password attuale"
              value={currentPass}
              onChange={e => setCurrentPass(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5 pr-10 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
              required
            />
            <button type="button" data-no-swipe="true" onClick={() => setShowCurrent(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="relative">
            <input
              data-no-swipe="true"
              type={showNew ? 'text' : 'password'}
              placeholder="Nuova password (min. 8 caratteri)"
              value={newPass}
              onChange={e => setNewPass(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5 pr-10 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] transition-colors focus:border-[rgba(230,255,61,0.45)]"
              minLength={8}
              required
            />
            <button type="button" data-no-swipe="true" onClick={() => setShowNew(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
              {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            type="submit"
            data-no-swipe="true"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-black transition-colors disabled:opacity-60"
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
      type="button"
      data-no-swipe="true"
      onClick={handleGlobalLogout}
      disabled={loading}
      className="group flex w-full items-center gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] p-4 text-left transition-all hover:border-red-500/35 hover:bg-red-500/5 disabled:opacity-60"
    >
      <ActionIcon danger>
        {loading ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
      </ActionIcon>
      <div>
        <p className="text-sm font-bold text-[var(--text-primary)] transition-colors group-hover:text-red-300">Esci da tutti i dispositivi</p>
        <p className="gk-caption">Invalida tutte le sessioni attive</p>
      </div>
    </button>
  )
}

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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return null

  return (
    <p className="gk-caption px-1 pt-1">
      Sessione corrente iniziata il {info}
    </p>
  )
}

function DigestToggle() {
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const params = new URLSearchParams(window.location.search)
      if (params.get('digest') === 'off') {
        await fetch('/api/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ digest_enabled: false }),
        })
        setEnabled(false)
        setLoading(false)
        window.history.replaceState({}, '', window.location.pathname)
        return
      }

      const { data } = await supabase
        .from('user_preferences')
        .select('digest_enabled')
        .eq('user_id', user.id)
        .single()

      setEnabled(data?.digest_enabled !== false)
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="flex items-center justify-between gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="flex min-w-0 items-center gap-3">
        <ActionIcon><Mail size={15} /></ActionIcon>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--text-primary)]">Digest settimanale</p>
          <p className="gk-caption line-clamp-1">Riepilogo ogni lunedì: gusti, completati, trending</p>
        </div>
      </div>

      {loading ? (
        <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
      ) : (
        <button
          type="button"
          data-no-swipe="true"
          onClick={toggle}
          className="relative h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200"
          style={{ background: enabled ? 'var(--accent)' : 'var(--bg-secondary)' }}
          aria-label={enabled ? 'Disattiva digest' : 'Attiva digest'}
        >
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      )}
    </div>
  )
}

const STREAMING_PLATFORMS = [
  { id: 8, name: 'Netflix', color: 'bg-red-600', textColor: 'text-red-400', borderColor: 'border-red-500/40', logo: '🎬' },
  { id: 119, name: 'Prime Video', color: 'bg-sky-600', textColor: 'text-sky-400', borderColor: 'border-sky-500/40', logo: '📦' },
  { id: 337, name: 'Disney+', color: 'bg-blue-700', textColor: 'text-blue-400', borderColor: 'border-blue-500/40', logo: '✨' },
  { id: 283, name: 'Crunchyroll', color: 'bg-orange-600', textColor: 'text-orange-400', borderColor: 'border-orange-500/40', logo: '⛩️' },
  { id: 531, name: 'Paramount+', color: 'bg-blue-500', textColor: 'text-blue-300', borderColor: 'border-blue-400/40', logo: '⭐' },
  { id: 39, name: 'NOW TV', color: 'bg-lime-600', textColor: 'text-lime-400', borderColor: 'border-lime-500/40', logo: '📡' },
  { id: 35, name: 'Apple TV+', color: 'bg-zinc-600', textColor: 'text-zinc-300', borderColor: 'border-zinc-500/40', logo: '🍎' },
  { id: 2, name: 'Apple iTunes', color: 'bg-zinc-700', textColor: 'text-zinc-400', borderColor: 'border-zinc-600/40', logo: '💾' },
  { id: 3, name: 'Google Play', color: 'bg-green-600', textColor: 'text-green-400', borderColor: 'border-green-500/40', logo: '▶️' },
  { id: 192, name: 'YouTube', color: 'bg-red-700', textColor: 'text-red-400', borderColor: 'border-red-600/40', logo: '📺' },
  { id: 1773, name: 'MUBI', color: 'bg-indigo-600', textColor: 'text-indigo-400', borderColor: 'border-indigo-500/40', logo: '🎞️' },
  { id: 188, name: 'Sky Go', color: 'bg-violet-700', textColor: 'text-violet-400', borderColor: 'border-violet-500/40', logo: '☁️' },
] as const

function StreamingPlatformsSelector({ onSelectedCountChange }: { onSelectedCountChange?: (count: number) => void }) {
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
        const platforms = data.streaming_platforms as number[]
        setSelected(platforms)
        onSelectedCountChange?.(platforms.length)
      }
      setLoading(false)
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
      onSelectedCountChange?.(next.length)
      return next
    })
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
    <SettingsCard>
      <div className="px-5 pb-3 pt-4">
        <p className="gk-body max-w-none">
          Seleziona le piattaforme attive. I consigli di film e serie verranno <span className="font-bold text-[var(--accent)]">boostati</span> se disponibili su queste piattaforme.
        </p>
        {selected.length === 0 && !loading && (
          <p className="gk-caption mt-1">Nessuna piattaforma selezionata: i consigli non terranno conto della disponibilità.</p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={18} className="animate-spin text-[var(--text-muted)]" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          {STREAMING_PLATFORMS.map(({ id, name, textColor, borderColor, logo }) => {
            const isSelected = selected.includes(id)
            return (
              <button
                key={id}
                type="button"
                data-no-swipe="true"
                onClick={() => toggle(id)}
                className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-sm font-bold transition-all ${isSelected
                    ? `${borderColor} bg-[var(--bg-secondary)] ${textColor}`
                    : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)] hover:border-[var(--border)] hover:text-[var(--text-secondary)]'
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
          type="button"
          data-no-swipe="true"
          onClick={save}
          disabled={saving || loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-black transition-colors disabled:opacity-50"
          style={{ background: 'var(--accent)', color: '#0B0B0F' }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {saving ? 'Salvataggio…' : 'Salva piattaforme'}
        </button>
      </div>
    </SettingsCard>
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
    }
  }

  return (
    <>
      <button
        type="button"
        data-no-swipe="true"
        onClick={() => setShowModal(true)}
        className="group flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-red-500/5"
      >
        <ActionIcon danger><Trash2 size={16} /></ActionIcon>
        <div>
          <p className="text-sm font-bold text-[var(--text-primary)] transition-colors group-hover:text-red-300">Elimina account</p>
          <p className="gk-caption">Cancella tutti i tuoi dati in modo permanente</p>
        </div>
      </button>
      {showModal && <DeleteAccountModal onConfirm={handleDelete} onClose={() => setShowModal(false)} />}
    </>
  )
}

export default function SettingsPage() {
  const { locale, setLocale, t } = useLocale()
  const copy = appCopy(locale)
  const [selectedPlatformsCount, setSelectedPlatformsCount] = useState(0)

  return (
    <PageScaffold
      title={t.settings.title}
      description="Lingua, notifiche, sicurezza e piattaforme: il pannello operativo del tuo account."
      icon={<Shield size={16} />}
      contentClassName="gk-settings-page max-w-3xl pt-2 md:pt-8 pb-28 space-y-6"
    >
      <SettingsControlHero
        localeLabel={locale.toUpperCase()}
        sectionsCount={6}
        selectedPlatformsCount={selectedPlatformsCount}
        digestEnabled
      />

      <SettingsSection icon={<Globe size={15} />} title={copy.settings.appLanguage}>
        <SettingsCard>
          <p className="gk-body max-w-none px-5 pb-3 pt-4">{copy.settings.productLanguage}</p>
          <div className="flex gap-2 p-3" data-no-swipe="true">
            {(['it', 'en'] as const).map(lang => (
              <button
                key={lang}
                type="button"
                data-no-swipe="true"
                onClick={() => setLocale(lang)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition-all ${locale === lang ? '' : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                style={locale === lang ? { background: 'var(--accent)', color: '#0B0B0F' } : {}}
              >
                {lang === 'it' ? copy.settings.italian : copy.settings.english}
                {locale === lang && <Check size={12} className="text-black" />}
              </button>
            ))}
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection icon={<LogOut size={15} />} title="Account">
        <SettingsCard><LogoutButton /></SettingsCard>
      </SettingsSection>

      <SettingsSection icon={<Shield size={15} />} title="Sicurezza">
        <div className="space-y-3">
          <ChangePasswordSheet />
          <GlobalLogoutButton />
          <LastAccessInfo />
        </div>
      </SettingsSection>

      <SettingsSection icon={<Bell size={15} />} title="Notifiche">
        <div className="space-y-3">
          <PushNotificationsToggle />
          <DigestToggle />
        </div>
      </SettingsSection>

      <SettingsSection icon={<Tv size={15} />} title="Piattaforme streaming">
        <StreamingPlatformsSelector onSelectedCountChange={setSelectedPlatformsCount} />
      </SettingsSection>

      <SettingsSection icon={<BarChart3 size={15} />} title="Altro">
        <div className="space-y-2">
          {[
            { href: '/stats', icon: BarChart3, label: 'Tempo sprecato', desc: 'Calcola quante ore hai speso' },
            { href: '/trending', icon: TrendingUp, label: 'Trending community', desc: 'I più aggiunti questa settimana' },
            { href: '/lists', icon: List, label: 'Le mie liste', desc: 'Crea e condividi liste tematiche' },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link
              key={href}
              href={href}
              data-no-swipe="true"
              className="group flex items-center justify-between rounded-[22px] border border-[var(--border)] bg-[var(--bg-card)] p-4 transition-colors hover:bg-[var(--bg-card-hover)]"
            >
              <div className="flex items-center gap-3">
                <ActionIcon><Icon size={16} /></ActionIcon>
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{label}</p>
                  <p className="gk-caption">{desc}</p>
                </div>
              </div>
              <span className="text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent)]">→</span>
            </Link>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection icon={<Trash2 size={15} />} title="Zona pericolosa">
        <SettingsCard><DeleteAccountSection /></SettingsCard>
      </SettingsSection>

      <div className="pt-4 text-center text-xs text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1">Geekore · {locale === 'it' ? 'Fatto con' : 'Made with'} <Heart size={11} className="fill-red-500 text-red-500" /> {locale === 'it' ? 'per i nerd' : 'for nerds'}</span>
      </div>

      <div className="flex flex-col items-center gap-3 pb-2 pt-2">
        <p className="gk-label text-[var(--text-muted)]">{locale === 'it' ? 'Dati forniti da' : 'Data provided by'}</p>
        <div className="flex flex-wrap items-center justify-center gap-4 opacity-40 transition-opacity hover:opacity-70">
          <a href="https://boardgamegeek.com" target="_blank" rel="noopener noreferrer" aria-label="Powered by BoardGameGeek" data-no-swipe="true">
            <img src="/powered-by-bgg.svg" alt="Powered by BGG" className="h-5 w-auto" />
          </a>
          <span className="text-[10px] text-[var(--text-muted)]">TMDb</span>
          <span className="text-[10px] text-[var(--text-muted)]">AniList</span>
          <span className="text-[10px] text-[var(--text-muted)]">IGDB</span>
        </div>
      </div>
    </PageScaffold>
  )
}
