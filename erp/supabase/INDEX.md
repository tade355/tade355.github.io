# Supabase SQL files

Run a new migration once in the Supabase SQL editor, in number order. `schema.sql` is the first full schema; the numbered files change it afterwards. The ERP keeps working if the newest migration has not been run yet (check the note against the file), but the feature it adds will be off.

| File | What it does |
|---|---|
| `schema.sql` | Emagrims ERP — Supabase schema |
| `seed_dozer_fleet.sql` | Seed data: real fleet roster provided by the client, entered after the |
| `seed_fleet_and_projects_2026.sql` | Seed data: additions to the real fleet roster and project list, provided |
| `002_fix_id_counter.sql` | Fix for the next_record_id() function: Supabase enables Row Level |
| `003_simplify_equipment_and_fix_type.sql` | Run this once in the SQL Editor. Two fixes found while migrating the |
| `004_prime_id_counters.sql` | The 32 real employees were bulk-inserted directly (with explicit IDs |
| `005_add_auth_columns.sql` | Adds real per-user login. Each employee gets a username (mapped behind |
| `006_require_authenticated.sql` | Now that real per-user logins exist, data access should require a |
| `007_operation_types.sql` | Daily Operations reporting now distinguishes between operation types |
| `008_projects.sql` | Projects becomes a real managed entity instead of a hardcoded list in |
| `009_income_expenditure.sql` | Fund Requests get a Cost Head (same categories as Expenses) so |
| `0010_dozer_categories.sql` | Widen fleet ownership from a binary Company/3rd-Party split into three |
| `0011_staff_memos.sql` | Staff Memos & Notices — printable internal correspondence (memo, notice, |
| `0012_rate_history.sql` | Rate/price history — so profitability and settlement calculations use |
| `0013_notice_board.sql` | Documents and Notices — company-wide announcements, meeting notices/agendas/ |
| `0014_fuel_credit.sql` | Fuel Credit Tracking — diesel and PMS collected on credit from filling |
| `0015_operation_type_rename.sql` | Corrects Daily Operations' operation-type list to match real field |
| `0016_project_expected_rate.sql` | Adds a per-project productivity target (Ha/day) so weekly actual area |
| `0017_maintenance_parts_labor.sql` | Adds a Parts/Labor cost split and external-contractor support to |
| `0018_expense_payee.sql` | Adds a recipient/payee field to Expenses — who the money actually went |
| `0019_operation_time_resumed.sql` | Adds an optional "Time Resumed" clock-time to Daily Operations reports, |
| `0020_operation_time_closed.sql` | Adds an optional "Time Closed" clock-time to Daily Operations reports, |
| `0021_project_milestone_fields.sql` | Adds a start date and total contract area to Projects, needed for the |
| `0022_dozer_parts_and_assets.sql` | Bulldozer parts withdrawal/utilization log (parts themselves live in |
| `0023_operation_diesel_tank_readings.sql` | Real per-day diesel tank readings on Daily Operations, matching the |
| `0024_tier_based_rls.sql` | Real per-tier database security, replacing the blanket "any signed-in |
| `0025_po_restock_and_inventory_withdrawals.sql` | Two related additions, both closing "not automated yet" gaps flagged |
| `0026_operations_downtime_and_block.sql` | Daily Operations: Block/Plot No. and downtime tracking (dozer breakdown, |
| `0027_diesel_consumption_rates.sql` | Per-dozer diesel consumption specs, set as basic info when adding/editing |
| `0028_resource_management_diesel.sql` | Resource Management: Diesel Management (3-level accountability) + moved |
| `0029_backfill_missing_diesel_columns.sql` | Catch-up migration: 0023 and 0027 were never applied to the live |
| `0030_revenue_reconciliation.sql` | Provisional (Daily Operations report) vs Verified (invoice) revenue |
| `0031_project_rate_operation_type.sql` | Contract rates on most projects aren't one blanket ₦/Ha figure — they're |
| `0032_loan_portfolio.sql` | Loan Portfolio: tracks borrowing from banks, directors, investors, and |
| `0033_payroll_amount_paid.sql` | Regular staff payroll (payroll_lines) gets the same amount_paid field |
| `0034_training_submissions.sql` | Backend for the Training module inside the ERP itself (a top-level |
| `0035_training_programs.sql` | Training programs: reusable definitions ("Management Trainee Training", |
| `0036_training_tab_switch_tracking.sql` | How many times a trainee left the browser tab during the Day 1 Knowledge |
| `0037_training_submissions_grading.sql` | Lets whoever reviews a Day 1 Knowledge Check submission mark it graded: |
| `0038_training_submissions_quiz_id.sql` | Training now has more than one knowledge check (Day 1, Session 1, and |
| `0039_project_item_manager.sql` | Bikes and other vehicles are moving out of the dozer-focused Fleet |
| `0040_machine_status_reports.sql` | Daily "General Machine Status Report" the site manager submits (per the |
| `0041_data_safety.sql` | Data safety (Oct 2026): atomic saves, an audit trail, an approval guard and an |
