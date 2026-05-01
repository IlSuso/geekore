/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    // Pattern unificato — evita problemi con cartelle [param] su Windows
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0a0a0f',
          secondary: '#111118',
          card: '#16161f',
          hover: '#1c1c28',
        },
        accent: {
          DEFAULT: '#7c6af7',
          light: '#a89af9',
          glow: 'rgba(124,106,247,0.3)',
        },
        manga: '#f97066',
        anime: '#38bdf8',
        game: '#4ade80',
        board: '#fb923c',
        surface: '#1e1e2e',
        border: 'rgba(255,255,255,0.08)',
        muted: 'rgba(255,255,255,0.4)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 30px rgba(124,106,247,0.25)',
        'glow-sm': '0 0 12px rgba(124,106,247,0.2)',
        card: '0 4px 24px rgba(0,0,0,0.4)',
      },
      animation: {
        'fade-up': 'fadeUp 0.5s ease forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(124,106,247,0.2)' },
          '50%': { boxShadow: '0 0 24px rgba(124,106,247,0.5)' },
        },
      },
    },
  },
  plugins: [],
}
