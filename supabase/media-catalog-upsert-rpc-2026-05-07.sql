-- Append-first catalog upsert with mutable metrics.
-- Stable metadata is only filled when missing; volatile values such as rating,
-- popularity and quality are refreshed whenever a source sees the title again.

CREATE OR REPLACE FUNCTION public.upsert_media_catalog_items(p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_items, '[]'::jsonb)) AS x(
      media_type text,
      external_id text,
      title text,
      title_original text,
      title_en text,
      title_it text,
      description text,
      description_en text,
      description_it text,
      cover_image text,
      cover_image_en text,
      cover_image_it text,
      year integer,
      genres text[],
      score numeric,
      popularity_score integer,
      quality_score integer,
      source text,
      localized jsonb,
      extra jsonb
    )
    WHERE media_type IN ('anime', 'manga', 'movie', 'tv', 'game', 'boardgame')
      AND external_id IS NOT NULL
      AND title IS NOT NULL
      AND cover_image IS NOT NULL
  ),
  upserted AS (
    INSERT INTO public.media_catalog (
      media_type, external_id, title, title_original, title_en, title_it,
      description, description_en, description_it,
      cover_image, cover_image_en, cover_image_it,
      year, genres, score, popularity_score, quality_score, source,
      localized, extra, last_seen_at, updated_at
    )
    SELECT
      media_type,
      external_id,
      title,
      COALESCE(title_original, title),
      title_en,
      title_it,
      description,
      description_en,
      description_it,
      cover_image,
      cover_image_en,
      cover_image_it,
      year,
      COALESCE(genres, '{}'::text[]),
      score,
      COALESCE(popularity_score, 0),
      COALESCE(quality_score, 0),
      COALESCE(source, 'external'),
      COALESCE(localized, '{}'::jsonb),
      COALESCE(extra, '{}'::jsonb),
      now(),
      now()
    FROM incoming
    ON CONFLICT (media_type, external_id) DO UPDATE SET
      title = COALESCE(public.media_catalog.title, excluded.title),
      title_original = COALESCE(public.media_catalog.title_original, excluded.title_original),
      title_en = COALESCE(public.media_catalog.title_en, excluded.title_en),
      title_it = COALESCE(public.media_catalog.title_it, excluded.title_it),
      description = COALESCE(public.media_catalog.description, excluded.description),
      description_en = COALESCE(public.media_catalog.description_en, excluded.description_en),
      description_it = COALESCE(public.media_catalog.description_it, excluded.description_it),
      cover_image = COALESCE(public.media_catalog.cover_image, excluded.cover_image),
      cover_image_en = COALESCE(public.media_catalog.cover_image_en, excluded.cover_image_en),
      cover_image_it = COALESCE(public.media_catalog.cover_image_it, excluded.cover_image_it),
      year = COALESCE(public.media_catalog.year, excluded.year),
      genres = CASE
        WHEN CARDINALITY(public.media_catalog.genres) > 0 THEN public.media_catalog.genres
        ELSE excluded.genres
      END,
      score = COALESCE(excluded.score, public.media_catalog.score),
      popularity_score = GREATEST(public.media_catalog.popularity_score, excluded.popularity_score),
      quality_score = GREATEST(public.media_catalog.quality_score, excluded.quality_score),
      source = COALESCE(public.media_catalog.source, excluded.source),
      localized = CASE
        WHEN public.media_catalog.localized = '{}'::jsonb THEN excluded.localized
        ELSE public.media_catalog.localized || excluded.localized
      END,
      extra = public.media_catalog.extra || excluded.extra,
      last_seen_at = now(),
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upserted;

  RETURN v_count;
END;
$$;
