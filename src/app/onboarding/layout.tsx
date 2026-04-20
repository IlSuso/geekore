// DESTINAZIONE: src/app/onboarding/layout.tsx
//
// Sovrascrive il <main> del root layout: l'onboarding è fullscreen
// senza padding top/bottom (la navbar è già nascosta via Navbar.tsx AUTH_PATHS).
// Usa un portale fixed che copre tutto il viewport — su desktop elimina
// le "bande nere" laterali rendendo l'esperienza realmente fullscreen.

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Benvenuto — Geekore',
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
        Il root layout wrappa tutto in:
          <main className="pt-14 md:pt-16 pb-20 md:pb-8">
            {children}
          </main>
        Non possiamo sovrascrivere il <main> da qui (Server Component),
        ma possiamo usare un div fixed che esce fuori dal flusso normale
        e copre l'intero viewport — esattamente come fa SwipeMode.
        La navbar è già display:none su /onboarding grazie ad AUTH_PATHS.
      */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          background: '#09090b', // zinc-950
          overflow: 'auto',
        }}
      >
        {children}
      </div>
    </>
  )
}