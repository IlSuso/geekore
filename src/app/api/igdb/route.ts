// src/app/api/igdb/route.ts
// SEC1: Aggiunto AbortSignal.timeout(8000) su tutte le fetch esterne
// C2:  logger invece di console.error

import { NextRequest, NextResponse } from "next/server";
import { rateLimitAsync } from "@/lib/rateLimit";
import { checkOrigin } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { translateWithCache } from "@/lib/deepl";
import { getRequestLocale } from "@/lib/i18n/serverLocale";
import { apiMessage } from '@/lib/i18n/apiErrors'

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getIgdbToken(
  clientId: string,
  clientSecret: string,
): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000)
    return cachedToken.token;

  const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(8000),
  });
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) return null;
  cachedToken = {
    token: accessToken,
    expiresAt: now + (tokenData.expires_in || 3600) * 1000,
  };
  return accessToken;
}

const SAFE_SEARCH_RE = /^[\p{L}\p{N}\s\-_:.,'!?&()]+$/u;

function validateSearch(
  request: NextRequest,
  search: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (!search || typeof search !== "string")
    return { ok: false, error: apiMessage(request, 'missingSearchParam') };

  const trimmed = search.trim();
  if (trimmed.length < 2)
    return { ok: false, error: "Ricerca troppo corta (minimo 2 caratteri)" };
  if (trimmed.length > 100)
    return { ok: false, error: "Ricerca troppo lunga (massimo 100 caratteri)" };
  if (!SAFE_SEARCH_RE.test(trimmed))
    return { ok: false, error: "Caratteri non consentiti nella ricerca" };

  return { ok: true, value: trimmed };
}

async function searchIgdb(
  request: NextRequest,
  cleanSearch: string,
  headers: Record<string, string>,
) {
  const clientId = process.env.IGDB_CLIENT_ID;
  const clientSecret = process.env.IGDB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: apiMessage(request, 'missingIgdbConfig') },
      { status: 500, headers },
    );
  }

  const accessToken = await getIgdbToken(clientId, clientSecret);
  if (!accessToken) {
    return NextResponse.json(
      { error: apiMessage(request, 'igdbTokenFailed') },
      { status: 500, headers },
    );
  }

  const safeSearch = cleanSearch.replace(/"/g, '\\"');

  const igdbRes = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "text/plain",
    },
    body: `
      search "${safeSearch}";
      fields name, cover.url, first_release_date, summary,
             genres.name, themes.name, keywords.name,
             player_perspectives.name,
             game_modes.name,
             involved_companies.company.name, involved_companies.developer,
             rating, rating_count;
      limit 20;
    `,
    signal: AbortSignal.timeout(8000),
  });

  if (!igdbRes.ok) {
    return NextResponse.json(
      { error: apiMessage(request, 'igdbResponseError') },
      { status: 502, headers },
    );
  }

  const games = await igdbRes.json();
  if (!Array.isArray(games)) {
    return NextResponse.json(
      { error: apiMessage(request, 'invalidIgdbResponse') },
      { status: 502, headers },
    );
  }

  const formattedGames = games.map((g: any) => {
    const descriptionEn = g.summary ? String(g.summary).trim() : undefined;
    return {
      id: g.id.toString(),
      title: g.name,
      title_original: g.name,
      title_en: g.name,
      type: "game",
      coverImage: g.cover?.url
        ? `https:${g.cover.url.replace("t_thumb", "t_1080p")}`
        : undefined,
      year: g.first_release_date
        ? new Date(g.first_release_date * 1000).getFullYear()
        : undefined,
      episodes: 1,
      description: descriptionEn,
      description_en: descriptionEn,
      localized: { en: { title: g.name, description: descriptionEn } },
      genres: g.genres?.map((gen: any) => gen.name) as string[] | undefined,
      themes: g.themes?.map((t: any) => t.name) as string[] | undefined,
      keywords: g.keywords?.map((k: any) => k.name) as string[] | undefined,
      player_perspectives: g.player_perspectives?.map((p: any) => p.name) as
        | string[]
        | undefined,
      game_modes: g.game_modes?.map((m: any) => m.name) as string[] | undefined,
      developers: g.involved_companies
        ?.filter((c: any) => c.developer)
        .map((c: any) => c.company?.name)
        .filter(Boolean) as string[] | undefined,
      source: "igdb",
    };
  });

  return NextResponse.json(formattedGames, { headers });
}

export async function POST(request: NextRequest) {
  const rl = await rateLimitAsync(request, {
    limit: 30,
    windowMs: 60_000,
    prefix: "igdb",
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: apiMessage(request, 'tooManyRequests') },
      { status: 429, headers: rl.headers },
    );
  }
  if (!checkOrigin(request))
    return NextResponse.json(
      { error: apiMessage(request, 'originNotAllowed') },
      { status: 403, headers: rl.headers },
    );

  try {
    const body = await request.json();
    const validated = validateSearch(request, body?.search);
    if (!validated.ok)
      return NextResponse.json(
        { error: validated.error },
        { status: 400, headers: rl.headers },
      );
    return await searchIgdb(request, validated.value, rl.headers);
  } catch (error: any) {
    if (error?.name === "TimeoutError") {
      logger.error("igdb", "Timeout richiesta IGDB");
      return NextResponse.json(
        { error: apiMessage(request, 'igdbTimeout') },
        { status: 504, headers: rl.headers },
      );
    }
    logger.error("igdb", error);
    return NextResponse.json(
      { error: apiMessage(request, 'serverInternalError') },
      { status: 500, headers: rl.headers },
    );
  }
}

export async function GET(request: NextRequest) {
  const rl = await rateLimitAsync(request, {
    limit: 30,
    windowMs: 60_000,
    prefix: "igdb",
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: apiMessage(request, 'tooManyRequests') },
      { status: 429, headers: rl.headers },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || searchParams.get("search") || "";
    const lang = searchParams.get("lang") || "it";
    const validated = validateSearch(request, q);
    if (!validated.ok) return NextResponse.json([], { headers: rl.headers });

    const locale = await getRequestLocale(request);
    const response = await searchIgdb(request, validated.value, rl.headers);
    if (!response.ok || locale !== "it") return response;

    const games: any[] = await response.json();
    if (!Array.isArray(games) || games.length === 0)
      return NextResponse.json(games, { headers: rl.headers });

    const toTranslate = games.filter((g: any) => g.description);
    if (toTranslate.length > 0) {
      const items = toTranslate.map((g: any) => ({
        id: `igdb:${g.id}`,
        text: g.description,
      }));
      const translated = await translateWithCache(items, "IT", "EN");
      toTranslate.forEach((g: any) => {
        const value = translated[`igdb:${g.id}`];
        if (value) {
          g.description = value;
          g.description_it = value;
          g.localized = {
            ...(g.localized || {}),
            it: { title: g.title, description: value },
          };
        }
      });
    }
    return NextResponse.json(games, { headers: rl.headers });
  } catch (error: any) {
    if (error?.name === "TimeoutError") {
      logger.error("igdb", "Timeout richiesta IGDB");
      return NextResponse.json(
        { error: apiMessage(request, 'igdbTimeout') },
        { status: 504, headers: rl.headers },
      );
    }
    logger.error("igdb", error);
    return NextResponse.json(
      { error: apiMessage(request, 'serverInternalError') },
      { status: 500, headers: rl.headers },
    );
  }
}
