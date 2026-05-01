-- Geekore action-required SQL - 2026-05-01
-- ESEGUIRE MANUALMENTE nel Supabase SQL Editor dopo review.
-- Obiettivo: applicare le fix DB richieste dal pass di hardening.

begin;

-- 1) RPC usata da /api/cron/taste-maintenance.
-- Tiene al massimo p_keep ricerche per utente ed elimina le più vecchie.
drop function if exists public.cleanup_search_history_bulk(integer);

create function public.cleanup_search_history_bulk(
  p_keep integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  deleted_count integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;

  with ranked as (
    select id,
           row_number() over (partition by user_id order by created_at desc) as rn
    from public.search_history
  ), deleted as (
    delete from public.search_history sh
    using ranked r
    where sh.id = r.id
      and r.rn > p_keep
    returning sh.id
  )
  select count(*) into deleted_count from deleted;

  return deleted_count;
end;
$function$;

revoke execute on function public.cleanup_search_history_bulk(integer) from public, anon, authenticated;

-- 2) Verifica consigliata: questa query deve funzionare solo con service_role.
-- Non eseguirla dal client browser.
-- select public.cleanup_search_history_bulk(500);

commit;
