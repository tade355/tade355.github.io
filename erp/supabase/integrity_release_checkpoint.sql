-- First part of the combined release transaction. Retain inside PostgreSQL.
-- This is a control-DDL checkpoint, not a full database/file backup.
create table if not exists erp_release_restorepoints (
  release text primary key, captured_at timestamptz not null default now(),
  policies jsonb not null, functions jsonb not null, triggers jsonb not null, function_grants jsonb not null
);
alter table erp_release_restorepoints enable row level security;
revoke all on erp_release_restorepoints from public, anon, authenticated;

insert into erp_release_restorepoints(release, policies, functions, triggers, function_grants)
select 'integrity-2026-11-03',
  coalesce((select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public'), '[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_object('name',p.proname,'ddl',pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname in ('current_employee_tier','save_record_with_items','guard_fund_request_status','audit_row')), '[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'ddl',pg_get_triggerdef(t.oid)))
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal and (t.tgname like 'trg_audit_%' or t.tgname like 'trg_guard_%')), '[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_object('name',p.proname,'args',pg_get_function_identity_arguments(p.oid),
    'role',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'grantable',a.is_grantable))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
      lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where n.nspname='public' and p.proname='save_record_with_items' and a.privilege_type='EXECUTE'), '[]'::jsonb)
on conflict (release) do nothing;
