'use client'
// src/components/ui/Avatar.tsx
// Design system: quadrati con radius, gradient type-colors da hash, story-ring

import { useState } from 'react'
import Image from 'next/image'

// Coppie di type-token colors per i gradient avatar
const TYPE_GRADIENT_PAIRS: [string, string][] = [
  ['#38BDF8', '#C084FC'], // anime + tv
  ['#4ADE80', '#FB923C'], // game + board
  ['#F97066', '#EF4444'], // manga + movie
  ['#C084FC', '#38BDF8'], // tv + anime
  ['#FB923C', '#4ADE80'], // board + game
  ['#EF4444', '#F97066'], // movie + manga
  ['#38BDF8', '#4ADE80'], // anime + game
  ['#F97066', '#C084FC'], // manga + tv
]

function getGradientPair(seed: string): [string, string] {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i)
    hash |= 0
  }
  return TYPE_GRADIENT_PAIRS[Math.abs(hash) % TYPE_GRADIENT_PAIRS.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return (name.slice(0, 2) || '?').toUpperCase()
}

// sm=24/r8, md=32/r12, lg=76/r24
function getRadius(size: number): number {
  if (size <= 24) return 8
  if (size <= 40) return 12
  if (size >= 72) return 24
  return Math.round(size * 0.375)
}

interface AvatarProps {
  src?: string | null
  username: string
  displayName?: string | null
  size?: number
  className?: string
  /** Se true, avvolge l'avatar con lo story-ring giallo-lime */
  hasStory?: boolean
}

export function Avatar({ src, username, displayName, size = 32, className = '', hasStory = false }: AvatarProps) {
  const [imgError, setImgError] = useState(false)
  const name = displayName || username
  const initials = getInitials(name)
  const [from, to] = getGradientPair(username)
  const radius = getRadius(size)

  const isRemoteUrl = src && !imgError && (
    src.startsWith('https://') || src.startsWith('http://')
  )

  const avatarNode = isRemoteUrl ? (
    <div
      style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0 }}
      className={hasStory ? '' : className}
      aria-label={`Avatar di ${name}`}
    >
      {src!.includes('dicebear.com') ? (
        <img
          src={src!}
          alt={`Avatar di ${name}`}
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <Image
          src={src!}
          alt={`Avatar di ${name}`}
          width={size}
          height={size}
          sizes={`(max-width: 768px) ${Math.min(size, 48)}px, ${size}px`}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgError(true)}
          loading="lazy"
        />
      )}
    </div>
  ) : (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      className={hasStory ? '' : className}
      aria-label={`Avatar di ${name}`}
    >
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          color: '#0B0B0F',
          fontSize: Math.max(Math.round(size * 0.38), 9),
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        {initials}
      </span>
    </div>
  )

  if (hasStory) {
    return (
      <div className={`gk-story-ring inline-flex flex-shrink-0 ${className}`}>
        <div className="gk-story-ring-inner">
          {avatarNode}
        </div>
      </div>
    )
  }

  return avatarNode
}

/**
 * Versione URL-based per i posti che non possono usare il componente React
 */
export function getLocalAvatarSvg(username: string, displayName?: string | null): string {
  const name = displayName || username
  const initials = getInitials(name)
  const [from, to] = getGradientPair(username)

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${from}"/>
        <stop offset="100%" stop-color="${to}"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" rx="30" fill="url(#g)"/>
    <text x="50" y="50" dominant-baseline="central" text-anchor="middle"
      font-family="-apple-system,BlinkMacSystemFont,sans-serif"
      font-size="38" font-weight="800" fill="#0B0B0F">${initials}</text>
  </svg>`

  return `data:image/svg+xml;base64,${btoa(svg)}`
}
