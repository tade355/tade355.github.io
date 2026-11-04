-- Permit Admin to cancel an unpaid approved request. Paid requests remain immutable.
begin;
create or replace function guard_fund_request_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare tier text := current_employee_tier(); actor text;
begin
  if auth.uid() is null then return new; end if;
  select id into actor from employees where auth_user_id = auth.uid();
  if tg_op = 'INSERT' then
    if new.status <> 'Pending' then raise exception 'New requests must start Pending'; end if;
    if tier not in ('Admin', 'Accounts') and new.submitted_by is distinct from actor then raise exception 'Submit only your own request'; end if;
    new.approved_by := null;
    new.paid_at := null;
    return new;
  end if;
  if old.status = 'Paid' and (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then raise exception 'Paid requests are immutable; use a documented correction'; end if;
  if old.status = 'Approved' then
    if (to_jsonb(new) - array['updated_at','status','paid_at']) is distinct from (to_jsonb(old) - array['updated_at','status','paid_at']) then
      raise exception 'Approved details are locked. Return to Pending before amending';
    end if;
    if new.status not in ('Approved','Pending','Paid','Rejected') then raise exception 'Invalid approved request transition'; end if;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'Paid' then
      if old.status <> 'Approved' or tier not in ('Admin','Accounts') then raise exception 'Only Admin/Accounts can settle an approved request'; end if;
      if new.paid_at is null then raise exception 'Payment date is required'; end if;
    elsif tier <> 'Admin' then raise exception 'Only Admin can approve, reject or reopen requests';
    end if;
    if new.status in ('Approved','Rejected') then new.approved_by := actor; end if;
    if new.status = 'Pending' then new.approved_by := null; new.paid_at := null; end if;
  elsif new.approved_by is distinct from old.approved_by or new.paid_at is distinct from old.paid_at then
    raise exception 'Approval and payment fields require a state transition';
  end if;
  return new;
end $$;
commit;
