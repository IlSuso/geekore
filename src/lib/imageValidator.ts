// src/lib/imageValidator.ts
// Fix #7 Repair Bible: validazione MIME lato server tramite magic number.
// Blocca SVG, HTML, eseguibili e qualsiasi file non-immagine rinominato.

const SIGNATURES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { mime: 'image/png',  bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { mime: 'image/gif',  bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/bmp',  bytes: [0x42, 0x4D] },
  // TIFF little-endian / big-endian
  { mime: 'image/tiff', bytes: [0x49, 0x49, 0x2A, 0x00] },
  { mime: 'image/tiff', bytes: [0x4D, 0x4D, 0x00, 0x2A] },
]

const MAX_SIZE_BYTES = 8 * 1024 * 1024 // 8 MB

/**
 * Valida un file immagine tramite magic number (primi byte del file).
 * WebP usa RIFF header — check separato.
 * SVG è XML testo — non corrisponde a nessun magic number → rifiutato.
 *
 * @throws Error con messaggio leggibile in caso di file non valido.
 * @returns Il MIME type rilevato.
 */
export async function validateImage(file: File): Promise<string> {
  if (file.size === 0) throw new Error('File vuoto')
  if (file.size > MAX_SIZE_BYTES) throw new Error('Dimensione massima: 8 MB')

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())

  // WebP: 'RIFF' (0x52 0x49 0x46 0x46) + 4 byte size + 'WEBP' (0x57 0x45 0x42 0x50)
  if (
    header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
    header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50
  ) {
    return 'image/webp'
  }

  for (const { mime, bytes, offset = 0 } of SIGNATURES) {
    if (bytes.every((b, i) => header[offset + i] === b)) {
      return mime
    }
  }

  throw new Error('Formato immagine non supportato. Usa JPEG, PNG, WebP o GIF.')
}

/**
 * Versione per Buffer (uso in API route Node.js dove File non è disponibile).
 */
export function validateImageBuffer(buf: Uint8Array): string {
  if (buf.length < 12) throw new Error('File troppo piccolo')

  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return 'image/webp'

  for (const { mime, bytes, offset = 0 } of SIGNATURES) {
    if (bytes.every((b, i) => buf[offset + i] === b)) return mime
  }

  throw new Error('Formato immagine non supportato. Usa JPEG, PNG, WebP o GIF.')
}
