-- Centralize Swipe exclusion reads behind one RPC.
-- This avoids repeated PostgREST requests to user_media_entries + swipe_skipped
-- during Swipe bootstrap/refill while keeping RLS semantics through auth.uid().

create or replace function public.get_swipe_exclusions()
returns table(kind text, value text)
language sql
stable
security invoker
set search_path = public
as $$
  select 'owned_id'::text, external_id::text
  from public.user_media_entries
  where user_id = auth.uid()
    and external_id is not null

  union all

  select 'owned_title'::text, lower(title)::text
  from public.user_media_entries
  where user_id = auth.uid()
    and title is not null
    and btrim(title) <> ''

  union all

  select 'skipped_id'::text, external_id::text
  from public.swipe_skipped
  where user_id = auth.uid()
    and external_id is not null;
$$;

grant execute on function public.get_swipe_exclusions() to authenticated;
