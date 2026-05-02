// DESTINAZIONE: src/components/ui/Spinner.tsx

export function Spinner() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#E6FF3D', borderTopColor: 'transparent' }} />
    </div>
  )
}