'use client'
// src/components/ui/Avatar.tsx
// Genera avatar con iniziali lato client senza dipendenze da dicebear.
// Usa un gradiente deterministico basato sullo username.

import { useState } from 'react'

const GRADIENTS: [string, string][] = [
  ['#7c3aed', '#a21caf'],   // violet → fuchsia
  ['#0891b2', '#7c3aed'],   // cyan → violet
  ['#059669', '#0891b2'],   // emerald → cyan
  ['#d97706', '#dc2626'],   // amber → red
  ['#7c3aed', '#2563eb'],   // violet → blue
  ['#be185d', '#7c3aed'],   // pink → violet
  ['#0e7490', '#059669'],   // teal → emerald
  ['#b45309', '#7c3aed'],   // orange → violet
]

function getGradient(seed: string): [string, string] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash |= 0
  }
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return (name[0] || '?').toUpperCase()
}

interface AvatarProps {
  src?: string | null
  username: string
  displayName?: string | null
  size?: number
  className?: string
}

export function Avatar({ src, username, displayName, size = 40, className = '' }: AvatarProps) {
  const [imgError, setImgError] = useState(false)
  const name = displayName || username
  const initials = getInitials(name)
  const [from, to] = getGradient(username)

  const style = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
  }

  if (src && !imgError) {
    return (
      <div className={`overflow-hidden rounded-full ${className}`} style={style}>
        <img
          src={src}
          alt={`Avatar di ${name}`}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  // SVG fallback generato localmente — nessuna chiamata a dicebear
  return (
    <div
      className={`overflow-hidden rounded-full flex items-center justify-center flex-shrink-0 ${className}`}
      style={{
        ...style,
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
      aria-label={`Avatar di ${name}`}
    >
      <span
        className="font-bold text-white select-none"
        style={{ fontSize: Math.max(size * 0.38, 10) }}
      >
        {initials}
      </span>
    </div>
  )
}

/**
 * Versione URL-based per i posti che non possono usare il componente React
 * (es: Navbar che usa <img src=...>). Restituisce una data URI SVG.
 */
export function getLocalAvatarSvg(username: string, displayName?: string | null): string {
  const name = displayName || username
  const initials = getInitials(name)
  const [from, to] = getGradient(username)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${from}"/>
        <stop offset="100%" stop-color="${to}"/>
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="50" fill="url(#g)"/>
    <text x="50" y="50" dominant-baseline="central" text-anchor="middle"
      font-family="-apple-system,BlinkMacSystemFont,sans-serif"
      font-size="38" font-weight="700" fill="white">${initials}</text>
  </svg>`

  return `data:image/svg+xml;base64,${btoa(svg)}`
}