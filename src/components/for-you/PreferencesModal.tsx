'use client'
// src/components/for-you/PreferencesModal.tsx
// Estratto da for-you/page.tsx — Fix #14 Repair Bible

import { useState, useEffect } from 'react'
import { gestureState } from '@/hooks/gestureState'
import { androidBack } from '@/hooks/androidBack'
import { X, ArrowRight, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useLocale } from '@/lib/locale'

// ── Costanti generi ───────────────────────────────────────────────────────────

const ANIME_GENRES = ['Action','Adventure','Comedy','Drama','Fantasy','Horror','Mystery','Romance','Sci-Fi','Slice of Life','Sports','Supernatural','Thriller','Psychological']
const MANGA_GENRES = [...ANIME_GENRES,'Shounen','Seinen','Shoujo','Josei']
const GAME_GENRES = ['Action','Adventure','RPG','Strategy','Simulation','Sports','Racing','Shooter','Puzzle','Horror','Platformer','Fighting','Stealth','Sandbox']
const MOVIE_GENRES = ['Action','Adventure','Animation','Comedy','Crime','Documentary','Drama','Fantasy','History','Horror','Mystery','Romance','Science Fiction','Thriller','War']
const TV_GENRES = [...MOVIE_GENRES,'Reality','Talk']

const QUICK_PRESETS = [
  { label: '🌑 Dark anime', prefs: { fav_anime_genres: ['Horror', 'Psychological', 'Thriller', 'Drama'], fav_manga_genres: ['Horror', 'Psychological', 'Thriller'] } },
  { label: '⚔️ Gamer RPG', prefs: { fav_game_genres: ['Role-playing (RPG)', 'Adventure', 'Action', 'Strategy'] } },
  { label: '🎬 Cinefilo europeo', prefs: { fav_movie_genres: ['Drama', 'Thriller', 'Crime', 'History'], fav_tv_genres: ['Drama', 'Crime', 'Thriller'] } },
  { label: '😂 Comedy & feel-good', prefs: { fav_anime_genres: ['Comedy', 'Slice of Life', 'Romance'], fav_movie_genres: ['Comedy', 'Romance', 'Animation'] } },
  { label: '🚀 Sci-fi & fantasy', prefs: { fav_anime_genres: ['Science Fiction', 'Fantasy'], fav_movie_genres: ['Science Fiction', 'Fantasy', 'Adventure'], fav_game_genres: ['Role-playing (RPG)', 'Adventure'] } },
]

// ── Componente ────────────────────────────────────────────────────────────────

export function PreferencesModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
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
    gestureState.drawerActive = true
    androidBack.push(onClose)
    return () => { gestureState.drawerActive = false; androidBack.pop(onClose) }
  }, [onClose])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      supabase.from('user_preferences').select('*').eq('user_id', user.id).single().then(({ data }) => {
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
          if (hasPrefs) setStep(1)
        }
        setLoading(false)
      })
    })
  }, [])

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
    { key: 'fav_anime_genres', label: '🎌 Anime preferiti', genres: ANIME_GENRES, desc: 'Seleziona i generi anime che ami di più' },
    { key: 'fav_manga_genres', label: '📖 Manga preferiti', genres: MANGA_GENRES, desc: 'Generi manga che leggi volentieri' },
    { key: 'fav_movie_genres', label: '🎬 Film preferiti', genres: MOVIE_GENRES, desc: 'Che tipo di film ti piace guardare?' },
    { key: 'fav_tv_genres', label: '📺 Serie TV preferite', genres: TV_GENRES, desc: 'Generi di serie che non salti mai' },
    { key: 'fav_game_genres', label: '🎮 Giochi preferiti', genres: GAME_GENRES, desc: 'A che tipo di giochi non riesci a smettere?' },
    { key: 'disliked_genres', label: '🚫 Generi da nascondere', genres: [...new Set([...GAME_GENRES, ...ANIME_GENRES, ...MOVIE_GENRES])], desc: 'Questi generi non appariranno nei tuoi consigli' },
  ]

  const currentSection = sections[step - 1]
  const totalSteps = sections.length

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl p-8 flex items-center justify-center" style={{ minHeight: 200 }}>
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header con progress bar */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-base font-bold text-white">
                {step === 0 ? 'Configura i tuoi gusti' : `${step} di ${totalSteps} — ${currentSection?.label}`}
              </h2>
              <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-white"><X size={18} /></button>
            </div>
            {step > 0 && (
              <div className="flex gap-1">
                {sections.map((_, i) => (
                  <div key={i} className={`h-1 rounded-full flex-1 transition-all ${i < step ? '' : 'bg-zinc-800'}`} style={i < step ? { background: '#E6FF3D' } : {}} />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-y-auto p-5 flex-1">
          {step === 0 ? (
            <div>
              <p className="text-sm text-zinc-400 mb-5">Scegli un profilo di partenza o configura tutto manualmente.</p>
              <div className="grid grid-cols-1 gap-2 mb-6">
                {QUICK_PRESETS.map(preset => (
                  <button key={preset.label} onClick={() => applyPreset(preset)}
                    className="flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-violet-500/50 rounded-2xl text-sm text-left transition-all">
                    <span className="text-xl">{preset.label.split(' ')[0]}</span>
                    <span className="font-medium text-zinc-200">{preset.label.split(' ').slice(1).join(' ')}</span>
                    <ArrowRight size={14} className="ml-auto text-zinc-600" />
                  </button>
                ))}
              </div>
              <button onClick={() => setStep(1)} className="w-full py-3 text-sm text-zinc-500 hover:text-zinc-300 border border-zinc-800 rounded-2xl">
                Configura manualmente →
              </button>
            </div>
          ) : currentSection ? (
            <div>
              <p className="text-xs text-zinc-500 mb-4">{currentSection.desc}</p>
              {currentSection.key === 'disliked_genres' && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
                  <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-300">Nasconderai tutti i contenuti di questi generi dai consigli.</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {currentSection.genres.map(genre => {
                  const sel = prefs[currentSection.key]?.includes(genre)
                  return (
                    <button key={genre} onClick={() => toggle(currentSection.key, genre)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        sel
                          ? (currentSection.key === 'disliked_genres'
                              ? 'bg-red-500/20 border-red-500/50 text-red-300'
                              : '')
                          : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}
                      style={sel && currentSection.key !== 'disliked_genres' ? { background: 'rgba(230,255,61,0.12)', borderColor: 'rgba(230,255,61,0.4)', color: '#E6FF3D' } : {}}>
                      {genre}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        {step > 0 && (
          <div className="p-5 border-t border-zinc-800 flex items-center gap-3">
            <button onClick={() => setStep(s => Math.max(0, s - 1))}
              className="px-4 py-2.5 text-sm text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded-2xl transition-all">
              ← Indietro
            </button>
            {step < totalSteps ? (
              <button onClick={() => setStep(s => s + 1)}
                className="flex-1 py-2.5 rounded-2xl text-sm font-semibold transition-all"
                style={{ background: '#E6FF3D', color: '#0B0B0F' }}>
                Avanti →
              </button>
            ) : (
              <button onClick={save} disabled={saving}
                className="flex-1 py-2.5 disabled:opacity-50 rounded-2xl text-sm font-semibold transition-all"
                style={{ background: '#E6FF3D', color: '#0B0B0F' }}>
                {saving ? 'Salvo...' : fy.prefsSave}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
