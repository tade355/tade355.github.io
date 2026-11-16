-- Rename Pastor and Saheed dozer labels while preserving all record IDs and history.
-- Applied to production on 16 Nov 2026.
begin;
update employees set assigned_dozer=replace(replace(assigned_dozer,'Ogbomo Dozer (Pastor)','Pastor (Osaro)'),'Ogbomo (Saheed)','Saheed (Osaro)') where assigned_dozer in ('Ogbomo Dozer (Pastor)','Ogbomo (Saheed)');
update employee_directory set assigned_dozer=replace(replace(assigned_dozer,'Ogbomo Dozer (Pastor)','Pastor (Osaro)'),'Ogbomo (Saheed)','Saheed (Osaro)') where assigned_dozer in ('Ogbomo Dozer (Pastor)','Ogbomo (Saheed)');
update diesel_site_distributions set equipment=replace(replace(equipment,'Ogbomo Dozer (Pastor)','Pastor (Osaro)'),'Ogbomo (Saheed)','Saheed (Osaro)') where equipment in ('Ogbomo Dozer (Pastor)','Ogbomo (Saheed)');
update dozer_issues set equipment=replace(replace(equipment,'Ogbomo Dozer (Pastor)','Pastor (Osaro)'),'Ogbomo (Saheed)','Saheed (Osaro)') where equipment in ('Ogbomo Dozer (Pastor)','Ogbomo (Saheed)');
update dozer_owner_settlements set equipment=replace(replace(equipment,'Ogbomo Dozer (Pastor)','Pastor (Osaro)'),'Ogbomo (Saheed)','Saheed (Osaro)') where equipment in ('Ogbomo Dozer (Pastor)','Ogbomo (Saheed)');
update dozer_part_withdrawals set equipment=replace(replace(equipment,'Ogbomo Dozer (Pastor)','Pastor (Osaro)'),'Ogbomo (Saheed)','Saheed (Osaro)') where equipment in ('Ogbomo Dozer (Pastor)','Ogbomo (Saheed)');
update dozer_payroll_lines set equipment=replace(replace(equipment,'Ogbomo Dozer (Pastor)','Pastor (Osaro)'),'Ogbomo (Saheed)','Saheed (Osaro)') where equipment in ('Ogbomo Dozer (Pastor)','Ogbomo (Saheed)');
update dozer_rate_history set equipment=replace(replace(equipment,'Ogbomo Dozer (Pastor)','Pastor (Osaro)'),'Ogbomo (Saheed)','Saheed (Osaro)') where equipment in ('Ogbomo Dozer (Pastor)','Ogbomo (Saheed)');
update dozer_rental_credits set equipment=replace(replace(equipment,'Ogbomo Dozer (Pastor)','Pastor (Osaro)'),'Ogbomo (Saheed)','Saheed (Osaro)') where equipment in ('Ogbomo Dozer (Pastor)','Ogbomo (Saheed)');
update expenses set equipment=replace(replace(equipment,'Ogbomo Dozer (Pastor)','Pastor (Osaro)'),'Ogbomo (Saheed)','Saheed (Osaro)') where equipment in ('Ogbomo Dozer (Pastor)','Ogbomo (Saheed)');
update machine_status_report_lines set equipment=replace(replace(equipment,'Ogbomo Dozer (Pastor)','Pastor (Osaro)'),'Ogbomo (Saheed)','Saheed (Osaro)') where equipment in ('Ogbomo Dozer (Pastor)','Ogbomo (Saheed)');
commit;