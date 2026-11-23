-- Close cross-project and training-data access gaps left by earlier policies.
-- Apply after 0083. Existing route hiding remains useful for navigation, but
-- these rules are enforced by Postgres for direct API requests as well.

begin;

create or replace function public.erp_supervisor_can_see_employee(p_employee_id text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(exists (
    select 1
    from public.employees manager
    join public.employees subject on subject.id = p_employee_id
    where manager.auth_user_id = auth.uid()
      and manager.status = 'Active'
      and manager.access_tier = 'Supervisor'
      and (
        manager.can_manage_all_projects
        or (nullif(trim(manager.assigned_project), '') is not null
          and manager.assigned_project = subject.assigned_project)
      )
  ), false);
$$;

create or replace function public.erp_can_grade_training_submission(p_employee_id text)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    public.current_employee_tier() in ('Admin', 'Accounts')
    or public.erp_supervisor_can_see_employee(p_employee_id), false
  );
$$;

revoke all on function public.erp_supervisor_can_see_employee(text) from public, anon;
revoke all on function public.erp_can_grade_training_submission(text) from public, anon;
grant execute on function public.erp_supervisor_can_see_employee(text) to authenticated;
grant execute on function public.erp_can_grade_training_submission(text) to authenticated;

-- Remove old permissive policies first. PostgreSQL ORs permissive policies,
-- so adding a narrower policy without removing the old one would not secure it.
do $$ declare r record; begin
  for r in select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('expenses','invoices','invoice_items','fueling_vouchers',
        'training_submissions','training_programs')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
alter table public.expenses enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.fueling_vouchers enable row level security;
alter table public.training_submissions enable row level security;
alter table public.training_programs enable row level security;

-- Supervisors can see project costs and invoices only for their assigned
-- project. Admin and Accounts retain company-wide finance access.
create policy expenses_read_scoped on public.expenses for select to authenticated
  using (public.current_employee_tier() in ('Admin','Accounts')
    or (public.current_employee_tier() = 'Supervisor' and public.erp_project_allowed(project)));
create policy expenses_write_finance on public.expenses for all to authenticated
  using (public.current_employee_tier() in ('Admin','Accounts'))
  with check (public.current_employee_tier() in ('Admin','Accounts'));

create policy invoices_read_scoped on public.invoices for select to authenticated
  using (public.current_employee_tier() in ('Admin','Accounts')
    or (public.current_employee_tier() = 'Supervisor' and public.erp_project_allowed(project)));
create policy invoices_write_finance on public.invoices for all to authenticated
  using (public.current_employee_tier() in ('Admin','Accounts'))
  with check (public.current_employee_tier() in ('Admin','Accounts'));
create policy invoice_items_read_scoped on public.invoice_items for select to authenticated
  using (exists (
    select 1 from public.invoices i
    where i.id = invoice_id
      and (public.current_employee_tier() in ('Admin','Accounts')
        or (public.current_employee_tier() = 'Supervisor' and public.erp_project_allowed(i.project)))
  ));
create policy invoice_items_write_finance on public.invoice_items for all to authenticated
  using (public.current_employee_tier() in ('Admin','Accounts'))
  with check (public.current_employee_tier() in ('Admin','Accounts'));

-- Site managers can see their own project vouchers (and their own requests
-- when a voucher has no project); finance staff retain company-wide visibility.
create policy fueling_vouchers_read_scoped on public.fueling_vouchers for select to authenticated
  using (public.current_employee_tier() in ('Admin','Accounts')
    or (public.current_employee_tier() = 'Supervisor'
      and (public.erp_project_allowed(project) or requested_by = public.current_employee_id())));
create policy fueling_vouchers_write_scoped on public.fueling_vouchers for all to authenticated
  using (public.current_employee_tier() = 'Admin'
    or (public.current_employee_tier() = 'Supervisor'
      and (public.erp_project_allowed(project) or requested_by = public.current_employee_id())))
  with check (public.current_employee_tier() = 'Admin'
    or (public.current_employee_tier() = 'Supervisor'
      and (public.erp_project_allowed(project) or requested_by = public.current_employee_id())));

-- Training programs are private to the assigned trainee and Admin. Only
-- Admin can create or edit program content.
create policy training_programs_read_assigned on public.training_programs for select to authenticated
  using (public.current_employee_tier() = 'Admin' or exists (
    select 1 from public.employees e
    where e.auth_user_id = auth.uid() and e.status = 'Active'
      and e.training_program_id = training_programs.id
  ));
create policy training_programs_write_admin on public.training_programs for all to authenticated
  using (public.current_employee_tier() = 'Admin')
  with check (public.current_employee_tier() = 'Admin');

-- Staff see and submit their own quiz records. Admin/Accounts and the
-- assigned-project supervisor can review submissions. Non-Admin graders are
-- limited to the grading columns by the trigger below.
create policy training_submissions_read_scoped on public.training_submissions for select to authenticated
  using (public.current_employee_tier() = 'Admin'
    or employee_id = public.current_employee_id()
    or public.erp_can_grade_training_submission(employee_id));
create policy training_submissions_create_self on public.training_submissions for insert to authenticated
  with check (public.current_employee_tier() in ('Admin','Accounts')
    or employee_id = public.current_employee_id());
create policy training_submissions_grade_scoped on public.training_submissions for update to authenticated
  using (public.erp_can_grade_training_submission(employee_id))
  with check (public.erp_can_grade_training_submission(employee_id));
create policy training_submissions_delete_admin on public.training_submissions for delete to authenticated
  using (public.current_employee_tier() = 'Admin');

create or replace function public.guard_training_submission_update()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare actor text := public.current_employee_id();
begin
  if auth.uid() is null or public.current_employee_tier() = 'Admin' then return new; end if;
  if not public.erp_can_grade_training_submission(old.employee_id)
    or new.employee_id is distinct from old.employee_id
    or new.id is distinct from old.id
    or new.name is distinct from old.name
    or new.quiz_id is distinct from old.quiz_id
    or new.submitted_at is distinct from old.submitted_at
    or new.timed_out is distinct from old.timed_out
    or new.video_recorded is distinct from old.video_recorded
    or new.video_duration_seconds is distinct from old.video_duration_seconds
    or new.video_url is distinct from old.video_url
    or new.answers is distinct from old.answers
    or new.created_at is distinct from old.created_at
    or new.graded_by is distinct from actor then
    raise exception 'Only an assigned reviewer may change the grade fields on this submission';
  end if;
  return new;
end $$;
drop trigger if exists guard_training_submission_update on public.training_submissions;
create trigger guard_training_submission_update before update on public.training_submissions
  for each row execute function public.guard_training_submission_update();

-- Make recorded quiz videos private. New uploads are stored under the
-- submitting employee's folder; legacy root-level filenames remain readable
-- only to that employee, Admin/Accounts, or their assigned-project reviewer.
update storage.buckets set public = false where id = 'trainee-videos';
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'storage'
    and tablename = 'objects'
    and (policyname like 'trainee_videos_%'
      or coalesce(qual, '') ilike '%trainee-videos%'
      or coalesce(with_check, '') ilike '%trainee-videos%')
  loop execute format('drop policy %I on storage.objects', r.policyname); end loop;
end $$;
create policy trainee_videos_private_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trainee-videos' and (
    public.current_employee_tier() = 'Admin'
    or name like public.current_employee_id() || '/%'
  ));
create policy trainee_videos_private_select on storage.objects for select to authenticated
  using (bucket_id = 'trainee-videos' and (
    public.current_employee_tier() in ('Admin','Accounts')
    or name like public.current_employee_id() || '/%'
    or name like '%_' || public.current_employee_id() || '.webm'
    or exists (
      select 1 from public.employees subject
      where (storage.objects.name like subject.id || '/%'
        or storage.objects.name like '%_' || subject.id || '.webm')
        and public.erp_supervisor_can_see_employee(subject.id)
    )
  ));

insert into public.erp_schema_migrations(version) values ('0084') on conflict do nothing;
notify pgrst, 'reload schema';
commit;

