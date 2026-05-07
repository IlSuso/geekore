-- One-time bootstrap for the global media catalog.
-- Safe to rerun: it only upserts by (media_type, external_id), preserving better
-- existing values where possible. This does not delete from any catalog.

WITH queue_rows AS (
  SELECT external_id,title,type,cover_image,year,genres,score,description,source,localized,title_original,title_en,title_it,description_en,description_it,inserted_at FROM public.swipe_queue_anime
  UNION ALL SELECT external_id,title,type,cover_image,year,genres,score,description,source,localized,title_original,title_en,title_it,description_en,description_it,inserted_at FROM public.swipe_queue_manga
  UNION ALL SELECT external_id,title,type,cover_image,year,genres,score,description,source,localized,title_original,title_en,title_it,description_en,description_it,inserted_at FROM public.swipe_queue_movie
  UNION ALL SELECT external_id,title,type,cover_image,year,genres,score,description,source,localized,title_original,title_en,title_it,description_en,description_it,inserted_at FROM public.swipe_queue_tv
  UNION ALL SELECT external_id,title,type,cover_image,year,genres,score,description,source,localized,title_original,title_en,title_it,description_en,description_it,inserted_at FROM public.swipe_queue_game
),
ranked AS (
  SELECT DISTINCT ON (type, external_id)
    type AS media_type,
    external_id,
    title,
    COALESCE(title_original, title) AS title_original,
    title_en,
    title_it,
    description,
    description_en,
    description_it,
    cover_image,
    NULL::text AS cover_image_en,
    NULL::text AS cover_image_it,
    year,
    COALESCE(genres, '{}'::text[]) AS genres,
    score,
    GREATEST(0, LEAST(100, COALESCE(ROUND(score)::int, 0))) AS popularity_score,
    GREATEST(25, LEAST(100,
      COALESCE(ROUND(score)::int, 0)
      + CASE WHEN cover_image IS NOT NULL THEN 20 ELSE 0 END
      + CASE WHEN description IS NOT NULL OR description_en IS NOT NULL OR description_it IS NOT NULL THEN 10 ELSE 0 END
      + CASE WHEN CARDINALITY(COALESCE(genres, '{}'::text[])) > 0 THEN 8 ELSE 0 END
    )) AS quality_score,
    COALESCE(source, 'queue-bootstrap') AS source,
    COALESCE(localized, '{}'::jsonb) AS localized,
    '{}'::jsonb AS extra,
    now() AS last_seen_at,
    now() AS updated_at
  FROM queue_rows
  WHERE type IN ('anime','manga','movie','tv','game')
    AND external_id IS NOT NULL
    AND title IS NOT NULL
    AND cover_image IS NOT NULL
  ORDER BY type, external_id, inserted_at DESC NULLS LAST
)
INSERT INTO public.media_catalog (
  media_type, external_id, title, title_original, title_en, title_it,
  description, description_en, description_it, cover_image, cover_image_en, cover_image_it,
  year, genres, score, popularity_score, quality_score, source, localized, extra, last_seen_at, updated_at
)
SELECT * FROM ranked
ON CONFLICT (media_type, external_id) DO UPDATE SET
  title = excluded.title,
  title_original = COALESCE(public.media_catalog.title_original, excluded.title_original),
  title_en = COALESCE(public.media_catalog.title_en, excluded.title_en),
  title_it = COALESCE(public.media_catalog.title_it, excluded.title_it),
  description = COALESCE(public.media_catalog.description, excluded.description),
  description_en = COALESCE(public.media_catalog.description_en, excluded.description_en),
  description_it = COALESCE(public.media_catalog.description_it, excluded.description_it),
  cover_image = COALESCE(public.media_catalog.cover_image, excluded.cover_image),
  year = COALESCE(public.media_catalog.year, excluded.year),
  genres = CASE WHEN CARDINALITY(public.media_catalog.genres) > 0 THEN public.media_catalog.genres ELSE excluded.genres END,
  score = GREATEST(COALESCE(public.media_catalog.score, 0), COALESCE(excluded.score, 0)),
  popularity_score = GREATEST(public.media_catalog.popularity_score, excluded.popularity_score),
  quality_score = GREATEST(public.media_catalog.quality_score, excluded.quality_score),
  last_seen_at = now(),
  updated_at = now();

INSERT INTO public.media_catalog (
  media_type, external_id, title, title_original, title_en, description, description_en,
  cover_image, year, genres, score, popularity_score, quality_score, source, localized, extra, last_seen_at, updated_at
)
SELECT
  'boardgame',
  'bgg-' || bgg_id::text,
  title,
  title,
  title,
  description,
  description,
  image_url,
  year_published,
  COALESCE(categories, '{}'::text[]),
  ROUND(COALESCE(average_rating, 0) * 10)::numeric,
  LEAST(100, GREATEST(0, ROUND(COALESCE(average_rating, 0) * 10)::int)),
  LEAST(100, GREATEST(25,
    ROUND(COALESCE(average_rating, 0) * 10)::int
    + CASE WHEN rank <= 500 THEN 10 WHEN rank <= 1500 THEN 6 ELSE 0 END
    + CASE WHEN users_rated >= 1000 THEN 8 WHEN users_rated >= 250 THEN 4 ELSE 0 END
  )),
  'bgg_catalog',
  jsonb_build_object(
    'en', jsonb_build_object('title', title, 'description', description, 'coverImage', image_url),
    'it', jsonb_build_object('title', title, 'description', description, 'coverImage', image_url)
  ),
  jsonb_build_object('rank', rank, 'users_rated', users_rated, 'mechanics', mechanics, 'designers', designers),
  now(),
  now()
FROM public.bgg_catalog
WHERE image_url IS NOT NULL
  AND rank <= 5000
  AND average_rating >= 6.8
  AND users_rated >= 100
  AND lower(title) NOT LIKE '%cabbage patch%'
  AND lower(title) NOT LIKE '%adoption game%'
  AND lower(title) NOT LIKE '%promo%'
  AND lower(title) NOT LIKE '%booster%'
ON CONFLICT (media_type, external_id) DO UPDATE SET
  title = excluded.title,
  title_original = COALESCE(public.media_catalog.title_original, excluded.title_original),
  title_en = COALESCE(public.media_catalog.title_en, excluded.title_en),
  description = COALESCE(public.media_catalog.description, excluded.description),
  description_en = COALESCE(public.media_catalog.description_en, excluded.description_en),
  cover_image = COALESCE(public.media_catalog.cover_image, excluded.cover_image),
  year = COALESCE(public.media_catalog.year, excluded.year),
  genres = CASE WHEN CARDINALITY(public.media_catalog.genres) > 0 THEN public.media_catalog.genres ELSE excluded.genres END,
  score = GREATEST(COALESCE(public.media_catalog.score, 0), COALESCE(excluded.score, 0)),
  popularity_score = GREATEST(public.media_catalog.popularity_score, excluded.popularity_score),
  quality_score = GREATEST(public.media_catalog.quality_score, excluded.quality_score),
  extra = public.media_catalog.extra || excluded.extra,
  last_seen_at = now(),
  updated_at = now();
