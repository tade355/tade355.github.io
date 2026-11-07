begin;
create or replace function public.restrict_fund_request_decisions()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor text;
begin
  if auth.uid() is null then return new; end if;
  select id into actor from public.employees where auth_user_id = auth.uid();
  if (new.status is distinct from old.status and new.status in ('Approved','Partially Approved','Rejected','Pending'))
     or new.approved_amount is distinct from old.approved_amount
     or new.approved_by is distinct from old.approved_by
     or new.remainder_decision is distinct from old.remainder_decision
     or new.approval_note is distinct from old.approval_note then
    if actor is null or actor not in ('EMP-28','EMP-26') then
      raise exception 'Only the CEO and COO can approve, reject, reopen or change fund request decisions';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_restrict_fund_request_decisions on public.fund_requests;
create trigger trg_restrict_fund_request_decisions before update on public.fund_requests
for each row execute function public.restrict_fund_request_decisions();
commit;