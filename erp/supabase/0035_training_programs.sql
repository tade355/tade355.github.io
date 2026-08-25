-- Training programs: reusable definitions ("Management Trainee Training",
-- and whatever else gets added later) that an employee is assigned to via
-- employees.training_program_id. The Training tab (erp/js/views/training.js)
-- shows a signed-in staff member their assigned program's Manual, Plan, and
-- Syllabus documents plus the knowledge-check quiz — nothing if no program
-- is currently assigned. Managed from HR & Employees → Training Programs
-- (Admin only), see erp/js/views/trainingPrograms.js.
--
-- manual/plan/syllabus are jsonb attachment arrays, same shape and same
-- 1.5MB-per-file client-side cap as every other attachments field in this
-- app (see erp/js/attachments.js) — small enough that, unlike training
-- videos, there's no need for a separate Storage bucket.

create table if not exists training_programs (
  id text primary key,
  name text not null,
  description text,
  manual jsonb not null default '[]'::jsonb,
  plan jsonb not null default '[]'::jsonb,
  syllabus jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table training_programs enable row level security;

drop policy if exists training_programs_auth_all on training_programs;
create policy training_programs_auth_all on training_programs for all to authenticated using (true) with check (true);

alter table employees add column if not exists training_program_id text references training_programs(id) on delete set null;
