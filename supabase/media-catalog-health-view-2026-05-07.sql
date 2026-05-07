-- Lightweight catalog health view for operational checks.
-- Helps decide which catalog slices need refresh without scanning full payloads.

CREATE OR REPLACE VIEW public.media_catalog_health AS
SELECT
  media_type,
  count(*) AS rows,
  count(*) FILTER (WHERE cover_image IS NOT NULL) AS with_cover,
  count(*) FILTER (WHERE score IS NOT NULL) AS with_score,
  count(*) FILTER (WHERE year >= EXTRACT(YEAR FROM now())::int - 1) AS recent_titles,
  min(updated_at) AS oldest_updated_at,
  max(updated_at) AS newest_updated_at,
  percentile_disc(0.5) WITHIN GROUP (ORDER BY quality_score) AS median_quality_score
FROM public.media_catalog
GROUP BY media_type;
