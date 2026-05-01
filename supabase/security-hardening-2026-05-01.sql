-- Security hardening for the first P1 audit pass.
-- Apply in Supabase SQL editor after deploying the matching application code.

alter table if exists public.activity_log enable row level security;

drop policy if exists activity_log_authenticated_read on public.activity_log;
create policy activity_log_authenticated_read
  on public.activity_log for select
  to authenticated
  using (true);

drop policy if exists activity_log_insert_own on public.activity_log;
create policy activity_log_insert_own
  on public.activity_log for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists activity_log_update_own on public.activity_log;
create policy activity_log_update_own
  on public.activity_log for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists activity_log_delete_own on public.activity_log;
create policy activity_log_delete_own
  on public.activity_log for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists post_images_public_read on storage.objects;
create policy post_images_public_read
  on storage.objects for select
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

drop function if exists public.cleanup_search_history_bulk(integer);

create function public.cleanup_search_history_bulk(p_keep integer default 500)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  deleted_count integer;
begin
  with ranked as (
    select id,
           row_number() over (
             partition by user_id
             order by created_at desc
           ) as rn
    from public.search_history
  ),
  deleted as (
    delete from public.search_history sh
    using ranked r
    where sh.id = r.id
      and r.rn > greatest(p_keep, 1)
    returning sh.id
  )
  select count(*) into deleted_count from deleted;

  return deleted_count;
end;
$function$;

revoke all on function public.cleanup_search_history_bulk(integer) from public;
grant execute on function public.cleanup_search_history_bulk(integer) to service_role;

create table if not exists public.reco_regen_locks (
  key text primary key,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.reco_regen_locks enable row level security;

create or replace function public.try_acquire_reco_regen_lock(
  p_key text,
  p_ttl_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  changed_rows integer;
begin
  insert into public.reco_regen_locks(key, expires_at, updated_at)
  values (p_key, now() + make_interval(secs => greatest(p_ttl_seconds, 1)), now())
  on conflict (key) do update
    set expires_at = excluded.expires_at,
        updated_at = now()
    where public.reco_regen_locks.expires_at <= now();

  get diagnostics changed_rows = row_count;
  return changed_rows > 0;
end;
$function$;

create or replace function public.finish_reco_regen_lock(
  p_key text,
  p_cooldown_seconds integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if p_cooldown_seconds > 0 then
    update public.reco_regen_locks
      set expires_at = now() + make_interval(secs => p_cooldown_seconds),
          updated_at = now()
      where key = p_key;
  else
    delete from public.reco_regen_locks where key = p_key;
  end if;
end;
$function$;

revoke all on public.reco_regen_locks from public;
revoke all on function public.try_acquire_reco_regen_lock(text, integer) from public;
revoke all on function public.finish_reco_regen_lock(text, integer) from public;
grant execute on function public.try_acquire_reco_regen_lock(text, integer) to service_role;
grant execute on function public.finish_reco_regen_lock(text, integer) to service_role;
