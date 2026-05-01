-- Geekore Supabase security follow-up - 2026-05-02
-- ESEGUIRE MANUALMENTE nel Supabase SQL Editor dopo review.
-- Obiettivo: chiudere i finding emersi da audit-checks-2026-05-02.sql.

begin;

-- 1) Evita che nuove funzioni future in public siano eseguibili automaticamente dai client.
-- Nota: non tocca le funzioni esistenti, solo i default privileges futuri.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;

-- 2) Lock RPC SECURITY DEFINER usate solo lato server/service-role.
-- Queste due RPC gestiscono lock interni di rigenerazione: non devono essere invocabili da browser.
revoke execute on function public.try_acquire_reco_regen_lock(text, integer) from public, anon, authenticated;
revoke execute on function public.finish_reco_regen_lock(text, integer) from public, anon, authenticated;
grant execute on function public.try_acquire_reco_regen_lock(text, integer) to service_role;
grant execute on function public.finish_reco_regen_lock(text, integer) to service_role;

-- 3) Tabelle interne senza policy: mantieni l'accesso solo server-side.
-- RLS gia blocca i client, ma togliamo anche i grant diretti per ridurre ambiguita.
revoke all on table public.push_rate_limit from public, anon, authenticated;
revoke all on table public.reco_regen_locks from public, anon, authenticated;
revoke all on table public.used_fake_content from public, anon, authenticated;
grant all on table public.push_rate_limit to service_role;
grant all on table public.reco_regen_locks to service_role;
grant all on table public.used_fake_content to service_role;

-- 4) Backup legacy: non devono stare esposti a ruoli client.
revoke all on table public._backup_feed_activities_20260418 from public, anon, authenticated;
revoke all on table public._backup_policies_20260418 from public, anon, authenticated;
grant all on table public._backup_feed_activities_20260418 to service_role;
grant all on table public._backup_policies_20260418 to service_role;

-- 5) Storage post-images: rimuovi policy duplicate/ampie e lascia solo path per-user.
-- Il codice salva gia in: <user_id>/<uuid>.<ext>
drop policy if exists post_images_insert_auth on storage.objects;
drop policy if exists post_images_delete_own on storage.objects;
drop policy if exists post_images_update_own on storage.objects;
drop policy if exists post_images_select_public on storage.objects;

drop policy if exists post_images_public_read on storage.objects;
create policy post_images_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'post-images');

drop policy if exists post_images_user_insert on storage.objects;
create policy post_images_user_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists post_images_user_update on storage.objects;
create policy post_images_user_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists post_images_user_delete on storage.objects;
create policy post_images_user_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
