'use client'
// src/components/ui/CompletionCertificate.tsx
// N9: Genera un certificato PNG via Canvas API quando un media viene completato
// Condivisibile via Web Share API — fallback clipboard

import { useCallback, useRef } from 'react'
import { Share2, Download, X, Trophy, Star } from 'lucide-react'

interface CertificateProps {
  title: string
  type: string
  coverImage?: string
  rating?: number
  username: string
  completedAt?: string
  onClose: () => void
}

const TYPE_LABEL: Record<string, string> = {
  anime: 'Anime', manga: 'Manga', game: 'Videogioco',
  movie: 'Film', tv: 'Serie TV',
}

const TYPE_COLOR: Record<string, [string, string]> = {
  anime:     ['#38bdf8', '#0284c7'],
  manga:     ['#fb923c', '#c2410c'],
  game:      ['#4ade80', '#15803d'],
  movie:     ['#f87171', '#dc2626'],
  tv:        ['#c084fc', '#9333ea'],
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function drawStars(ctx: CanvasRenderingContext2D, x: number, y: number, rating: number, size = 18) {
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < rating ? '#fbbf24' : '#3f3f46'
    ctx.beginPath()
    const cx = x + i * (size + 4)
    const cy = y
    for (let j = 0; j < 5; j++) {
      const angle = (j * 4 * Math.PI) / 5 - Math.PI / 2
      const r = j % 2 === 0 ? size / 2 : size / 5
      const px = cx + r * Math.cos(angle)
      const py = cy + r * Math.sin(angle)
      j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fill()
  }
}

async function generateCertificateCanvas(props: CertificateProps): Promise<HTMLCanvasElement> {
  const W = 540
  const H = 960
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background
  const [c1, c2] = TYPE_COLOR[props.type] || ['#7c6af7', '#d946ef']
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#09090b')
  bg.addColorStop(0.5, '#0f0a1e')
  bg.addColorStop(1, '#09090b')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // Glow top
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 300)
  glow.addColorStop(0, c1 + '40')
  glow.addColorStop(1, 'transparent')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, 300)

  // Cover image (se disponibile)
  let coverLoaded = false
  if (props.coverImage) {
    const img = await loadImage(props.coverImage)
    if (img) {
      const coverW = 200
      const coverH = 280
      const coverX = (W - coverW) / 2
      const coverY = 60
      ctx.save()
      ctx.shadowColor = c1 + '80'
      ctx.shadowBlur = 30
      const r = 16
      ctx.beginPath()
      ctx.roundRect(coverX, coverY, coverW, coverH, r)
      ctx.clip()
      ctx.drawImage(img, coverX, coverY, coverW, coverH)
      ctx.restore()
      coverLoaded = true
    }
  }

  // Geekore logo
  ctx.fillStyle = '#7c6af7'
  ctx.font = 'bold 16px -apple-system, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('geekore', W / 2, 30)

  const contentY = coverLoaded ? 370 : 120

  // Badge tipo
  const [tc1, tc2] = TYPE_COLOR[props.type] || ['#7c6af7', '#d946ef']
  const typeGrad = ctx.createLinearGradient(0, 0, 120, 0)
  typeGrad.addColorStop(0, tc1)
  typeGrad.addColorStop(1, tc2)
  ctx.fillStyle = typeGrad
  ctx.beginPath()
  ctx.roundRect((W - 100) / 2, contentY, 100, 28, 14)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 12px -apple-system, system-ui, sans-serif'
  ctx.fillText(TYPE_LABEL[props.type] || props.type, W / 2, contentY + 18)

  // Titolo
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 28px -apple-system, system-ui, sans-serif'
  ctx.textAlign = 'center'
  const words = props.title.split(' ')
  let line = ''
  let lineY = contentY + 70
  for (const word of words) {
    const test = line + word + ' '
    if (ctx.measureText(test).width > W - 80 && line !== '') {
      ctx.fillText(line.trim(), W / 2, lineY)
      line = word + ' '
      lineY += 36
    } else {
      line = test
    }
  }
  ctx.fillText(line.trim(), W / 2, lineY)
  lineY += 50

  // Trofeo
  ctx.font = '48px serif'
  ctx.textAlign = 'center'
  ctx.fillText('🏆', W / 2, lineY + 10)
  lineY += 70

  // Messaggio
  ctx.fillStyle = '#a1a1aa'
  ctx.font = '16px -apple-system, system-ui, sans-serif'
  ctx.fillText('Ho completato', W / 2, lineY)
  lineY += 30

  // Rating stelle
  if (props.rating && props.rating > 0) {
    drawStars(ctx, (W - (5 * 22)) / 2, lineY + 10, props.rating)
    lineY += 50
  }

  // Username
  ctx.fillStyle = '#7c6af7'
  ctx.font = 'bold 18px -apple-system, system-ui, sans-serif'
  ctx.fillText('@' + props.username, W / 2, lineY + 20)
  lineY += 50

  // Data
  if (props.completedAt) {
    const date = new Date(props.completedAt).toLocaleDateString('it-IT', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    ctx.fillStyle = '#52525b'
    ctx.font = '14px -apple-system, system-ui, sans-serif'
    ctx.fillText(date, W / 2, lineY)
  }

  // Footer divider
  ctx.strokeStyle = '#27272a'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(60, H - 60)
  ctx.lineTo(W - 60, H - 60)
  ctx.stroke()

  ctx.fillStyle = '#3f3f46'
  ctx.font = '12px -apple-system, system-ui, sans-serif'
  ctx.fillText('geekore.it', W / 2, H - 35)

  return canvas
}

export function CompletionCertificate(props: CertificateProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const handleGenerate = useCallback(async () => {
    const canvas = await generateCertificateCanvas(props)
    canvasRef.current = canvas

    canvas.toBlob(async (blob) => {
      if (!blob) return
      const file = new File([blob], `geekore-${props.username}-${Date.now()}.png`, { type: 'image/png' })

      // Web Share API con file
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Ho completato ${props.title} su Geekore!`,
          files: [file],
        })
      } else {
        // Fallback: download diretto
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
      }
    }, 'image/png')
  }, [props])

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-sm w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Trophy size={18} className="text-yellow-400" /> Completato!</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Hai completato {props.title}</p>
          </div>
          <button
            onClick={props.onClose}
            className="w-8 h-8 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Preview card */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 text-center mb-5">
          <div className="flex justify-center mb-3"><Trophy size={40} className="text-yellow-400" /></div>
          {props.coverImage && (
            <img
              src={props.coverImage}
              alt={props.title}
              className="w-20 h-28 object-cover rounded-xl mx-auto mb-3"
            />
          )}
          <p className="text-sm font-bold text-white line-clamp-2 mb-1">{props.title}</p>
          <p className="text-xs text-zinc-500">{TYPE_LABEL[props.type] || props.type}</p>
          {props.rating && props.rating > 0 && (
            <div className="flex justify-center gap-0.5 mt-2">
              {[1,2,3,4,5].map(s => (
                <Star key={s} size={14} className={s <= props.rating! ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-700'} />
              ))}
            </div>
          )}
          <p className="text-[10px] mt-2" style={{ color: '#E6FF3D' }}>@{props.username} su geekore.it</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={props.onClose}
            className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-sm font-medium transition-colors"
          >
            Chiudi
          </button>
          <button
            onClick={handleGenerate}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all"
            style={{ background: '#E6FF3D', color: '#0B0B0F' }}
          >
            <Share2 size={14} />
            Condividi
          </button>
        </div>
      </div>
    </div>
  )
}
