-- Adds an optional "Time Closed" clock-time to Daily Operations reports,
-- symmetric to time_resumed (0019), so Fleet Roster can show each dozer's
-- average close time alongside its average resumption time. Stored as
-- "HH:MM" text (24h), same convention as time_resumed and the attendance
-- clock-in/out fields.

alter table operations add column if not exists time_closed text;
