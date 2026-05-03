import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
const write = (p, s) => fs.writeFileSync(p, s)

function patchFile(rel, patcher) {
  const p = path.join(root, rel)
  const src = read(p)
  if (src == null) return false
  const next = patcher(src)
  if (next !== src) write(p, next)
  return next !== src
}

function ensureImport(src, importLine) {
  if (src.includes(importLine)) return src
  const lines = src.split('\n')
  let insertAt = 0
  while (insertAt < lines.length && (lines[insertAt].startsWith('import ') || lines[insertAt].trim() === '' || lines[insertAt].startsWith('//') || lines[insertAt] === "'use client'")) insertAt++
  lines.splice(insertAt, 0, importLine)
  return lines.join('\n')
}

let changed = []

// Make old translateGenre calls locale-aware where possible.
for (const rel of [
  'src/components/media/MediaDetailsDrawer.tsx',
  'src/app/library/page.tsx',
  'src/app/profile/[username]/page.tsx',
  'src/app/lists/page.tsx',
  'src/app/wishlist/page.tsx',
]) {
  const did = patchFile(rel, src => {
    let out = src
    if (out.includes('translateGenre(')) {
      out = ensureImport(out, "import { genreLabel, mediaTypeLabel, statusLabel } from '@/lib/i18n/displayLabels'")
      if (!out.includes('const { locale } = useLocale()') && out.includes('useLocale()')) {
        out = out.replace(/const \{([^}]*?)\}\s*=\s*useLocale\(\)/, (m, inner) => {
          if (inner.includes('locale')) return m
          return `const {${inner}, locale } = useLocale()`
        })
      }
      out = out.replace(/translateGenre\(([^)]+)\)/g, 'genreLabel($1, locale)')
    }
    return out
  })
  if (did) changed.push(rel)
}

// Add lang to common direct API calls not covered by fetch bridge because some routes use absolute/custom URLs.
for (const rel of [
  'src/app/discover/page.tsx',
  'src/app/for-you/page.tsx',
  'src/components/for-you/SwipeMode.tsx',
]) {
  const did = patchFile(rel, src => {
    let out = src
    out = out.replace(/\/api\/bgg\?q=\$\{encodeURIComponent\(([^)]+)\)\}/g, '/api/bgg?q=${encodeURIComponent($1)}&lang=${lang}')
    out = out.replace(/\/api\/recommendations\?type=all(?![^'"`]*lang=)/g, '/api/recommendations?type=all&lang=${locale}')
    return out
  })
  if (did) changed.push(rel)
}

// Make collection/wishlist client payloads carry multilingual fields if the media object already has them.
for (const rel of [
  'src/components/media/MediaDetailsDrawer.tsx',
  'src/app/discover/page.tsx',
  'src/app/for-you/page.tsx',
  'src/components/for-you/SwipeMode.tsx',
]) {
  const did = patchFile(rel, src => {
    let out = src
    if (!out.includes('localized: media.localized') && out.includes('title_en: media.title_en')) {
      out = out.replace(/title_en:\s*media\.title_en \|\| media\.title,/g, `title_en: media.title_en || media.title,
        title_original: (media as any).title_original || media.title,
        title_it: (media as any).title_it || null,
        description_en: (media as any).description_en || media.description || null,
        description_it: (media as any).description_it || null,
        localized: (media as any).localized || null,`)
    }
    if (!out.includes('localized: media.localized') && out.includes('body: JSON.stringify({') && out.includes('cover_image: media.coverImage')) {
      out = out.replace(/cover_image:\s*media\.coverImage,/g, `cover_image: media.coverImage,
          title_original: (media as any).title_original || media.title,
          title_en: (media as any).title_en || media.title,
          title_it: (media as any).title_it || null,
          description_en: (media as any).description_en || media.description || null,
          description_it: (media as any).description_it || null,
          localized: (media as any).localized || null,`)
    }
    return out
  })
  if (did) changed.push(rel)
}

console.log('i18n persistence/library v30 applied')
if (changed.length) console.log('changed:', [...new Set(changed)].join(', '))
else console.log('no matching files changed; helper/sql files are still available')
