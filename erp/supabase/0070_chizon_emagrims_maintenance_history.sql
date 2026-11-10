-- Historical repair/fault events consolidated from the Chizon and Emagrims export.
insert into public.maintenance_logs
(id,date,equipment,type,description,status,contractor_name)
values
('MNT-CHIZON-001','2026-07-01','C5 D8H','Inspection','Filters require replacement; engine oil needs 5 L top-up; one battery tested bad.','Scheduled','Chizon maintenance report'),
('MNT-CHIZON-002','2026-07-01','C3 D8H','Breakdown','Transmission oil required; gear selector pinion and bushings require replacement; air cleaner folded.','In Progress','Chizon maintenance report'),
('MNT-CHIZON-003','2026-07-01','C1 D8H','Service','Engine oil requires approximately 5 L top-up; machine ready for deployment.','Completed','Chizon maintenance report'),
('MNT-CHIZON-004','2026-07-01','C2 D8K','Repair','Injector requires control adjustment; alternator requires work; air cleaner required.','In Progress','Chizon maintenance report'),
('MNT-CHIZON-005','2026-07-01','C4 D8N','Repair','Track requires total overhaul; worn links restrict movement; radiator requires flushing.','Scheduled','Chizon maintenance report'),
('MNT-CHIZON-006','2026-07-06','C5 D8H','Service','Machine serviced; battery still requires replacement after failed battery test.','Completed','Chizon maintenance report'),
('MNT-CHIZON-007','2026-07-09','C5 D8H','Breakdown','Steering fault developed after one hour of work; machine parked pending repair.','Completed','Chizon maintenance report'),
('MNT-CHIZON-008','2026-07-13','C1 D8H','Breakdown','Oil leakage from kick-starter area, suspected faulty converter; engine oil top-up required.','In Progress','Chizon maintenance report'),
('MNT-CHIZON-009','2026-09-30','C1 D8H','Repair','Transmission pump ground and requires replacement; reverse/forward shafts and bushings require replacement; turbo charger leaking oil; breather blocked.','In Progress','Chizon maintenance report'),
('MNT-CHIZON-010','2026-09-30','C2 D8K','Repair','Fuel tank cleaned and welded; injector cover plate requires work; three bad nozzles replaced; hydraulic oil required.','In Progress','Chizon maintenance report'),
('MNT-CHIZON-011','2026-09-30','C3 D8H','Repair','Hydraulic cartridges procured; kick starter repaired; fuel filter leaking and requires replacement; air cleaner folded.','In Progress','Chizon maintenance report'),
('MNT-CHIZON-012','2026-10-10','C1 D8H','Breakdown','Transmission suction pipe and fuel line leaking; transmission and hydraulic oil required; turbo charger leaking oil.','In Progress','Chizon maintenance report'),
('MNT-CHIZON-013','2026-10-10','C2 D8K','Inspection','Requires injector specialist attention and replacement air cleaner.','Scheduled','Chizon maintenance report'),
('MNT-CHIZON-014','2026-10-10','C3 D8H','Breakdown','Transmission and hydraulic oil required; machine could not engage gear pending oil and testing.','In Progress','Chizon maintenance report'),
('MNT-CHIZON-015','2026-10-13','C1 D8H','Breakdown','Worked 6 hours 30 minutes; turbo charger leaking oil and requires replacement; transmission and hydraulic oil required.','In Progress','Chizon maintenance report'),
('MNT-CHIZON-016','2026-10-13','C3 D8H','Repair','Transmission pressure valve requires servicing or replacement.','In Progress','Chizon maintenance report'),
('MNT-CHIZON-017','2026-10-17','C1 D8H','Repair','Mechanic found bad engine rings causing oil loss through turbo charger; rings require replacement before fitting a new turbo charger.','Scheduled','Chizon maintenance report'),
('MNT-CHIZON-018','2026-10-18','C2 D8K','Repair','Movement faults identified: pressure valve, reverse and forward valve, 123 valve and transmission pump; oil leakage at final drive requires internal seal replacement.','In Progress','Chizon maintenance report'),
('MNT-CHIZON-019','2026-10-19','C3 D8H','Repair','Pressure valve, reverse and forward valve, 123 valve, transmission pump and final-drive transfer seal require replacement.','In Progress','Chizon maintenance report')
on conflict (id) do nothing;

insert into public.erp_schema_migrations(version)
values ('0070_chizon_emagrims_maintenance_history')
on conflict (version) do nothing;

notify pgrst, 'reload schema';