export default function ForYouLoading() {
  return (
    <div className="min-h-screen bg-black text-white pt-8 pb-24 max-w-6xl mx-auto px-3 sm:px-4 md:px-6">
      <div className="mb-10 animate-pulse">
        <div className="h-10 w-48 bg-zinc-800 rounded-2xl mb-3" />
        <div className="h-5 w-80 bg-zinc-900 rounded-xl" />
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} className="mb-12">
          <div className="h-7 w-36 bg-zinc-800 rounded-xl mb-5 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="animate-pulse">
                <div className="bg-zinc-900 rounded-2xl h-64 mb-2" />
                <div className="h-4 bg-zinc-800 rounded w-3/4 mb-1" />
                <div className="h-3 bg-zinc-900 rounded w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
