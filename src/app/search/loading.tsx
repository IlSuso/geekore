// src/app/search/loading.tsx
export default function Loading() {
  return (
    <div className="min-h-screen bg-black pt-8 pb-20 max-w-2xl mx-auto px-4">
      <div className="mb-6 animate-pulse">
        <div className="h-12 bg-zinc-900 border border-zinc-800 rounded-2xl" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 bg-zinc-950 border border-zinc-800 rounded-2xl animate-pulse">
            <div className="w-12 h-12 bg-zinc-800 rounded-2xl flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-zinc-800 rounded-full w-1/2" />
              <div className="h-3 bg-zinc-800 rounded-full w-1/4" />
            </div>
            <div className="w-20 h-8 bg-zinc-800 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}