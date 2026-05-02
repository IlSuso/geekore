'use client'

import Link from 'next/link'
import { useLocale } from '@/lib/locale'
import { Shield } from 'lucide-react'

export default function PrivacyPage() {
  const { locale } = useLocale()
  const isEN = locale === 'en'

  const lastUpdated = '7 aprile 2025'

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white">
      <div className="max-w-3xl mx-auto px-6 pt-10 pb-24">

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center">
            <Shield size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEN ? 'Privacy Policy' : 'Informativa sulla Privacy'}
          </h1>
        </div>
        <p className="text-zinc-500 text-sm mb-10">
          {isEN ? `Last updated: ${lastUpdated}` : `Ultimo aggiornamento: ${lastUpdated}`}
        </p>

        <div className="prose prose-invert prose-zinc max-w-none space-y-8 text-zinc-300 leading-relaxed">

          {isEN ? (
            <>
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">1. Data Controller</h2>
                <p>Geekore is operated as a personal project. For data-related requests, contact us at: <a href="mailto:privacy@geekore.app" className="text-[var(--accent)] hover:underline">privacy@geekore.app</a></p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">2. Data We Collect</h2>
                <p>When you use Geekore, we collect:</p>
                <ul className="list-disc pl-6 space-y-1 mt-2">
                  <li><strong>Account data:</strong> email address, username, display name, profile picture, bio</li>
                  <li><strong>Content data:</strong> media entries (anime, games, movies, series, manga, board games), ratings, notes, progress, posts, comments, likes</li>
                  <li><strong>Social data:</strong> follows, notifications</li>
                  <li><strong>Optional — Steam:</strong> Steam ID, games list, play hours (only if you link your account)</li>
                  <li><strong>Technical data:</strong> session tokens (managed by Supabase/Auth)</li>
                </ul>
                <p className="mt-3">We do <strong>not</strong> collect: location data, device identifiers, browsing history, or any data for advertising purposes.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">3. Purpose and Legal Basis</h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Providing and operating the service (contractual necessity — Art. 6(1)(b) GDPR)</li>
                  <li>Account authentication and security (legitimate interest — Art. 6(1)(f) GDPR)</li>
                  <li>Displaying your profile and content to other users (consent given at registration — Art. 6(1)(a) GDPR)</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">4. Third-Party Services</h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Supabase</strong> (database, authentication, storage) — EU data hosting available. <a href="https://supabase.com/privacy" target="_blank" className="text-[var(--accent)] hover:underline">Privacy Policy</a></li>
                  <li><strong>TMDb</strong> — used for news/discover (we fetch data; no user data is sent). <a href="https://www.themoviedb.org/privacy-policy" target="_blank" className="text-[var(--accent)] hover:underline">Privacy Policy</a></li>
                  <li><strong>AniList</strong> — used for anime/manga data (read-only). <a href="https://anilist.co/terms" target="_blank" className="text-[var(--accent)] hover:underline">Terms</a></li>
                  <li><strong>IGDB / Twitch</strong> — used for game data (read-only). <a href="https://www.twitch.tv/p/en/legal/privacy-notice/" target="_blank" className="text-[var(--accent)] hover:underline">Privacy Policy</a></li>
                  <li><strong>Steam / Valve</strong> — optional. Used only if you connect your account. <a href="https://store.steampowered.com/privacy_agreement/" target="_blank" className="text-[var(--accent)] hover:underline">Privacy Policy</a></li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">5. Data Retention</h2>
                <p>Your data is retained for as long as your account is active. Upon account deletion, all personal data is permanently deleted within 30 days, except where retention is required by law.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">6. Your Rights (GDPR)</h2>
                <p>Under the GDPR, you have the right to:</p>
                <ul className="list-disc pl-6 space-y-1 mt-2">
                  <li><strong>Access</strong> your personal data</li>
                  <li><strong>Rectify</strong> inaccurate data</li>
                  <li><strong>Erase</strong> your data ("right to be forgotten")</li>
                  <li><strong>Portability</strong> — receive your data in a structured format</li>
                  <li><strong>Object</strong> to processing based on legitimate interest</li>
                  <li><strong>Withdraw consent</strong> at any time</li>
                </ul>
                <p className="mt-3">To exercise these rights, contact us at <a href="mailto:privacy@geekore.app" className="text-[var(--accent)] hover:underline">privacy@geekore.app</a>. You may also lodge a complaint with your national data protection authority.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">7. Cookies</h2>
                <p>We use only strictly necessary cookies for authentication (session management). We do not use tracking, analytics, or advertising cookies. See our <Link href="/cookies" className="text-[var(--accent)] hover:underline">Cookie Policy</Link>.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">8. Children</h2>
                <p>Geekore is not directed at children under 16. If you believe a child has provided us personal data, contact us to have it deleted.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">9. Changes</h2>
                <p>We may update this policy. We will notify registered users of significant changes via the app or email.</p>
              </section>
            </>
          ) : (
            <>
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">1. Titolare del Trattamento</h2>
                <p>Geekore è gestito come progetto personale. Per richieste relative ai dati personali contattaci a: <a href="mailto:privacy@geekore.app" className="text-[var(--accent)] hover:underline">privacy@geekore.app</a></p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">2. Dati Raccolti</h2>
                <p>Quando utilizzi Geekore raccogliamo:</p>
                <ul className="list-disc pl-6 space-y-1 mt-2">
                  <li><strong>Dati dell'account:</strong> indirizzo email, username, nome visualizzato, foto profilo, bio</li>
                  <li><strong>Dati sui contenuti:</strong> voci media (anime, giochi, film, serie, manga, giochi da tavolo), voti, note, progressi, post, commenti, like</li>
                  <li><strong>Dati social:</strong> follower/following, notifiche</li>
                  <li><strong>Opzionale — Steam:</strong> Steam ID, lista giochi, ore di gioco (solo se colleghi il tuo account)</li>
                  <li><strong>Dati tecnici:</strong> token di sessione (gestiti da Supabase/Auth)</li>
                </ul>
                <p className="mt-3"><strong>Non raccogliamo:</strong> dati di geolocalizzazione, identificatori del dispositivo, cronologia di navigazione o dati a fini pubblicitari.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">3. Finalità e Basi Giuridiche</h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Erogazione e funzionamento del servizio (necessità contrattuale — Art. 6(1)(b) GDPR)</li>
                  <li>Autenticazione e sicurezza dell'account (interesse legittimo — Art. 6(1)(f) GDPR)</li>
                  <li>Visualizzazione del profilo e dei contenuti agli altri utenti (consenso fornito alla registrazione — Art. 6(1)(a) GDPR)</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">4. Servizi Terzi</h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Supabase</strong> (database, autenticazione, storage) — hosting UE disponibile. <a href="https://supabase.com/privacy" target="_blank" className="text-[var(--accent)] hover:underline">Privacy Policy</a></li>
                  <li><strong>TMDb</strong> — usato per news/scoperta (recuperiamo dati; nessun dato utente viene inviato). <a href="https://www.themoviedb.org/privacy-policy" target="_blank" className="text-[var(--accent)] hover:underline">Privacy Policy</a></li>
                  <li><strong>AniList</strong> — usato per dati anime/manga (sola lettura). <a href="https://anilist.co/terms" target="_blank" className="text-[var(--accent)] hover:underline">Termini</a></li>
                  <li><strong>IGDB / Twitch</strong> — usato per dati videogiochi (sola lettura). <a href="https://www.twitch.tv/p/en/legal/privacy-notice/" target="_blank" className="text-[var(--accent)] hover:underline">Privacy Policy</a></li>
                  <li><strong>Steam / Valve</strong> — opzionale. Usato solo se colleghi il tuo account. <a href="https://store.steampowered.com/privacy_agreement/" target="_blank" className="text-[var(--accent)] hover:underline">Privacy Policy</a></li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">5. Conservazione dei Dati</h2>
                <p>I tuoi dati vengono conservati per tutta la durata dell'account attivo. In caso di cancellazione dell'account, tutti i dati personali vengono eliminati definitivamente entro 30 giorni, salvo obblighi di legge contrari.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">6. I Tuoi Diritti (GDPR)</h2>
                <p>Ai sensi del GDPR, hai diritto a:</p>
                <ul className="list-disc pl-6 space-y-1 mt-2">
                  <li><strong>Accedere</strong> ai tuoi dati personali</li>
                  <li><strong>Rettificare</strong> dati inesatti</li>
                  <li><strong>Cancellare</strong> i tuoi dati ("diritto all'oblio")</li>
                  <li><strong>Portabilità</strong> — ricevere i tuoi dati in formato strutturato</li>
                  <li><strong>Opporti</strong> al trattamento basato su interesse legittimo</li>
                  <li><strong>Revocare il consenso</strong> in qualsiasi momento</li>
                </ul>
                <p className="mt-3">Per esercitare questi diritti contattaci a <a href="mailto:privacy@geekore.app" className="text-[var(--accent)] hover:underline">privacy@geekore.app</a>. Hai inoltre il diritto di presentare reclamo al Garante per la Protezione dei Dati Personali (<a href="https://www.garanteprivacy.it" target="_blank" className="text-[var(--accent)] hover:underline">garanteprivacy.it</a>).</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">7. Cookie</h2>
                <p>Utilizziamo esclusivamente cookie strettamente necessari per l'autenticazione (gestione della sessione). Non utilizziamo cookie di tracciamento, analytics o pubblicità. Vedi la nostra <Link href="/cookies" className="text-[var(--accent)] hover:underline">Cookie Policy</Link>.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">8. Minori</h2>
                <p>Geekore non è rivolto a minori di 16 anni. Se ritieni che un minore abbia fornito dati personali, contattaci per eliminarli.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">9. Modifiche</h2>
                <p>Potremmo aggiornare questa informativa. Notificheremo gli utenti registrati delle modifiche sostanziali tramite l'app o email.</p>
              </section>
            </>
          )}
        </div>

        <div className="mt-12 pt-8 border-t border-zinc-800 flex flex-wrap gap-4 text-sm text-zinc-500">
          <Link href="/terms" className="hover:text-[var(--accent)] transition-colors">
            {isEN ? 'Terms of Service' : 'Termini di Servizio'}
          </Link>
          <Link href="/cookies" className="hover:text-[var(--accent)] transition-colors">
            Cookie Policy
          </Link>
          <Link href="/" className="hover:text-[var(--accent)] transition-colors">
            ← {isEN ? 'Back to Geekore' : 'Torna a Geekore'}
          </Link>
        </div>
      </div>
    </div>
  )
}
