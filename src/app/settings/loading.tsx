// src/app/settings/loading.tsx
export default function Loading() {
  return (
    <div className="min-h-screen bg-black pt-8 pb-20 max-w-2xl mx-auto px-4">
      <div className="mb-8 animate-pulse">
        <div className="h-9 w-32 bg-zinc-800 rounded-2xl" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 animate-pulse">
            <div className="h-4 bg-zinc-800 rounded-full w-32 mb-4" />
            <div className="space-y-3">
              {[1,2].map(j => (
                <div key={j} className="flex items-center justify-between">
                  <div className="h-4 bg-zinc-800 rounded-full w-40" />
                  <div className="w-10 h-6 bg-zinc-800 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}