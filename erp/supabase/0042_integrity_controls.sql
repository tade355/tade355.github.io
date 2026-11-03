-- Apply after 0041, in staging first. This changes no business balances.
-- Run the release preflight and take a platform/database backup first.

create table if not exists erp_schema_migrations (
  version text primary key, applied_at timestamptz not null default now()
);
alter table erp_schema_migrations enable row level security;
drop policy if exists migration_admin_read on erp_schema_migrations;
create policy migration_admin_read on erp_schema_migrations for select to authenticated
  using (current_employee_tier() = 'Admin');

alter table fund_requests add column if not exists paid_at date;
alter table payroll_lines add column if not exists sort_order integer not null default 0;
alter table maintenance_logs add column if not exists project text;
-- Preserve the current general manager's existing cross-project scope explicitly;
-- an unassigned ordinary Supervisor must never gain that scope by omission.
alter table employees add column if not exists can_manage_all_projects boolean not null default false;
update employees set can_manage_all_projects = true
 where id = 'EMP-1' and access_tier = 'Supervisor' and status = 'Active' and assigned_project is null
   and lower(role) = 'general manager/site manager';
alter table expenses add column if not exists fund_request_id text references fund_requests(id);
alter table diesel_receipts add column if not exists fuel_credit_collection_id text references fuel_credit_collections(id);
alter table diesel_receipts add column if not exists prepayment_id text references diesel_station_prepayments(id);
create unique index if not exists diesel_receipt_collection_once on diesel_receipts(fuel_credit_collection_id) where fuel_credit_collection_id is not null;
create unique index if not exists expense_request_once on expenses(fund_request_id) where fund_request_id is not null;

create or replace function guard_delivery_links() returns trigger language plpgsql security invoker set search_path=public as $$
declare advance diesel_station_prepayments%rowtype; collection fuel_credit_collections%rowtype;
begin
  if auth.uid() is not null and coalesce(current_employee_tier(),'') not in ('Admin','Accounts') then
    if tg_op = 'INSERT' then
      if new.prepayment_id is not null or new.fuel_credit_collection_id is not null then raise exception 'Finance must confirm receipt payment/collection links'; end if;
    elsif new.prepayment_id is not null or new.fuel_credit_collection_id is not null or old.prepayment_id is not null or old.fuel_credit_collection_id is not null then
      if (to_jsonb(new) - array['updated_at','project','notes','supplier','reference','unit_cost']) is distinct from
         (to_jsonb(old) - array['updated_at','project','notes','supplier','reference','unit_cost']) then
        raise exception 'Finance must amend a linked receipt quantity, station, date or payment link';
      end if;
      return new;
    end if;
  end if;
  if new.prepayment_id is not null then
    select * into advance from diesel_station_prepayments where id=new.prepayment_id;
    if advance.id is null or new.station is distinct from advance.station or new.date < advance.date or new.litres <= 0 then
      raise exception 'Delivery must match its prepayment station, be positive and not precede the advance';
    end if;
  end if;
  if new.fuel_credit_collection_id is not null then
    select * into collection from fuel_credit_collections where id=new.fuel_credit_collection_id;
    if collection.id is null or collection.fuel_type <> 'Diesel' or new.station is distinct from collection.station
      or new.date is distinct from collection.date or new.litres is distinct from collection.litres then
      raise exception 'A collection link must identify the same full diesel delivery, station and date';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_delivery_links on diesel_receipts;
create trigger trg_guard_delivery_links before insert or update on diesel_receipts for each row execute function guard_delivery_links();

create or replace function guard_expense_request_link() returns trigger language plpgsql security invoker set search_path=public as $$
declare total numeric; request_status text;
begin
  if new.fund_request_id is not null then
    select status into request_status from fund_requests where id=new.fund_request_id;
    select sum(amount) into total from fund_request_items where fund_request_id=new.fund_request_id;
    if request_status is distinct from 'Paid' or new.amount is distinct from total then
      raise exception 'Expense link requires the same full payment as a Paid request';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_expense_link on expenses;
create trigger trg_guard_expense_link before insert or update on expenses for each row execute function guard_expense_request_link();

-- The only permitted parent/child relationships for a generic save command.
create or replace function erp_save_mapping(p_table text) returns jsonb
language sql immutable set search_path = public as $$
  select case p_table
    when 'invoices' then '["invoice_items","invoice_id"]'::jsonb
    when 'purchase_orders' then '["purchase_order_items","purchase_order_id"]'::jsonb
    when 'fund_requests' then '["fund_request_items","fund_request_id"]'::jsonb
    when 'payroll_runs' then '["payroll_lines","payroll_run_id"]'::jsonb
    when 'dozer_payroll_runs' then '["dozer_payroll_lines","dozer_payroll_run_id"]'::jsonb
    when 'machine_status_reports' then '["machine_status_report_lines","report_id"]'::jsonb
    when 'employees' then '[]'::jsonb when 'inventory' then '[]'::jsonb when 'customers' then '[]'::jsonb
    when 'suppliers' then '[]'::jsonb when 'projects' then '[]'::jsonb when 'expenses' then '[]'::jsonb
    when 'operations' then '[]'::jsonb when 'maintenance_logs' then '[]'::jsonb when 'diesel_receipts' then '[]'::jsonb
    when 'diesel_stock_counts' then '[]'::jsonb when 'leave_requests' then '[]'::jsonb when 'attendance_logs' then '[]'::jsonb
    when 'fueling_vouchers' then '[]'::jsonb when 'financial_entries' then '[]'::jsonb when 'dozer_owner_settlements' then '[]'::jsonb
    when 'staff_memos' then '[]'::jsonb when 'dozer_rate_history' then '[]'::jsonb when 'project_rate_history' then '[]'::jsonb
    when 'notice_board_posts' then '[]'::jsonb when 'fuel_credit_collections' then '[]'::jsonb when 'fuel_credit_payments' then '[]'::jsonb
    when 'dozer_part_withdrawals' then '[]'::jsonb when 'assets' then '[]'::jsonb when 'inventory_withdrawals' then '[]'::jsonb
    when 'diesel_station_prepayments' then '[]'::jsonb when 'diesel_site_distributions' then '[]'::jsonb when 'invoice_payments' then '[]'::jsonb
    when 'loans' then '[]'::jsonb when 'loan_repayments' then '[]'::jsonb when 'training_submissions' then '[]'::jsonb
    when 'training_programs' then '[]'::jsonb else null end;
$$;

create or replace function save_record_checked(
  p_table text, p_row jsonb, p_child_table text default null, p_fk text default null,
  p_items jsonb default '[]'::jsonb, p_create boolean default false,
  p_expected_updated_at timestamptz default null
) returns void language plpgsql security invoker set search_path = public as $$
declare
  mapping jsonb := erp_save_mapping(p_table);
  rid text := p_row ->> 'id'; current_row jsonb; columns_sql text; updates_sql text;
  item_columns text; old_items jsonb; has_stamp boolean; changed integer;
begin
  if mapping is null or rid is null or rid = '' or jsonb_typeof(p_row) <> 'object' then raise exception 'Invalid save target or record'; end if;
  if p_child_table is distinct from (mapping ->> 0) or p_fk is distinct from (mapping ->> 1) then raise exception 'Invalid child mapping'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Items must be an array'; end if;
  if exists (select 1 from jsonb_object_keys(p_row) k where k in ('updated_at') or not exists (
    select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = p_table and c.column_name = k
  )) then raise exception 'Unknown or protected record field'; end if;

  select exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = p_table and column_name = 'updated_at') into has_stamp;
  if not p_create then
    execute format('select to_jsonb(t) from public.%I t where id = $1 for update', p_table) into current_row using rid;
    if current_row is null then raise exception 'Record not found or not authorized'; end if;
    if has_stamp and (p_expected_updated_at is null or (current_row ->> 'updated_at')::timestamptz is distinct from p_expected_updated_at) then
      raise exception 'Record changed or version missing. Refresh and retry';
    end if;
  end if;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(format('%1$I = src.%1$I', column_name), ', ' order by ordinal_position) filter (where column_name <> 'id')
    into columns_sql, updates_sql from information_schema.columns
   where table_schema = 'public' and table_name = p_table and p_row ? column_name;
  if p_create then
    -- A collision is an error, never an overwrite.
    execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)', p_table, columns_sql) using p_row;
  else
    execute format('update public.%1$I t set %2$s from jsonb_populate_record(null::public.%1$I, $1) src where t.id = $2', p_table, coalesce(updates_sql, 'id = src.id')) using p_row, rid;
    get diagnostics changed = row_count;
    if changed <> 1 then raise exception 'Update denied'; end if;
  end if;
  if p_child_table is not null then
    if exists (select 1 from jsonb_array_elements(p_items) x, lateral jsonb_object_keys(x) k where k in ('id', p_fk, 'sort_order') or not exists (
      select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = p_child_table and c.column_name = k
    )) then raise exception 'Unknown or protected line-item field'; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(t) - ''id'' - %L - ''sort_order'' order by sort_order, id), ''[]''::jsonb) from public.%I t where %I = $1', p_fk, p_child_table, p_fk) into old_items using rid;
    -- Status-only changes must not delete/reinsert approved line items.
    if jsonb_strip_nulls(old_items) = jsonb_strip_nulls(p_items) then return; end if;
    execute format('delete from public.%I where %I = $1', p_child_table, p_fk) using rid;
    if jsonb_array_length(p_items) > 0 then
      select string_agg(quote_ident(column_name), ', ') into item_columns from information_schema.columns
       where table_schema = 'public' and table_name = p_child_table and (column_name in (p_fk, 'sort_order') or column_name in (select jsonb_object_keys(x) from jsonb_array_elements(p_items) x));
      execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1)', p_child_table, item_columns)
        using (select jsonb_agg(item || jsonb_build_object(p_fk, rid, 'sort_order', ord - 1)) from jsonb_array_elements(p_items) with ordinality as t(item, ord));
    end if;
  end if;
end $$;
revoke all on function save_record_checked(text,jsonb,text,text,jsonb,boolean,timestamptz) from public;
grant execute on function save_record_checked(text,jsonb,text,text,jsonb,boolean,timestamptz) to authenticated;
-- Retire the unchecked RPC; it would otherwise bypass version enforcement.
revoke execute on function save_record_with_items(text,jsonb,text,text,jsonb) from public, anon, authenticated;

create or replace function guard_fund_request_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare tier text := current_employee_tier(); actor text;
begin
  if auth.uid() is null then return new; end if;
  select id into actor from employees where auth_user_id = auth.uid();
  if tg_op = 'INSERT' then
    if new.status <> 'Pending' then raise exception 'New requests must start Pending'; end if;
    if tier not in ('Admin', 'Accounts') and new.submitted_by is distinct from actor then raise exception 'Submit only your own request'; end if;
    new.approved_by := null;
    new.paid_at := null;
    return new;
  end if;
  if old.status = 'Paid' and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then raise exception 'Paid requests are immutable; use a documented correction'; end if;
  if old.status = 'Approved' then
    if (to_jsonb(new) - array['updated_at','status','paid_at']) is distinct from (to_jsonb(old) - array['updated_at','status','paid_at']) then
      raise exception 'Approved details are locked. Return to Pending before amending';
    end if;
    if new.status not in ('Approved','Pending','Paid') then raise exception 'Invalid approved request transition'; end if;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'Paid' then
      if old.status <> 'Approved' or tier not in ('Admin','Accounts') then raise exception 'Only Admin/Accounts can settle an approved request'; end if;
      if new.paid_at is null then raise exception 'Payment date is required'; end if;
    elsif tier <> 'Admin' then raise exception 'Only Admin can approve, reject or reopen requests';
    end if;
    if new.status in ('Approved','Rejected') then new.approved_by := actor; end if;
    if new.status = 'Pending' then new.approved_by := null; new.paid_at := null; end if;
  elsif new.approved_by is distinct from old.approved_by or new.paid_at is distinct from old.paid_at then
    raise exception 'Approval and payment fields require a state transition';
  end if;
  return new;
end $$;

create or replace function guard_approved_request_items() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_id text; parent_status text;
begin
  if auth.uid() is null then return coalesce(new,old); end if;
  -- Serialize child edits with parent approval to prevent an approval/edit race.
  if tg_op <> 'INSERT' then
    select status into parent_status from fund_requests where id = old.fund_request_id for update;
    if parent_status <> 'Pending' then raise exception 'Only Pending request items can be changed'; end if;
  end if;
  if tg_op <> 'DELETE' then
    select status into parent_status from fund_requests where id = new.fund_request_id for update;
    if parent_status <> 'Pending' then raise exception 'Only Pending request items can be changed'; end if;
  end if;
  return coalesce(new,old);
end $$;
drop trigger if exists trg_guard_request_items on fund_request_items;
create trigger trg_guard_request_items before insert or update or delete on fund_request_items for each row execute function guard_approved_request_items();

-- Audit every existing application table and child table, including stock and journals.
do $$ declare t text; begin
  for t in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
    and (erp_save_mapping(table_name) is not null or table_name in ('invoice_items','purchase_order_items','fund_request_items','payroll_lines','dozer_payroll_lines','machine_status_report_lines'))
  loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$I for each row execute function audit_row()', t);
  end loop;
end $$;

insert into erp_schema_migrations(version) values ('0041'),('0042') on conflict do nothing;
notify pgrst, 'reload schema';
