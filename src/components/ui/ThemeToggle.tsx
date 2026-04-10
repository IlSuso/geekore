'use client'
// src/components/ui/ThemeToggle.tsx
// Bottone toggle dark/light mode.
// Inserirlo nella Navbar (desktop) o in /settings.

import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/lib/theme'

interface ThemeToggleProps {
  /** Se true, mostra anche il testo */
  showLabel?: boolean
  className?: string
}

export function ThemeToggle({ showLabel = false, className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
      className={`flex items-center gap-2 transition-colors ${
        isDark
          ? 'text-zinc-400 hover:text-yellow-400'
          : 'text-zinc-600 hover:text-violet-600'
      } ${className}`}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
      {showLabel && (
        <span className="text-sm">{isDark ? 'Tema chiaro' : 'Tema scuro'}</span>
      )}
    </button>
  )
}