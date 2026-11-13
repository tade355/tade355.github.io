-- Web push for Action Center and ERP notifications.
-- Apply before deploying the erp-push-dispatch Edge Function.
-- Configure ERP_VAPID_PUBLIC_KEY, ERP_VAPID_PRIVATE_KEY and ERP_PUSH_DISPATCH_SECRET
-- in Edge Function Secrets. Store the dispatch secret and public anon key in
-- Supabase Vault as erp_push_dispatch_secret and erp_push_anon_key.
create table if not exists public.erp_push_subscriptions (
  endpoint text primary key,
  employee_id text not null references public.employees(id) on delete cascade,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists erp_push_subscriptions_employee_idx on public.erp_push_subscriptions(employee_id);
alter table public.erp_push_subscriptions enable row level security;
drop policy if exists push_subscription_owner on public.erp_push_subscriptions;
create policy push_subscription_owner on public.erp_push_subscriptions for all to authenticated
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id());

create table if not exists public.erp_push_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id text not null references public.employees(id) on delete cascade,
  source_key text not null unique,
  title text not null,
  body text not null default '',
  target_path text not null default '#/actionCenter',
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text
);
create index if not exists erp_push_outbox_pending_idx on public.erp_push_outbox(next_attempt_at) where delivered_at is null;
alter table public.erp_push_outbox enable row level security;

create or replace function public.queue_staff_action_push() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or new.assignee_id is distinct from old.assignee_id then
    insert into public.erp_push_outbox(recipient_id,source_key,title,body,target_path)
    values (new.assignee_id,'action:'||new.id||':'||new.assignee_id,
            'New action assigned','Open Action Center to review your task.','#/actionCenter')
    on conflict (source_key) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists trg_queue_staff_action_push on public.staff_action_items;
create trigger trg_queue_staff_action_push after insert or update of assignee_id on public.staff_action_items
  for each row execute function public.queue_staff_action_push();

create or replace function public.queue_erp_notification_push() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.erp_push_outbox(recipient_id,source_key,title,body,target_path)
  values (new.recipient_id,'notification:'||new.id::text,
          'ERP notification','Open the ERP to view your notification.',
          coalesce(nullif(new.target_path,''),'#/dashboard'))
  on conflict (source_key) do nothing;
  return new;
end $$;
drop trigger if exists trg_queue_erp_notification_push on public.erp_notifications;
create trigger trg_queue_erp_notification_push after insert on public.erp_notifications
  for each row execute function public.queue_erp_notification_push();

create or replace function public.queue_due_staff_action_push() returns integer
language plpgsql security definer set search_path=public as $$
declare count_added integer;
begin
  insert into public.erp_push_outbox(recipient_id,source_key,title,body,target_path)
  select assignee_id,'due:'||id||':'||current_date::text,'Action due today',
         'Open Action Center to review your task.','#/actionCenter'
  from public.staff_action_items
  where due_date=current_date and status in ('Open','In Progress')
  on conflict (source_key) do nothing;
  get diagnostics count_added=row_count;
  return count_added;
end $$;
revoke all on function public.queue_due_staff_action_push() from public, anon, authenticated;

create or replace function public.erp_claim_push_outbox(batch_size integer default 25)
returns setof public.erp_push_outbox language plpgsql security definer set search_path=public as $$
begin
  return query with picked as (
    select id from public.erp_push_outbox
    where delivered_at is null and next_attempt_at <= now() and attempt_count < 10
    order by created_at limit least(greatest(batch_size,1),50) for update skip locked
  )
  update public.erp_push_outbox o
  set attempt_count=o.attempt_count+1, next_attempt_at=now()+interval '5 minutes'
  from picked where o.id=picked.id returning o.*;
end $$;
revoke all on function public.erp_claim_push_outbox(integer) from public, anon, authenticated;
grant execute on function public.erp_claim_push_outbox(integer) to service_role;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('erp-push-dispatch','* * * * *',$cron$
  select net.http_post(
    url:='https://ydjutniskysecomvgrwi.supabase.co/functions/v1/erp-push-dispatch',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='erp_push_anon_key' order by created_at desc limit 1),
      'x-erp-push-secret',(select decrypted_secret from vault.decrypted_secrets where name='erp_push_dispatch_secret' order by created_at desc limit 1)
    ),
    body:='{}'::jsonb
  );
$cron$);
select cron.schedule('erp-action-due-reminders','0 6 * * *',$cron$
  select public.queue_due_staff_action_push();
$cron$);
insert into public.erp_schema_migrations(version) values ('0082') on conflict do nothing;
notify pgrst, 'reload schema';
