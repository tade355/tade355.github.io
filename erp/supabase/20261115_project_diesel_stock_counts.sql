-- Physical diesel counts are project-specific. Keep historical unassigned counts
-- intact; new site counts provide a project through Resource Management.
alter table public.diesel_stock_counts
  add column if not exists project text;

create index if not exists idx_diesel_stock_counts_project_date
  on public.diesel_stock_counts (project, date desc);
