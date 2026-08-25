-- How many times a trainee left the browser tab during the Day 1 Knowledge
-- Check, and how long they were away in total — see the visibilitychange
-- tracking in erp/js/views/training.js. This is a signal for whoever
-- reviews the submission (shown on the Training tab's answers view and
-- submissions table), not an enforcement mechanism — the app has no way to
-- lock down another tab/device.

alter table training_submissions add column if not exists tab_switch_count integer not null default 0;
alter table training_submissions add column if not exists tab_away_seconds integer not null default 0;
