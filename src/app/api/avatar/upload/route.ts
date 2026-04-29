// src/app/api/avatar/upload/route.ts
// S2: Validazione magic bytes lato server per upload avatar.
//     Previene upload di file non-immagine rinominati come .jpg/.png.
//     Il client non può falsificare il body di questa route.
// S5: Usa logger invece di console.error

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'

// Magic bytes per tipi immagine supportati
// Ogni entry: [offset_byte, bytes_attesi_in_hex]
const MAGIC_SIGNATURES: Array<{
  type: string
  mimeType: string
  signature: number[]
  offset?: number
}> = [
  // JPEG: FF D8 FF
  { type: 'jpeg', mimeType: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { type: 'png', mimeType: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // GIF87a: 47 49 46 38 37 61
  { type: 'gif', mimeType: 'image/gif', signature: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  // GIF89a: 47 49 46 38 39 61
  { type: 'gif', mimeType: 'image/gif', signature: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
  { type: 'webp', mimeType: 'image/webp', signature: [0x52, 0x49, 0x46, 0x46], offset: 0 },
]

const WEBP_SECONDARY = [0x57, 0x45, 0x42, 0x50] // "WEBP" at offset 8

function detectMimeType(buffer: Uint8Array): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    const offset = sig.offset ?? 0
    const match = sig.signature.every((byte, i) => buffer[offset + i] === byte)
    if (!match) continue

    // WebP ha firma secondaria
    if (sig.type === 'webp') {
      const secondaryMatch = WEBP_SECONDARY.every((byte, i) => buffer[8 + i] === byte)
      if (secondaryMatch) return sig.mimeType
      continue
    }

    return sig.mimeType
  }
  return null
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

export async function POST(request: NextRequest) {
  // Rate limit: max 5 upload avatar ogni 10 minuti
  const rl = rateLimit(request, { limit: 5, windowMs: 10 * 60_000, prefix: 'avatar-upload' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Troppi upload. Attendi qualche minuto.' },
      { status: 429, headers: rl.headers }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'FormData non valido' }, { status: 400 })
  }

  const file = formData.get('avatar')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'File mancante' }, { status: 400 })
  }

  // Controllo dimensione
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File troppo grande (max 5MB)' }, { status: 400 })
  }

  if (file.size < 8) {
    return NextResponse.json({ error: 'File non valido' }, { status: 400 })
  }

  // S2: Leggi i primi 16 byte per validare magic bytes
  const headerSlice = file.slice(0, 16)
  const headerBuffer = new Uint8Array(await headerSlice.arrayBuffer())

  const detectedMime = detectMimeType(headerBuffer)

  if (!detectedMime) {
    logger.warn('AvatarUpload', 'Rejected file with invalid magic bytes')
    return NextResponse.json(
      { error: 'Formato non supportato. Usa JPEG, PNG, GIF o WebP.' },
      { status: 415 }
    )
  }

  // Estensione dal mime type rilevato (non dal nome file del client)
  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  }
  const ext = extMap[detectedMime] || 'jpg'

  // La policy Storage richiede lo user id come prima cartella del path.
  const fileName = `${user.id}/avatar-${Date.now()}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(fileName, arrayBuffer, {
      contentType: detectedMime,
      upsert: true,
    })

  if (uploadError) {
    logger.error('AvatarUpload', 'Storage error')
    return NextResponse.json({ error: 'Errore durante il caricamento' }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)

  return NextResponse.json(
    { success: true, url: urlData.publicUrl },
    { headers: rl.headers }
  )
}
