-- Backend for the Training module inside the ERP itself (a top-level
-- "Day 1 Knowledge Check" tab next to Leave & Attendance and My Salary —
-- see erp/js/views/training.js), not a standalone public page. Every
-- submission is tied to a real, logged-in employee (employee_id), so RLS
-- requires an authenticated session throughout, matching the rest of this
-- schema since 006_require_authenticated.sql.
--
-- Supersedes an earlier draft of this table that used a bigint id and
-- anon-role policies for a standalone, no-login quiz page. This cleans
-- that up first — safe to run whether or not that earlier version was
-- ever applied to this database.

do $$
begin
  if to_regclass('public.submissions') is not null then
    execute 'drop policy if exists submissions_anon_insert on submissions';
    execute 'drop policy if exists submissions_anon_select on submissions';
    execute 'drop table submissions';
  end if;
end $$;

drop policy if exists trainee_videos_anon_insert on storage.objects;
drop policy if exists trainee_videos_anon_select on storage.objects;

create table if not exists training_submissions (
  id text primary key,
  employee_id text not null references employees(id) on delete cascade,
  name text not null,
  submitted_at timestamptz not null default now(),
  timed_out boolean not null default false,
  video_recorded boolean not null default false,
  video_duration_seconds integer not null default 0,
  video_url text,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_training_submissions_employee on training_submissions(employee_id);

alter table training_submissions enable row level security;

drop policy if exists training_submissions_auth_all on training_submissions;
create policy training_submissions_auth_all on training_submissions for all to authenticated using (true) with check (true);

-- Storage bucket for the recorded Q3 video answers. Public so playback in
-- the app can use getPublicUrl() directly instead of a signed URL; upload
-- and listing are still gated to signed-in staff.
insert into storage.buckets (id, name, public)
values ('trainee-videos', 'trainee-videos', true)
on conflict (id) do nothing;

drop policy if exists trainee_videos_auth_insert on storage.objects;
create policy trainee_videos_auth_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'trainee-videos');

drop policy if exists trainee_videos_auth_select on storage.objects;
create policy trainee_videos_auth_select on storage.objects
  for select to authenticated using (bucket_id = 'trainee-videos');
