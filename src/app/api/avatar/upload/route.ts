// src/app/api/avatar/upload/route.ts
// S2: Validazione magic bytes lato server per upload avatar.
//     Previene upload di file non-immagine rinominati come .jpg/.png.
//     Il client non può falsificare il body di questa route.
// S5: Usa logger invece di console.error

import { NextRequest, NextResponse } from 'next/server'
import { apiMessage } from '@/lib/i18n/apiErrors'
import { createClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'
import { checkOrigin } from '@/lib/csrf'

const MAGIC_SIGNATURES: Array<{
  type: string
  mimeType: string
  signature: number[]
  offset?: number
}> = [
  { type: 'jpeg', mimeType: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  { type: 'png', mimeType: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'gif', mimeType: 'image/gif', signature: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { type: 'gif', mimeType: 'image/gif', signature: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  { type: 'webp', mimeType: 'image/webp', signature: [0x52, 0x49, 0x46, 0x46], offset: 0 },
]

const WEBP_SECONDARY = [0x57, 0x45, 0x42, 0x50]
const MAX_SIZE_BYTES = 5 * 1024 * 1024

function detectMimeType(buffer: Uint8Array): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    const offset = sig.offset ?? 0
    const match = sig.signature.every((byte, i) => buffer[offset + i] === byte)
    if (!match) continue

    if (sig.type === 'webp') {
      const secondaryMatch = WEBP_SECONDARY.every((byte, i) => buffer[8 + i] === byte)
      if (secondaryMatch) return sig.mimeType
      continue
    }

    return sig.mimeType
  }
  return null
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 5, windowMs: 10 * 60_000, prefix: 'avatar-upload' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: apiMessage(request, 'tooManyUploads') },
      { status: 429, headers: rl.headers }
    )
  }
  if (!checkOrigin(request)) return NextResponse.json({ error: apiMessage(request, 'originNotAllowed') }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: apiMessage(request, 'notAuthenticated') }, { status: 401, headers: rl.headers })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: apiMessage(request, 'invalidFormData') }, { status: 400, headers: rl.headers })
  }

  const file = formData.get('avatar')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: apiMessage(request, 'missingFile') }, { status: 400, headers: rl.headers })
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: apiMessage(request, 'fileTooLarge5') }, { status: 400, headers: rl.headers })
  }

  if (file.size < 8) {
    return NextResponse.json({ error: apiMessage(request, 'invalidFile') }, { status: 400, headers: rl.headers })
  }

  const headerSlice = file.slice(0, 16)
  const headerBuffer = new Uint8Array(await headerSlice.arrayBuffer())
  const detectedMime = detectMimeType(headerBuffer)

  if (!detectedMime) {
    logger.warn('AvatarUpload', 'Rejected file with invalid magic bytes')
    return NextResponse.json(
      { error: apiMessage(request, 'unsupportedImageFormat') },
      { status: 415, headers: rl.headers }
    )
  }

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  }
  const ext = extMap[detectedMime] || 'jpg'
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
    return NextResponse.json({ error: apiMessage(request, 'uploadError') }, { status: 500, headers: rl.headers })
  }

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName)

  return NextResponse.json(
    { success: true, url: urlData.publicUrl },
    { headers: rl.headers }
  )
}
