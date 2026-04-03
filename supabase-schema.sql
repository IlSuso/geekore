-- =============================================
-- GEEKORE - Supabase Schema (Versione Aggiornata - Aprile 2026)
-- =============================================

-- Enable extensions
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
-- MEDIA (Anime, Manga, Movie, TV, Game, Board Game)
-- =============================================
CREATE TABLE IF NOT EXISTS media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('anime', 'manga', 'movie', 'tv', 'game', 'boardgame')),
    title TEXT NOT NULL,
    cover_url TEXT,
    external_id TEXT,                    -- id da AniList / IGDB / BGG
    year INTEGER,
    total_episodes INTEGER,              -- per anime/tv
    total_chapters INTEGER,              -- per manga
    total_volumes INTEGER,               -- per manga
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- USER MEDIA ENTRIES (Progressi personali)
-- =============================================
CREATE TABLE IF NOT EXISTS user_media_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('planning', 'watching', 'reading', 'playing', 'completed', 'dropped', 'on_hold')),
    progress INTEGER DEFAULT 0,          -- episodi/capitoli/ore giocati
    score INTEGER CHECK (score >= 0 AND score <= 10),
    notes TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, media_id)
);

-- =============================================
-- POSTS (Post sociali liberi)
-- =============================================
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_url TEXT,
    item_id UUID REFERENCES media(id) ON DELETE SET NULL,   -- opzionale: legato a un media
    rating INTEGER CHECK (rating >= 1 AND rating <= 10),
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
-- LIKES (Unificata per posts e activities)
-- =============================================
CREATE TABLE IF NOT EXISTS likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    activity_id UUID,                    -- se vorrai usarlo per feed_activities in futuro
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
-- FEED ACTIVITIES (attività automatiche)
-- =============================================
CREATE TABLE IF NOT EXISTS feed_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    entry_id UUID NOT NULL,              -- può essere post_id o user_media_entry_id
    type TEXT NOT NULL,                  -- 'post', 'media_update', 'completed', ecc.
    created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    sender_id UUID NOT NULL REFERENCES profiles(id),
    receiver_id UUID NOT NULL REFERENCES profiles(id),
    post_id UUID REFERENCES posts(id),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

-- =============================================
-- CACHE TABLES (mantieni se le usi)
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

-- =============================================
-- INDEXES per performance
-- =============================================
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_user_media_entries_user_id ON user_media_entries(user_id);
CREATE INDEX idx_follows_follower ON follows(follower_id);

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