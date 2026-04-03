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

  // Sincronizza lo stato locale con il Context quando cambia tab
  useEffect(() => {
    if (allNews[activeTab]) {
      setDisplayNews(allNews[activeTab])
      setPage(1)
    }
  }, [activeTab, allNews])

  // Funzione per caricare la pagina successiva (10 news alla volta)
  const loadMore = async () => {
    if (isMoreLoading || activeTab === 'boardgames') return
    setIsMoreLoading(true)
    
    try {
      const nextPage = page + 1
      const catQuery = CATEGORIES.find(c => c.id === activeTab)?.id || "all"
      const q = CATEGORIES.find(c => c.id === activeTab)?.id === 'all' ? 'nerd' : catQuery

      const res = await fetch(`/api/news?category=${activeTab}&q=${q}&page=${nextPage}`)
      const data = await res.json()
      
      if (data.articles && data.articles.length > 0) {
        setDisplayNews(prev => [...prev, ...data.articles])
        setPage(nextPage)
      }
    } catch (e) {
      console.error("Errore caricamento infinito:", e)
    } finally {
      setIsMoreLoading(false)
    }
  }

  // Intersection Observer per triggerare il caricamento a fondo pagina
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && displayNews.length >= 10 && !isMoreLoading) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (observerTarget.current) observer.observe(observerTarget.current)
    return () => observer.disconnect()
  }, [displayNews, isMoreLoading])

  return (
    <main className="min-h-screen bg-[#050507] pt-20 pb-32 px-4 text-white uppercase italic selection:bg-[#7c6af7]/30">
      <div className="max-w-xl mx-auto">
        
        {/* LOGO */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 bg-[#7c6af7] rounded-[2rem] flex items-center justify-center shadow-2xl mb-4">
            <Ghost size={32} />
          </div>
          <h1 className="text-4xl font-black tracking-tighter italic">GEEKORE</h1>
        </div>

        {/* NAVIGAZIONE */}
        <div className="grid grid-cols-5 gap-2 mb-12 px-1">
          {CATEGORIES.map((cat) => (
            <button key={cat.id} onClick={() => setActiveTab(cat.id)}
              className={`flex flex-col items-center justify-center py-5 rounded-2xl border transition-all duration-300 ${activeTab === cat.id ? 'bg-[#7c6af7] border-[#7c6af7] text-white scale-105' : 'bg-white/5 border-white/5 text-gray-500'}`}>
              <cat.icon size={18} className="mb-2" />
              <span className="text-[7px] font-black tracking-[0.1em]">{cat.label}</span>
            </button>
          ))}
        </div>

        {/* FEED NEWS */}
        {globalLoading && displayNews.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-[#7c6af7]" size={40} />
            <span className="text-[10px] font-black tracking-widest text-gray-500 uppercase">Syncing Geekore...</span>
          </div>
        ) : (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-10 duration-700">
            {displayNews.map((item, i) => (
              <div key={i} onClick={() => setSelectedArticle(item)} className="group cursor-pointer relative h-[500px] w-full rounded-[4rem] overflow-hidden shadow-2xl border border-white/5 bg-[#0d0d0f] active:scale-[0.98] transition-all">
                <img src={item.urlToImage} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-[2s]" alt="" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent opacity-95" />
                <div className="absolute bottom-12 left-10 right-10">
                  <span className="text-[#7c6af7] text-[10px] font-black tracking-[0.5em] mb-4 block">{item.source?.name || 'GEEKORE'}</span>
                  <h2 className="text-3xl font-black leading-[0.85] tracking-tighter italic uppercase">{item.title}</h2>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TARGET PER CARICAMENTO INFINITO */}
        <div ref={observerTarget} className="h-20 flex items-center justify-center mt-10">
          {isMoreLoading && (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="animate-spin text-[#7c6af7]" size={24} />
              <span className="text-[8px] font-black tracking-widest text-gray-500">FETCHING MORE DATA...</span>
            </div>
          )}
        </div>
      </div>

      {/* MODAL DETTAGLI */}
      {selectedArticle && (
        <div className="fixed inset-0 z-[100] bg-black/98 backdrop-blur-3xl flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setSelectedArticle(null)}>
          <div className="w-full max-w-lg bg-[#050507] rounded-t-[4rem] sm:rounded-[4rem] p-10 border-t border-white/10 shadow-2xl animate-in slide-in-from-bottom duration-500" onClick={e => e.stopPropagation()}>
            <img src={selectedArticle.urlToImage} className="w-full aspect-video object-cover rounded-[2.5rem] mb-8" alt="" />
            <h2 className="text-4xl font-black leading-none mb-6 italic tracking-tighter uppercase">{selectedArticle.title}</h2>
            <p className="text-gray-400 text-lg lowercase leading-relaxed mb-10 font-medium italic">{selectedArticle.description}</p>
            <a href={selectedArticle.url} target="_blank" rel="noopener noreferrer" className="block w-full py-6 bg-white text-black text-center font-black rounded-[2rem] hover:bg-[#7c6af7] hover:text-white transition-all text-xl uppercase tracking-widest">READ SOURCE</a>
          </div>
        </div>
      )}
    </main>
  )
}