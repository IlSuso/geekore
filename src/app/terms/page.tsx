'use client'

import Link from 'next/link'
import { useLocale } from '@/lib/locale'
import { FileText } from 'lucide-react'

export default function TermsPage() {
  const { locale } = useLocale()
  const isEN = locale === 'en'
  const lastUpdated = '7 aprile 2025'

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-3xl mx-auto px-6 pt-10 pb-24">

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center">
            <FileText size={18} style={{ color: '#E6FF3D' }} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            {isEN ? 'Terms of Service' : 'Termini di Servizio'}
          </h1>
        </div>
        <p className="text-zinc-500 text-sm mb-10">
          {isEN ? `Last updated: ${lastUpdated}` : `Ultimo aggiornamento: ${lastUpdated}`}
        </p>

        <div className="space-y-8 text-zinc-300 leading-relaxed">
          {isEN ? (
            <>
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">1. Acceptance of Terms</h2>
                <p>By creating an account or using Geekore, you agree to these Terms of Service. If you do not agree, do not use the service.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
                <p>Geekore is a free platform that allows users to track media consumption (anime, manga, movies, TV series, video games, board games), share progress, post content, and follow other users.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">3. User Accounts</h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li>You must be at least 16 years old to register</li>
                  <li>You are responsible for maintaining the confidentiality of your account credentials</li>
                  <li>You are responsible for all activity under your account</li>
                  <li>You must not create multiple accounts to circumvent restrictions</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">4. User Content</h2>
                <p>By posting content (posts, comments, profile information), you grant Geekore a non-exclusive, royalty-free license to display and distribute that content on the platform. You retain ownership of your content.</p>
                <p className="mt-2">You must not post content that:</p>
                <ul className="list-disc pl-6 space-y-1 mt-2">
                  <li>Is illegal, abusive, harassing, or defamatory</li>
                  <li>Infringes third-party intellectual property rights</li>
                  <li>Contains malware, spam, or unsolicited commercial messages</li>
                  <li>Impersonates other users or public figures</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">5. Intellectual Property</h2>
                <p>Geekore and its original content, features and functionality are owned by the operators and are protected by applicable intellectual property laws. Media metadata (titles, covers, descriptions) is sourced from third-party APIs (TMDb, AniList, IGDB) and belongs to their respective owners.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">6. Prohibited Uses</h2>
                <p>You may not use Geekore to:</p>
                <ul className="list-disc pl-6 space-y-1 mt-2">
                  <li>Scrape, crawl, or harvest data without authorization</li>
                  <li>Attempt to gain unauthorized access to any system</li>
                  <li>Interfere with the operation of the service</li>
                  <li>Transmit viruses or malicious code</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">7. Disclaimers</h2>
                <p>Geekore is provided "as is" without warranties of any kind, express or implied. We do not guarantee continuous, uninterrupted, or error-free service. We are not liable for any damages arising from use of the service.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">8. Termination</h2>
                <p>We reserve the right to suspend or terminate accounts that violate these terms, without prior notice. You may delete your account at any time from your profile settings.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">9. Governing Law</h2>
                <p>These Terms are governed by Italian law. Any disputes shall be subject to the exclusive jurisdiction of the courts of Italy.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">10. Changes</h2>
                <p>We may modify these Terms at any time. Continued use of the service after changes constitutes acceptance of the new Terms.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">11. Contact</h2>
                <p>Questions about these Terms: <a href="mailto:support@geekore.app" className="hover:underline" style={{ color: '#E6FF3D' }}>support@geekore.app</a></p>
              </section>
            </>
          ) : (
            <>
              <section>
                <h2 className="text-xl font-semibold text-white mb-3">1. Accettazione dei Termini</h2>
                <p>Creando un account o utilizzando Geekore, accetti i presenti Termini di Servizio. Se non accetti, non utilizzare il servizio.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">2. Descrizione del Servizio</h2>
                <p>Geekore è una piattaforma gratuita che consente agli utenti di tracciare il consumo di media (anime, manga, film, serie TV, videogiochi, giochi da tavolo), condividere progressi, pubblicare contenuti e seguire altri utenti.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">3. Account Utente</h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Devi avere almeno 16 anni per registrarti</li>
                  <li>Sei responsabile della riservatezza delle credenziali del tuo account</li>
                  <li>Sei responsabile di tutta l'attività svolta tramite il tuo account</li>
                  <li>Non puoi creare più account per aggirare restrizioni</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">4. Contenuti degli Utenti</h2>
                <p>Pubblicando contenuti (post, commenti, informazioni del profilo), concedi a Geekore una licenza non esclusiva e gratuita per visualizzare e distribuire tali contenuti sulla piattaforma. Mantieni la proprietà dei tuoi contenuti.</p>
                <p className="mt-2">Non puoi pubblicare contenuti che:</p>
                <ul className="list-disc pl-6 space-y-1 mt-2">
                  <li>Siano illegali, abusivi, molesti o diffamatori</li>
                  <li>Violino diritti di proprietà intellettuale di terzi</li>
                  <li>Contengano malware, spam o messaggi commerciali non richiesti</li>
                  <li>Impersonino altri utenti o figure pubbliche</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">5. Proprietà Intellettuale</h2>
                <p>Geekore e i suoi contenuti originali, funzionalità e caratteristiche appartengono agli operatori e sono protetti dalle leggi vigenti sulla proprietà intellettuale. I metadati dei media (titoli, copertine, descrizioni) provengono da API di terze parti (TMDb, AniList, IGDB) e appartengono ai rispettivi proprietari.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">6. Usi Vietati</h2>
                <p>Non puoi utilizzare Geekore per:</p>
                <ul className="list-disc pl-6 space-y-1 mt-2">
                  <li>Estrarre dati (scraping) senza autorizzazione</li>
                  <li>Tentare di ottenere accesso non autorizzato a qualsiasi sistema</li>
                  <li>Interferire con il funzionamento del servizio</li>
                  <li>Trasmettere virus o codice malevolo</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">7. Esclusione di Garanzie</h2>
                <p>Geekore è fornito "così com'è" senza garanzie di alcun tipo, esplicite o implicite. Non garantiamo un servizio continuo, ininterrotto o privo di errori. Non siamo responsabili per eventuali danni derivanti dall'uso del servizio.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">8. Risoluzione</h2>
                <p>Ci riserviamo il diritto di sospendere o terminare account che violano questi termini, senza preavviso. Puoi eliminare il tuo account in qualsiasi momento dalle impostazioni del profilo.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">9. Legge Applicabile</h2>
                <p>I presenti Termini sono regolati dalla legge italiana. Qualsiasi controversia sarà soggetta alla giurisdizione esclusiva dei tribunali italiani.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">10. Modifiche</h2>
                <p>Potremmo modificare questi Termini in qualsiasi momento. L'utilizzo continuato del servizio dopo le modifiche costituisce accettazione dei nuovi Termini.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-white mb-3">11. Contatti</h2>
                <p>Domande su questi Termini: <a href="mailto:support@geekore.app" className="hover:underline" style={{ color: '#E6FF3D' }}>support@geekore.app</a></p>
              </section>
            </>
          )}
        </div>

        <div className="mt-12 pt-8 border-t border-zinc-800 flex flex-wrap gap-4 text-sm text-zinc-500">
          <Link href="/privacy" className="hover:text-[#E6FF3D] transition-colors">
            {isEN ? 'Privacy Policy' : 'Informativa Privacy'}
          </Link>
          <Link href="/cookies" className="hover:text-[#E6FF3D] transition-colors">Cookie Policy</Link>
          <Link href="/" className="hover:text-[#E6FF3D] transition-colors">
            ← {isEN ? 'Back to Geekore' : 'Torna a Geekore'}
          </Link>
        </div>
      </div>
    </div>
  )
}
