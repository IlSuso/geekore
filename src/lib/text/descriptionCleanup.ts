export function stripDescriptionSourceAttribution(value: string): string {
  let text = value

  // AniList/MAL spesso appendono attribuzioni tipo:
  // "(Source: MAL Rewrite)", "(Source: MangaUpdates)", "(Fonte: ...)".
  // Vanno rimosse solo quando sono una coda di attribuzione, non quando
  // "source/fonte" è parte normale della sinossi.
  const trailingParenthesizedSource = /\s*[\[(]\s*(?:source|sources|fonte|fonti)\s*:\s*[^\])]*[\])]\s*$/i
  const trailingPlainSource = /(?:\s|\n)+(?:source|sources|fonte|fonti)\s*:\s*[^\n.。!?]*\s*$/i

  let previous = ''
  while (text && text !== previous) {
    previous = text
    text = text
      .replace(trailingParenthesizedSource, '')
      .replace(trailingPlainSource, '')
      .trim()
  }

  return text
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

export function cleanDescriptionForDisplay(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined

  const clean = stripDescriptionSourceAttribution(value
    .replace(/\u0000/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim())

  if (!clean) return undefined
  if (/^(0|null|undefined|nan|n\/a|none)$/i.test(clean)) return undefined
  return clean
}
