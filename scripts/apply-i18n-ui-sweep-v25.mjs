import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const files = {
  discover: path.join(root, 'src/app/discover/page.tsx'),
  drawer: path.join(root, 'src/components/media/MediaDetailsDrawer.tsx'),
  swipe: path.join(root, 'src/components/for-you/SwipeMode.tsx'),
}

function read(file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null }
function write(file, text) { fs.writeFileSync(file, text) }
function ensureImport(text, importLine, afterNeedle) {
  if (text.includes(importLine)) return text
  return text.replace(afterNeedle, `${afterNeedle}\n${importLine}`)
}
function replaceAll(text, pairs) {
  for (const [from, to] of pairs) text = text.split(from).join(to)
  return text
}

// Discover sweep
{
  let text = read(files.discover)
  if (text) {
    text = ensureImport(text, "import { appCopy, discoverFilterLabel, typeLabel } from '@/lib/i18n/uiCopy'", "import { useLocale } from '@/lib/locale'")
    text = text.replace("function useVoiceSearch(onResult: (text: string) => void) {", "function useVoiceSearch(onResult: (text: string) => void, locale: 'it' | 'en' = 'it') {")
    text = text.replace("rec.lang = 'it-IT'", "rec.lang = locale === 'en' ? 'en-US' : 'it-IT'")
    text = text.replace("const { isListening, isSupported: voiceSupported, toggle: toggleVoice } = useVoiceSearch((transcript) => setSearchTerm(transcript))", "const { isListening, isSupported: voiceSupported, toggle: toggleVoice } = useVoiceSearch((transcript) => setSearchTerm(transcript), locale)")
    text = text.replace("const d = t.discover", "const d = t.discover\n  const ui = appCopy[locale]")
    text = text.replace("fetch(`/api/bgg?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })", "fetch(`/api/bgg?q=${encodeURIComponent(trimmed)}&lang=${lang}`, { signal: controller.signal })")
    text = text.replace("{tf.icon}{tf.label}", "{tf.icon}{discoverFilterLabel(tf.id, locale)}")
    text = text.replace(/aria-label="Discover search"/g, "aria-label={ui.discover.searchLabel}")
    text = text.replace(/aria-label="Filtri Discover"/g, "aria-label={ui.discover.filtersLabel}")
    text = text.replace("placeholder={isListening ? 'In ascolto...' : 'Cerca anime, film, giochi, serie...'}", "placeholder={isListening ? ui.discover.listeningPlaceholder : ui.discover.searchPlaceholder}")
    text = text.replace(/aria-label="Cancella ricerca"/g, "aria-label={ui.discover.clearSearch}")
    text = text.replace(/aria-label=isListening  'Ferma ricerca vocale' : 'Avvia ricerca vocale'/g, "aria-label={isListening ? ui.discover.stopVoice : ui.discover.startVoice}")
    text = replaceAll(text, [
      [">In ascolto...</span>", ">{ui.discover.listening}</span>"],
      [">Annulla</button>", ">{ui.common.cancel}</button>"],
      [">Ricerca in corso…</span>", ">{ui.common.searching}</span>"],
      ['title="Parti da un universo" subtitle="Shortcut editoriali per aprire subito ricerche utili"', 'title={ui.discover.browseTitle} subtitle={ui.discover.browseSubtitle}'],
      ['title="Trending oggi" subtitle="Il mix più caldo tra community e cataloghi"', 'title={ui.discover.trendingTitle} subtitle={ui.discover.trendingSubtitle}'],
      ['Nessun risultato trovato', '{ui.common.noResults}'],
      ['TYPE_LABELS[type] || type', 'typeLabel(type, locale)'],
      ['TYPE_LABELS[item.type] || item.type', 'typeLabel(item.type, locale)'],
    ])
    write(files.discover, text)
  }
}

// Drawer sweep
{
  let text = read(files.drawer)
  if (text) {
    text = ensureImport(text, "import { useLocale } from '@/lib/locale'", "import { optimizeCover } from '@/lib/imageOptimizer'")
    text = ensureImport(text, "import { appCopy, typeLabel, genreLabel, relationLabels } from '@/lib/i18n/uiCopy'", "import { useLocale } from '@/lib/locale'")
    text = text.replace("const supabase = createClient()", "const supabase = createClient()\n  const { locale } = useLocale()\n  const ui = appCopy[locale].drawer\n  const commonUi = appCopy[locale].common")
    text = text.replace("const RELATION_LABEL: Record<string, string> = {\n  SEQUEL: 'Sequel', PREQUEL: 'Prequel', SIDE_STORY: 'Side story',\n  SPIN_OFF: 'Spin-off', ALTERNATIVE: 'Alternativo',\n}", "const RELATION_LABEL: Record<string, string> = {\n  SEQUEL: 'Sequel', PREQUEL: 'Prequel', SIDE_STORY: 'Side story',\n  SPIN_OFF: 'Spin-off', ALTERNATIVE: 'Alternative',\n}")
    text = replaceAll(text, [
      ['title="Generi"', 'title={ui.genres}'],
      ['title="Perché te lo consigliamo"', 'title={ui.why}'],
      ['title="Descrizione"', 'title={ui.description}'],
      ['title="Meccaniche"', 'title={ui.mechanics}'],
      ['title="Designer"', 'title={ui.designers}'],
      ['title="Piattaforme"', 'title={ui.platforms}'],
      ['title="Temi"', 'title={ui.themes}'],
      ['title="Cast"', 'title={ui.cast}'],
      ['title="Dove guardarlo"', 'title={ui.providers}'],
      ['title="Collegati"', 'title={ui.relations}'],
      ['title="Fonte"', 'title={ui.source}'],
      ["<MediaDetailsTag key={g} accent>{translateGenre(g)}</MediaDetailsTag>", "<MediaDetailsTag key={g} accent>{genreLabel(translateGenre(g), locale)}</MediaDetailsTag>"],
      ["<p className=\"gk-label mb-1\">Voto</p>", "<p className=\"gk-label mb-1\">{commonUi.score}</p>"],
      ["<p className=\"gk-label mb-1\">Anno</p>", "<p className=\"gk-label mb-1\">{commonUi.year}</p>"],
      ["<p className=\"gk-label mb-1\">Stagioni</p>", "<p className=\"gk-label mb-1\">{commonUi.seasons}</p>"],
      ["<p className=\"gk-label mb-1\">Durata</p>", "<p className=\"gk-label mb-1\">{commonUi.duration}</p>"],
      ["<p className=\"gk-label mb-1\">Difficoltà</p>", "<p className=\"gk-label mb-1\">{commonUi.difficulty}</p>"],
      ["<p className=\"gk-label mb-1\">Giocatori</p>", "<p className=\"gk-label mb-1\">{commonUi.players}</p>"],
      ["<p className=\"gk-label mb-1\">Pagine</p>", "<p className=\"gk-label mb-1\">{commonUi.pages}</p>"],
      ["'Autori'", "ui.authors"],
      ["'Editori'", "ui.publishers"],
      ["'Studio'", "ui.studios"],
      ["'Registi'", "ui.directors"],
      ["'Cap.'", "commonUi.chapters"],
      ["'Ep.'", "commonUi.episodes"],
      ["'min/ep'", "commonUi.minutesPerEpisode"],
      ["'min'", "commonUi.minutesShort"],
      ["RELATION_LABEL[r.relationType]", "relationLabels[locale][r.relationType]"],
    ])
    write(files.drawer, text)
  }
}

// Swipe sweep: conservative string replacements only, avoids changing layout logic.
{
  let text = read(files.swipe)
  if (text) {
    text = ensureImport(text, "import { useLocale } from '@/lib/locale'", "import { optimizeCover } from '@/lib/imageOptimizer'")
    text = ensureImport(text, "import { appCopy, typeLabel, genreLabel } from '@/lib/i18n/uiCopy'", "import { useLocale } from '@/lib/locale'")
    // Insert locale only once inside exported component, near first createClient or first state block.
    if (!text.includes('const swipeUi = appCopy[locale].swipe')) {
      text = text.replace("const supabase = createClient()", "const supabase = createClient()\n  const { locale } = useLocale()\n  const swipeUi = appCopy[locale].swipe\n  const commonUi = appCopy[locale].common")
    }
    text = replaceAll(text, [
      ['Come funziona', '{swipeUi.howItWorks}'],
      ['Dettagli', '{swipeUi.details}'],
      ['Descrizione', '{swipeUi.description}'],
      ['Generi', '{swipeUi.genres}'],
      ['Fonte dati', '{swipeUi.source}'],
      ['Perché te lo consigliamo', '{swipeUi.why}'],
      ['Annulla', '{swipeUi.undo}'],
      ['Nessuna card disponibile', '{swipeUi.empty}'],
      ['Caricamento consigli…', '{swipeUi.loading}'],
      ['Giochi da Tavolo', "{typeLabel('boardgame', locale)}"],
      ['Videogiochi', "{typeLabel('game', locale)}"],
      ['Serie TV', "{typeLabel('tv', locale)}"],
    ])
    write(files.swipe, text)
  }
}

console.log('i18n UI sweep v25 applied. Run npm run build and inspect Discover, Drawer and Swipe.')
