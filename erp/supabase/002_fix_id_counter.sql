-- Fix for the next_record_id() function: Supabase enables Row Level
-- Security by default on every new table, including the internal
-- id_counters helper table used by next_record_id(). No policy grants
-- anon/authenticated access to id_counters directly (by design — it's
-- only meant to be touched through this function), so without this fix
-- every attempt to create a new record fails with:
--   "new row violates row-level security policy for table id_counters"
--
-- Run this once in the SQL Editor on the emagrims-erp project to apply
-- the fix. Safe to run even if you already ran schema.sql — it only
-- replaces the function and revokes direct table access.

create or replace function next_record_id(p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v integer;
begin
  insert into id_counters (prefix, next_value) values (p_prefix, 2)
  on conflict (prefix) do update set next_value = id_counters.next_value + 1
  returning next_value - 1 into v;
  return p_prefix || '-' || v;
end;
$$;

grant execute on function next_record_id(text) to anon, authenticated;
revoke all on id_counters from anon, authenticated;
