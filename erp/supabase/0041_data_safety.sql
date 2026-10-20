-- Data safety (Oct 2026): atomic saves, an audit trail, an approval guard and an
-- owner flag. Run once in the Supabase SQL editor. The app keeps working if this
-- has not been run yet: saves fall back to the old two-step path and the audit
-- tab shows a hint.

-- 1. Atomic save of a record and its line items ------------------------------
-- Replaces the old delete-then-insert of line items done from the browser, so a
-- failure part-way can no longer lose a request's items. SECURITY INVOKER: the
-- caller's row-level-security policies still decide what may be written.
create or replace function save_record_with_items(
  p_table text, p_row jsonb, p_child_table text default null, p_fk text default null, p_items jsonb default '[]'::jsonb
) returns void language plpgsql security invoker set search_path = public as $$
declare
  cols text; sets text; item_cols text; rid text := p_row ->> 'id';
begin
  if to_regclass('public.' || quote_ident(p_table)) is null then raise exception 'unknown table %', p_table; end if;
  if rid is null then raise exception 'record has no id'; end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(format('%1$I = excluded.%1$I', column_name), ', ' order by ordinal_position) filter (where column_name <> 'id')
    into cols, sets
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table and p_row ? column_name;
  execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) on conflict (id) do update set %3$s',
                 p_table, cols, coalesce(sets, 'id = excluded.id')) using p_row;

  if p_child_table is not null then
    if to_regclass('public.' || quote_ident(p_child_table)) is null then raise exception 'unknown table %', p_child_table; end if;
    execute format('delete from public.%I where %I = $1', p_child_table, p_fk) using rid;
    if jsonb_typeof(p_items) = 'array' and jsonb_array_length(p_items) > 0 then
      select string_agg(quote_ident(c.column_name), ', ')
        into item_cols
        from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = p_child_table
         and (c.column_name in (p_fk, 'sort_order')
              or c.column_name in (select jsonb_object_keys(x) from jsonb_array_elements(p_items) x));
      execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1)', p_child_table, item_cols)
        using (select jsonb_agg(item || jsonb_build_object(p_fk, rid, 'sort_order', ord - 1))
                 from jsonb_array_elements(p_items) with ordinality as t(item, ord));
    end if;
  end if;
end $$;

-- 2. Audit trail -------------------------------------------------------------
create table if not exists audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  employee_id text,
  table_name  text not null,
  record_id   text,
  action      text not null,
  old_row     jsonb,
  new_row     jsonb
);
create index if not exists idx_audit_log_at on audit_log (at desc);
create index if not exists idx_audit_log_record on audit_log (table_name, record_id);
alter table audit_log enable row level security;
drop policy if exists audit_log_admin_read on audit_log;
create policy audit_log_admin_read on audit_log for select to authenticated using (current_employee_tier() = 'Admin');
-- No insert/update/delete policy: only the trigger below (security definer) writes.

create or replace function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_log (user_id, employee_id, table_name, record_id, action, old_row, new_row)
  values (auth.uid(), (select id from employees where auth_user_id = auth.uid() limit 1), tg_table_name, rec ->> 'id', tg_op,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['employees','operations','expenses','invoices','invoice_payments','maintenance_logs','fueling_vouchers',
                           'fund_requests','diesel_stock_counts','fuel_credit_collections','fuel_credit_payments','diesel_site_distributions',
                           'diesel_station_prepayments','dozer_payroll_runs','dozer_owner_settlements','payroll_runs','loans','loan_repayments']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
      execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$I for each row execute function audit_row()', t);
    end if;
  end loop;
end $$;

-- 3. Approval guard ----------------------------------------------------------
-- The UI already lets only Admin approve or reject; this makes the database say
-- the same. Marking a request Paid stays open to Admin and Accounts.
create or replace function guard_fund_request_status() returns trigger language plpgsql security definer set search_path = public as $$
declare tier text := (select access_tier from employees where auth_user_id = auth.uid() limit 1);
begin
  -- Service-role and SQL-editor sessions have no auth.uid(); they are trusted.
  if auth.uid() is null then return new; end if;
  if (tg_op = 'INSERT' or new.status is distinct from old.status) then
    if new.status in ('Approved', 'Rejected') and coalesce(tier, '') <> 'Admin' then
      raise exception 'Only an Admin account can approve or reject a fund request';
    elsif new.status = 'Paid' and coalesce(tier, '') not in ('Admin', 'Accounts') then
      raise exception 'Only Admin or Accounts can mark a fund request Paid';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_fund_request_status on fund_requests;
create trigger trg_guard_fund_request_status before insert or update on fund_requests
  for each row execute function guard_fund_request_status();

-- 4. Owner flag --------------------------------------------------------------
-- Replaces the hard-coded employee id in erp/js/access.js. The app falls back to
-- the old id when this column is missing.
alter table employees add column if not exists is_owner boolean not null default false;
update employees set is_owner = true where id = 'EMP-26';
