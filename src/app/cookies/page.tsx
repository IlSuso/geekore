'use client'

import Link from 'next/link'
import { useLocale } from '@/lib/locale'
import { Cookie } from 'lucide-react'

export default function CookiePage() {
  const { locale } = useLocale()
  const isEN = locale === 'en'
  const lastUpdated = '7 aprile 2025'

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-6 pt-10 pb-24">

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center">
            <Cookie size={18} className="text-violet-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Cookie Policy</h1>
        </div>
        <p className="text-zinc-500 text-sm mb-10">
          {isEN ? `Last updated: ${lastUpdated}` : `Ultimo aggiornamento: ${lastUpdated}`}
        </p>

        <div className="space-y-8 text-zinc-300 leading-relaxed">
          {isEN ? (
            <>
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">What Are Cookies</h2>
                <p>Cookies are small text files stored on your device when you visit a website. They help websites remember your preferences and provide certain functionality.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">Cookies We Use</h2>
                <p>Geekore uses <strong>only strictly necessary cookies</strong> required for the service to function:</p>
                <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-800">
                      <tr>
                        <th className="text-left px-4 py-3 text-zinc-300">Cookie</th>
                        <th className="text-left px-4 py-3 text-zinc-300">Purpose</th>
                        <th className="text-left px-4 py-3 text-zinc-300">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      <tr><td className="px-4 py-3 font-mono text-xs text-violet-400">sb-*</td><td className="px-4 py-3">Authentication session (Supabase)</td><td className="px-4 py-3">Session / 7 days</td></tr>
                      <tr><td className="px-4 py-3 font-mono text-xs text-violet-400">geekore_locale</td><td className="px-4 py-3">Language preference (localStorage)</td><td className="px-4 py-3">Persistent</td></tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">What We Don't Use</h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Analytics cookies (no Google Analytics, no Hotjar, etc.)</li>
                  <li>Advertising/tracking cookies</li>
                  <li>Social media tracking pixels</li>
                  <li>Third-party marketing cookies</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">Legal Basis</h2>
                <p>Authentication cookies are strictly necessary for the service to function and do not require consent under the ePrivacy Directive (2002/58/EC) and Italian Legislative Decree 69/2012. No cookie banner is required for strictly necessary cookies.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">Managing Cookies</h2>
                <p>You can clear cookies at any time through your browser settings. Clearing authentication cookies will log you out of Geekore. The language preference is stored in <code className="text-violet-400 bg-zinc-900 px-1 rounded">localStorage</code> and can be cleared from browser developer tools or changed in Settings.</p>
              </section>
            </>
          ) : (
            <>
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">Cosa Sono i Cookie</h2>
                <p>I cookie sono piccoli file di testo memorizzati sul tuo dispositivo quando visiti un sito web. Aiutano i siti a ricordare le tue preferenze e a fornire alcune funzionalità.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">Cookie Utilizzati</h2>
                <p>Geekore utilizza <strong>esclusivamente cookie strettamente necessari</strong> al funzionamento del servizio:</p>
                <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-800">
                      <tr>
                        <th className="text-left px-4 py-3 text-zinc-300">Cookie</th>
                        <th className="text-left px-4 py-3 text-zinc-300">Finalità</th>
                        <th className="text-left px-4 py-3 text-zinc-300">Durata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      <tr><td className="px-4 py-3 font-mono text-xs text-violet-400">sb-*</td><td className="px-4 py-3">Sessione di autenticazione (Supabase)</td><td className="px-4 py-3">Sessione / 7 giorni</td></tr>
                      <tr><td className="px-4 py-3 font-mono text-xs text-violet-400">geekore_locale</td><td className="px-4 py-3">Preferenza lingua (localStorage)</td><td className="px-4 py-3">Persistente</td></tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">Cosa Non Utilizziamo</h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Cookie di analytics (nessun Google Analytics, Hotjar, ecc.)</li>
                  <li>Cookie pubblicitari o di tracciamento</li>
                  <li>Pixel di social media</li>
                  <li>Cookie di marketing di terze parti</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">Base Giuridica</h2>
                <p>I cookie di autenticazione sono strettamente necessari al funzionamento del servizio e non richiedono il consenso ai sensi della Direttiva ePrivacy (2002/58/CE) e del D.Lgs. 69/2012. Per i cookie tecnici necessari non è obbligatorio il banner cookie.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">Gestione dei Cookie</h2>
                <p>Puoi cancellare i cookie in qualsiasi momento tramite le impostazioni del browser. La cancellazione dei cookie di autenticazione comporterà il logout da Geekore. La preferenza della lingua è memorizzata nel <code className="text-violet-400 bg-zinc-900 px-1 rounded">localStorage</code> e può essere cancellata dagli strumenti di sviluppo del browser o modificata nelle Impostazioni.</p>
              </section>
            </>
          )}
        </div>

        <div className="mt-12 pt-8 border-t border-zinc-800 flex flex-wrap gap-4 text-sm text-zinc-500">
          <Link href="/privacy" className="hover:text-violet-400 transition-colors">
            {isEN ? 'Privacy Policy' : 'Informativa Privacy'}
          </Link>
          <Link href="/terms" className="hover:text-violet-400 transition-colors">
            {isEN ? 'Terms of Service' : 'Termini di Servizio'}
          </Link>
          <Link href="/" className="hover:text-violet-400 transition-colors">
            ← {isEN ? 'Back to Geekore' : 'Torna a Geekore'}
          </Link>
        </div>
      </div>
    </div>
  )
}
