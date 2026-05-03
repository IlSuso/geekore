import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8') }
function write(rel, text) { fs.writeFileSync(path.join(root, rel), text) }
function exists(rel) { return fs.existsSync(path.join(root, rel)) }
function replaceAll(text, map) {
  for (const [from, to] of map) text = text.split(from).join(to)
  return text
}
function ensureImport(text, importLine, afterNeedle) {
  if (text.includes(importLine)) return text
  return text.replace(afterNeedle, `${afterNeedle}\n${importLine}`)
}

// Navbar: localizza i label ancora hardcoded mantenendo termini da app moderna.
if (exists('src/components/Navbar.tsx')) {
  let text = read('src/components/Navbar.tsx')
  text = ensureImport(text, "import { appCopy } from '@/lib/i18n/appCopy'", "import { GeekoreWordmark } from '@/components/ui/GeekoreWordmark'")
  text = text.replace('  const { t } = useLocale()\n', '  const { t, locale } = useLocale()\n  const copy = appCopy(locale)\n')
  text = replaceAll(text, [
    ["{ href: '/swipe', label: 'Swipe', icon: Shuffle }", "{ href: '/swipe', label: copy.nav.swipe, icon: Shuffle }"],
    ["{ href: '/friends', label: 'Friends', icon: Users }", "{ href: '/friends', label: copy.nav.friends, icon: Users }"],
    ["{ href: '/trending', label: 'Trending', icon: TrendingUp }", "{ href: '/trending', label: copy.nav.trending, icon: TrendingUp }"],
    ["{ href: '/wishlist', label: 'Wishlist', icon: Heart }", "{ href: '/wishlist', label: copy.nav.wishlist, icon: Heart }"],
    ["{ href: '/leaderboard', label: 'Classifica', icon: Trophy }", "{ href: '/leaderboard', label: copy.nav.leaderboard, icon: Trophy }"],
    ["{ href: '/stats', label: 'Stats', icon: BarChart3 }", "{ href: '/stats', label: copy.nav.stats, icon: BarChart3 }"],
    ["{ href: '/lists', label: 'Liste', icon: List }", "{ href: '/lists', label: copy.nav.lists, icon: List }"],
    ["{ href: `/profile/${username || 'me'}`, label: 'Il tuo profilo', icon: User }", "{ href: `/profile/${username || 'me'}`, label: copy.nav.yourProfile, icon: User }"],
    ["{ href: '/library', label: 'Gestisci Library', icon: Library }", "{ href: '/library', label: copy.nav.manageLibrary, icon: Library }"],
    ["{ href: '/settings', label: 'Impostazioni', icon: Settings }", "{ href: '/settings', label: t.nav.settings, icon: Settings }"],
    ['placeholder="Cerca utenti..."', 'placeholder={copy.nav.searchUsers}'],
    ['aria-label="Cancella ricerca"', 'aria-label={copy.nav.clearSearch}'],
    ['Nessun utente trovato', '{copy.nav.noUsers}'],
    ['<p className="gk-label mb-2 px-3">Scopri</p>', '<p className="gk-label mb-2 px-3">{copy.nav.discoverGroup}</p>'],
    ['Notifiche\n          </Link>', '{copy.nav.notifications}\n          </Link>'],
    ['aria-label="Menu account"', 'aria-label={copy.nav.accountMenu}'],
    ["displayName || 'Utente'", 'displayName || copy.nav.userFallback'],
    ["currentDisplayName || currentUsername || 'Utente'", 'currentDisplayName || currentUsername || copy.nav.userFallback'],
    ['Esci da Geekore', '{copy.nav.logoutGeekore}'],
    ['aria-label="Navigazione principale desktop"', 'aria-label={locale === \'it\' ? \'Navigazione principale desktop\' : \'Main desktop navigation\'}'],
  ])
  write('src/components/Navbar.tsx', text)
}

// Settings: aggiorna copy vecchio sulle limitazioni API, se presente.
if (exists('src/app/settings/page.tsx')) {
  let text = read('src/app/settings/page.tsx')
  text = ensureImport(text, "import { appCopy } from '@/lib/i18n/appCopy'", "import { useLocale } from '@/lib/locale'")
  text = text.replace('const { t, locale, setLocale } = useLocale()', 'const { t, locale, setLocale } = useLocale()\n  const copy = appCopy(locale)')
  text = replaceAll(text, [
    ["t.settings.language", "copy.settings.appLanguage"],
    ["t.settings.languageDesc", "copy.settings.productLanguage"],
    ["t.settings.apiNote", "copy.settings.dataLanguage"],
    ["t.settings.italian", "copy.settings.italian"],
    ["t.settings.english", "copy.settings.english"],
  ])
  write('src/app/settings/page.tsx', text)
}

// Onboarding: patch prudente dei testi più comuni senza riscrivere il file.
for (const rel of ['src/app/onboarding/page.tsx', 'src/components/onboarding/OnboardingFlow.tsx']) {
  if (!exists(rel)) continue
  let text = read(rel)
  text = ensureImport(text, "import { appCopy } from '@/lib/i18n/appCopy'", "import { useLocale } from '@/lib/locale'")
  text = text.replace('const { t, locale } = useLocale()', 'const { t, locale } = useLocale()\n  const copy = appCopy(locale)')
  text = text.replace('const { locale, t } = useLocale()', 'const { locale, t } = useLocale()\n  const copy = appCopy(locale)')
  text = text.replace('const { t } = useLocale()', 'const { t, locale } = useLocale()\n  const copy = appCopy(locale)')
  text = replaceAll(text, [
    ['>Continua<', '>{copy.onboarding.continue}<'],
    ['>Indietro<', '>{copy.onboarding.back}<'],
    ['>Salta<', '>{copy.onboarding.skip}<'],
    ['>Importa<', '>{copy.onboarding.import}<'],
    ['>Collega<', '>{copy.onboarding.connect}<'],
    ['>Caricamento...<', '>{copy.onboarding.loading}<'],
    ['>Annulla<', '>{copy.onboarding.undo}<'],
    ['>Wishlist<', '>{copy.onboarding.wishlist}<'],
    ['Scegli cosa ami', '{copy.onboarding.chooseInterests}'],
    ['Importa dalle tue piattaforme', '{copy.onboarding.importFrom}'],
    ['Inizia lo swipe', '{copy.onboarding.startSwipe}'],
    ['Completa', '{copy.onboarding.finish}'],
  ])
  write(rel, text)
}

console.log('i18n nav/settings/onboarding sweep v26 applied')
