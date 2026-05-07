-- Global compact media catalog used as a shared, append-first discovery source.
-- User actions must never mutate this table. Seen/skipped/wishlist state lives in
-- user-specific tables; catalog rows are shared by everyone.

CREATE TABLE IF NOT EXISTS public.media_catalog (
  media_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  title_original TEXT,
  title_en TEXT,
  title_it TEXT,
  description TEXT,
  description_en TEXT,
  description_it TEXT,
  cover_image TEXT,
  cover_image_en TEXT,
  cover_image_it TEXT,
  year INTEGER,
  genres TEXT[] NOT NULL DEFAULT '{}',
  score NUMERIC(5,2),
  popularity_score INTEGER NOT NULL DEFAULT 0,
  quality_score INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  localized JSONB NOT NULL DEFAULT '{}'::jsonb,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (media_type, external_id),
  CONSTRAINT media_catalog_type_check CHECK (
    media_type IN ('anime', 'manga', 'movie', 'tv', 'game', 'boardgame')
  )
);

CREATE INDEX IF NOT EXISTS idx_media_catalog_type_quality
  ON public.media_catalog(media_type, quality_score DESC, popularity_score DESC, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_catalog_type_year
  ON public.media_catalog(media_type, year DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_media_catalog_genres
  ON public.media_catalog USING GIN(genres);

CREATE INDEX IF NOT EXISTS idx_media_catalog_updated
  ON public.media_catalog(updated_at DESC);

ALTER TABLE public.media_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Media catalog is readable" ON public.media_catalog;
CREATE POLICY "Media catalog is readable"
  ON public.media_catalog FOR SELECT
  USING (true);
