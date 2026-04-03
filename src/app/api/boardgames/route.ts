import { NextResponse } from 'next/server';
import Parser from 'rss-parser';

const parser = new Parser({
  customFields: {
    item: [['media:content', 'mediaContent', { keepArray: true }], ['content:encoded', 'contentEncoded']],
  },
});

export async function GET() {
  try {
    const feed = await parser.parseURL('https://www.giochisulnostrotavolo.it/feed/');
    const articles = feed.items.map((item) => {
      let img = null;
      if (item.mediaContent && item.mediaContent[0]) img = item.mediaContent[0].$.url;
      else {
        const content = item.contentEncoded || item.content || "";
        const match = content.match(/<img[^>]+src="([^">]+)"/);
        if (match) img = match[1];
      }
      return {
        title: item.title,
        description: item.contentSnippet?.slice(0, 160).replace(/<[^>]*>?/gm, '') + '...',
        url: item.link,
        urlToImage: img || "https://images.unsplash.com/photo-1585504198199-20277593b94f?q=80&w=1600",
        source: { name: 'Boardgame ITA' },
        publishedAt: item.pubDate
      };
    });
    return NextResponse.json({ articles });
  } catch (error) {
    return NextResponse.json({ articles: [] }, { status: 500 });
  }
}