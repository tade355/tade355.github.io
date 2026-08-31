-- Training now has more than one knowledge check (Day 1, Session 1, and
-- whatever gets added later — see the QUIZZES array in
-- erp/js/views/training.js), so a submission needs to say which one it's
-- for. Existing rows predate this and were all the Day 1 check.

alter table training_submissions add column if not exists quiz_id text not null default 'day1';
