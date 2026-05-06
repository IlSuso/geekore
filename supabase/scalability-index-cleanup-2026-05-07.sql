-- Scalability hardening: remove redundant indexes that duplicate primary keys
-- or equivalent left-prefix indexes. Run during a quiet window.
--
-- These drops do not remove constraints; they remove only duplicate helper
-- indexes that add write overhead and storage use.

drop index if exists public.idx_follows_follower_following;
drop index if exists public.idx_posts_created_at;
drop index if exists public.idx_posts_user_recent;
drop index if exists public.idx_recommendations_shown_session;
drop index if exists public.idx_recommendations_shown_user;
drop index if exists public.idx_recommendations_shown_user_shown_desc;
drop index if exists public.idx_swipe_skipped_user_external;
drop index if exists public.idx_swipe_skipped_user_external_v4;
drop index if exists public.swipe_skipped_user_id_idx;
drop index if exists public.idx_user_media_entries_external_id;
drop index if exists public.idx_user_media_external_id;
drop index if exists public.idx_user_media_entries_user_id;
drop index if exists public.idx_user_media_user_id;
drop index if exists public.idx_user_media_type;
drop index if exists public.idx_user_media_user_type;
drop index if exists public.user_media_entries_user_type;
drop index if exists public.idx_user_media_user_type_updated_desc;
