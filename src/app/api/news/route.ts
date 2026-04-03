import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CACHE_DURATION = 600000; // 10 minuti

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'all';
    const query = searchParams.get('q') || 'nerd';
    const page = searchParams.get('page') || '1';
    const pageSize = '10';

    // Gestiamo la cache solo per la pagina 1 per evitare database enormi
    if (page === '1') {
      const { data: cache } = await supabase
        .from('news_cache')
        .select('*')
        .eq('category', category)
        .single();

      const now = new Date().getTime();
      if (cache && (now - new Date(cache.updated_at).getTime() < CACHE_DURATION)) {
        return NextResponse.json({ articles: cache.data });
      }
    }

    // Fetch da NewsAPI con paginazione
    const domains = "everyeye.it,multiplayer.it,movieplayer.it,badtaste.it,animeclick.it";
    const apiKey = process.env.NEXT_PUBLIC_NEWS_API_KEY;
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&domains=${domains}&language=it&sortBy=publishedAt&pageSize=${pageSize}&page=${page}&apiKey=${apiKey}`;

    const res = await fetch(url);
    const apiData = await res.json();

    if (apiData.status === 'error') {
      return NextResponse.json({ articles: [] });
    }

    const freshArticles = apiData.articles || [];

    // Aggiorna cache solo per pagina 1
    if (page === '1' && freshArticles.length > 0) {
      await supabase.from('news_cache').upsert({
        category: category,
        data: freshArticles,
        updated_at: new Date().toISOString()
      });
    }

    return NextResponse.json({ articles: freshArticles });

  } catch (error) {
    return NextResponse.json({ articles: [] }, { status: 500 });
  }
}