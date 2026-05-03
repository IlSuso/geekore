import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function read(rel) {
  const file = path.join(root, rel)
  if (!fs.existsSync(file)) throw new Error(`File non trovato: ${rel}`)
  return { file, text: fs.readFileSync(file, 'utf8') }
}

function write(file, text) {
  fs.writeFileSync(file, text)
}

function addImport(text, importLine) {
  if (text.includes(importLine)) return text
  const lines = text.split('\n')
  let insertAt = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) insertAt = i + 1
  }
  lines.splice(insertAt, 0, importLine)
  return lines.join('\n')
}

// ── SwipeMode: useLocale import + appCopy import if needed ───────────────────
{
  const rel = 'src/components/for-you/SwipeMode.tsx'
  const { file, text: original } = read(rel)
  let text = original

  if (text.includes('useLocale()') && !text.includes("from '@/lib/locale'")) {
    text = addImport(text, "import { useLocale } from '@/lib/locale'")
  }

  if (text.includes('appCopy[') && !text.includes("from '@/lib/i18n/appCopy'")) {
    text = addImport(text, "import { appCopy } from '@/lib/i18n/appCopy'")
  }

  if (text !== original) {
    write(file, text)
    console.log(`fixed ${rel}`)
  } else {
    console.log(`ok ${rel}`)
  }
}

// ── Settings: appCopy import + const copy inside SettingsPage ────────────────
{
  const rel = 'src/app/settings/page.tsx'
  const { file, text: original } = read(rel)
  let text = original

  if (text.includes('copy.') && !text.includes("from '@/lib/i18n/appCopy'")) {
    text = addImport(text, "import { appCopy } from '@/lib/i18n/appCopy'")
  }

  if (text.includes('copy.') && !/const\s+copy\s*=\s*appCopy\[locale\]/.test(text)) {
    const patterns = [
      /const\s*\{\s*locale\s*,\s*setLocale\s*,\s*t\s*\}\s*=\s*useLocale\(\)/,
      /const\s*\{\s*locale\s*,\s*t\s*,\s*setLocale\s*\}\s*=\s*useLocale\(\)/,
      /const\s*\{\s*t\s*,\s*locale\s*,\s*setLocale\s*\}\s*=\s*useLocale\(\)/,
      /const\s*\{\s*setLocale\s*,\s*locale\s*,\s*t\s*\}\s*=\s*useLocale\(\)/,
    ]

    let replaced = false
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        text = text.replace(pattern, match => `${match}\n  const copy = appCopy[locale]`)
        replaced = true
        break
      }
    }

    if (!replaced) {
      text = text.replace(
        /export default function SettingsPage\(\) \{\n/,
        "export default function SettingsPage() {\n  const { locale, setLocale, t } = useLocale()\n  const copy = appCopy[locale]\n",
      )
    }
  }

  if (text !== original) {
    write(file, text)
    console.log(`fixed ${rel}`)
  } else {
    console.log(`ok ${rel}`)
  }
}

console.log('i18n build fix v27 applied. Run npm run build.')
