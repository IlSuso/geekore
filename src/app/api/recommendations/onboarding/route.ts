// DESTINAZIONE: src/app/api/recommendations/onboarding/route.ts
// Fast path dedicato all'onboarding.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitAsync } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";
import { translateWithCache } from "@/lib/deepl";

const TMDB_BASE = "https://api.themoviedb.org/3";
const ANILIST_GQL = "https://graphql.anilist.co";
const IGDB_GAMES = "https://api.igdb.com/v4/games";
const IGDB_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const BGG_BASE = "https://boardgamegeek.com/xmlapi2";
const TARGET_PER_TYPE = 50;

const BOARDGAME_DESCRIPTION_MAX = 1100;
const DEFAULT_DESCRIPTION_MAX = 900;

function clampDescriptionWithoutEllipsis(text: string, maxLen = DEFAULT_DESCRIPTION_MAX): string {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();

  if (!cleaned || cleaned.length <= maxLen) return cleaned;

  const slice = cleaned.slice(0, maxLen);
  const sentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("; "),
  );

  if (sentenceEnd > maxLen * 0.55) {
    return slice.slice(0, sentenceEnd + 1).trim();
  }

  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim();
}

function looksMostlyEnglish(text: string): boolean {
  const sample = ` ${text.toLowerCase()} `;
  const englishHits = [" the ", " and ", " with ", " your ", " players ", " game ", " each ", " cards ", " board ", " victory "]
    .filter(token => sample.includes(token)).length;
  const italianHits = [" il ", " lo ", " la ", " gli ", " le ", " con ", " per ", " giocatori ", " partita ", " carte "]
    .filter(token => sample.includes(token)).length;
  return englishHits >= 2 && englishHits > italianHits;
}

async function translateBoardgameDescriptions(items: any[]): Promise<any[]> {
  const toTranslate = items
    .filter(item => item?.id && item?.description && looksMostlyEnglish(item.description))
    .map(item => ({ id: `bgg-onboarding:${item.id}`, text: item.description }));

  if (toTranslate.length === 0) {
    return items.map(item => ({
      ...item,
      description: item.description ? clampDescriptionWithoutEllipsis(item.description, BOARDGAME_DESCRIPTION_MAX) : item.description,
    }));
  }

  try {
    const translated = await translateWithCache(toTranslate, "IT", "EN");
    return items.map(item => {
      const key = `bgg-onboarding:${item.id}`;
      const nextDescription = translated[key] || item.description;
      return {
        ...item,
        description: nextDescription ? clampDescriptionWithoutEllipsis(nextDescription, BOARDGAME_DESCRIPTION_MAX) : nextDescription,
      };
    });
  } catch (err) {
    logger.warn("OnboardingQuick", "BGG translation failed, using original descriptions", err);
    return items.map(item => ({
      ...item,
      description: item.description ? clampDescriptionWithoutEllipsis(item.description, BOARDGAME_DESCRIPTION_MAX) : item.description,
    }));
  }
}

async function translateLikelyEnglishDescriptions(
  items: any[],
  cachePrefix = "onboarding",
  maxLen = DEFAULT_DESCRIPTION_MAX,
): Promise<any[]> {
  const normalized = items.map(item => ({
    ...item,
    description: item?.description ? clampDescriptionWithoutEllipsis(String(item.description), maxLen) : item?.description,
  }));

  const toTranslate = normalized
    .filter(item => item?.id && item?.description && looksMostlyEnglish(item.description))
    .map(item => ({ id: `${cachePrefix}:${item.type || "media"}:${item.id}`, text: item.description }));

  if (toTranslate.length === 0) return normalized;

  try {
    const translated = await translateWithCache(toTranslate, "IT", "EN");
    return normalized.map(item => {
      if (!item?.id || !item?.description) return item;
      const key = `${cachePrefix}:${item.type || "media"}:${item.id}`;
      const nextDescription = translated[key] || item.description;
      return {
        ...item,
        description: nextDescription ? clampDescriptionWithoutEllipsis(nextDescription, maxLen) : nextDescription,
      };
    });
  } catch (err) {
    logger.warn("OnboardingQuick", "description translation failed, using original descriptions", err);
    return normalized;
  }
}

let _igdbToken: { token: string; expiresAt: number } | null = null;

async function getIgdbToken(
  clientId: string,
  secret: string,
): Promise<string | null> {
  if (_igdbToken && _igdbToken.expiresAt > Date.now() + 60_000)
    return _igdbToken.token;
  try {
    const res = await fetch(IGDB_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    if (!data.access_token) return null;
    _igdbToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };
    return _igdbToken.token;
  } catch {
    return null;
  }
}

async function fetchAnimeQuick(token: string): Promise<any[]> {
  if (!token) return [];
  const results: any[] = [];
  const seen = new Set<string>();
  const pages = [1, 2, 3];

  await Promise.all(
    pages.map(async (page) => {
      try {
        const params = new URLSearchParams({
          with_original_language: "ja",
          with_genres: "16",
          sort_by: "popularity.desc",
          "vote_count.gte": "100",
          "vote_average.gte": "6",
          language: "it-IT",
          page: String(page),
        });
        const res = await fetch(`${TMDB_BASE}/discover/tv?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return;
        const json = await res.json();
        for (const m of json.results || []) {
          if (!m.poster_path) continue;
          const id = `tmdb-anime-${m.id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const year = m.first_air_date
            ? parseInt(m.first_air_date.slice(0, 4))
            : undefined;
          results.push({
            id,
            title: m.name || "Senza titolo",
            type: "anime",
            coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
            year,
            genres: [],
            score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
            description: m.overview || undefined,
            why: "Popolare tra gli appassionati di anime",
            matchScore: Math.round((m.popularity || 0) / 10),
          });
        }
      } catch {}
    }),
  );

  return results.slice(0, TARGET_PER_TYPE);
}

async function fetchMangaQuick(): Promise<any[]> {
  const results: any[] = [];
  const query = `
    query ($page: Int) {
      Page(page: $page, perPage: 25) {
        media(type: MANGA, sort: POPULARITY_DESC, status_not: NOT_YET_RELEASED, isAdult: false) {
          id title { romaji english native } coverImage { extraLarge large }
          genres averageScore popularity startDate { year }
          description(asHtml: false)
        }
      }
    }
  `;

  await Promise.all(
    [1, 2].map(async (page) => {
      try {
        const res = await fetch(ANILIST_GQL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, variables: { page } }),
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return;
        const json = await res.json();
        const media = json.data?.Page?.media || [];
        for (const m of media) {
          const title =
            m.title?.italian ||
            m.title?.english ||
            m.title?.romaji ||
            "Senza titolo";
          results.push({
            id: `anilist-manga-${m.id}`,
            title,
            type: "manga",
            coverImage: m.coverImage?.extraLarge || m.coverImage?.large,
            year: m.startDate?.year,
            genres: m.genres || [],
            score: m.averageScore ? m.averageScore / 20 : undefined,
            description: m.description
              ? m.description.replace(/<[^>]*>/g, "")
              : undefined,
            why: "Tra i manga più amati della community",
            matchScore: Math.round((m.popularity || 0) / 100),
          });
        }
      } catch {}
    }),
  );

  return translateLikelyEnglishDescriptions(results.slice(0, TARGET_PER_TYPE), "anilist-onboarding", 900);
}

async function fetchMovieQuick(token: string): Promise<any[]> {
  if (!token) return [];
  const results: any[] = [];
  const seen = new Set<string>();

  await Promise.all(
    [
      { sort: "popularity.desc", page: 1 },
      { sort: "popularity.desc", page: 2 },
      { sort: "vote_average.desc", page: 1 },
    ].map(async ({ sort, page }) => {
      try {
        const params = new URLSearchParams({
          sort_by: sort,
          "vote_count.gte": "200",
          "vote_average.gte": "6.5",
          language: "it-IT",
          page: String(page),
        });
        const res = await fetch(`${TMDB_BASE}/discover/movie?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return;
        const json = await res.json();
        for (const m of json.results || []) {
          if (!m.poster_path) continue;
          const id = `tmdb-movie-${m.id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const year = m.release_date
            ? parseInt(m.release_date.slice(0, 4))
            : undefined;
          results.push({
            id,
            title: m.title || "Senza titolo",
            type: "movie",
            coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
            year,
            genres: [],
            score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
            description: m.overview || undefined,
            why: "Film apprezzato dalla critica e dal pubblico",
            matchScore: Math.round((m.popularity || 0) / 10),
          });
        }
      } catch {}
    }),
  );

  return results.slice(0, TARGET_PER_TYPE);
}

async function fetchTvQuick(token: string): Promise<any[]> {
  if (!token) return [];
  const results: any[] = [];
  const seen = new Set<string>();

  await Promise.all(
    [
      { sort: "popularity.desc", page: 1 },
      { sort: "popularity.desc", page: 2 },
      { sort: "vote_average.desc", page: 1 },
    ].map(async ({ sort, page }) => {
      try {
        const params = new URLSearchParams({
          sort_by: sort,
          without_genres: "16",
          without_keywords: "210024",
          "vote_count.gte": "100",
          "vote_average.gte": "6.5",
          language: "it-IT",
          page: String(page),
        });
        const res = await fetch(`${TMDB_BASE}/discover/tv?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return;
        const json = await res.json();
        for (const m of json.results || []) {
          if (!m.poster_path) continue;
          const id = `tmdb-tv-${m.id}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const year = m.first_air_date
            ? parseInt(m.first_air_date.slice(0, 4))
            : undefined;
          results.push({
            id,
            title: m.name || "Senza titolo",
            type: "tv",
            coverImage: `https://image.tmdb.org/t/p/w780${m.poster_path}`,
            year,
            genres: [],
            score: m.vote_average ? Math.min(m.vote_average / 2, 5) : undefined,
            description: m.overview || undefined,
            why: "Serie TV molto seguita",
            matchScore: Math.round((m.popularity || 0) / 10),
          });
        }
      } catch {}
    }),
  );

  return results.slice(0, TARGET_PER_TYPE);
}

async function fetchGameQuick(
  clientId: string,
  secret: string,
): Promise<any[]> {
  if (!clientId || !secret) return [];
  const token = await getIgdbToken(clientId, secret);
  if (!token) return [];
  const results: any[] = [];

  await Promise.all(
    [
      `fields id,name,cover.url,genres.name,rating,rating_count,summary,first_release_date,involved_companies.company.name,involved_companies.developer; where rating >= 75 & rating_count >= 200 & cover != null & themes != (42); sort rating_count desc; limit 25;`,
      `fields id,name,cover.url,genres.name,rating,rating_count,summary,first_release_date,involved_companies.company.name,involved_companies.developer; where rating >= 70 & rating_count >= 100 & cover != null & themes != (42); sort rating desc; limit 25;`,
    ].map(async (body) => {
      try {
        const res = await fetch(IGDB_GAMES, {
          method: "POST",
          headers: {
            "Client-ID": clientId,
            Authorization: `Bearer ${token}`,
            "Content-Type": "text/plain",
          },
          body,
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return;
        const games = await res.json();
        for (const g of games) {
          if (!g.cover?.url) continue;
          const coverUrl = g.cover.url.replace("t_thumb", "t_cover_big_2x");
          const year = g.first_release_date
            ? new Date(g.first_release_date * 1000).getFullYear()
            : undefined;
          results.push({
            id: `igdb-${g.id}`,
            title: g.name || "Senza titolo",
            type: "game",
            coverImage: coverUrl.startsWith("//")
              ? `https:${coverUrl}`
              : coverUrl,
            year,
            genres: (g.genres || []).map((gn: any) => gn.name).filter(Boolean),
            score: g.rating ? Math.min(g.rating / 20, 5) : undefined,
            description: g.summary || undefined,
            why: "Titolo acclamato dai giocatori",
            matchScore: Math.round(g.rating || 0),
          });
        }
      } catch {}
    }),
  );

  const seen = new Set<string>();
  const unique = results
    .filter((g) => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    })
    .slice(0, TARGET_PER_TYPE);

  return translateLikelyEnglishDescriptions(unique, "igdb-onboarding", 900);
}

const BGG_SEED_IDS = [
  174430, 224517, 161936, 167791, 233078, 291457, 266192, 220308, 182028,
  169786, 162886, 12333, 68448, 31260, 3076, 822, 9209, 178900, 205637, 199792,
  84876, 173346, 316554, 295947, 244521, 237182, 120677, 346965, 342942, 328871,
  192135, 146021, 284083, 251247, 285774, 35677, 70323, 110327, 30549, 13,
  39856, 2651, 478, 98778, 148228, 147020, 54043, 129622, 271324, 25613,
];

const BOARDGAME_STATIC_FALLBACK: any[] = [];

function decodeXml(value = ""): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripXml(value = ""): string {
  return decodeXml(
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function xmlAttr(chunk: string, name: string): string | undefined {
  const match = chunk.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : undefined;
}

function xmlNodeText(chunk: string, name: string): string | undefined {
  const match = chunk.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"),
  );
  return match ? stripXml(match[1]) : undefined;
}

function xmlLinkValues(chunk: string, type: string, max = 8): string[] {
  const values: string[] = [];
  const re = new RegExp(
    `<link[^>]*type="${type}"[^>]*value="([^"]+)"[^>]*/?>`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk)) && values.length < max)
    values.push(decodeXml(m[1]));
  return values;
}

async function fetchBggText(url: string, attempts = 3): Promise<string> {
  const token = process.env.BGG_BEARER_TOKEN;
  const headers: HeadersInit = {
    "User-Agent": "Geekore/1.0 (https://geekore.it)",
    Accept: "application/xml,text/xml,*/*",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10_000),
        next: { revalidate: 3600 },
      });

      // BGG XML API spesso risponde 202 alla prima chiamata mentre prepara i dati.
      if (res.status === 202 || res.status === 429 || res.status === 503) {
        await new Promise((resolve) =>
          setTimeout(resolve, 700 * (attempt + 1)),
        );
        continue;
      }

      if (!res.ok) continue;
      const text = await res.text();
      if (text.trim().length > 0) return text;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
    }
  }

  return "";
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    chunks.push(items.slice(i, i + size));
  return chunks;
}

function parseBggThingXml(xml: string): any[] {
  const items: any[] = [];
  const re = /<item\b[^>]*type="boardgame"[^>]*>[\s\S]*?<\/item>/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml))) {
    const chunk = m[0];
    const id = xmlAttr(chunk, "id");
    if (!id) continue;

    const primaryName = chunk.match(
      /<name[^>]*type="primary"[^>]*value="([^"]+)"[^>]*\/>/i,
    );
    const fallbackName = chunk.match(/<name[^>]*value="([^"]+)"[^>]*\/>/i);
    const title = decodeXml(primaryName?.[1] || fallbackName?.[1] || "");
    if (!title) continue;

    const yearChunk = chunk.match(/<yearpublished[^>]*\/>/i)?.[0] || "";
    const avgChunk = chunk.match(/<average[^>]*\/>/i)?.[0] || "";
    const ratedChunk = chunk.match(/<usersrated[^>]*\/>/i)?.[0] || "";

    const year = Number(xmlAttr(yearChunk, "value")) || undefined;
    const coverImage =
      xmlNodeText(chunk, "image") || xmlNodeText(chunk, "thumbnail");
    const average = Number(xmlAttr(avgChunk, "value")) || undefined;
    const usersRated = Number(xmlAttr(ratedChunk, "value")) || 0;
    const rankRaw = chunk.match(
      /<rank[^>]*name="boardgame"[^>]*value="(\d+)"/,
    )?.[1];
    const rank = rankRaw ? Number(rankRaw) : undefined;
    const categories = xmlLinkValues(chunk, "boardgamecategory", 8);
    const mechanics = xmlLinkValues(chunk, "boardgamemechanic", 8);
    const designers = xmlLinkValues(chunk, "boardgamedesigner", 6).filter(
      (d) => d !== "(Uncredited)",
    );
    const description = clampDescriptionWithoutEllipsis(xmlNodeText(chunk, "description") || "", BOARDGAME_DESCRIPTION_MAX);
    const minPlayers =
      Number(
        xmlAttr(chunk.match(/<minplayers[^>]*\/>/i)?.[0] || "", "value"),
      ) || undefined;
    const maxPlayers =
      Number(
        xmlAttr(chunk.match(/<maxplayers[^>]*\/>/i)?.[0] || "", "value"),
      ) || undefined;
    const playingTime =
      Number(
        xmlAttr(chunk.match(/<playingtime[^>]*\/>/i)?.[0] || "", "value"),
      ) || undefined;
    const complexityRaw = chunk.match(
      /<averageweight[^>]*value="([\d.]+)"/,
    )?.[1];
    const complexity = complexityRaw
      ? Math.round(Number(complexityRaw) * 10) / 10
      : undefined;

    // Onboarding deve mostrare card ricche: niente righe quasi vuote.
    if (!coverImage || !description) continue;

    const rankScore = rank
      ? Math.max(64, 100 - Math.min(rank, 900) / 12)
      : undefined;
    const ratingScore = average ? Math.round(average * 10) : undefined;
    const popularityScore =
      rankScore ??
      ratingScore ??
      Math.min(92, 62 + Math.round(usersRated / 1500));

    items.push({
      id: `bgg-${id}`,
      title,
      type: "boardgame",
      coverImage,
      year,
      genres: categories.length ? categories : mechanics,
      score: average ? Math.round((average / 2) * 10) / 10 : undefined,
      description,
      why: rank
        ? `Board game molto apprezzato su BGG (#${rank})`
        : "Board game molto apprezzato dalla community",
      matchScore: Math.max(45, Math.min(99, Math.round(popularityScore))),
      authors: designers,
      developers: [],
      platforms: mechanics,
      isAwardWinner: Boolean(average && average >= 7.5 && usersRated >= 500),
      source: "bgg",
      min_players: minPlayers,
      max_players: maxPlayers,
      playing_time: playingTime,
      complexity,
    });
  }

  return items;
}

async function fetchBoardgameQuick(): Promise<any[]> {
  try {
    const hotXml = await fetchBggText(`${BGG_BASE}/hot?type=boardgame`, 2);
    const hotIds: number[] = [];
    const hotRe = /<item[^>]*id="(\d+)"/g;
    let hotMatch: RegExpExecArray | null;
    while ((hotMatch = hotRe.exec(hotXml)) && hotIds.length < 25)
      hotIds.push(Number(hotMatch[1]));

    const ids = [...new Set([...hotIds, ...BGG_SEED_IDS])].slice(0, 80);
    const batches = chunkArray(ids, 20);
    const xmlResults = await Promise.allSettled(
      batches.map((batch) =>
        fetchBggText(`${BGG_BASE}/thing?id=${batch.join(",")}&stats=1`, 4),
      ),
    );

    const byId = new Map<string, any>();
    for (const result of xmlResults) {
      if (result.status !== "fulfilled" || !result.value) continue;
      for (const item of parseBggThingXml(result.value)) {
        if (!byId.has(item.id)) byId.set(item.id, item);
      }
    }

    const sorted = [...byId.values()]
      .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
      .slice(0, TARGET_PER_TYPE);

    return translateBoardgameDescriptions(sorted);
  } catch {
    return BOARDGAME_STATIC_FALLBACK;
  }
}

export async function GET(request: NextRequest) {
  const rl = await rateLimitAsync(request, {
    limit: 20,
    windowMs: 60_000,
    prefix: "recommendations:onboarding",
  });
  if (!rl.ok)
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rl.headers },
    );

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401, headers: rl.headers },
      );

    const { searchParams } = new URL(request.url);
    const typesParam = searchParams.get("types");
    const requestedTypes = typesParam
      ? typesParam
          .split(",")
          .filter((t) =>
            ["anime", "manga", "movie", "tv", "game", "boardgame"].includes(t),
          )
      : ["anime", "manga", "movie", "tv", "game", "boardgame"];

    const tmdbToken = process.env.TMDB_API_KEY || "";
    const igdbClientId = process.env.IGDB_CLIENT_ID || "";
    const igdbClientSecret = process.env.IGDB_CLIENT_SECRET || "";

    const fetchMap: Record<string, () => Promise<any[]>> = {
      anime: () => fetchAnimeQuick(tmdbToken),
      manga: () => fetchMangaQuick(),
      movie: () => fetchMovieQuick(tmdbToken),
      tv: () => fetchTvQuick(tmdbToken),
      game: () => fetchGameQuick(igdbClientId, igdbClientSecret),
      boardgame: () => fetchBoardgameQuick(),
    };

    const fetchers = requestedTypes.map((type) =>
      fetchMap[type]().then((items) => ({ type, items })),
    );
    const fetchResults = await Promise.allSettled(fetchers);

    const recommendations: Record<string, any[]> = {};
    for (const result of fetchResults) {
      if (result.status === "fulfilled") {
        const { type, items } = result.value;
        if (items.length > 0) recommendations[type] = items;
      }
    }

    return NextResponse.json(
      { recommendations, source: "onboarding_quick", cached: false },
      {
        headers: {
          ...rl.headers,
          "Cache-Control": "no-store",
          "X-Source": "onboarding-quick",
        },
      },
    );
  } catch (err) {
    logger.error("OnboardingQuick", "error", err);
    return NextResponse.json(
      { error: "Errore interno" },
      { status: 500, headers: rl.headers },
    );
  }
}
