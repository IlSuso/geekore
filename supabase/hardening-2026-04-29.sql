-- Geekore hardening patch - 2026-04-29
-- Run this from Supabase SQL Editor after reviewing it.

begin;

-- 1. Storage: covers must be public-read only. Writes/deletes should go
-- through server-side service role code, not public Storage policies.
drop policy if exists covers_service_insert on storage.objects;
drop policy if exists covers_service_delete on storage.objects;

drop policy if exists covers_public_read on storage.objects;
create policy covers_public_read
  on storage.objects
  for select
  to public
  using (bucket_id = 'covers');

-- 2. Remove database-side HTTP regen functions that embed app secrets.
-- The app already has a regen_jobs model; keep HTTP calls in server code.
drop trigger if exists trg_regen_pool_on_entry on public.user_media_entries;
drop function if exists public.fn_trigger_regen_on_entry_insert();
drop function if exists public.fn_regen_stale_pools();

-- 3. Harden SECURITY DEFINER functions that are callable from the app.
create or replace function public.increment_category_score(
  p_user_id uuid,
  p_category text,
  p_subcategory text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not authorized';
  end if;

  insert into user_category_affinity (user_id, category, subcategory, score, last_interacted_at)
  values (p_user_id, p_category, p_subcategory, 1, now())
  on conflict (user_id, category, subcategory)
  do update set
    score = user_category_affinity.score + 1,
    last_interacted_at = now();
end;
$function$;

create or replace function public.cleanup_old_search_history(
  p_user_id uuid,
  p_keep integer default 500
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  total_count integer;
  oldest_kept timestamptz;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'not authorized';
  end if;

  select count(*) into total_count
  from search_history sh
  where sh.user_id = p_user_id;

  if total_count <= p_keep then
    return;
  end if;

  select created_at into oldest_kept
  from search_history sh
  where sh.user_id = p_user_id
  order by created_at desc
  limit 1 offset p_keep;

  delete from search_history sh
  where sh.user_id = p_user_id
    and sh.created_at < oldest_kept;
end;
$function$;

create or replace function public.update_display_orders(updates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  item jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authorized';
  end if;

  for item in select * from jsonb_array_elements(updates)
  loop
    update user_media_entries
    set display_order = (item->>'display_order')::bigint
    where id = (item->>'id')::uuid
      and user_id = auth.uid();
  end loop;
end;
$function$;

-- 4. Lock down RPC execution. Re-grant only functions intentionally used
-- by browser/client code. Service role can still execute everything.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.get_leaderboard(integer) to anon, authenticated;
grant execute on function public.increment_category_score(uuid, text, text) to authenticated;
grant execute on function public.cleanup_old_search_history(uuid, integer) to authenticated;
grant execute on function public.update_display_orders(jsonb) to authenticated;
grant execute on function public.feed_following(uuid, integer, integer) to authenticated;

commit;
