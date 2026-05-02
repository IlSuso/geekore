// src/app/notifications/loading.tsx
export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pt-8 pb-20 max-w-3xl mx-auto px-4">
      <div className="mb-8 animate-pulse">
        <div className="h-9 w-40 bg-zinc-800 rounded-2xl" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 bg-zinc-950 border border-zinc-800 rounded-2xl animate-pulse">
            <div className="w-11 h-11 bg-zinc-800 rounded-2xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-zinc-800 rounded-full w-3/4" />
              <div className="h-3 bg-zinc-800 rounded-full w-1/3" />
            </div>
            <div className="w-2 h-2 bg-zinc-700 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}