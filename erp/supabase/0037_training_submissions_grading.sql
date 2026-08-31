-- Lets whoever reviews a Day 1 Knowledge Check submission mark it graded:
-- an overall score out of the question count, a pass/fail-style outcome,
-- and free-text notes. See the grading section in viewSubmission()
-- (erp/js/views/training.js), shown only to Admin/Accounts/Supervisor.

alter table training_submissions add column if not exists score integer;
alter table training_submissions add column if not exists outcome text
  check (outcome in ('Pass', 'Needs Review', 'Fail'));
alter table training_submissions add column if not exists grader_notes text;
alter table training_submissions add column if not exists graded_at timestamptz;
alter table training_submissions add column if not exists graded_by text references employees(id) on delete set null;
