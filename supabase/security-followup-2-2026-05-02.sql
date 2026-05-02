-- Geekore Supabase security follow-up 2 - 2026-05-02
-- ESEGUIRE MANUALMENTE nel Supabase SQL Editor dopo review.
-- Obiettivo: chiudere SECURITY DEFINER senza search_path e default privileges modificabili dal ruolo corrente.
-- Nota: i default privileges di supabase_admin possono richiedere privilegi non disponibili dal SQL Editor.

begin;

-- 1) Chiudi default privileges futuri modificabili dal ruolo corrente.
-- Non modifica tabelle/funzioni esistenti; riduce solo il rischio su oggetti creati in futuro dal ruolo corrente.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;
alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;

-- 2) Aggiungi search_path sicuro alle SECURITY DEFINER rimaste senza proconfig.
-- Non cambia la logica, solo l'ambiente di risoluzione dei nomi.
alter function public.check_entry_threshold() set search_path = public;
alter function public.cleanup_search_history(uuid, integer) set search_path = public;
alter function public.trigger_regen_on_collection_growth() set search_path = public;
alter function public.upsert_media_continuity(text, text, text, text, text, integer, text, text, integer) set search_path = public;

commit;

-- Finding residuo intenzionalmente NON eseguito qui:
-- alter default privileges for role supabase_admin ...
-- Supabase SQL Editor puo restituire permission denied su quel ruolo.
-- Trattarlo come finding di piattaforma/owner, non come blocco applicativo immediato.
