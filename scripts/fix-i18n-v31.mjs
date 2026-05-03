import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function write(rel, content) {
  fs.writeFileSync(path.join(root, rel), content)
}

function ensureImport(content, importLine) {
  if (content.includes(importLine)) return content
  const lines = content.split('\n')
  let lastImportIndex = -1
  let inBlockImport = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('import {') && !line.includes(' from ')) {
      inBlockImport = true
    }

    if (inBlockImport && line.includes('} from ')) {
      inBlockImport = false
      lastImportIndex = i
      continue
    }

    if (!inBlockImport && line.startsWith('import ')) {
      lastImportIndex = i
    }

    if (!line.startsWith('import ') && !inBlockImport && line.trim() !== '' && lastImportIndex >= 0) {
      break
    }
  }

  lines.splice(lastImportIndex + 1, 0, importLine)
  return lines.join('\n')
}

function fixMediaDetailsDrawer() {
  const rel = 'src/components/media/MediaDetailsDrawer.tsx'
  let content = read(rel)

  // Lo script v30 poteva avere inserito questo import dentro il blocco lucide:
  // import {
  // import { genreLabel, mediaTypeLabel, statusLabel } ...
  //   ExternalLink, ...
  content = content.replace(
    /\nimport\s+\{\s*genreLabel,\s*mediaTypeLabel,\s*statusLabel\s*\}\s+from\s+['"]@\/lib\/i18n\/displayLabels['"]\s*\n/g,
    '\n'
  )
  content = content.replace(
    /\nimport\s+\{\s*genreLabel,\s*mediaTypeLabel\s*\}\s+from\s+['"]@\/lib\/i18n\/displayLabels['"]\s*\n/g,
    '\n'
  )

  content = ensureImport(
    content,
    "import { genreLabel, mediaTypeLabel } from '@/lib/i18n/displayLabels'"
  )

  // Se qualche sostituzione ha lasciato statusLabel nel codice ma non serve,
  // non lo importiamo: il drawer normalmente usa solo label tipo/genere.
  write(rel, content)
  console.log('fixed', rel)
}

function fixSettingsAppCopyCall() {
  const rel = 'src/app/settings/page.tsx'
  if (!fs.existsSync(path.join(root, rel))) return

  let content = read(rel)
  content = content.replaceAll('appCopy[locale]', 'appCopy(locale)')
  content = content.replaceAll('copy.settings.appLanguageDesc', 'copy.settings.productLanguage')
  write(rel, content)
  console.log('checked', rel)
}

function fixSwipeUiCopyImport() {
  const rel = 'src/components/for-you/SwipeMode.tsx'
  if (!fs.existsSync(path.join(root, rel))) return

  let content = read(rel)

  content = content.replace(
    /import\s+\{\s*uiCopy\s*\}\s+from\s+['"]@\/lib\/i18n\/uiCopy['"]\n?/g,
    ''
  )

  if (content.includes('appCopy[locale].swipe') || content.includes('appCopy[locale].common')) {
    content = ensureImport(content, "import { appCopy } from '@/lib/i18n/uiCopy'")
  }

  content = content.replaceAll('uiCopy(locale).swipe', 'appCopy[locale].swipe')
  content = content.replaceAll('uiCopy(locale).common', 'appCopy[locale].common')

  write(rel, content)
  console.log('checked', rel)
}

function fixMediaLocalizationSemicolon() {
  const rel = 'src/lib/i18n/mediaLocalization.ts'
  if (!fs.existsSync(path.join(root, rel))) return

  let content = read(rel)
  content = content.replace(
    /\(item as any\)\.description_it = text\s+\(item as any\)\.localized = \{/g,
    `const mutable = item as any

    mutable.description_it = text
    mutable.localized = {`
  )

  write(rel, content)
  console.log('checked', rel)
}

function fixUiCopyDuplicateRomance() {
  const rel = 'src/lib/i18n/uiCopy.ts'
  if (!fs.existsSync(path.join(root, rel))) return

  let content = read(rel)

  // Rimuove solo il secondo Romance nello stesso oggetto italiano, lasciando la prima occorrenza.
  let seen = false
  content = content.replace(/Romance:\s*'Romance',?/g, (match) => {
    if (!seen) {
      seen = true
      return match.endsWith(',') ? match : `${match},`
    }
    return ''
  })

  write(rel, content)
  console.log('checked', rel)
}

fixMediaDetailsDrawer()
fixSettingsAppCopyCall()
fixSwipeUiCopyImport()
fixMediaLocalizationSemicolon()
fixUiCopyDuplicateRomance()

console.log('i18n v31 build fixes applied')
