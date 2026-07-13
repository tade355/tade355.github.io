-- The 32 real employees were bulk-inserted directly (with explicit IDs
-- EMP-1..EMP-32) during setup, bypassing next_record_id() — so the
-- id_counters table has no entry for the 'EMP' prefix yet. Without this
-- fix, the next "Add Employee" in HR would generate 'EMP-1' again and
-- silently overwrite Oki Christopher's record instead of creating a new
-- one. This primes the counter so the next generated ID is EMP-33.
--
-- security definer means this can't be written to directly by the anon
-- role (see 002_fix_id_counter.sql) — run this as yourself in the SQL
-- Editor, which uses the postgres role and bypasses that restriction.

insert into id_counters (prefix, next_value) values ('EMP', 33)
on conflict (prefix) do update set next_value = greatest(id_counters.next_value, 33);
