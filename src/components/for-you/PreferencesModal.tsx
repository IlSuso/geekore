'use client'
// src/components/for-you/PreferencesModal.tsx
// Preferences come taste tuning: meno wizard generico, più controllo diretto sul For You.

import { useState, useEffect } from 'react'
import { gestureState } from '@/hooks/gestureState'
import { androidBack } from '@/hooks/androidBack'
import { X, ArrowRight, AlertCircle, Brain, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLocale } from '@/lib/locale'

const ANIME_GENRES = ['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller','Psychological']
const MANGA_GENRES = [...ANIME_GENRES,'Shounen','Seinen','Shoujo','Josei']
const GAME_GENRES = ['Action','Adventure','RPG','Strategy','Simulation','Sports','Racing','Shooter','Puzzle','Horror','Platformer','Fighting','Stealth','Sandbox']
const MOVIE_GENRES = ['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Fantasy','History','Horror','Mystery','Romance','Science Fiction','Thriller','War']
const TV_GENRES = [...MOVIE_GENRES,'Reality','Talk']

const QUICK_PRESETS = [
  { label: 'Dark anime', eyebrow: 'toni cupi · tensione · psicologico', prefs: { fav_anime_genres: ['Horror', 'Psychological', 'Thriller', 'Drama'], fav_manga_genres: ['Horror', 'Psychological', 'Thriller'] } },
  { label: 'Gamer RPG', eyebrow: 'progressione · party · mondi aperti', prefs: { fav_game_genres: ['RPG', 'Adventure', 'Action', 'Strategy'] } },
  { label: 'Cinefilo crime', eyebrow: 'drama · thriller · storia', prefs: { fav_movie_genres: ['Drama', 'Thriller', 'Crime', 'History'], fav_tv_genres: ['Drama', 'Crime', 'Thriller'] } },
  { label: 'Comfort picks', eyebrow: 'comedy · romance · feel good', prefs: { fav_anime_genres: ['Comedy', 'Slice of Life', 'Romance'], fav_movie_genres: ['Comedy', 'Romance', 'Animation'] } },
  { label: 'Sci-fi & fantasy', eyebrow: 'mondi strani · avventura · lore', prefs: { fav_anime_genres: ['Sci-Fi', 'Fantasy'], fav_movie_genres: ['Science Fiction', 'Fantasy', 'Adventure'], fav_game_genres: ['RPG', 'Adventure'] } },
]

type PreferencesModalProps = {
  open?: boolean
  onClose: () => void
  onSaved: () => void
}

export function PreferencesModal({ open = true, onClose, onSaved }: PreferencesModalProps) {
  const { t } = useLocale()
  const fy = t.forYou
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(0)
  const [prefs, setPrefs] = useState<Record<string, string[]>>({
    fav_game_genres: [], fav_anime_genres: [], fav_movie_genres: [],
    fav_tv_genres: [], fav_manga_genres: [], disliked_genres: []
  })

  useEffect(() => {
    if (!open) return
    gestureState.drawerActive = true
    androidBack.push(onClose)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      gestureState.drawerActive = false
      androidBack.pop(onClose)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (cancelled) return
      if (!user) { setLoading(false); return }
      supabase.from('user_preferences').select('*').eq('user_id', user.id).single().then(({ data }) => {
        if (cancelled) return
        if (data) {
          setPrefs({
            fav_game_genres: data.fav_game_genres || [],
            fav_anime_genres: data.fav_anime_genres || [],
            fav_movie_genres: data.fav_movie_genres || [],
            fav_tv_genres: data.fav_tv_genres || [],
            fav_manga_genres: data.fav_manga_genres || [],
            disliked_genres: data.disliked_genres || []
          })
          const hasPrefs = Object.values(data).some(v => Array.isArray(v) && (v as unknown[]).length > 0)
          setStep(hasPrefs ? 1 : 0)
        } else {
          setStep(0)
        }
        setLoading(false)
      })
    })
    return () => { cancelled = true }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const toggle = (key: string, genre: string) => setPrefs(prev => ({
    ...prev,
    [key]: prev[key].includes(genre) ? prev[key].filter(g => g !== genre) : [...prev[key], genre]
  }))

  const applyPreset = (preset: typeof QUICK_PRESETS[0]) => {
    setPrefs(prev => {
      const next = { ...prev }
      for (const [k, v] of Object.entries(preset.prefs)) {
        next[k] = [...new Set([...(next[k] || []), ...v])]
      }
      return next
    })
    setStep(1)
  }

  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    }).catch(() => null)
    setSaving(false)
    if (res?.ok) {
      onSaved()
      onClose()
    }
  }

  const sections = [
    { key: 'fav_anime_genres', label: 'Anime', genres: ANIME_GENRES, desc: 'Generi che vuoi vedere pesare di più nei consigli anime.' },
    { key: 'fav_manga_genres', label: 'Manga', genres: MANGA_GENRES, desc: 'Preferenze per letture, manga e webtoon.' },
    { key: 'fav_movie_genres', label: 'Film', genres: MOVIE_GENRES, desc: 'Coordinate principali per film consigliati.' },
    { key: 'fav_tv_genres', label: 'TV', genres: TV_GENRES, desc: 'Segnali per serie e stagioni da proporti.' },
    { key: 'fav_game_genres', label: 'Game', genres: GAME_GENRES, desc: 'Cosa deve spingere i consigli gaming.' },
    { key: 'disliked_genres', label: 'Da ridurre', genres: [...new Set([...GAME_GENRES, ...ANIME_GENRES, ...MOVIE_GENRES])], desc: 'Segnali negativi: Geekore li userà per abbassare il ranking.' },
  ]

  const currentSection = sections[step - 1]
  const totalSteps = sections.length
  const selectedCount = Object.values(prefs).reduce((sum, list) => sum + list.length, 0)

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" data-no-swipe="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <div className="flex min-h-[220px] w-full max-w-2xl items-center justify-center rounded-[28px] border border-[var(--border)] bg-[var(--bg-primary)] p-8" onMouseDown={e => e.stopPropagation()}>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" data-no-swipe="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[30px] border border-[rgba(230,255,61,0.18)] bg-[var(--bg-primary)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]" onMouseDown={e => e.stopPropagation()}>
        <div className="border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(230,255,61,0.08),rgba(139,92,246,0.06),rgba(20,20,27,0.9))] p-5">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[rgba(230,255,61,0.35)] bg-[rgba(230,255,61,0.08)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
                <Brain size={12} /> Taste tuning
              </div>
              <h2 className="gk-title text-[var(--text-primary)]">
                {step === 0 ? 'Accendi il tuo For You.' : `${currentSection?.label} · ${step}/${totalSteps}`}
              </h2>
              <p className="gk-caption mt-1">
                {step === 0
                  ? 'Scegli un preset o raffina manualmente i segnali che alimentano le raccomandazioni.'
                  : currentSection?.desc}
              </p>
            </div>
            <button type="button" data-no-swipe="true" onClick={onClose} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-black/20 text-[var(--text-secondary)] hover:text-white" aria-label="Chiudi taste tuning">
              <X size={17} />
            </button>
          </div>

          {step > 0 && (
            <div className="space-y-2">
              <div className="flex gap-1">
                {sections.map((_, i) => (
                  <div key={i} className="h-1 flex-1 rounded-full bg-black/30">
                    <div className="h-full rounded-full transition-all" style={i < step ? { width: '100%', background: 'var(--accent)' } : { width: 0 }} />
                  </div>
                ))}
              </div>
              <p className="gk-mono text-[var(--text-muted)]">{selectedCount} segnali selezionati</p>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === 0 ? (
            <div>
              <div className="mb-5 grid grid-cols-1 gap-2">
                {QUICK_PRESETS.map(preset => (
                  <button key={preset.label} type="button" data-no-swipe="true" onClick={() => applyPreset(preset)}
                    className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-left transition-all hover:border-[rgba(230,255,61,0.35)] hover:bg-[var(--bg-card-hover)]">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-[rgba(230,255,61,0.08)] text-[var(--accent)]">
                      <Sparkles size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[var(--text-primary)]">{preset.label}</p>
                      <p className="gk-caption truncate">{preset.eyebrow}</p>
                    </div>
                    <ArrowRight size={15} className="text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
                  </button>
                ))}
              </div>
              <button type="button" data-no-swipe="true" onClick={() => setStep(1)} className="w-full rounded-2xl border border-[var(--border)] py-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[rgba(230,255,61,0.28)] hover:text-[var(--text-primary)]">
                Configura manualmente
              </button>
            </div>
          ) : currentSection ? (
            <div>
              {currentSection.key === 'disliked_genres' && (
                <div className="mb-4 flex items-start gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 p-3">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0 text-red-400" />
                  <p className="text-xs text-red-300">Questi generi non spariscono: vengono penalizzati, così evitiamo un For You troppo rigido.</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {currentSection.genres.map(genre => {
                  const sel = prefs[currentSection.key]?.includes(genre)
                  return (
                    <button key={genre} type="button" data-no-swipe="true" onClick={() => toggle(currentSection.key, genre)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${
                        sel
                          ? (currentSection.key === 'disliked_genres'
                              ? 'border-red-500/50 bg-red-500/20 text-red-300'
                              : '')
                          : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:border-[var(--border)] hover:text-[var(--text-primary)]'
                      }`}
                      style={sel && currentSection.key !== 'disliked_genres' ? { background: 'rgba(230,255,61,0.12)', borderColor: 'rgba(230,255,61,0.4)', color: 'var(--accent)' } : {}}>
                      {genre}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        {step > 0 && (
          <div className="flex items-center gap-3 border-t border-[var(--border)] p-5">
            <button type="button" data-no-swipe="true" onClick={() => setStep(s => Math.max(0, s - 1))}
              className="rounded-2xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-white">
              Indietro
            </button>
            {step < totalSteps ? (
              <button type="button" data-no-swipe="true" onClick={() => setStep(s => s + 1)}
                className="flex-1 rounded-2xl py-2.5 text-sm font-black transition-all"
                style={{ background: 'var(--accent)', color: '#0B0B0F' }}>
                Avanti
              </button>
            ) : (
              <button type="button" data-no-swipe="true" onClick={save} disabled={saving}
                className="flex-1 rounded-2xl py-2.5 text-sm font-black transition-all disabled:opacity-50"
                style={{ background: 'var(--accent)', color: '#0B0B0F' }}>
                {saving ? 'Salvo…' : fy.prefsSave}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
