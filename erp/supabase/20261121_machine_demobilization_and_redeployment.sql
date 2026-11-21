-- Run after the application release. Preserve historical reports under Pastor.
alter table public.inventory add column if not exists demobilized_at date;
alter table public.inventory add column if not exists current_project_since date;

update public.inventory
set demobilized_at = '2026-11-21',
    fleet_status = 'Idle',
    current_project = null
where name = 'Pastor (Osaro)' and demobilized_at is null;

update public.inventory
set owner_name = coalesce(owner_name, (select owner_name from public.inventory where name = 'Pastor (Osaro)' limit 1))
where name = 'Emma (Osaro)' and owner_name is null;

update public.inventory
set current_project = 'Blue Sky Project - Ajue-Ore',
    current_project_since = '2026-11-20'
where name = 'EMG-004';

-- The two 19 November entries were drawn from Pastor's tank, not site stock.
-- Keep their IDs and audit timestamps; identify the donor and actual recipients.
update public.diesel_site_distributions
set recipient = equipment,
    equipment = 'Pastor (Osaro)',
    purpose = 'Tank Transfer',
    notes = 'Drilled from Pastor tank; original recipient retained'
where id = 'DSD-132' and date = '2026-11-19'
  and equipment = 'EMG-004' and litres = 60 and purpose = 'Dozer';

update public.diesel_site_distributions
set recipient = equipment,
    equipment = 'Pastor (Osaro)',
    purpose = 'Tank Transfer',
    notes = 'Drilled from Pastor tank; original recipient retained'
where id = 'DSD-133' and date = '2026-11-19'
  and equipment = 'Saheed (Osaro)' and litres = 90 and purpose = 'Dozer';

-- Saheed's 20 November report included the 90 L tank transfer in its
-- 120 L "supplied" figure. Only 30 L came out of site stock (DSD-130).
-- Preserve the actual opening, usage and closing readings.
update public.operations set diesel_supplied = 30
where id = 'OPS-280' and date = '2026-11-20'
  and equipment = 'Saheed (Osaro)' and diesel_supplied = 120;

-- EMG-004 received 579.92 L directly from Midejab on 20 November.
-- A site receipt and equal dozer issue leave ground stock unchanged.
insert into public.diesel_receipts
  (id, date, litres, supplier, station, project, notes)
select next_record_id('DR'), '2026-11-20', 579.92, 'Midejab Ltd',
       'Midejab Ltd', 'Blue Sky Project - Ajue-Ore',
       'Direct station supply to EMG-004 tank; price not provided'
where not exists (
  select 1 from public.diesel_receipts
  where date = '2026-11-20' and litres = 579.92
    and project = 'Blue Sky Project - Ajue-Ore'
)
and not exists (
  select 1 from public.fuel_credit_collections
  where date = '2026-11-20' and fuel_type = 'Diesel' and litres = 579.92
    and project = 'Blue Sky Project - Ajue-Ore'
);

insert into public.diesel_site_distributions
  (id, date, project, equipment, litres, purpose, notes)
select next_record_id('DSD'), '2026-11-20', 'Blue Sky Project - Ajue-Ore',
       'EMG-004', 579.92, 'Dozer', 'Direct Midejab station supply to tank'
where not exists (
  select 1 from public.diesel_site_distributions
  where date = '2026-11-20' and project = 'Blue Sky Project - Ajue-Ore'
    and equipment = 'EMG-004' and litres = 579.92 and purpose = 'Dozer'
);
