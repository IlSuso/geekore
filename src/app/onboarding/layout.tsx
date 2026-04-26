import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Benvenuto — Geekore',
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
