-- Compact internal BoardGameGeek catalog for recommendation recruitment.
-- Designed for Supabase Free: keep rows lean, store image URLs, avoid large
-- descriptions unless explicitly needed.

CREATE TABLE IF NOT EXISTS public.bgg_catalog (
  bgg_id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  year_published INTEGER,
  rank INTEGER,
  average_rating NUMERIC(4,2),
  users_rated INTEGER,
  categories TEXT[] NOT NULL DEFAULT '{}',
  mechanics TEXT[] NOT NULL DEFAULT '{}',
  designers TEXT[] NOT NULL DEFAULT '{}',
  image_url TEXT,
  thumbnail_url TEXT,
  min_players INTEGER,
  max_players INTEGER,
  playing_time INTEGER,
  complexity NUMERIC(3,2),
  description TEXT,
  source TEXT NOT NULL DEFAULT 'bgg',
  last_enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bgg_catalog_rank
  ON public.bgg_catalog(rank)
  WHERE rank IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bgg_catalog_rating
  ON public.bgg_catalog(average_rating DESC, users_rated DESC);

CREATE INDEX IF NOT EXISTS idx_bgg_catalog_categories
  ON public.bgg_catalog USING GIN(categories);

CREATE INDEX IF NOT EXISTS idx_bgg_catalog_mechanics
  ON public.bgg_catalog USING GIN(mechanics);

CREATE INDEX IF NOT EXISTS idx_bgg_catalog_updated
  ON public.bgg_catalog(updated_at DESC);

ALTER TABLE public.bgg_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "BGG catalog is readable" ON public.bgg_catalog;
CREATE POLICY "BGG catalog is readable"
  ON public.bgg_catalog FOR SELECT
  USING (true);
