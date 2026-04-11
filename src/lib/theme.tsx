'use client'
// DESTINAZIONE: src/lib/theme.tsx
// #39: Aggiunta modalità OLED — sfondo #000000 puro, risparmio batteria su AMOLED.
// I tre temi: 'dark' (default), 'light', 'oled'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type Theme = 'dark' | 'light' | 'oled'

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

// Ciclo: dark → light → oled → dark
const CYCLE: Theme[] = ['dark', 'light', 'oled']

function applyTheme(t: Theme) {
  const html = document.documentElement
  html.classList.remove('light', 'dark', 'oled')
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

  // Ciclo: dark → light → oled → dark
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