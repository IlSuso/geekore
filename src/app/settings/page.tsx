'use client'

import { useLocale } from '@/lib/locale'
import { Settings, Globe, ChevronRight } from 'lucide-react'

export default function SettingsPage() {
  const { locale, setLocale, t } = useLocale()

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-xl mx-auto px-6 pt-10 pb-24">

        {/* Header */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center">
            <Settings size={20} className="text-violet-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{t.settings.title}</h1>
        </div>

        {/* Sezione Lingua */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Globe size={15} className="text-zinc-500" />
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">{t.settings.language}</h2>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <p className="text-sm text-zinc-500 px-5 pt-4 pb-3">{t.settings.languageDesc}</p>
            <div className="flex p-3 gap-2">
              <button
                onClick={() => setLocale('it')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all ${
                  locale === 'it'
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                {t.settings.italian}
                {locale === 'it' && <span className="text-violet-300 text-xs">✓</span>}
              </button>
              <button
                onClick={() => setLocale('en')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all ${
                  locale === 'en'
                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                {t.settings.english}
                {locale === 'en' && <span className="text-violet-300 text-xs">✓</span>}
              </button>
            </div>
            <div className="px-5 pb-4">
              <p className="text-xs text-zinc-600">
                {locale === 'it'
                  ? 'Le news verranno mostrate in italiano (TMDb it-IT). Cambiando lingua il refresh aggiornerà i contenuti.'
                  : 'News will be shown in English (TMDb en-US). Changing language will refresh content on next update.'}
              </p>
            </div>
          </div>
        </section>

        {/* Versione */}
        <div className="text-center text-zinc-700 text-xs mt-16">
          Geekore · {locale === 'it' ? 'Fatto con ❤️ per i nerd' : 'Made with ❤️ for nerds'}
        </div>
      </div>
    </div>
  )
}
