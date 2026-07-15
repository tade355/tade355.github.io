-- Projects becomes a real managed entity instead of a hardcoded list in
-- the app's code — needed since more projects will be added over time,
-- and each one now tracks status, contract/T&C status, percent complete,
-- rate, and scope.

create table projects (
  id               text primary key,
  name             text not null unique,
  status           text not null default 'Active' check (status in ('Active', 'On Hold', 'Completed')),
  contract_status  text check (contract_status in ('Draft', 'Pending Signature', 'Signed', 'Expired')),
  percent_complete numeric check (percent_complete >= 0 and percent_complete <= 100),
  rate             numeric,
  rate_unit        text,
  scope            text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_projects_updated_at before update on projects
  for each row execute function set_updated_at();

alter table projects enable row level security;
create policy projects_anon_all on projects for all to authenticated using (true) with check (true);
