-- Geekore Supabase security follow-up 2 - 2026-05-02
-- ESEGUIRE MANUALMENTE nel Supabase SQL Editor dopo review.
-- Obiettivo: chiudere default privileges residui e SECURITY DEFINER senza search_path.

begin;

-- 1) Chiudi anche i default privileges creati da supabase_admin.
-- L'audit precedente mostrava ancora execute futuro su funzioni per anon/authenticated.
alter default privileges for role supabase_admin in schema public revoke execute on functions from public;
alter default privileges for role supabase_admin in schema public revoke execute on functions from anon;
alter default privileges for role supabase_admin in schema public revoke execute on functions from authenticated;

-- 2) Chiudi default privileges table/sequence troppo larghi per oggetti futuri.
-- Non modifica tabelle esistenti; riduce solo il rischio su oggetti creati in futuro.
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges for role supabase_admin in schema public revoke all on tables from public, anon, authenticated;
alter default privileges for role supabase_admin in schema public revoke all on sequences from public, anon, authenticated;

-- 3) Aggiungi search_path sicuro alle SECURITY DEFINER rimaste senza proconfig.
-- Non cambia la logica, solo l'ambiente di risoluzione dei nomi.
alter function public.check_entry_threshold() set search_path = public;
alter function public.cleanup_search_history(uuid, integer) set search_path = public;
alter function public.trigger_regen_on_collection_growth() set search_path = public;
alter function public.upsert_media_continuity(text, text, text, text, text, integer, text, text, integer) set search_path = public;

commit;
