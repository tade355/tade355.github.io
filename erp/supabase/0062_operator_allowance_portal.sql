-- Private operator allowance projection. Operators receive only their own totals.
begin;

create or replace function public.erp_operator_allowance() returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare
  e public.employees%rowtype;
  v_day_rate numeric;
  v_earned numeric := 0;
  v_payroll_paid numeric := 0;
  v_expense_paid numeric := 0;
  v_payments jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view your allowance'; end if;
  if (select count(*) from public.employees where auth_user_id=auth.uid() and status='Active' and canonical_employee_id is null) <> 1 then
    raise exception 'Your login must be linked to one active employee record';
  end if;

  select * into e from public.employees
  where auth_user_id=auth.uid() and status='Active' and canonical_employee_id is null;
  v_day_rate := coalesce(nullif(e.day_rate,0),30000);

  with operator_ids as (
    select e.id as id union all
    select a.id from public.employees a where a.canonical_employee_id=e.id
  ), daily as (
    select o.date, sum(coalesce(o.hours_worked,0)) hours
    from public.operations o
    where o.operator_id in (select id from operator_ids)
      and o.equipment in ('EMG-004','EMG-006','EMG-007','EMG-008')
    group by o.date
  )
  select coalesce(sum(
    case when extract(dow from date)=0
      then least(hours,8)/8.0*50000
      else least(hours,8)/8.0*v_day_rate end
    + greatest(hours-8,0)*10000
  ),0) into v_earned from daily;

  select coalesce(sum(coalesce(l.amount_paid,0)),0) into v_payroll_paid
  from public.dozer_payroll_lines l
  join public.dozer_payroll_runs r on r.id=l.dozer_payroll_run_id
  where l.employee_id=e.id and r.status<>'Draft';

  select coalesce(sum(x.amount),0) into v_expense_paid
  from public.expenses x
  where x.category='Salary and Allowance'
    and (
      regexp_replace(lower(coalesce(x.payee,'')),'[^a-z0-9]+','','g')
        = regexp_replace(lower(e.name),'[^a-z0-9]+','','g')
      or (e.id='EMP-12' and lower(coalesce(x.payee,'')) ~ '(paul.*joshua|joshua.*paul)')
      or (e.id='EMP-11' and lower(coalesce(x.payee,'')) ~ '(temitope|adebayo.*tope)')
      or (e.id='EMP-20' and lower(coalesce(x.payee,'')) ~ '(jenom.*jessie|jessie.*jenom)')
      or (e.id='EMP-34' and lower(coalesce(x.payee,'')) ~ 'ephraim')
    );

  select coalesce(jsonb_agg(p order by p->>'date' desc),'[]'::jsonb) into v_payments
  from (
    select jsonb_build_object('date',r.period_end,'amount',coalesce(l.amount_paid,0),
      'source','Payroll run','reference',r.id) p
    from public.dozer_payroll_lines l
    join public.dozer_payroll_runs r on r.id=l.dozer_payroll_run_id
    where l.employee_id=e.id and r.status<>'Draft' and coalesce(l.amount_paid,0)>0
    union all
    select jsonb_build_object('date',x.date,'amount',x.amount,
      'source','Accounts payment','reference',x.id) p
    from public.expenses x
    where x.category='Salary and Allowance' and x.amount>0 and (
      regexp_replace(lower(coalesce(x.payee,'')),'[^a-z0-9]+','','g')
        = regexp_replace(lower(e.name),'[^a-z0-9]+','','g')
      or (e.id='EMP-12' and lower(coalesce(x.payee,'')) ~ '(paul.*joshua|joshua.*paul)')
      or (e.id='EMP-11' and lower(coalesce(x.payee,'')) ~ '(temitope|adebayo.*tope)')
      or (e.id='EMP-20' and lower(coalesce(x.payee,'')) ~ '(jenom.*jessie|jessie.*jenom)')
      or (e.id='EMP-34' and lower(coalesce(x.payee,'')) ~ 'ephraim')
    )
  ) q;

  return jsonb_build_object(
    'dayRate',v_day_rate,'overtimeRate',10000,'earned',v_earned,
    'paid',v_payroll_paid+v_expense_paid,
    'balance',v_earned-v_payroll_paid-v_expense_paid,
    'payments',v_payments
  );
end $$;

revoke all on function public.erp_operator_allowance() from public;
grant execute on function public.erp_operator_allowance() to authenticated;
insert into public.erp_schema_migrations(version) values ('0062') on conflict do nothing;
notify pgrst,'reload schema';
commit;
