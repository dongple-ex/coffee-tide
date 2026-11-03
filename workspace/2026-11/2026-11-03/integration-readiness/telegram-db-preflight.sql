-- Data mutation: NONE - 100% read-only
begin read only;
set local statement_timeout = '30s';

select expected.name as table_name,
  object.oid is not null as exists,
  object.relrowsecurity as row_level_security,
  case when object.oid is null then null else not has_table_privilege('anon', object.oid, 'SELECT,INSERT,UPDATE,DELETE') end as anon_denied,
  case when object.oid is null then null else not has_table_privilege('authenticated', object.oid, 'SELECT,INSERT,UPDATE,DELETE') end as authenticated_denied,
  case when object.oid is null then null else (
    select bool_and(has_table_privilege('service_role', object.oid, privilege))
    from unnest(array['SELECT','INSERT','UPDATE','DELETE']) as privilege
  ) end as service_role_access
from (values ('telegram_links'), ('telegram_link_requests'), ('telegram_events'), ('telegram_update_receipts')) as expected(name)
left join pg_class as object on object.oid = to_regclass('public.' || expected.name)
limit 10;

select expected.signature,
  object.oid is not null as exists,
  object.prosecdef as security_definer,
  object.proconfig as function_settings,
  case when object.oid is null then null else not has_function_privilege('anon', object.oid, 'EXECUTE') end as anon_denied,
  case when object.oid is null then null else not has_function_privilege('authenticated', object.oid, 'EXECUTE') end as authenticated_denied,
  case when object.oid is null then null else has_function_privilege('service_role', object.oid, 'EXECUTE') end as service_role_access
from (values
  ('public.telegram_start_link(uuid,text)'),
  ('public.telegram_propose_link(text,text,text,text)'),
  ('public.telegram_confirm_link(uuid,uuid)'),
  ('public.telegram_unlink(uuid)'),
  ('public.telegram_claim_event(bigint,text,text,text)')
) as expected(signature)
left join pg_proc as object on object.oid = to_regprocedure(expected.signature)
limit 10;

select indexname, indexdef from pg_indexes
where schemaname = 'public' and tablename in ('telegram_events','telegram_update_receipts')
order by tablename, indexname
limit 10;

rollback;
