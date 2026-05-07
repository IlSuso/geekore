-- Remove false Italian catalog assets from sources that only provide
-- English/original metadata. Official Italian titles remain a source-specific
-- field, not a machine-translated fallback.

UPDATE public.media_catalog
SET
  title_it = NULL,
  description_it = NULL,
  cover_image_it = NULL,
  localized = COALESCE(localized, '{}'::jsonb) - 'it',
  updated_at = now()
WHERE media_type IN ('anime', 'manga', 'game', 'boardgame')
  AND source IN ('anilist', 'igdb', 'steam', 'bgg', 'bgg_catalog')
  AND (
    title_it IS NOT NULL
    OR description_it IS NOT NULL
    OR cover_image_it IS NOT NULL
    OR COALESCE(localized, '{}'::jsonb) ? 'it'
  );
