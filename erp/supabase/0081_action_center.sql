-- Assigned meeting actions with personal notification/read tracking.
-- Run after the currently applied ERP migrations. Does not change business records.

create table if not exists staff_action_items (
  id text primary key,
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  assignee_id text not null references employees(id) on delete restrict,
  created_by text not null references employees(id) on delete restrict,
  due_date date,
  priority text not null default 'Normal' check (priority in ('Normal','High')),
  status text not null default 'Open' check (status in ('Open','In Progress','Completed','Cancelled')),
  source_notice_id text references notice_board_posts(id) on delete set null,
  source_title text not null default '',
  viewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_action_assignee_status on staff_action_items(assignee_id, status, due_date);
create index if not exists idx_staff_action_created_by on staff_action_items(created_by, created_at desc);
drop trigger if exists trg_staff_action_updated_at on staff_action_items;
create trigger trg_staff_action_updated_at before update on staff_action_items
  for each row execute function set_updated_at();

alter table staff_action_items enable row level security;
drop policy if exists staff_action_read on staff_action_items;
drop policy if exists staff_action_create on staff_action_items;
drop policy if exists staff_action_manager_update on staff_action_items;
drop policy if exists staff_action_assignee_update on staff_action_items;
create policy staff_action_read on staff_action_items for select to authenticated
  using (current_employee_id() is not null and
    (current_employee_tier() in ('Admin','Accounts','Supervisor') or assignee_id = current_employee_id()));
create policy staff_action_create on staff_action_items for insert to authenticated
  with check (current_employee_tier() in ('Admin','Accounts','Supervisor') and created_by = current_employee_id());
create policy staff_action_manager_update on staff_action_items for update to authenticated
  using (current_employee_tier() in ('Admin','Accounts','Supervisor'))
  with check (current_employee_tier() in ('Admin','Accounts','Supervisor'));
create policy staff_action_assignee_update on staff_action_items for update to authenticated
  using (assignee_id = current_employee_id())
  with check (assignee_id = current_employee_id());
-- No delete policy: retain the meeting decision and completion history.

create or replace function guard_staff_action_item() returns trigger
language plpgsql security invoker set search_path = public as $$
declare actor text := current_employee_id(); tier text := current_employee_tier();
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if tier not in ('Admin','Accounts','Supervisor') or new.created_by is distinct from actor then
      raise exception 'Only management may assign an action on their own behalf';
    end if;
    if new.status <> 'Open' or new.viewed_at is not null then
      raise exception 'A new action must start open and unread';
    end if;
    if not exists (select 1 from employees where id = new.assignee_id and status = 'Active' and coalesce(archived_at::text,'') = '') then
      raise exception 'Actions can only be assigned to active staff';
    end if;
    return new;
  end if;
  if tier not in ('Admin','Accounts','Supervisor') and old.assignee_id = actor then
    if (to_jsonb(new) - array['status','viewed_at','completed_at','updated_at']) is distinct from
       (to_jsonb(old) - array['status','viewed_at','completed_at','updated_at']) then
      raise exception 'Only management may edit action details';
    end if;
  elsif tier not in ('Admin','Accounts','Supervisor') then
    raise exception 'Only the assigned staff member may update this action';
  end if;
  if new.status = 'Completed' and new.completed_at is null then new.completed_at := now(); end if;
  return new;
end $$;
drop trigger if exists trg_guard_staff_action_item on staff_action_items;
create trigger trg_guard_staff_action_item before insert or update on staff_action_items
  for each row execute function guard_staff_action_item();

drop trigger if exists trg_audit_staff_action_items on staff_action_items;
create trigger trg_audit_staff_action_items after insert or update or delete on staff_action_items
  for each row execute function audit_row();

insert into erp_schema_migrations(version) values ('0081') on conflict do nothing;
notify pgrst, 'reload schema';

