-- Geekore Supabase audit checks - 2026-05-02
-- ESEGUIRE MANUALMENTE nel Supabase SQL Editor.
-- Consiglio pratico: eseguire UNA SEZIONE ALLA VOLTA, non tutto insieme.
-- Obiettivo: produrre output read-only per review RLS/RPC/grant/storage.
-- Questo file NON modifica dati/schema/policy.

-- 1) Tabelle public con RLS disabilitata.
select
  n.nspname as schemaname,
  c.relname as tablename,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relrowsecurity = false
order by c.relname;

-- 2) Tabelle public senza policy visibili.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
group by c.relname, c.relrowsecurity
having count(p.polname) = 0
order by c.relname;

-- 3) Policy public/anon/authenticated: controllare soprattutto cmd insert/update/delete e role public.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 4) Storage policies sui bucket sensibili.
select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;

-- 5) Funzioni SECURITY DEFINER in public con search_path e grants.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  p.proacl as grants
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by p.proname, args;

-- 6) Funzioni public eseguibili da anon/authenticated/public.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('public', p.oid, 'execute') as public_execute,
  p.prosecdef as security_definer,
  p.proconfig as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    has_function_privilege('anon', p.oid, 'execute')
    or has_function_privilege('authenticated', p.oid, 'execute')
    or has_function_privilege('public', p.oid, 'execute')
  )
order by p.prosecdef desc, p.proname, args;

-- 7) Default execute privileges che possono riaprire RPC future.
select
  defaclrole::regrole as grantor,
  defaclnamespace::regnamespace as schema_name,
  defaclobjtype as object_type,
  defaclacl as acl
from pg_default_acl
where defaclnamespace::regnamespace::text = 'public'
order by 1, 2, 3;

-- 8) Tabelle con grants diretti a anon/authenticated/public fuori dalle policy RLS.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'public')
order by table_name, grantee, privilege_type;

-- 9) Trigger su tabelle public: cercare chiamate HTTP, doppie rigenerazioni o side-effect inattesi.
select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where event_object_schema = 'public'
order by event_object_table, trigger_name;

-- 10) Estensioni HTTP/cron/vault installate: utile per capire chiamate DB -> HTTP e gestione secret.
select
  extname,
  extversion,
  n.nspname as schema_name
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where extname in ('http', 'pg_net', 'pg_cron', 'vault')
order by extname;
