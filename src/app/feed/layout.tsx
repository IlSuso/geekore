import { BottomNav } from '@/components/layout/BottomNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* Main scrollable content */}
      <main className="flex-1 pb-24">
        <div className="mx-auto max-w-lg">
          {children}
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
