-- Preserve the original device capture time separately from the later server sync time.
alter table public.attendance_logs
  add column if not exists captured_at timestamptz,
  add column if not exists synced_at timestamptz,
  add column if not exists capture_source text;

update public.attendance_logs
set captured_at = coalesce(captured_at, created_at),
    synced_at = coalesce(synced_at, created_at),
    capture_source = coalesce(capture_source, 'online')
where captured_at is null or synced_at is null or capture_source is null;

alter table public.attendance_logs
  alter column capture_source set default 'online';

alter table public.attendance_logs
  drop constraint if exists attendance_logs_capture_source_check;

alter table public.attendance_logs
  add constraint attendance_logs_capture_source_check
  check (capture_source is null or capture_source in ('online', 'offline'));
