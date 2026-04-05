export default function Loading() {
  return (
    <div className="min-h-screen bg-black pt-8 pb-20 max-w-6xl mx-auto px-6">
      <div className="text-center mb-12">
        <div className="h-12 w-48 bg-zinc-800 rounded animate-pulse mx-auto mb-4" />
        <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse mx-auto" />
      </div>
      <div className="flex flex-wrap gap-3 justify-center mb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 w-24 bg-zinc-900 rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="max-w-2xl mx-auto mb-12">
        <div className="h-16 bg-zinc-900 rounded-3xl animate-pulse" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden animate-pulse">
            <div className="h-64 bg-zinc-900" />
            <div className="p-5 space-y-3">
              <div className="h-4 bg-zinc-800 rounded" />
              <div className="h-3 w-2/3 bg-zinc-800 rounded" />
              <div className="h-10 bg-zinc-800 rounded-2xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
