-- Add the fields used by the mobile fund-request line-item form.
-- Safe for existing requests: old rows become one item at the recorded amount.
alter table fund_request_items
  add column if not exists quantity numeric not null default 1,
  add column if not exists unit text,
  add column if not exists rate numeric not null default 0;

update fund_request_items
set rate = amount
where coalesce(rate, 0) = 0 and amount is not null;

insert into erp_schema_migrations(version)
values ('0069_fund_request_line_item_fields')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
