'use client'

import { Moon } from 'lucide-react'
import { useLocale } from '@/lib/locale'

export function ThemeToggle({ showLabel = false, className = '' }: { showLabel?: boolean; className?: string }) {
  const { locale } = useLocale()
  const label = locale === 'it' ? 'Tema scuro' : 'Dark theme'
  const shortLabel = locale === 'it' ? 'Scuro' : 'Dark'
  return (
    <button
      title={label}
      className={`flex items-center gap-2 transition-colors text-zinc-400 ${className}`}
    >
      <Moon size={16} fill="none" />
      {showLabel && <span className="text-sm">{shortLabel}</span>}
    </button>
  )
}
