-- Adds an optional "Time Resumed" clock-time to Daily Operations reports,
-- so Fleet Roster can show each dozer's average resumption time. Stored as
-- "HH:MM" text (24h), matching the existing clock_in/clock_out convention
-- on attendance_logs. Only starts collecting data from whenever this ships
-- forward — there's no historical Time-In data to backfill.

alter table operations add column if not exists time_resumed text;
