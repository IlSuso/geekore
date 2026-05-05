import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOSTS = [
  's4.anilist.co',
  'anilist.co',
  'cdn.myanimelist.net',
  'myanimelist.net',
  'image.tmdb.org',
  'images.igdb.com',
  'cf.geekdo-images.com',
  'geekdo-images.com',
  'cdn.cloudflare.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'books.google.com',
  'lh3.googleusercontent.com',
  'covers.openlibrary.org',
  'media.kitsu.io',
]

function isAllowed(hostname: string): boolean {
  return ALLOWED_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`))
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('url') || ''
  let url: URL

  try {
    url = new URL(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 })
  }

  if (url.protocol !== 'https:' || !isAllowed(url.hostname)) {
    return NextResponse.json({ error: 'Image host not allowed' }, { status: 400 })
  }

  try {
    const upstream = await fetch(url.toString(), {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 Geekore Image Proxy',
        referer: `${url.protocol}//${url.hostname}/`,
      },
      signal: AbortSignal.timeout(9000),
      next: { revalidate: 60 * 60 * 24 * 7 },
    })

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'Image fetch failed' }, { status: 502 })
    }

    const contentType = upstream.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Upstream is not an image' }, { status: 502 })
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Image proxy timeout' }, { status: 504 })
  }
}
