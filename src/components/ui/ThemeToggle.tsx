'use client'

import { Moon } from 'lucide-react'

export function ThemeToggle({ showLabel = false, className = '' }: { showLabel?: boolean; className?: string }) {
  return (
    <button
      title="Tema scuro"
      className={`flex items-center gap-2 transition-colors text-zinc-400 ${className}`}
    >
      <Moon size={16} fill="none" />
      {showLabel && <span className="text-sm">Scuro</span>}
    </button>
  )
}
