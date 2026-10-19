# Emagrims ERP: working guide for coding agents

This repository is a static website (GitHub Pages) plus the Emagrims Ltd ERP in `erp/`. The ERP has no build step: plain ES modules in the browser, with Supabase (Postgres + REST) as the database. This file is everything an agent needs to keep running and extending it. Credentials are never stored here; see "Secrets".

## Where things are

| Item | Value |
|---|---|
| Live ERP | https://tade355.github.io/erp/ |
| Repo | `tade355/tade355.github.io`, GitHub Pages is served from `master` (pushing to `master` deploys in about a minute) |
| Working branch | `claude/emagrims-erp-build-v7cfod`; it is merged or pushed to `master` after every change |
| Tests | `npm test` (`node --test erp/js/*.test.js`, about 123 tests, no dependencies) |
| Database | Supabase project URL and anon key are in `erp/js/supabaseClient.js`; row level security allows signed-in users only |
| ERP login used for scripts | user `olumide` (email `olumide@emagrims-erp.app`), password from the `ERP_PW` environment variable |
| Manual | `erp/MANUAL.md` |

Always verify after a push: wait for the deploy (`curl -s https://tade355.github.io/erp/js/<file> | grep <new text>`), then check the real page with `tools/screenshot_page.cjs` or `tools/dashboard_download.cjs`.

## Secrets

- Never write the ERP password, tokens or bank details into any file, commit, test or log. Read the password only from `ERP_PW`.
- The repo is public. Do not commit staff pay details, account numbers or private business notes. Private context lives outside the repo.
- Olumide-only features (report download, Data Import) are hidden in the UI (`erp/js/access.js`) but are not enforced by the database.

## Code layout (`erp/js`)

- `main.js` boots the app, `router.js` lists every page in `ROUTES` (path, label, icon, allowed `tiers`, optional `guard`). `views/*.js` are the pages; tabs are built inside each view.
- `store.js` holds every collection in `CONFIG` (collection name, Supabase table, id prefix, child table). It maps camelCase fields to snake_case columns automatically, so a new column needs a migration in `erp/supabase/` and nothing else.
- `ui.js` (`renderTable`, `statCard`, buttons), `utils.js` (`el()`, formatters, `ico()`), `icons.js` (line icons, no emojis), `css/style.css` (design system: filter bars, `.stat-*` cards, `.dd-*` dashboard classes, `.table-wrap`).
- Logic that needs tests is kept pure (no store or DOM imports; a `ctx` object is passed in): `dailyDashboardData.js`, `dashboardBasis.js`, `opEconomics.js`, `agoPlanData.js`, `importPlan.js`, `dieselSupply.js`, `askErp.js` and `askErpFacts.js`, `rexInvoice.js`, `workOrderParse.js`, `searchCatalogue.js`. `reportContext.js` builds the `ctx` from the live store.
- `dashboardHtml.js` produces the downloadable dashboard HTML; `views/dailyDashboard.js` is the on-screen version. They must show the same numbers.
- Adding a page or tab: add the route or tab, then add it to `searchCatalogue.js` so the global search finds it. Keep the filter-bar and card styles uniform.

Style: match the surrounding code (comment density, naming, `el()` helper). No emojis in the UI. Every new rule gets a unit test.

## Database conventions

- Ids are text such as `FR-114`, created from the server function `next_record_id` (parameter name `p_prefix`). The counter can lag behind the highest existing id, so keep drawing until the number is above the table's maximum (`tools/erp_rest.py: nid`).
- Parent and child tables: fund requests have `fund_request_items`, machine status reports have `machine_status_report_lines`, payroll runs have lines, and so on (see `CONFIG`).
- To change data without the UI, use `tools/erp_rest.py` (login, `get`, `ins`, `upd`, `nid`). Never delete a record you did not create; correct it and say so.
- Reads of a changed record: check the table and the dashboard afterwards.

## Business rules the code depends on

Dashboard basis starts **10 Oct 2026** (`DASHBOARD_BASIS_FROM`). Dates before it use the older Profitability rules and must not move.

**Diesel**
- Chain per dozer from the basis date: opening = previous closing + diesel supplied; used = 25 L per hour (20 L per hour after 8 hrs); closing = opening - used. Diesel marked "not tank fuel" or "maintenance diesel" in the distribution notes is outside the chain.
- A closing reported by the site (`operations.closing_diesel`) is the physical tank level. The dashboard flags a difference ("Closing restated") and builds the next fueling request from the reported closing.
- Fueling request for tomorrow: 250 L target (8 hrs x 25 L + 50 L reserve) less closing, for the dozers working tomorrow, less diesel on ground.
- Diesel on ground = latest stock count + diesel collected since (excluding collections whose notes say sold) - diesel distributed since.
- Diesel moved from one machine to another (drilled out of one tank into another): book it in `diesel_site_distributions` as a positive row for the receiving machine and a negative row (litres below zero) for the donor, both with a note. The site total then shows only what came from site stock.
- Station collections: a collection whose notes start "Sold to the CEO" is not site diesel. When part of a collection is sold, split it into two rows (supplied and sold).
- Station price history is in `rateHistory.js`; the Midejab station is `Midejab Ltd`.
- Station ledger and tracker: collections minus payments; the Excel tracker must agree with the ERP station balance.

**Operators and dozers**
- Owned fleet operator allowance: day rate prorated by hours / 8 (the operator's own rate; Jessie's is lower), plus overtime at the configured rate per hour beyond 8. On Sundays the rate is a flat 50,000 per day for everyone, with overtime still beyond 8 hrs. `ownedOperatorAllowance.js` is the single source.
- Rented and partnership dozers are costed hours x hourly rate. A **deal day** (`workType = Business` with `businessAmount`) is costed at the amount paid and is not accrued to the owner (`dozerCostFor` in `dashboardBasis.js`). Deal days never appear in owner settlements.
- Dozer rent settlements (`dozer_owner_settlements`) count office days only.
- Dozer payroll runs (`dozer_payroll_runs` and lines) record days, rate, overtime and amount paid per operator per day.

**Sunday bonus policy (supervisors)** in `supervisorSundayAllowanceBasis`: per supervisor per Sunday, 3 or more dozers at 6 hrs or more = 20,000; 2 dozers = 10,000; 1 dozer = 5,000; then 5 or more days worked Monday to Saturday = full, 3 to 4 days = 50%, 2 or fewer = none. Mechanics: 5,000 to 10,000 for minor Sunday support repairs only. Dates that fall on a Saturday or Monday are treated as the nearest Sunday.

**Fund requests**
- A request has a date, items and a status (Pending, Approved, Paid, Rejected). There is no paid-date column, so when a request is paid later its `date` is moved to the payment date and the original date is kept in the description.
- Approved and Paid requests count as spend on the dashboard and in Income and Expenditure. Maintenance requests count under Machine Recovery (maintenance incurred), not operations profit.
- Duplicates: the site manager resends requests. Check for an existing request with the same description and amount before adding one.

**Other**
- Revenue is hectares x the project rate per hectare (Phase 1 Kangidi: 845,000 per ha). Expected output is 1.3 ha per 8 hrs.
- PMS (petrol) is collected at the station, priced as recorded, and costed under "PMS - Tacoma" unless the note says maintenance or unexplained.
- Diesel logistics: 50 per litre supplied to company-owned and rented dozers.
- Rex work-order invoices, letterhead and CEO signature live in `rexInvoice*.js`, `views/workOrderInvoices.js` and `erp/assets`.

## Daily runbook

1. **Receive the day's WhatsApp material** (end-of-day reports, diesel distribution list, requests, receipts, station collection report, machine status).
2. **Record it**, preferring the Data Import page (`tools/import_upload.cjs`, template in `erp/templates`) for reports, supply, collections, requests and payments. Use REST (`tools/erp_rest.py`) for anything the template cannot hold (payroll lines, machine status, maintenance logs, stock counts, closing diesel).
   - Daily Reports: one row per dozer; hours as reported by the manager; the ERP works out diesel used. Name ambiguous people by staff id.
   - Diesel Supply: litres per dozer per day (net of internal transfers between dozers).
   - Station collections from the station's own "Grand Total / Analysis" message, which is the authority; cross-check each day and the running grand total.
   - Stock count: Oki's on-site diesel at end of day.
   - Fund requests and payments: mark paid requests Paid and move their date; new receipts match existing requests first.
   - Also: dozer payroll run for the day, machine status report, maintenance logs for breakdowns and repairs, rent settlement update for rented dozers.
3. **Dashboard**: `node tools/dashboard_download.cjs <date> out.html "<dozers working tomorrow>"`, read it for flags, then send it.
4. **AGO planner** for the next day: `python tools/build_ago_planner.py ...`; raise fueling vouchers (diesel and PMS) when told; write the supply message ("No 1. Please supply Christopher with N liters Diesel tomorrow - dd Mon yyyy. Thank you.").
5. **Midejab tracker**: `python tools/midejab_tracker.py`; the closing balance must equal the ERP station balance.
6. Run `npm test` for any code change, push, confirm the deploy.

Every response to the owner should state what was recorded, what was assumed, and what needs a decision. Answer "straight": the decision first, the working second. Excel outputs should be simple tables; screenshots full width and uncut.

## Gotchas learned the hard way

- Never `pkill -f http.server` (it kills the agent's own shell). Playwright needs a Chromium; set `CHROMIUM_PATH` if it is not found.
- A table inside a view can be wider than the screen if a cell has a very long unbroken text; give the column `wrap: true` in `renderTable`.
- Dashboard downloads are generated by the real page, so deploy before regenerating.
- The reported-vs-calculated closing difference accumulates. Restating the calculated chain to the site's figure is a decision for the owner.
- Fractional hours: use the hours the manager reports; the start and stop times are kept as reported even if they disagree.
- Collection figures typed in chat can be wrong; the station manager's daily message wins. The 15 Oct 2026 AGO collection was entered as 2,550 L instead of 2,250 L and caused a 300 L gap that took a day to find.
- Do not mark requests Approved on the owner's behalf; leave them Pending unless told.
