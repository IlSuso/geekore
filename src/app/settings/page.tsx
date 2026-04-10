'use client'
// src/app/settings/page.tsx — versione aggiornata con tema, import AniList

import { useLocale } from '@/lib/locale'
import { useTheme } from '@/lib/theme'
import { Settings, Globe, Sun, Moon, Download, List, TrendingUp, BarChart3 } from 'lucide-react'
import { AniListImport } from '@/components/import/AniListImport'
import Link from 'next/link'

export default function SettingsPage() {
  const { locale, setLocale, t } = useLocale()
  const { theme, setTheme } = useTheme()

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-xl mx-auto px-6 pt-10 pb-24 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center">
            <Settings size={20} className="text-violet-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{t.settings.title}</h1>
        </div>

        {/* Sezione Lingua */}
        <section>
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
                  ? 'Le news verranno mostrate in italiano. Cambiando lingua il refresh aggiornerà i contenuti.'
                  : 'News will be shown in English. Changing language will refresh content on next update.'}
              </p>
            </div>
          </div>
        </section>

        {/* Sezione Tema */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            {theme === 'dark' ? <Moon size={15} className="text-zinc-500" /> : <Sun size={15} className="text-zinc-500" />}
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Tema</h2>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <p className="text-sm text-zinc-500 px-5 pt-4 pb-3">Scegli tra tema scuro e chiaro</p>
            <div className="flex p-3 gap-2">
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all ${
                  theme === 'dark'
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                <Moon size={14} />
                Scuro
                {theme === 'dark' && <span className="text-violet-300 text-xs">✓</span>}
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold transition-all ${
                  theme === 'light'
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                <Sun size={14} />
                Chiaro
                {theme === 'light' && <span className="text-violet-300 text-xs">✓</span>}
              </button>
            </div>
          </div>
        </section>

        {/* Sezione Import */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Download size={15} className="text-zinc-500" />
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Importazione</h2>
          </div>
          <AniListImport />
        </section>

        {/* Link Feature */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={15} className="text-zinc-500" />
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Altro</h2>
          </div>
          <div className="space-y-2">
            <Link
              href="/stats"
              className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-violet-500/20 rounded-xl flex items-center justify-center">
                  <BarChart3 size={16} className="text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Tempo sprecato</p>
                  <p className="text-xs text-zinc-500">Calcola quante ore hai speso</p>
                </div>
              </div>
              <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
            </Link>

            <Link
              href="/trending"
              className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-fuchsia-500/20 rounded-xl flex items-center justify-center">
                  <TrendingUp size={16} className="text-fuchsia-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Trending community</p>
                  <p className="text-xs text-zinc-500">I più aggiunti questa settimana</p>
                </div>
              </div>
              <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
            </Link>

            <Link
              href="/lists"
              className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <List size={16} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Le mie liste</p>
                  <p className="text-xs text-zinc-500">Crea e condividi liste tematiche</p>
                </div>
              </div>
              <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
            </Link>
          </div>
        </section>

        {/* Footer */}
        <div className="text-center text-zinc-700 text-xs pt-4">
          Geekore · {locale === 'it' ? 'Fatto con ❤️ per i nerd' : 'Made with ❤️ for nerds'}
        </div>
      </div>
    </div>
  )
}