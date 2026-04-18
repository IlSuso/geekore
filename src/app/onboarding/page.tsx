'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Zap, Gamepad2, BookOpen, Film, Tv, Search, ChevronRight, Check } from 'lucide-react'
import { SteamIcon } from '@/components/icons/SteamIcon'

const STEPS = [
  { id: 0, title: 'Benvenuto su Geekore!', subtitle: 'Il tuo universo geek in un unico posto.' },
  { id: 1, title: 'Cosa tracci?', subtitle: 'Seleziona i media che ti interessano.' },
  { id: 2, title: 'Connetti Steam', subtitle: 'Importa automaticamente la tua libreria giochi.' },
  { id: 3, title: 'Cerca il primo titolo', subtitle: 'Aggiungi qualcosa che stai seguendo adesso.' },
]

const MEDIA_TYPES = [
  { id: 'anime', label: 'Anime', icon: Film, color: 'bg-sky-500/20 border-sky-500/50 text-sky-300' },
  { id: 'manga', label: 'Manga', icon: BookOpen, color: 'bg-orange-500/20 border-orange-500/50 text-orange-300' },
  { id: 'game', label: 'Videogiochi', icon: Gamepad2, color: 'bg-green-500/20 border-green-500/50 text-green-300' },
  { id: 'tv', label: 'Serie TV', icon: Tv, color: 'bg-purple-500/20 border-purple-500/50 text-purple-300' },
  { id: 'movie', label: 'Film', icon: Film, color: 'bg-red-500/20 border-red-500/50 text-red-300' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
    })
  }, [])

  const toggleType = (id: string) => {
    setSelectedTypes(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  const completeOnboarding = async () => {
    if (!userId) return
    setLoading(true)
    await supabase.from('profiles').update({
      onboarding_done: true,
      onboarding_step: 4,
    }).eq('id', userId)
    router.push('/feed')
  }

  const progress = ((step + 1) / STEPS.length) * 100

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12">
      <div className="w-full max-w-lg">

        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-2xl font-bold tracking-tighter text-white">geekore</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-zinc-800 rounded-full mb-10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step indicator */}
        <div className="flex gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className={`flex-1 h-1 rounded-full transition-all ${i <= step ? 'bg-violet-500' : 'bg-zinc-800'}`} />
          ))}
        </div>

        {/* Step 0 — Welcome */}
        {step === 0 && (
          <div className="text-center py-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 border border-violet-500/20 flex items-center justify-center">
              <Zap size={36} className="text-violet-400" />
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-white mb-4">{STEPS[0].title}</h1>
            <p className="text-zinc-400 text-lg mb-10">{STEPS[0].subtitle}</p>
            <p className="text-zinc-500 mb-10 max-w-sm mx-auto">
              Traccia anime, manga, videogiochi, film, serie TV e board game. Condividi i progressi con la community.
            </p>
            <button onClick={() => setStep(1)}
              className="w-full py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold text-lg transition-all flex items-center justify-center gap-2">
              Inizia <ChevronRight size={20} />
            </button>
          </div>
        )}

        {/* Step 1 — Seleziona media */}
        {step === 1 && (
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{STEPS[1].title}</h1>
            <p className="text-zinc-400 mb-8">{STEPS[1].subtitle}</p>
            <div className="grid grid-cols-2 gap-3 mb-10">
              {MEDIA_TYPES.map(({ id, label, icon: Icon, color }) => {
                const selected = selectedTypes.includes(id)
                return (
                  <button key={id} onClick={() => toggleType(id)}
                    className={`relative flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                      selected ? color : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <Icon size={22} />
                    <span className="font-medium">{label}</span>
                    {selected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-violet-500 rounded-full flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(0)} className="px-6 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl font-medium transition-all">
                Indietro
              </button>
              <button onClick={() => setStep(2)}
                className="flex-1 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2">
                Continua <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Steam */}
        {step === 2 && (
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{STEPS[2].title}</h1>
            <p className="text-zinc-400 mb-8">{STEPS[2].subtitle}</p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-[#1b2838] rounded-2xl flex items-center justify-center overflow-hidden">
                  <SteamIcon size={48} />
                </div>
                <div>
                  <p className="font-semibold text-white">Steam</p>
                  <p className="text-sm text-zinc-500">Importa la tua libreria automaticamente</p>
                </div>
              </div>
              <a href="/api/steam/connect"
                className="w-full flex items-center justify-center gap-3 bg-[#1B2838] hover:bg-[#2a475e] border border-[#66C0F4]/50 py-3.5 rounded-2xl font-medium transition text-[#66C0F4]">
                Collega Account Steam
              </a>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="px-6 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl font-medium transition-all">
                Indietro
              </button>
              <button onClick={() => setStep(3)}
                className="flex-1 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold transition-all flex items-center justify-center gap-2">
                Salta <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Primo titolo */}
        {step === 3 && (
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">{STEPS[3].title}</h1>
            <p className="text-zinc-400 mb-8">{STEPS[3].subtitle}</p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 mb-8 text-center">
              <Search size={40} className="mx-auto mb-4 text-zinc-600" />
              <p className="text-zinc-400 mb-4">Vai su Discover per cercare anime, manga, giochi e molto altro.</p>
              <a href="/discover"
                className="inline-flex items-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-2xl font-semibold transition">
                Vai su Discover <ChevronRight size={16} />
              </a>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="px-6 py-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl font-medium transition-all">
                Indietro
              </button>
              <button
                onClick={completeOnboarding}
                disabled={loading}
                className="flex-1 py-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 rounded-2xl font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? 'Caricamento...' : 'Entra in Geekore'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}