"use client"
import { useState, useEffect, useRef } from 'react'
import { useNews } from '@/context/NewsContext'
import { Loader2, Ghost, LayoutGrid, Gamepad2, Film, Book, Puzzle } from 'lucide-react'

const CATEGORIES = [
  { id: 'all', label: 'LATEST', icon: LayoutGrid },
  { id: 'gaming', label: 'GAMING', icon: Gamepad2 },
  { id: 'cinema', label: 'CINEMA', icon: Film },
  { id: 'anime', label: 'MANGA', icon: Book },
  { id: 'boardgames', label: 'BOARD', icon: Puzzle }, 
]

export default function NewsPage() {
  const { allNews, isLoading: globalLoading } = useNews()
  const [activeTab, setActiveTab] = useState('all')
  const [displayNews, setDisplayNews] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [isMoreLoading, setIsMoreLoading] = useState(false)
  const [selectedArticle, setSelectedArticle] = useState<any>(null)
  
  const observerTarget = useRef(null)

  useEffect(() => {
    if (allNews[activeTab]) {
      setDisplayNews(allNews[activeTab])
      setPage(1)
    }
  }, [activeTab, allNews])

  const loadMore = async () => {
    if (isMoreLoading || activeTab === 'boardgames') return
    setIsMoreLoading(true)
    try {
      const nextPage = page + 1
      const res = await fetch(`/api/news?category=${activeTab}&page=${nextPage}`)
      const data = await res.json()
      if (data.articles) {
        setDisplayNews(prev => [...prev, ...data.articles])
        setPage(nextPage)
      }
    } catch (e) { console.error(e) } finally { setIsMoreLoading(false) }
  }

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && displayNews.length >= 10 && !isMoreLoading) loadMore()
    }, { threshold: 0.1 })
    if (observerTarget.current) observer.observe(observerTarget.current)
    return () => observer.disconnect()
  }, [displayNews, isMoreLoading])

  return (
    <main className="min-h-screen pt-12 pb-40 px-4 uppercase italic">
      <div className="max-w-xl mx-auto">
        
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-[#7c6af7] rounded-[2rem] flex items-center justify-center shadow-2xl mb-4 shadow-purple-500/20">
            <Ghost size={32} />
          </div>
          <h1 className="text-4xl font-black tracking-tighter italic">GEEKORE</h1>
        </div>

        <div className="grid grid-cols-5 gap-2 mb-12 sticky top-4 z-40 bg-[#050507]/80 backdrop-blur-lg p-2 rounded-3xl border border-white/5">
          {CATEGORIES.map((cat) => (
            <button key={cat.id} onClick={() => setActiveTab(cat.id)}
              className={`flex flex-col items-center justify-center py-4 rounded-2xl border transition-all duration-300 ${activeTab === cat.id ? 'bg-[#7c6af7] border-[#7c6af7] text-white scale-105' : 'bg-white/5 border-transparent text-gray-500 hover:text-gray-300'}`}>
              <cat.icon size={18} className="mb-1" />
              <span className="text-[7px] font-black tracking-widest">{cat.label}</span>
            </button>
          ))}
        </div>

        {globalLoading && displayNews.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-4 animate-pulse">
            <Loader2 className="animate-spin text-[#7c6af7]" size={40} />
            <span className="text-[10px] font-black text-gray-500">SYNCING FEED...</span>
          </div>
        ) : (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-1000">
            {displayNews.map((item, i) => (
              <div key={i} onClick={() => setSelectedArticle(item)} className="group cursor-pointer relative h-[500px] rounded-[4rem] overflow-hidden border border-white/5 bg-[#0d0d0f] active:scale-[0.98] transition-all duration-500 shadow-2xl">
                <img src={item.urlToImage} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2.5s]" alt="" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent opacity-90" />
                <div className="absolute bottom-12 left-10 right-10">
                  <span className="text-[#7c6af7] text-[10px] font-black tracking-[0.4em] mb-4 block drop-shadow-md">{item.source?.name}</span>
                  <h2 className="text-3xl font-black leading-[0.85] tracking-tighter drop-shadow-2xl">{item.title}</h2>
                </div>
              </div>
            ))}
          </div>
        )}

        <div ref={observerTarget} className="h-24 flex items-center justify-center mt-10">
          {isMoreLoading && <Loader2 className="animate-spin text-[#7c6af7]" size={24} />}
        </div>
      </div>

      {selectedArticle && (
        <div className="fixed inset-0 z-[120] bg-black/98 backdrop-blur-3xl flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelectedArticle(null)}>
          <div className="w-full max-w-lg bg-[#050507] rounded-t-[4rem] sm:rounded-[4rem] p-10 border-t border-white/10 animate-in slide-in-from-bottom duration-500 shadow-2xl" onClick={e => e.stopPropagation()}>
            <img src={selectedArticle.urlToImage} className="w-full aspect-video object-cover rounded-[2.5rem] mb-8 border border-white/5" alt="" />
            <h2 className="text-4xl font-black leading-none mb-6 tracking-tighter uppercase">{selectedArticle.title}</h2>
            <p className="text-gray-400 text-lg lowercase font-medium italic leading-relaxed mb-10">{selectedArticle.description}</p>
            <a href={selectedArticle.url} target="_blank" className="block w-full py-6 bg-white text-black text-center font-black rounded-[2rem] text-xl tracking-widest hover:bg-[#7c6af7] hover:text-white transition-colors">READ SOURCE</a>
          </div>
        </div>
      )}
    </main>
  )
}