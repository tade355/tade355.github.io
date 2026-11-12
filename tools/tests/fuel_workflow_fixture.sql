-- Isolated CI database only. No production connection or credentials.
create schema auth;
create role anon;
create role authenticated;
create function auth.uid() returns uuid language sql stable as $test$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$test$;
create table employees(id text primary key,name text,auth_user_id uuid,status text,access_tier text,assigned_project text);
create table projects(name text primary key);
create table fund_requests(id text primary key,project text);
create table fuel_credit_collections(id text primary key,date date,station text,fuel_type text,litres numeric,unit_price numeric,reference text,notes text,payment_basis text not null default 'Cash and carry');
create table fuel_credit_payments(id text primary key,date date,station text,amount numeric,reference text,notes text);
create table diesel_site_distributions(id text primary key,date date,project text,equipment text,litres numeric,notes text);
create table expenses(id text primary key,date date,category text,description text,amount numeric,payee text,paid_by text,project text);
create function audit_row() returns trigger language plpgsql as $test$ begin return coalesce(new,old); end $test$;
grant usage on schema public,auth to authenticated;
grant select on employees,projects to authenticated;
insert into projects values('Test Site A'),('Test Site B');
insert into employees values
 ('EMP-28','Test executive','00000000-0000-0000-0000-000000000028','Active','Admin',null),
 ('EMP-26','Test operations','00000000-0000-0000-0000-000000000026','Active','Admin',null),
 ('TEST-MANAGER','Test manager','00000000-0000-0000-0000-000000000001','Active','Supervisor','Test Site A'),
 ('TEST-ACCOUNTS','Test accounts','00000000-0000-0000-0000-000000000002','Active','Accounts',null),
 ('TEST-OTHER','Test unrelated manager','00000000-0000-0000-0000-000000000003','Active','Supervisor','Test Site B');
