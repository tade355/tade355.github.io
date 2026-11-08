-- Personal pay projection: only the employee linked to the current login.
begin;
create or replace function public.erp_personal_pay() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
 e public.employees%rowtype;
 ids text[];
 result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to view your pay'; end if;
 if (select count(*) from public.employees where auth_user_id=auth.uid() and status='Active' and canonical_employee_id is null) <> 1 then
   raise exception 'Your login must be linked to one active employee record';
 end if;
 select * into e from public.employees where auth_user_id=auth.uid() and status='Active' and canonical_employee_id is null;
 select array_agg(id) into ids from public.employees where id=e.id or canonical_employee_id=e.id;
 select jsonb_build_object(
 'employeeId',e.id,
 'payrollRuns',coalesce((
   select jsonb_agg(jsonb_build_object('id',r.id,'month',r.month,'status',r.status,'lines',(
     select jsonb_agg(jsonb_build_object('employeeId',e.id,'baseSalary',l.base_salary,'bonus',l.bonus,'deductions',l.deductions,'amountPaid',l.amount_paid))
     from public.payroll_lines l where l.payroll_run_id=r.id and l.employee_id=any(ids)
   ))) from public.payroll_runs r where r.status in ('Approved','Paid')
     and exists(select 1 from public.payroll_lines l where l.payroll_run_id=r.id and l.employee_id=any(ids))
 ),'[]'::jsonb),
 'dozerPayrollRuns',coalesce((
   select jsonb_agg(jsonb_build_object('id',r.id,'periodStart',r.period_start,'periodEnd',r.period_end,'status',r.status,'lines',(
     select jsonb_agg(jsonb_build_object('employeeId',e.id,'daysWorked',l.days_worked,'dayRate',l.day_rate,
       'overtimeHours',l.overtime_hours,'overtimeRate',l.overtime_rate,'businessEarnings',l.business_earnings,
       'deductions',l.deductions,'amountPaid',l.amount_paid,'equipment',l.equipment))
     from public.dozer_payroll_lines l where l.dozer_payroll_run_id=r.id and l.employee_id=any(ids)
   ))) from public.dozer_payroll_runs r where r.status in ('Approved','Paid')
     and exists(select 1 from public.dozer_payroll_lines l where l.dozer_payroll_run_id=r.id and l.employee_id=any(ids))
 ),'[]'::jsonb),
 'operations',coalesce((
   select jsonb_agg(jsonb_build_object('operatorId',e.id,'date',o.date,'equipment',o.equipment,'hoursWorked',o.hours_worked))
   from public.operations o where o.operator_id=any(ids) and o.equipment in ('EMG-004','EMG-006','EMG-007','EMG-008')
 ),'[]'::jsonb),
 'expenses',coalesce((
   select jsonb_agg(jsonb_build_object('id',x.id,'date',x.date,'amount',x.amount,'payee',e.name,'category',x.category,'personalAllowancePayment',true))
   from public.expenses x where x.category='Salary and Allowance' and (
     regexp_replace(lower(coalesce(x.payee,'')),'[^a-z0-9]+','','g')=regexp_replace(lower(e.name),'[^a-z0-9]+','','g')
     or(e.id='EMP-12' and lower(coalesce(x.payee,'')) ~ '(paul.*joshua|joshua.*paul)')
     or(e.id='EMP-11' and lower(coalesce(x.payee,'')) ~ '(temitope|adebayo.*tope)')
     or(e.id='EMP-20' and lower(coalesce(x.payee,'')) ~ '(jenom.*jessie|jessie.*jenom)')
     or(e.id='EMP-34' and lower(coalesce(x.payee,'')) ~ 'ephraim')
   )
 ),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.erp_personal_pay() from public;
grant execute on function public.erp_personal_pay() to authenticated;
insert into public.erp_schema_migrations(version) values('0068') on conflict do nothing;
notify pgrst,'reload schema';
commit;
