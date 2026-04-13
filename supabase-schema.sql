-- =============================================
-- GEEKORE - Supabase Schema (Sincronizzato con il codice - Aprile 2026)
-- =============================================
-- NOTA: questo schema usa user_media_entries come tabella FLAT (senza media separata)
-- per allinearsi con il codice attuale. La tabella `media` normalizzata è rimossa.
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PROFILES
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    steam_id TEXT,
    website TEXT,
    twitch_url TEXT,
    discord_username TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- USER MEDIA ENTRIES (Flat — nessuna tabella media separata)
-- =============================================
CREATE TABLE IF NOT EXISTS user_media_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Dati media inline
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('anime', 'manga', 'movie', 'tv', 'game', 'boardgame')),
    cover_image TEXT,
    external_id TEXT,                  -- AniList ID, IGDB ID, BGG ID
    appid TEXT,                        -- Steam AppID

    -- Progressi
    current_episode INTEGER DEFAULT 0,
    current_season INTEGER DEFAULT 1,
    episodes INTEGER,                  -- totale episodi/capitoli per la stagione corrente
    season_episodes JSONB,             -- { "1": { "episode_count": 13 }, ... }

    -- Metadati
    rating NUMERIC(3,1) CHECK (rating >= 0 AND rating <= 5),  -- mezze stelle (0.5 step)
    notes TEXT,
    is_steam BOOLEAN DEFAULT false,
    display_order BIGINT DEFAULT 0,
    genres TEXT[] DEFAULT '{}',          -- generi salvati al momento dell'aggiunta
    status TEXT DEFAULT 'watching',      -- watching|completed|paused|dropped|planning

    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Vincolo unico per media normali (non Steam)
    UNIQUE NULLS NOT DISTINCT (user_id, title)
    -- Per Steam usare UNIQUE(user_id, appid) — aggiungere se necessario:
    -- UNIQUE NULLS NOT DISTINCT (user_id, appid)
);

-- =============================================
-- USER PREFERENCES (per raccomandazioni personalizzate)
-- =============================================
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    -- Generi preferiti per categoria (array di stringhe)
    fav_game_genres TEXT[] DEFAULT '{}',
    fav_anime_genres TEXT[] DEFAULT '{}',
    fav_movie_genres TEXT[] DEFAULT '{}',
    fav_tv_genres TEXT[] DEFAULT '{}',
    fav_manga_genres TEXT[] DEFAULT '{}',
    -- Generi da escludere
    disliked_genres TEXT[] DEFAULT '{}',
    -- Piattaforme preferite per giochi
    preferred_platforms TEXT[] DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- RECOMMENDATIONS CACHE (TTL 6h, evita martellare API esterne)
-- =============================================
CREATE TABLE IF NOT EXISTS recommendations_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    media_type TEXT NOT NULL,            -- 'game'|'anime'|'movie'|'tv'|'manga'
    data JSONB NOT NULL,                 -- array di raccomandazioni
    taste_snapshot JSONB,               -- snapshot del profilo gusti usato
    generated_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + interval '6 hours'),
    UNIQUE(user_id, media_type)
);

-- =============================================
-- STEAM ACCOUNTS
-- =============================================
CREATE TABLE IF NOT EXISTS steam_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    steam_id TEXT,           -- Steam vanity URL / custom ID
    steam_id64 TEXT,         -- Steam 64-bit ID numerico
    username TEXT,           -- Steam display name
    avatar TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- STEAM IMPORT LOG (rate limiting)
-- =============================================
CREATE TABLE IF NOT EXISTS steam_import_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    imported_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- POSTS
-- =============================================
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- =============================================
-- COMMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- =============================================
-- LIKES
-- =============================================
CREATE TABLE IF NOT EXISTS likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, post_id)
);

-- =============================================
-- FOLLOWS
-- =============================================
CREATE TABLE IF NOT EXISTS follows (
    follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (follower_id, following_id)
);

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,               -- 'like', 'comment', 'follow'
    sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- =============================================
-- WISHLIST
-- =============================================
CREATE TABLE IF NOT EXISTS wishlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('anime', 'manga', 'movie', 'tv', 'game', 'boardgame')),
    cover_image TEXT,
    external_id TEXT,
    added_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, external_id)
);

-- =============================================
-- LEADERBOARD
-- =============================================
CREATE TABLE IF NOT EXISTS leaderboard (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    username TEXT,
    avatar_url TEXT,
    steam_id TEXT,
    core_power INTEGER DEFAULT 0,      -- score calcolato (era hardcoded a 75)
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- CACHE TABLES
-- =============================================
CREATE TABLE IF NOT EXISTS news_cache (
    category TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS boardgames_cache (
    id INTEGER PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Cache globale poster/dati film Letterboxd (via TMDB).
-- Condivisa tra tutti gli utenti: se utente A importa "Inception",
-- utente B non richiama TMDB ma prende i dati da qui.
CREATE TABLE IF NOT EXISTS tmdb_poster_cache (
    external_id  TEXT PRIMARY KEY,   -- es. "letterboxd-inception-2010"
    tmdb_id      INTEGER,
    poster_url   TEXT,
    title        TEXT,
    year         TEXT,
    found        BOOLEAN NOT NULL DEFAULT false,
    last_checked TIMESTAMPTZ DEFAULT now()
);

-- Cache globale poster/titoli MAL (via MAL API o Jikan).
-- Condivisa tra tutti gli utenti: evita chiamate API ripetute per lo stesso MAL ID.
CREATE TABLE IF NOT EXISTS mal_poster_cache (
    mal_id       INTEGER NOT NULL,
    media_type   TEXT NOT NULL CHECK (media_type IN ('anime', 'manga')),
    poster_url   TEXT,
    title_it     TEXT,   -- titolo italiano se disponibile via MAL alternative_titles
    found        BOOLEAN NOT NULL DEFAULT false,
    last_checked TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (mal_id, media_type)
);

-- Nota: AniList non ha una tabella cache dedicata.
-- I titoli italiani vengono recuperati da mal_poster_cache via idMal (cross-reference)
-- senza chiamate API extra. La cover image viene usata direttamente dall'URL AniList.

-- =============================================
-- INDEXES per performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_user_media_entries_user_id ON user_media_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_user_media_entries_type ON user_media_entries(user_id, type);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_notifications_receiver ON notifications(receiver_id, is_read);
CREATE INDEX IF NOT EXISTS idx_steam_import_log_user ON steam_import_log(user_id, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_media_entries_genres ON user_media_entries USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_recommendations_cache_user ON recommendations_cache(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_mal_poster_cache_type ON mal_poster_cache(media_type, mal_id);

-- =============================================
-- TRIGGER per updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_media_entries_updated_at
    BEFORE UPDATE ON user_media_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leaderboard_updated_at
    BEFORE UPDATE ON leaderboard
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
