import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimitAsync } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'
import { checkOrigin } from '@/lib/csrf'

const MAX_SIZE_BYTES = 6 * 1024 * 1024

const MAGIC_SIGNATURES: Array<{
  mimeType: string
  signature: number[]
  offset?: number
  secondary?: { offset: number; signature: number[] }
}> = [
  { mimeType: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  { mimeType: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/gif', signature: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },
  { mimeType: 'image/gif', signature: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] },
  {
    mimeType: 'image/webp',
    signature: [0x52, 0x49, 0x46, 0x46],
    secondary: { offset: 8, signature: [0x57, 0x45, 0x42, 0x50] },
  },
]

function detectMimeType(buffer: Uint8Array): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    const offset = sig.offset ?? 0
    const match = sig.signature.every((byte, i) => buffer[offset + i] === byte)
    if (!match) continue
    if (sig.secondary) {
      const second = sig.secondary.signature.every((byte, i) => buffer[sig.secondary!.offset + i] === byte)
      if (!second) continue
    }
    return sig.mimeType
  }
  return null
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, { limit: 12, windowMs: 10 * 60_000, prefix: 'post-image-upload' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Troppi upload. Attendi qualche minuto.' },
      { status: 429, headers: rl.headers }
    )
  }
  if (!checkOrigin(request)) return NextResponse.json({ error: 'Origin non consentito' }, { status: 403, headers: rl.headers })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autenticato' }, { status: 401, headers: rl.headers })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'FormData non valido' }, { status: 400, headers: rl.headers })
  }

  const file = formData.get('image')
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'File mancante' }, { status: 400, headers: rl.headers })
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File troppo grande (max 6MB)' }, { status: 400, headers: rl.headers })
  }
  if (file.size < 12) {
    return NextResponse.json({ error: 'File non valido' }, { status: 400, headers: rl.headers })
  }

  const headerBuffer = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const detectedMime = detectMimeType(headerBuffer)
  if (!detectedMime) {
    logger.warn('PostImageUpload', 'Rejected file with invalid magic bytes')
    return NextResponse.json(
      { error: 'Formato non supportato. Usa JPEG, PNG, GIF o WebP.' },
      { status: 415, headers: rl.headers }
    )
  }

  const extMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  }
  const fileName = `${user.id}/${crypto.randomUUID()}.${extMap[detectedMime] || 'jpg'}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('post-images')
    .upload(fileName, arrayBuffer, {
      contentType: detectedMime,
      upsert: false,
    })

  if (uploadError) {
    logger.error('PostImageUpload', 'Storage error')
    return NextResponse.json({ error: 'Errore durante il caricamento' }, { status: 500, headers: rl.headers })
  }

  const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(fileName)
  return NextResponse.json(
    { success: true, url: urlData.publicUrl },
    { headers: rl.headers }
  )
}
