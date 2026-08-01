-- Seed data: real fleet roster provided by the client, entered after the
-- 0010_dozer_categories.sql migration. Run once in the Supabase SQL Editor.
--
-- Hourly rate is derived from the given day rate at 8 hours = 1 day (the
-- convention used throughout the dozer-categories feature) so the existing
-- project-profitability report (hours worked × hourly rate) reflects the
-- same day-rate figures. Adjust if the real work-day length differs.

insert into inventory (id, name, category, sku, ownership, owner_name, fleet_status, hourly_rate, current_project, rental_rate_per_day, management_fee_per_day)
values
  -- Company-owned (Emagrims) — ₦300k/day → ₦37,500/hr internal rate
  (next_record_id('INV'), 'EMG-007', 'Heavy Equipment', 'EMG-007', 'Company', null, 'Active', 37500, 'Rex Forestry', null, null),
  (next_record_id('INV'), 'EMG-004', 'Heavy Equipment', 'EMG-004', 'Company', null, 'Active', 37500, 'Rex Forestry', null, null),
  (next_record_id('INV'), 'EMG-006', 'Heavy Equipment', 'EMG-006', 'Company', null, 'Active', 37500, 'Enugu Palm', null, null),

  -- Partnership — Chizon Nig Ltd — ₦300k/day rental, ₦20k/day management fee retained
  (next_record_id('INV'), 'CHI-001', 'Heavy Equipment', 'CHI-001', 'Partnership', 'Chizon Nig Ltd', 'Active', 37500, 'Rex Forestry', 300000, 20000),
  (next_record_id('INV'), 'CHI-002', 'Heavy Equipment', 'CHI-002', 'Partnership', 'Chizon Nig Ltd', 'Active', 37500, 'Rex Forestry', 300000, 20000),
  (next_record_id('INV'), 'CHI-003', 'Heavy Equipment', 'CHI-003', 'Partnership', 'Chizon Nig Ltd', 'Active', 37500, 'Rex Forestry', 300000, 20000),
  (next_record_id('INV'), 'CHI-004', 'Heavy Equipment', 'CHI-004', 'Partnership', 'Chizon Nig Ltd', 'Active', 37500, 'Rex Forestry', 300000, 20000),
  (next_record_id('INV'), 'CHI-005', 'Heavy Equipment', 'CHI-005', 'Partnership', 'Chizon Nig Ltd', 'Active', 37500, 'Rex Forestry', 300000, 20000),

  -- Partnership — Ema Property Ltd — same terms as Chizon
  (next_record_id('INV'), 'EMA-001', 'Heavy Equipment', 'EMA-001', 'Partnership', 'Ema Property Ltd', 'Active', 37500, null, 300000, 20000),
  (next_record_id('INV'), 'EMA-002', 'Heavy Equipment', 'EMA-002', 'Partnership', 'Ema Property Ltd', 'Active', 37500, null, 300000, 20000),

  -- Rented — Jokings Ltd — ₦400k/day, no management fee
  (next_record_id('INV'), 'D8K Collins', 'Heavy Equipment', 'D8K Collins', 'Rented', 'Jokings Ltd', 'Active', 50000, null, 400000, null);
