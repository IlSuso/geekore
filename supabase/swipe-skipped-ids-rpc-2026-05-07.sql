-- Hot-path Swipe helper for refill/onboarding.
-- Use this when the caller only needs skipped ids and not the full owned-title set.

create or replace function public.get_swipe_skipped_ids()
returns table(external_id text)
language sql
stable
security invoker
set search_path = public
as $$
  select s.external_id::text
  from public.swipe_skipped s
  where s.user_id = auth.uid()
    and s.external_id is not null;
$$;

grant execute on function public.get_swipe_skipped_ids() to authenticated;
