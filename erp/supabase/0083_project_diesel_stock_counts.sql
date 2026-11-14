-- Keep legacy company-wide readings unassigned; new physical counts identify
-- the site's storage tank so they can be reconciled against its own supply.
alter table public.diesel_stock_counts
  add column if not exists project text;

create index if not exists idx_diesel_stock_counts_project_date
  on public.diesel_stock_counts (project, date desc)
  where project is not null;

