// src/app/trending/loading.tsx
export default function Loading() {
  return (
    <div className="min-h-screen bg-black pt-8 pb-20 max-w-3xl mx-auto px-3 sm:px-4 md:px-6">
      {/* Header */}
      <div className="mb-10 animate-pulse">
        <div className="h-10 w-56 bg-zinc-800 rounded-2xl mb-3" />
        <div className="h-4 w-72 bg-zinc-800 rounded-full" />
      </div>
      {/* Filtri tipo */}
      <div className="flex gap-3 mb-8 animate-pulse">
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="h-9 w-20 bg-zinc-900 rounded-2xl" />
        ))}
      </div>
      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex gap-4 animate-pulse">
            <div className="w-14 h-20 bg-zinc-900 rounded-xl flex-shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 bg-zinc-800 rounded-full w-3/4" />
              <div className="h-3 bg-zinc-800 rounded-full w-1/3" />
              <div className="h-3 bg-zinc-800 rounded-full w-1/2 mt-2" />
            </div>
            <div className="w-8 h-8 bg-zinc-800 rounded-xl flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}