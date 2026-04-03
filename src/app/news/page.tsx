"use client";

import { useState } from "react";
import useSWR from "swr";
import { Radio, Loader2, ExternalLink } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function NewsPage() {
  const [category, setCategory] = useState("all");
  const { data: news, error, isLoading } = useSWR(`/api/news?cat=${category}`, fetcher);

  return (
    <div className="min-h-screen bg-[#050507] text-white p-6 font-sans">
      <header className="max-w-4xl mx-auto mb-12 border-b border-white/10 pb-8">
        <div className="flex items-center gap-2 text-[#7c6af7] mb-4">
          <Radio size={16} className="animate-pulse" />
          <span className="text-[10px] font-black tracking-[0.3em] uppercase">System_Live</span>
        </div>
        <h1 className="text-6xl font-black italic italic uppercase tracking-tighter mb-8 text-white">News</h1>
        
        <div className="flex gap-4">
          {["all", "gaming", "cinema", "anime"].map((c) => (
            <button 
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-1 text-[10px] font-bold uppercase border ${category === c ? 'bg-white text-black' : 'border-white/20 text-white/40'}`}
            >
              {c}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-4xl mx-auto space-y-20">
        {isLoading && <Loader2 className="animate-spin mx-auto text-[#7c6af7]" />}
        
        {news && Array.isArray(news) && news.map((item: any, i: number) => (
          <article key={i} className="group border-b border-white/5 pb-12">
            {item.urlToImage && (
              <img 
                src={item.urlToImage} 
                className="w-full aspect-video object-cover mb-6 rounded-lg grayscale hover:grayscale-0 transition-all" 
                alt=""
              />
            )}
            <div className="text-[#7c6af7] text-[10px] font-black mb-2 uppercase tracking-widest">
              {item.source?.name || "News"}
            </div>
            <h2 className="text-3xl font-black italic uppercase leading-none mb-4 group-hover:text-[#7c6af7] transition-colors">
              {item.title}
            </h2>
            <p className="text-sm text-white/50 leading-relaxed mb-6 line-clamp-3 lowercase">
              {item.description}
            </p>
            <a 
              href={item.url} 
              target="_blank" 
              className="inline-flex items-center gap-2 text-[10px] font-black border-b-2 border-[#7c6af7] pb-1"
            >
              LEGGI FONTE <ExternalLink size={12} />
            </a>
          </article>
        ))}
      </main>
    </div>
  );
}