'use client'
// src/lib/theme.tsx
// N1: Aggiunto tema "aura" — gradiente aurora animato viola/fuchsia/cyan
// Ciclo temi: dark → light → oled → aura → dark

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type Theme = 'dark' | 'light' | 'oled' | 'aura'

interface ThemeContextType {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
})

// N1: Aura aggiunto nel ciclo
const CYCLE: Theme[] = ['dark', 'light', 'oled', 'aura']

function applyTheme(t: Theme) {
  const html = document.documentElement
  html.classList.remove('light', 'dark', 'oled', 'aura')
  html.classList.add(t)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('geekore_theme') as Theme | null
    const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    const initial: Theme = (saved && CYCLE.includes(saved)) ? saved : preferred
    setThemeState(initial)
    applyTheme(initial)
  }, [])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem('geekore_theme', t)
    applyTheme(t)
  }

  const toggleTheme = () => {
    const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length]
    setTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() { return useContext(ThemeContext) }
