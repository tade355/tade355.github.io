alter table public.diesel_site_distributions
  alter column equipment drop not null,
  add column if not exists purpose text not null default 'Dozer',
  add column if not exists recipient text;
