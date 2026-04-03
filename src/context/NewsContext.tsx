"use client"
import React, { createContext, useContext, useState, useEffect } from 'react'

const CATEGORIES = [
  { id: 'all', q: '(ps5 OR nintendo OR xbox OR cinema OR "serie tv" OR marvel OR anime OR manga)' },
  { id: 'gaming', q: '(ps5 OR nintendo OR xbox OR "giochi pc")' },
  { id: 'cinema', q: '(cinema OR "serie tv" OR netflix OR marvel OR "star wars")' },
  { id: 'anime', q: '(anime OR manga OR crunchyroll)' },
  { id: 'boardgames', q: '' },
]

interface NewsContextType {
  allNews: Record<string, any[]>;
  isLoading: boolean;
}

const NewsContext = createContext<NewsContextType>({ allNews: {}, isLoading: true });

export function NewsProvider({ children }: { children: React.ReactNode }) {
  const [allNews, setAllNews] = useState<Record<string, any[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchInitial = async () => {
      const promises = CATEGORIES.map(async (cat) => {
        try {
          const url = cat.id === 'boardgames' 
            ? '/api/boardgames' 
            : `/api/news?category=${cat.id}&q=${encodeURIComponent(cat.q)}&page=1`;
          
          const res = await fetch(url);
          const data = await res.json();
          return { id: cat.id, articles: data.articles || [] };
        } catch (e) {
          return { id: cat.id, articles: [] };
        }
      });

      const results = await Promise.all(promises);
      const cache: Record<string, any[]> = {};
      results.forEach(res => { cache[res.id] = res.articles; });

      setAllNews(cache);
      setIsLoading(false);
    };

    fetchInitial();
  }, []);

  return (
    <NewsContext.Provider value={{ allNews, isLoading }}>
      {children}
    </NewsContext.Provider>
  );
}

export const useNews = () => useContext(NewsContext);