-- Seed data: additions to the real fleet roster and project list, provided
-- by the client after seed_dozer_fleet.sql was first run. Run once in the
-- Supabase SQL Editor.
--
-- Fleet: adds Big Fish (Partnership, operator Sodiq Olawale) at the same
-- ₦300,000/8-hr-day rental + ₦20,000/day management fee terms confirmed for
-- all Partnership dozers (matching the existing Chizon Nig Ltd / Ema
-- Property Ltd rows in seed_dozer_fleet.sql). The Shantui/"Chinese" vendor
-- fleet (SHT-001..006) is intentionally NOT added — those dozers have been
-- demobilized and are no longer part of the active roster.
--
-- Projects: adds the two real projects missing from the Projects list.

insert into inventory (id, name, category, sku, ownership, owner_name, fleet_status, hourly_rate, current_project, rental_rate_per_day, management_fee_per_day)
values
  (next_record_id('INV'), 'BIG-001', 'Heavy Equipment', 'BIG-001', 'Partnership', 'Big Fish', 'Active', 37500, null, 300000, 20000);

insert into projects (id, name)
values
  (next_record_id('PRJ'), 'Delta State Project'),
  (next_record_id('PRJ'), 'SAO Project');
