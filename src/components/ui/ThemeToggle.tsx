'use client'
// DESTINAZIONE: src/components/ui/ThemeToggle.tsx
// #39: Bottone a 3 stati che cicla dark → light → oled.
// Icone: 🌙 dark | ☀️ light | ⚫ OLED

import { Sun, Moon, Circle } from 'lucide-react'
import { useTheme, type Theme } from '@/lib/theme'

interface ThemeToggleProps {
  showLabel?: boolean
  className?: string
}

const THEME_CONFIG: Record<Theme, { icon: React.ElementType; label: string; title: string; iconClass: string }> = {
  dark: {
    icon: Moon,
    label: 'Scuro',
    title: 'Passa al tema chiaro',
    iconClass: 'text-zinc-400 hover:text-yellow-400',
  },
  light: {
    icon: Sun,
    label: 'Chiaro',
    title: 'Passa al tema OLED',
    iconClass: 'text-yellow-500 hover:text-violet-600',
  },
  oled: {
    icon: Circle,
    label: 'OLED',
    title: 'Passa al tema scuro',
    iconClass: 'text-zinc-200 hover:text-zinc-400',
  },
}

export function ThemeToggle({ showLabel = false, className = '' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme()
  const config = THEME_CONFIG[theme]
  const Icon = config.icon

  return (
    <button
      onClick={toggleTheme}
      title={config.title}
      className={`flex items-center gap-2 transition-colors ${config.iconClass} ${className}`}
    >
      <Icon size={16} fill={theme === 'oled' ? 'currentColor' : 'none'} />
      {showLabel && <span className="text-sm">{config.label}</span>}
    </button>
  )
}