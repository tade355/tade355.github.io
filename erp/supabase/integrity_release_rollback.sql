-- Administrator only. Pair with reverting the application release.
-- This restores pre-release policies/functions/triggers, including their old
-- weaknesses. It retains business records, audit history and additive columns.
begin;
do $$
declare checkpoint erp_release_restorepoints%rowtype; r record; item jsonb; role_list text;
begin
  select * into checkpoint from erp_release_restorepoints where release='integrity-2026-11-03';
  if checkpoint.release is null then raise exception 'No release checkpoint. Stop; restore a verified database backup instead'; end if;
  -- Only the tables whose policies this release replaces.
  for r in select tablename,policyname from pg_policies where schemaname='public' and tablename in (
    'employees','fund_requests','fund_request_items','operations','maintenance_logs','machine_status_reports','machine_status_report_lines',
    'diesel_site_distributions','diesel_receipts','leave_requests','attendance_logs','payroll_runs','payroll_lines','dozer_payroll_runs','dozer_payroll_lines',
    'invoice_payments','financial_entries','diesel_station_prepayments','fuel_credit_collections','fuel_credit_payments','loans','loan_repayments')
  loop execute format('drop policy %I on public.%I',r.policyname,r.tablename); end loop;
  for item in select value from jsonb_array_elements(checkpoint.policies) where value->>'tablename' in (
    'employees','fund_requests','fund_request_items','operations','maintenance_logs','machine_status_reports','machine_status_report_lines',
    'diesel_site_distributions','diesel_receipts','leave_requests','attendance_logs','payroll_runs','payroll_lines','dozer_payroll_runs','dozer_payroll_lines',
    'invoice_payments','financial_entries','diesel_station_prepayments','fuel_credit_collections','fuel_credit_payments','loans','loan_repayments')
  loop
    select string_agg(case when value='public' then 'PUBLIC' else quote_ident(value) end,', ') into role_list from jsonb_array_elements_text(item->'roles');
    execute format('create policy %I on public.%I as %s for %s to %s %s %s',item->>'policyname',item->>'tablename',item->>'permissive',item->>'cmd',role_list,
      case when item->>'qual' is not null then 'using ('||(item->>'qual')||')' else '' end,
      case when item->>'with_check' is not null then 'with check ('||(item->>'with_check')||')' else '' end);
  end loop;
  for r in select c.relname,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal and (t.tgname like 'trg_audit_%' or t.tgname like 'trg_guard_%')
  loop execute format('drop trigger %I on public.%I',r.tgname,r.relname); end loop;
  for item in select value from jsonb_array_elements(checkpoint.functions) loop execute item->>'ddl'; end loop;
  -- The old app falls back to REST only when this optional RPC is absent.
  -- If it did not exist before the release, remove it rather than leaving a
  -- revoked function that would make the old app's saves fail after rollback.
  if not exists(select 1 from jsonb_array_elements(checkpoint.functions) f where f->>'name'='save_record_with_items') then
    execute 'drop function if exists save_record_with_items(text,jsonb,text,text,jsonb)';
  end if;
  for item in select value from jsonb_array_elements(checkpoint.triggers) loop execute item->>'ddl'; end loop;
  for item in select value from jsonb_array_elements(checkpoint.function_grants) loop
    execute format('grant execute on function public.%I(%s) to %s %s',item->>'name',item->>'args',
      case when item->>'role'='PUBLIC' then 'PUBLIC' else quote_ident(item->>'role') end,
      case when (item->>'grantable')::boolean then 'with grant option' else '' end);
  end loop;
end $$;
revoke execute on function save_record_checked(text,jsonb,text,text,jsonb,boolean,timestamptz) from public,anon,authenticated;
delete from erp_schema_migrations where version in ('0042','0043');
notify pgrst, 'reload schema';
commit;
