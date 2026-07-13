-- Adds real per-user login. Each employee gets a username (mapped behind
-- the scenes to a Supabase Auth account) and an auth_user_id linking their
-- employee record to that account.
--
-- Run this in the SQL Editor before the account-provisioning step.

alter table employees add column username text unique;
alter table employees add column auth_user_id uuid unique;

create index idx_employees_auth_user on employees(auth_user_id);
