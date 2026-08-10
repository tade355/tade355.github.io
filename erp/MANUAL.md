# Emagrims ERP — User Manual

This is the complete guide to the Emagrims Ltd Operations ERP — the internal system used to run daily land-clearing operations, the dozer fleet, sales, purchasing, accounting, HR/payroll, and company documents. It's written so a new user can learn the whole system from this document alone, with no other training required.

Use **Ctrl+F** (or your browser's "Find" feature) to jump to a section by name — the table of contents below links to every module and tab.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [The App Shell — What's Always On Screen](#2-the-app-shell--whats-always-on-screen)
3. [Access Tiers — Who Can See What](#3-access-tiers--who-can-see-what)
4. [Common Screen Patterns](#4-common-screen-patterns)
5. [Dashboard](#5-dashboard)
6. [Documents and Notices](#6-documents-and-notices)
7. [Projects](#7-projects)
8. [Daily Operations](#8-daily-operations)
9. [Fleet Management](#9-fleet-management)
10. [Resource Management](#10-resource-management)
11. [Sales & Invoicing](#11-sales--invoicing)
12. [Purchasing & Suppliers](#12-purchasing--suppliers)
13. [Accounting & Expenses](#13-accounting--expenses)
14. [Fund Requests & Approvals](#14-fund-requests--approvals)
15. [HR & Employees](#15-hr--employees)
16. [Leave & Attendance](#16-leave--attendance)
17. [Backup & Data](#17-backup--data)
18. [Step-by-Step Workflows](#18-step-by-step-workflows)
19. [Glossary](#19-glossary)
20. [Known Limitations](#20-known-limitations)

---

## 1. Getting Started

### Logging in

Open the ERP in a browser and you'll see a **"Sign in to Emagrims ERP"** screen with a **Username** and **Password** field. There is no self-signup and no "Forgot password" link — an account (username + an initial password) is set up for you directly in the system's backend before you ever log in. Once you're in, use **Change Password** (see below) to set your own. If you're ever locked out, there's no in-app reset — whoever administers the underlying system (not a normal in-app HR action) has to issue you a new password.

### Logging out / changing your password

At the bottom of the sidebar, under your name and access tier, there are two links:
- **Change Password** — opens a form asking for a **New Password** (minimum 6 characters). Use this any time, including right after your Admin gives you a temporary password.
- **Log Out** — ends your session and returns you to the login screen.

### Theme

Three buttons in the sidebar footer — **🖥 Auto**, **☀ Light**, **🌙 Dark** — switch the app's color scheme. Auto follows your device's system setting. Your choice is remembered on that browser/device.

---

## 2. The App Shell — What's Always On Screen

| Element | Where | What it does |
|---|---|---|
| **Sidebar navigation** | Left | The full list of modules you have access to (see [Access Tiers](#3-access-tiers--who-can-see-what) — items you can't access simply don't appear). On a phone/narrow screen, tap the ☰ menu icon in the top bar to open/close it. |
| **↻ Refresh Data** | Sidebar footer | Every screen loads from a shared, central database — if a colleague changed something while you were looking at a page, this button re-fetches everything and reloads the current view. The app also refreshes automatically in the background whenever you switch back to the tab, and every 90 seconds while it's open, but those background refreshes never interrupt what you're doing (they won't close a form you have open) — only clicking Refresh Data or navigating to a new page shows you the freshest data on screen. |
| **↗ Company website (LinkedIn)** | Sidebar footer | Opens Emagrims Ltd's LinkedIn page in a new tab. |
| **User badge** | Sidebar footer | Shows your name and access tier, plus Change Password / Log Out. |

---

## 3. Access Tiers — Who Can See What

Every staff account is assigned one of four **ERP Access Levels** in HR & Employees. This determines which sidebar items you see and, in a few places, what you can edit even within a page you can open.

| Tier | Who this is for | What they get |
|---|---|---|
| **Admin** | Management / ownership | Everything — every module, every tab, every action, including HR, Payroll, and the Admin-only Internal Ledger inside Dozer Economics. |
| **Accounts** | Office / accounts staff | Dashboard, Documents and Notices, Projects (including Profitability and Rate History), Resource Management, Sales & Invoicing, Purchasing & Suppliers, Accounting & Expenses, Fund Requests & Approvals, Leave & Attendance. **Not**: Daily Operations, Fleet Management, HR & Employees. |
| **Supervisor** | Site supervisors | Documents and Notices, Projects (Map View, Photo Gallery, and Weekly Report only — no Projects list, Rate History, or Profitability tab), Daily Operations, Fleet Management, Resource Management, Fund Requests & Approvals (including the Approvals inbox), Leave & Attendance. A Supervisor's view of Fund Requests, Leave Requests, and Fueling Vouchers is further narrowed to their own **Assigned Project** (set on their HR record) — see the note under each relevant module. **Not**: Dashboard, Sales, Purchasing, Accounting, HR. |
| **Staff** | Everyone else (general/field staff) | Documents and Notices, Fund Requests & Approvals (their own requests only — no Approvals tab), Leave & Attendance (their own leave/attendance only). Nothing else. |

> **Important caveat:** this tier system controls what the app's screens *show and offer* — it is not a database-level security wall. Anyone determined enough with technical access to the underlying system could bypass it. Treat it as "the right doors are hidden from the wrong people," not "the wrong people are locked out even if they try to force their way in."

**Setting a tier:** an Admin sets this per person on the **Employees** tab of HR & Employees, field **"ERP Access Level."** New employees default to **Staff** until changed.

---

## 4. Common Screen Patterns

These conventions repeat across almost every module — learn them once here instead of re-reading them on every page.

- **`+ Add / New / Log / Submit …` button** — top-right of most list screens. Opens a form (a "modal" popup) to create a new record. Required fields are marked with `*`.
- **Row icons**:
  - **✎ Edit** — opens the same form, pre-filled, to change that record.
  - **🗑 Delete** — always asks to confirm first (*"Delete '&lt;record name&gt;'? This cannot be undone."*). There is no undo after confirming, other than restoring from a backup (see [Backup & Data](#17-backup--data)).
  - **🖨 Print** — only appears where a printable document exists for that record (see each module's Print section below). Opens your browser's print dialog with a formatted letterhead document — print it, or use "Save as PDF" in the print dialog to get a PDF file instead of paper.
- **Status pills** — colored badges showing a record's status. As a rough guide: **green** = good/complete/paid/active, **amber** = pending/in-progress/needs attention, **red** = a problem, rejected, overdue, or unpaid.
- **Search and filter bars** — most list screens have a search box and/or dropdown filters just above the table. These only change what's *displayed*; they never delete or alter data.
- **Date fields** — clicking or tabbing into any date field pops its calendar picker open immediately, instead of making you find and click a small icon.
- **Row highlighting** — some tables tint a whole row amber or red to flag something (e.g. low stock, overdue invoice, pending approval) without you having to read every column.
- **Tabs** — most modules are split into tabs (e.g. Fleet Management has 5). The tab bar sits just under the page title. Which tabs you see can depend on your access tier. A couple of screens go one level deeper — Resource Management's Diesel Management tab has its own row of sub-tabs beneath the main one.

---

## 5. Dashboard

**Who sees it:** Admin, Accounts.

The Dashboard is an Executive Command Centre — a live, always-current briefing on the whole company, with no forms to fill in (everything here is read-only, sourced from every other module). Almost everything on it is clickable, taking you straight to the module behind the number.

**What's on it, top to bottom:**
- **Greeting** — "Good morning/afternoon/evening, {name} — here's how Emagrims Ltd is doing today, {date}."
- **KPI row** — 10 headline cards, each linking to the module behind it: Machine Availability (% of fleet Active, with a "Target: 85%" reference line), Active Machines, Machines Under Repair, Today's Revenue, Today's Cost, Today's Profit, ROI (Profit ÷ Cost for today — a return-on-operating-spend proxy, labeled as such since capital expenditure per machine isn't tracked), Today's Diesel Consumption, Today's Hectares, Active Staff, and Outstanding Approvals (Fund Requests + Leave Requests + Fueling Vouchers combined). Revenue/Cost/Profit/ROI/Diesel/Hectares each carry a 7-day sparkline and a trend arrow vs. yesterday — green for a favorable move, amber for an unfavorable one (e.g. Cost rising shows amber, Revenue rising shows green).
- **Executive Alert Center** — every "watch this" signal the app can surface, grouped into three severity tiers instead of one flat list: 🔴 **Critical** (unpaid invoices, overdue loan repayments, out-of-stock items, dozers overdue for service), 🟠 **Important** (dozers down/under maintenance, dozers due soon for service, low-stock items, fuel credit owed, dozer owner settlements owed, pending Fund Requests/Leave Requests/Fueling Vouchers, stale or missing backup), and 🟢 **Info** (daily reports submitted today). Each row links straight to where you'd act on it. Shows "✅ All caught up" when there's nothing outstanding.
- **This Month at a Glance** — four leaderboard panels for the current month: **Top Sites by Hectares**, **Top Operators by Hours**, **Top Machines by Utilization** (hours worked — not profit, since a per-machine profit can't fully attribute Logistics/Other costs below project level), and **Recently Logged** (the 5 most recent Daily Operations reports across all sites).
- **Today's Activity Timeline** — a chronological feed of today's real events: Daily Operations reports (using their actual Time Resumed/Time Closed where logged), diesel deliveries, and maintenance log entries. Records with no time-of-day field (diesel receipts, maintenance logs) are listed without a fabricated timestamp rather than an invented one.
- **Charts** (last 6 months unless noted): Revenue vs Cost vs Profit (company-wide, all projects — same math as Profitability), Sales Trend, Land Cleared Trend, Expenses by Category (all-time), Land Cleared by Site (all-time).

---

## 6. Documents and Notices

**Who sees it:** everyone (Admin, Accounts, Supervisor, Staff).
**Who can post/edit/delete:** Admin, Accounts only — everyone else has read-only access.

This is the company notice board — announcements, meeting notices, agendas, minutes, policies, SOPs, templates, the organogram, adverts, and flyers, all in one shared feed.

**Filter:** a **Category** dropdown at the top narrows the board to one category, or "All Categories."

**Notices display as cards**, newest first, except **pinned** notices which always float to the top regardless of date (used for things like the organogram or a standing policy that should always be easy to find). Each card shows the category, title, date, who posted it, the body text, and any attachments — image attachments show as clickable thumbnails (click to view full-size in a lightbox), other files (PDFs, etc.) show as a downloadable link.

**"+ Post Notice" fields:**

| Field | Notes |
|---|---|
| Title | required |
| Category | required — Announcement, Meeting Notice, Agenda, Minutes, Policy, SOP, Template, Organogram, Advert, Flyer, or Other |
| Date | required |
| Details | free text |
| Attachments | flyers, policy PDFs, the organogram image, etc. — multiple files allowed |
| Pin to top of the board? | Yes/No — pinned notices always show first |

No print button on this screen.

---

## 7. Projects

**Who sees it:** Admin, Accounts, Supervisor.
**Tab visibility differs by tier:**
- **Admin / Accounts** see all six tabs: Projects, Map View, Photo Gallery, Weekly Report, Rate History, Profitability.
- **Supervisor** sees only **Map View, Photo Gallery, and Weekly Report** — no ability to add/edit projects, and no Rate History or Profitability tabs.

### Projects tab (Admin/Accounts only)

The master list of every job/site the company runs. Stat cards: Total Projects, Active, Contract Not Signed.

**"+ Add Project" fields, in order:**

| Field | Notes |
|---|---|
| Project Name | required |
| Status | required — Active, On Hold, Completed |
| Contract / T&C Status | Not set, Draft, Pending Signature, Signed, Expired |
| Percent Complete (%) | |
| Rate (₦) | |
| Rate Unit | free text, e.g. "per Ha", "per KM" — kept as a record; see note below |
| Expected Rate/Day (Ha) | your target hectares-per-day for this project — feeds the **Weekly Productivity** comparison on the Profitability tab |
| Project Start Date | feeds the Milestone Tracker (Weekly Report tab) |
| Total Contract Area (Ha) | feeds the Milestone Tracker's "Remaining to Complete" figure |
| Scope of Work | free text |
| Notes | free text |

> **Note on Rate:** setting or changing a project's Rate/Rate Unit automatically logs an entry to the **Rate History** tab (first save always logs an opening entry; later edits only log a new entry if the rate actually changed) — this preserves a dated history of what the contract rate was at any point in time. However, as currently built, this Rate value is a *record only* — Profitability's cost/revenue math draws revenue from tagged Invoices and cost from dozer/diesel rate history, not from this Project Rate field.

No print button on this tab.

### Map View tab

Shows every land-clearing boundary, road, or point that field supervisors have uploaded as a `.kml` file when logging a Daily Operations report, drawn on an interactive map (OpenStreetMap base, centered on Nigeria by default, then auto-zoomed to whatever's drawn).

- **Site** filter — narrow to one project/site, or "All Sites."
- **Legend checkboxes** — one per operation type present (Felling, Stacking, etc.), each with its own fixed color; untick one to hide that layer without losing it.
- Click any shape to see its Operation Type, Site — Date, and Quantity.
- If nothing's been uploaded yet: "No KML boundaries uploaded for these filters yet."
- A Supervisor only sees shapes from their own assigned project.

### Photo Gallery tab

A browsable wall of every photo attached to Daily Operations reports.

- Filters: **Site**, **From** date, **To** date.
- Click any thumbnail to open a full-size lightbox with **‹ Prev** / **n of total** / **Next ›** to page through without closing it.
- A Supervisor only sees photos from their own assigned project.

### Weekly Report tab

Two sub-tabs generate the standard weekly field-reporting documents, straight from Daily Operations data.

**Weekly Performance sub-tab:** pick a **Project** and a **From**/**To** date range — despite the tab's name, the period isn't locked to a Mon–Sun week; pick any range from a single day to 92 days (the hard cap — a longer range shows a notice and truncates rather than trying to render an unbounded number of day columns), and the day columns resize to match. Rows are every dozer with **at least one working day on this project in the selected period** — an operations report logged against the project, whether or not that dozer's Current Project has since changed or was never set correctly. A dozer currently assigned to the project but idle all period is left off, so the report stays focused on who actually worked. Each row shows:
- A day-by-day breakdown of hectares cleared, a period total, and its own average Start/Close time.
- **Type (Speed/Day)** — each operation type the dozer worked this period gets its own speed figure (e.g. "Phase 2: 4.0 Ha/day, Trekking: 2.0 hrs/day") rather than one blended average, since different operation types genuinely run at different rates and averaging them together is misleading.
- **% Optimization** — days the dozer did any work this period ÷ days in the period (same definition as Fleet Management → Dozer Economics → Company-Owned Dozer Performance).

A bolded **Cumulative** row sums every dozer's daily totals and also shows the fleet-wide average Start/Close across every report in the period.

Below the daily grid, the financial part of the report is organized into three consistently-structured sections — a stat-card headline followed by supporting tables — so the two cost methodologies read side by side instead of as one long mixed list:

**Revenue** (shown once, shared by both cost lenses below — they start from the same figure): quantity achieved this period × the contract rate in effect that day (Rate History), broken down **by Operation Type** in a table (Felling, Stacking, etc. each get their own row, since they earn at very different rates). **Trekking always shows ₦0 revenue** — it's repositioning time between sites/blocks, not billable production, even if a general fallback contract rate happens to be on file for the project (this rule is enforced in the shared revenue calculation used app-wide, so Profitability and Projects → Profitability agree with it too, not just this report). This is provisional/expected revenue, not verified or invoiced revenue.

**Cost & Profit — Tentative (Field Estimate):** a quick field estimate using standard flat rates rather than logged ledger entries, shown as a Cost Item / Basis / Amount table:
- **Rental Cost** — days worked this period × Rental Rate/Day, for **every dozer on the roster with a rate set, regardless of ownership**. For a Partnership/Rented dozer this is real rent paid out; for a Company-owned dozer it's the imputed cost of using owned equipment (what it would cost to replicate the operation from scratch) — consistent with how M/c Recovered credits Company dozers the same way further down.
- **Diesel Cost** — Fuel Used × the diesel rate in effect that day, summed across the roster.
- **Site Logistics** — ₦12,800 per working day this period (any day at least one roster dozer had an operation).
- **Diesel Logistics** — ₦1,500 per 30 litres of diesel used this period.
- **Operator Cost** — ₦30,000 per 8 hours worked, for Company and Partnership dozers only (a Rented dozer's day rate already includes the owner's own operator, so it doesn't get this on top).

Two detail tables show exactly how Rental Cost and Diesel Cost were arrived at: **Rental Cost — by Dozer** (one row per dozer that contributed a nonzero Rental Cost this period, with Ownership, Days Worked, Rate/Day, and Cost) and **Diesel Cost — by Day** (one row per day, with Litres Used, the diesel rate in effect that day, and Cost) — useful when the rate changed mid-period, since each row shows exactly which rate applied.

**Cost & Profit — Actual (Ledger-Based):** mirrors the fuller cost-and-margin table used for the company's own weekly field-report review — a different lens from Tentative above, not a replacement for it. Total Cost is a Cost Item / Basis / Amount / % of Total table: Diesel Cost (same formula as above) + Dozer Cost (hours worked × the hourly rate on file for each dozer — Profitability's standard formula) + Logistics & Others (this project's Logistics and other expense-category spend for the period; Fuel- and Maintenance-category expenses are excluded since they're already covered by Diesel Cost and Maintenance Incurred below, so they don't get double-counted). Actual Profit is Revenue minus Total Cost, shown as a percentage of Revenue.

A **Machine Recovery** table then bridges to the final bottom line:
- **M/c Recovered** — the Management Fee retained on Partnership/Rented dozers (days worked × fee/day, the same bookkeeping a Dozer Rent Payments settlement uses), plus the rental rate saved by using Company-owned dozers instead of renting equivalent capacity (days worked × the dozer's Rental Rate/Day, if set) — no rent is actually paid out for an owned dozer, so this is value generated/cost avoided.
- **Maintenance Incurred** — the whole roster's Maintenance Log repair costs this period, netted against M/c Recovered. This is informational only here — it's not part of Total Cost above (already excluded there to avoid double-counting).
- **Net M/c Recovered** and **Total Margin** (Actual Profit plus Net M/c Recovered) — the combined bottom line.

A **Daily Summary** table breaks Revenue/Cost/Profit down by day, plus how many dozers worked each day — the daily figures always sum to the weekly totals above.

Click **🖨 Print Report** for a printable "WEEKLY PERFORMANCE REPORT" that includes the daily grid and all three financial sections.

If a dozer you expect to see is missing: it has no operations report logged against this project in the selected period — check the date range, or whether the report was logged against a different project name.

**Milestone Tracker sub-tab:** pick a **Project**. Shows all-time (not period-limited) progress: Project Start Date, Days on Project, Project Speed (Ha/Day), Grand Cumulative Achieved, Total Contract Area, and Remaining to Complete — plus a table of every machine/operator that's ever worked the project (same Current-Project-or-actually-worked-here roster rule as Weekly Performance above), broken down by operation type. Requires **Project Start Date** and **Total Contract Area (Ha)** to be set on the Projects tab for the full set of figures to compute (otherwise they show "—"). Click **🖨 Print Tracker** for a printable "MILESTONE REPORT TRACKING SYSTEM" document.

### Rate History tab (Admin/Accounts only)

A dated log of every contract-rate change, per project **and, usually, per Operation Type** — most contracts price each operation type separately (a hectare's contract value isn't earned until every operation type contracted for it, e.g. Felling, then Stacking, then Bonding, has actually been done). **"+ Log Rate Change"** fields: Project (required), Operation Type (optional — leave as "General (all operations)" for a fallback rate that applies to any operation type without its own specific entry), Effective From (date, required), Rate (₦), Rate Unit, Notes. Filterable by Project and Operation Type.

Editing a project's own **Default Rate** (Projects tab) auto-logs a general (no-Operation-Type) entry here, same as before — add an Operation Type-specific entry manually here when a contract prices that operation differently, or when a rate is reviewed upward later and you need the old rate preserved for work already done under it. Provisional revenue (Profitability, Revenue Reconciliation) always looks up the operation-type-specific rate in effect on the report's date first, falling back to the project's general rate if none exists.

### Profitability tab (Admin/Accounts only)

The same screen also appears inside [Accounting & Expenses](#13-accounting--expenses) — see that section for the full breakdown of how revenue, cost, and margin are calculated. It's a read-only report; there's nothing to add or edit here.

### Revenue Reconciliation tab (Admin/Accounts only)

**Purpose:** two things that used to have no visibility at all — where a Daily Operations report's figures disagree with what a client-approved invoice actually verifies, and how much of what's been invoiced has actually been paid.

**Filters:** Project (or "All Projects"), From, To.

**Revenue Reconciliation table** — one row per Project × Operation Type combination that has activity in the selected range:
- **Reported Qty / Reported Revenue** — from Daily Operations reports, quantity × the contract rate that was in effect that day (Rate History tab). This is the **provisional** figure, available same-day, before any client involvement.
- **Invoiced Qty / Invoiced Revenue** — from invoice line items that carry the same Operation Type and whose invoice's Period overlaps the range. This is the **verified** figure, from what the client actually agreed to pay for.
- **Qty Variance / Revenue Variance** — the gap between the two, with a status pill: **OK** (within 2% or a small floor), **Minor Variance**, or **Variance** (flagged red) if the gap is larger. **No Invoice Yet** means nothing's been invoiced for that slice at all.

Only invoice lines with an **Operation Type** set can appear in this matrix (see the Sales & Invoicing section below) — older invoices, or ones not linked to a project, predate this and show up instead in a small "Unclassified / Legacy Invoices" note beneath the table, so their revenue isn't mistaken for a gap; it's already counted normally everywhere else (Profitability, Income & Expenditure).

**Payment Tracking table** — every invoice (optionally filtered to the selected project): Invoiced, Received, Outstanding, Status, and Aging (days past due, only shown for invoices that are overdue and not fully paid). Stat cards above it total Outstanding, Partially Paid, and Overdue counts. See the Sales & Invoicing section for how to log a payment.

This is a read-only report — nothing here can be added or edited directly; go to Sales & Invoicing to change an invoice or log a payment.

---

## 8. Daily Operations

**Who sees it:** Admin, Supervisor.

This is the field log book — one entry per piece of equipment per day, capturing what was worked, how much got done, fuel burned, and any site files.

**List screen:** a search box ("Search by site, block/plot, equipment, operator, or notes…"), stat cards (Total Area Cleared, Total Road, Total Trekking, Total Fuel Used, Total Downtime, Ongoing Sites, Reports Logged), and a table of every report. A Supervisor only sees rows from their own assigned project.

**"+ Log Daily Report"** is grouped into four blocks. In practice only about six things need typing — the rest is pre-filled or calculated.

**Who and where**

| Field | Notes |
|---|---|
| Date | required, defaults to today |
| Site / Project Name | dropdown of Projects; pre-fills to a Supervisor's own assigned project |
| Equipment Used | dropdown — only shows items whose Category is Heavy Equipment, Tools, or Vehicles |
| Operator | **pre-fills** with whoever last operated the dozer you selected — change it when someone else is on the machine |
| Supervisor | **pre-fills** with whoever is logged in |
| Block / Plot No. | optional free text — fill in only when the site actually has this subdivided |
| Client | optional — **pre-fills** with the client on that site's last report |

> All the pre-filling above happens only on a **new** report, and only from the most recent matching report. Editing an existing report always shows exactly what was saved. Nothing is invented — if there's no history for that dozer or site yet, the field simply stays empty.

**Hours**

| Field | Notes |
|---|---|
| Time In (Resumed) | also feeds the fleet's average resumption-time stat |
| Time Out (Closed) | also feeds the fleet's average close-time stat |
| Downtime Reason | — None —, Dozer Breakdown, Community Disturbance, Operator Delay / Infringement, or Other |
| Downtime (minutes) | a single box of total minutes — enter 90 for an hour and a half. (Stored as hours + minutes behind the scenes, so older reports still read correctly.) |
| Hours Worked | **calculates itself** the moment both Time In and Time Out are set — the shift span minus any Downtime. Handles a shift crossing midnight. Still editable, so you can type it by hand when times aren't tracked. ⚠ if left blank with no times entered, it silently saves as 0 rather than blocking the save. |

**Work done**

| Field | Notes |
|---|---|
| Operation Type | **pre-fills** from the last report for that dozer/site. Felling (Ha), Stacking (Ha), Direct Stacking (Ha), Root Picking (Ha), Bonding (Ha), Phase 1 (Ha), Phase 2 (Ha), Cross Cutting (Ha), Road (KM), or Trekking (hrs) |
| Quantity | the amount done, in whatever unit the chosen Operation Type uses — same "required label but silently saves as 0" caveat as Hours Worked |
| Status | Completed, Ongoing, or Halted (defaults to Completed) |

**Diesel** — all four calculate themselves; normally you don't touch this block at all.

| Field | Notes |
|---|---|
| Diesel Supplied (litres) | **auto-fills** from any matching Resource Management → Diesel Management → Site Distribution entry logged for this exact equipment/date/site |
| Opening Diesel (litres) | **auto-fills** as this dozer's last logged Closing Diesel (its most recent prior report) **+ today's Diesel Supplied** |
| Fuel/Diesel Used (litres) | **auto-calculates** as consumption rate × Hours Worked — see the rate note below |
| Closing Diesel (litres) | **auto-calculates** as Opening Diesel − Fuel Used. **This is the one worth overwriting** — put in a real tank dip whenever you have one, because the [Dozer Discrepancy Report](#10-resource-management) compares exactly this against the calculated figure to spot losses. It's also what the Diesel Replenishment Request treats as "what's currently in the tank". |

> **Diesel consumption rate.** The whole current fleet is D8K, so one set of rates applies across the board with nothing to configure per machine: **25 L/hr for the first 8 hours of a day, 20 L/hr for every hour after that**, and **20 L/hr flat for Trekking** (no 8-hour tiering — the machine is walking, not pushing). A future machine that burns differently can override this on its own Fleet Roster record via the three Diesel Consumption fields; leave those blank and the fleet default applies. To change the fleet-wide figures, edit `DEFAULT_DIESEL_RATES` in `erp/js/constants.js` — one place, and every calculation follows.

**Also on the form:** Work Type + Business Amount (₦) — **only appears if the selected equipment's Ownership is Partnership or Rented.** Choose "Office" for the normal, owner-shareable arrangement, or "Business" for a private arrangement that's never shown to the owner (and pays the operator an extra Business Amount for that day). See Dozer Economics (Fleet Management) and [Dozer Rent Payments](#10-resource-management) for how this splits downstream. Plus **Notes** (free text) and **KML Boundary File / Photos** — attach a `.kml` site-boundary file and/or photos, which automatically feed the Projects → Map View and Photo Gallery tabs.

Date, Site, Equipment, Operator, Supervisor, and Operation Type genuinely block saving if left blank; the rest do not (see the caveat above — fill them in anyway, since downstream stats depend on real numbers).

> **How Downtime "punishes" an operator:** there's no separate penalty step. Downtime minutes are simply subtracted from the auto-computed Hours Worked, and that same Hours Worked figure is what HR → Operator Allowance pays day-rate against and what Profitability charges as dozer cost — so logging downtime as, say, Operator Delay / Infringement automatically reduces that day's credited hours (and pay) with no extra step. The Downtime Reason itself is only an accountability label, for telling fault from no-fault situations afterward — every reason deducts the same way.

No print button on this screen.

---

## 9. Fleet Management

**Who sees it:** Admin, Supervisor.

Five tabs cover everything about the company's dozers, excavators, and vehicles: **Fleet Roster, Maintenance Log, Inventory & Equipment, Rate History, Dozer Economics.**

> **Diesel Tracking and Fueling Vouchers moved.** Both now live under [Resource Management → Diesel Management](#10-resource-management), alongside the Station Ledger and Site Distribution tabs they feed. Nothing about how they work changed — only where you find them.

### Fleet Roster tab

Stat cards: Fleet Size, Company Owned, Partnership, Rented, Down / Under Maintenance, Due for Service.

**Table columns:** Asset, Ownership, Owner, Status, Current Project, Rate/hr, Utilization (30d, Company-owned only), Avg Hrs/Day (30d), Avg Ha/Day (30d), Avg Resumption (30d), Avg Close (30d), Total Hours, Total Fuel, Last Maintenance, Next Service.

- **Utilization (30d)** = the fraction of the last 30 calendar days the asset actually worked — Company-owned only.
- **Avg Hrs/Day / Avg Ha/Day (30d)** = averaged only over days it actually worked in the last 30 (not all 30 calendar days), for every ownership type.
- **Next Service** shows hours accumulated since its last completed maintenance entry versus its Service Interval — flagged **Overdue** at ≥100% and **Due Soon** at ≥80%.

**"+ Add Fleet Asset" fields:**

| Field | Notes |
|---|---|
| Asset Name | required |
| Type | Heavy Equipment or Vehicle |
| Asset Tag / SKU / Dozer Code | required |
| Ownership | required — **Company** (company-owned and maintained, operators paid per day), **Partnership** (a 2nd-party owner; company pays a day-rate rental, keeps a management fee, still pays operators directly), or **Rented** (a 3rd-party owner who pays their own operators; company just pays a day rate) |
| Owner / Contractor Name | for Partnership/Rented |
| Status | Active, Under Maintenance, Idle, Down |
| Hourly Rate (₦) | internal cost/value used for project profitability |
| Rental Rate/Day (₦) | Partnership or Rented only |
| Management Fee/Day (₦) | Partnership only — retained from the rental rate |
| Diesel Consumption — First 8 hrs/day (L/hr) | **leave blank** unless this machine differs from the fleet — blank uses the fleet default of 25 |
| Diesel Consumption — After 8 hrs/day (L/hr) | **leave blank** unless this machine differs — blank uses the fleet default of 20 |
| Diesel Consumption — Trekking (L/hr, flat) | **leave blank** unless this machine differs — blank uses the fleet default of 20 |

> These three exist only to override a machine that burns differently from the rest of the fleet. Since every current dozer is a D8K, all three should stay blank and the fleet-wide rates apply automatically — nobody has to configure a dozer before Fuel Used will calculate on a daily report.
| Current Project | which project it's currently deployed to — feeds the Weekly Report tab's roster (a dozer also appears there for any project it has an operations report against, even without this field set correctly, but keeping it current is what makes an idle dozer show up as a zero-activity row instead of not appearing at all) |
| Location | required |
| Acquisition Value (₦) | |
| Service Interval (engine hours) | default 250 |

> Saving a new asset, or changing its rates, automatically logs an entry to the **Rate History** tab (an opening entry on creation; a new entry on edit only if a rate actually changed) — so historical costing always uses the rate that was really in effect at the time, not today's rate applied retroactively.

Deleting a fleet asset deletes the underlying inventory record — the Fleet Roster is really just Inventory & Equipment filtered down to Heavy Equipment and Vehicles. No print button on this tab.

### Maintenance Log tab

Stat cards: Total Maintenance Spend (all-time), This Month, Scheduled / In Progress.

**"+ Log Maintenance" fields:** Date, Dozer/Equipment, Type (Service / Repair / Inspection / Breakdown), Description, Parts Cost (₦), Labor Cost (₦), Performed By (a staff member, or leave blank and fill in an External Contractor / Vendor instead), Status (Completed / Scheduled / In Progress).

The record's total cost is always Parts Cost + Labor Cost added automatically — there's no separate "total" field to fill in. No print button.

### Inventory & Equipment tab

The master stock list of everything the company owns or holds: machinery, vehicles, tools, consumables, and safety gear. (Fleet Roster above is this same list, filtered to just Heavy Equipment + Vehicles.)

**"+ Add Item" fields:** Item Name, Category (Heavy Equipment, Vehicles, Tools, Consumables, Safety Gear, or Dozer Parts — the last two are really managed from [Resource Management](#10-resource-management), see there), SKU, Quantity, Unit, Unit Cost (₦), Reorder Level, Location, Current Project.

Rows where **Quantity ≤ Reorder Level** are flagged with an amber row highlight — your visual cue to reorder.

**Withdrawal Log — Tools, Safety Gear** (below the main item table): logging a withdrawal here auto-deducts the quantity from that item's stock — you don't edit Quantity by hand for a withdrawal. **"+ Log Withdrawal" fields:** Date, Item (only Tools/Safety Gear appear here — Heavy Equipment/Vehicles are fixed assets, and Dozer Parts/Consumables each have their own tracker under [Resource Management](#10-resource-management)), Quantity Withdrawn, Issued To (Staff), Equipment (optional, if used on a specific machine), Notes. Correct a mistaken withdrawal by **editing** it, not deleting it — deleting doesn't restore the stock.

No print button.

### Rate History tab (dozer rates)

A dated log of hourly-rate/rental-rate/management-fee changes per fleet asset. **"+ Log Rate Change"** fields: Equipment, Effective From, Hourly Rate (₦), Rental Rate/Day (₦), Management Fee/Day (₦), Notes. As with Projects' Rate History, entries are normally created automatically when you edit an asset's rates on the Fleet Roster — add one manually here to backdate a correction.

This "rate as of a date" system is what lets Profitability and Dozer Economics always use the rate that was *actually in effect* on each day worked, even after a rate has since changed.

### Dozer Economics tab

**Purpose:** dozer-level profitability and revenue analysis.

**Company-Owned Dozer Performance** (top of the tab, filterable by From/To dates): per Company dozer, Hours Worked, Downtime (days without a logged report — only computable with both dates set), % Optimization, Actual Revenue (estimated as hours worked × the rate in effect each day — clients are billed per project, not per machine, so this is always an estimate), Potential Revenue (what it *could* have earned working a full 8h every day in the period), Shortfall, Maintenance Cost, and Profit (estimated).

> Partnership owner accountability (settling what's owed to a Partnership dozer's outside owner) moved to [Resource Management → Dozer Rent Payments](#10-resource-management).

**Internal Ledger — Office vs Business** *(Admin only — Supervisors do not see this section at all, even though they can open this tab)*: every day logged against a Partnership or Rented dozer, both Office and Business, side by side, with Business Earnings totaled. This exists purely for internal audit of the "Business" arrangement — none of it ever appears in the owner-facing settlement (Resource Management → Dozer Rent Payments).

---

## 10. Resource Management

**Who sees it:** Admin, Accounts, Supervisor.

Four tabs: **Diesel Management, Bulldozer Parts & Supplies, Dozer Rent Payments, Lubricants & Consumables.** This is the home for diesel accountability from the filling station all the way down to an individual dozer, plus everything else that gets consumed or paid out against the fleet.

### Diesel Management tab

**Purpose:** a 3-level accountability chain that tracks diesel from a filling station relationship, through a project site's bulk tank, down to what an individual dozer actually burned — each level built from the same underlying receipts and daily reports rather than three separate ledgers, so logging a delivery or a report in one place automatically updates the others.

This tab has its own row of **five sub-tabs** beneath the main Resource Management tab bar: **Station Ledger, Site Distribution, Dozer Discrepancy Report, Diesel Tracking, Fueling Vouchers.** The first three are the accountability chain; the last two are the day-to-day records that feed it (both moved here from Fleet Management — unchanged apart from their location).

**Station Ledger (Level 1)** — a *prepay* relationship: you pay a filling station up front, and it owes back litres/funds as it supplies diesel over the following days. **"+ Log Prepayment" fields:** Date, Filling Station, Amount Paid (₦), Agreed Unit Price (₦/litre), Reference, Notes. A balances table shows, per station: Total Prepaid, Litres Purchased, Litres Supplied, Balance (Diesel), Balance (Funds), and Status (Fully Settled / Partially Settled / Outstanding). "Litres Supplied" comes from **Diesel Receipts** (the Diesel Tracking sub-tab) tagged with that station — there's nothing extra to log here once a receipt is tagged. Note the balance direction is the opposite of the existing Fuel Credit tab in Purchasing & Suppliers: there, a balance means *you* owe the station (credit collected, paid later); here, a balance means *the station* still owes *you* (paid up front, not yet fully supplied). Use whichever matches how a given station actually does business with you.

**Site Distribution (Level 2)** — each project's dump-tank stock. Opening + New Supply − Distributed = Closing, filterable by date range. "New Supply" comes from Diesel Receipts tagged with that Site/Project (same receipts as Level 1, just tagged with a project instead of/as well as a station). **"Distributed" is read straight from Daily Operations reports** — the sum of every report's Diesel Supplied field for that site in range — so it updates itself as field reports come in, with nothing extra to log. **"+ Log Distribution" fields:** Date, Site/Project, Dozer/Equipment, Litres Distributed, Distributed By, Notes — this is an optional accountability record (who physically handed diesel to which dozer); logging one also pre-fills that dozer's Daily Operations report for the same date/site with these litres, but it's the report itself, not this log, that the Distributed figure counts.

> Logging a distribution here is what auto-fills that dozer's **Diesel Supplied** field on its next matching Daily Operations report (same equipment, date, and site) — see [Daily Operations](#8-daily-operations).

**Dozer Discrepancy Report (Level 3)** — a read-only report, filterable by date range and dozer, built entirely from existing Daily Operations figures (nothing new to log here): Distributed, Used, Closing Expected (opening + supplied − used, recomputed the same way the Daily Operations form auto-fills it), Closing Reported (whatever was actually saved — a real tank dip if one overrode the estimate), and Discrepancy (Reported − Expected). Status is **OK**, **Minor Variance**, or **Variance** (flagged red once the gap exceeds roughly 2% of the expected figure, or 5 litres, whichever is larger) — this is the theft/leak signal: a real tank reading that doesn't match what the math says should be there.

#### Diesel Tracking sub-tab

Buttons: **+ Log Diesel Receipt**, **+ Log Stock Count**.

Stat cards: Total Received (All-Time), Total Issued (from Daily Logs), Expected Balance, and — once at least one physical count has been logged — Last Count Variance.

**"+ Log Diesel Receipt" fields:** Date, Litres Received, Unit Cost (₦/litre), Supplier, Filling Station (optional — draws down that station's prepayment balance), Site / Project (optional — replenishes that site's dump tank), Reference (PO #, waybill, etc.), Notes.

> Tagging a receipt with a **Filling Station** and/or **Site / Project** is what feeds the Station Ledger (Level 1) and Site Distribution (Level 2) sub-tabs — this same receipt is the single record used everywhere; there's no separate ledger to keep in sync.

**"+ Log Stock Count" fields:** Date, Counted Litres (the physical tank reading), Counted By, Notes.

Below the buttons, four sections:
1. **Diesel Receipts** — every delivery logged, filterable by **Station** and date range (From/To). **🖨 Print Report** produces a "DIESEL RECEIPTS REPORT" document listing exactly what's currently filtered — date, litres, unit cost, total cost, supplier, and reference for each receipt, plus a totals row — useful for reconciling directly with a specific filling station over a period.
2. **Stock Counts & Reconciliation** — every physical count, compared against what the records say *should* be in the tank as of that date, with a Variance pill (green if under 1 L off, amber if under 2% off, red if worse).
3. **Diesel Ledger by Asset** — filter by date range; shows each dozer's Opening / New / Used / Closing litre balances over that period. "New" comes from Fulfilled fueling vouchers issued to that asset; "Used" comes from its Daily Operations fuel figures; "Opening" is derived from everything before your start date — none of this is entered by hand.
4. **Diesel Replenishment Request — &lt;tomorrow's date&gt;** — for every fleet asset, shows **C. Diesel** (its most recent actual Closing Diesel reading from Daily Operations), **Tomorrow** (the top-up still needed on top of that), **Next Day** (the full amount needed the day after, assuming the tank is empty by then), **Total**, and **Status**. Two inputs — **Target Hrs — Tomorrow** and **Target Hrs — Next Day** (both default to 8) — let you adjust the planning assumption; a **Station** and **Staff (requested by)** dropdown feed the printed document. Click **🖨 Print Request** for a "DIESEL REQUEST" document itemized per asset with a total, ready to send for approval and on to the station. This is a planning estimate, not a confirmed work schedule.
>
> **How Tomorrow/Next Day are calculated:** each asset's own recent litres-per-hour rate (from its last 14 worked days) × your Target Hours, minus what's already in its tank (Tomorrow only — Next Day assumes a near-empty tank by then, so it's the full amount). An asset with no Closing Diesel reading yet is treated as having 0 in the tank. Assets that aren't currently Active always show 0/0/0.

> **Expected Balance** is always calculated, never typed in: total litres received (up to a date) minus total litres used on Daily Operations reports (up to that date).

#### Fueling Vouchers sub-tab

**Purpose:** an authorization slip a driver/operator takes to a filling station to get fuel on the company's account.

**"+ New Fueling Voucher" fields:** Date, Fuel Station (Midejab Ltd, SK Gold, Asolak Ltd, Iloamachi Ltd, Total Enugu, Akuebuolo Ltd, Kabir Ltd), Project, Dozer/Equipment, Litres Requested, Estimated Cost (₦), Requested By, Status (Pending Approval / Approved / Rejected / Fulfilled), Approved By, Notes, Receipts / Photos.

A voucher only counts toward the Diesel Ledger's "New" litres once it's marked **Fulfilled**. Approving or rejecting a pending voucher is normally done from the [Approvals inbox](#14-fund-requests--approvals) rather than from here.

**Print** (🖨 on any row) produces a "FUELING VOUCHER" document to hand to the station attendant, with signature lines for Requested By, Approved By, and Station Attendant.

### Bulldozer Parts & Supplies tab

**Purpose:** the spare-parts store room — what's in stock, reorder thresholds, and a log of every part taken out to service a specific dozer. (Behind the scenes, the parts catalog is really the same Inventory & Equipment list, tagged with Category = "Dozer Parts.")

**"+ Add Part" fields:** Part Name, Part Number / SKU, Current Stock, Unit, Unit Cost (₦), Reorder Level, Storage Location. Rows at or below Reorder Level are flagged amber.

**"+ Log Withdrawal" fields:** Date, Part (its dropdown shows current stock right in the label), Quantity Withdrawn, Dozer / Equipment, Withdrawn By, Notes.

> **This is one of the few places in the app where stock deducts itself automatically.** Logging a withdrawal immediately reduces that part's stock count by the quantity withdrawn — you never edit the stock number by hand for a withdrawal. If you need to correct a withdrawal you logged by mistake, **edit it** rather than deleting it: editing correctly restores the old quantity and re-applies the corrected one, while deleting a withdrawal record does *not* put the stock back.

No print button.

### Dozer Rent Payments tab

**Purpose:** Partnership owner accountability — settling what's owed to a Partnership dozer's outside owner. (Company-owned dozer profitability and the internal Office/Business ledger stay on Fleet Management → Dozer Economics.)

A per-dozer summary (Total Generated, Management Retained, Repairs Cost, Already Paid, Balance Owed — red if still owed), then a full settlement history.

**"+ New Settlement" fields:** Partnership Dozer, Period Start, Period End, Days Worked (Office days only), Rental Rate/Day (₦), Management Fee/Day (₦), Repairs Cost (₦), Amount Paid to Owner (₦), Notes — plus a live-updating **Balance Owed to Owner** preview, and a **↻ Fill Days, Repairs & Rates from Records** button that auto-computes Days Worked, Repairs Cost, and the historically-correct rates for you (requires the dozer and both dates set first).

> **The Office/Business split matters here:** "Days Worked" only counts days logged as **Office** work type in Daily Operations. Any day logged as **Business** never appears in this settlement — it's excluded entirely, by design, since it's a private arrangement never meant to be shown to the outside owner (see the Internal Ledger on Fleet Management → Dozer Economics for where Business days actually show up).

**Balance Owed** = (Days Worked × Rental Rate/Day) − (Days Worked × Management Fee/Day) − Repairs Cost − Amount Paid to Owner.

**Print** produces a "DOZER OWNER SETTLEMENT STATEMENT" the owner can be shown directly, with signature lines for Prepared By and Owner Acknowledgement.

### Lubricants & Consumables tab

**Purpose:** engine oil, grease, hydraulic fluid, and other consumables — stock levels and a per-dozer withdrawal/utilization log, kept separate from Fleet Management's Tools/Safety Gear withdrawal log. (Behind the scenes, this catalog is really the same Inventory & Equipment list, tagged with Category = "Consumables.")

**"+ Add Item" fields:** Item Name, SKU, Current Stock, Unit, Unit Cost (₦), Reorder Level, Storage Location. Rows at or below Reorder Level are flagged amber.

**"+ Log Withdrawal" fields:** Date, Item (its dropdown shows current stock right in the label), Quantity Withdrawn, Issued To (Staff), Equipment (optional, if used on a specific dozer), Notes.

> As with Bulldozer Parts, logging a withdrawal here deducts stock automatically. Correct a mistake by **editing** it, not deleting it — deleting doesn't restore the stock.

No print button.

---

## 11. Sales & Invoicing

**Who sees it:** Admin, Accounts.

Two tabs: **Invoices** and **Customers.**

### Invoices tab

Table: Invoice #, Customer, Project, Date, Due, Total, Status, actions. Any invoice that isn't fully **Paid** and is past its Due Date is flagged with a red row highlight.

**"+ New Invoice" fields:** Customer (required), Project (optional), Invoice Date, Due Date, and one or more **Line Items** (Description, Qty, Price/Unit — "+ Add Line" for more than one). **Status is no longer set by hand** — it's computed automatically from payments logged against the invoice (see "Log a Payment" below): Unpaid, Partially Paid, or Paid.

> **When a Project is linked**, two things appear that don't for a freeform invoice: a **Period Start / Period End** (the measurement window this invoice verifies), and an **Operation Type** dropdown on every line item — both required. This is what lets the Revenue Reconciliation tab on the Projects screen automatically match this invoice against Daily Operations reports for the same project, operation type, and period. Non-project invoices skip both and stay freeform, same as before. Picking an Operation Type also fills that line's **Price/Unit** from the project's contract rate for that operation type as of the invoice's Period Start (Projects → Rate History) — only when Price/Unit is still blank, so it never overwrites a price you've already typed.

**Log a Payment (💰 button on the invoices table):** opens a window showing the invoice's payment history (Date, Amount, Method, Reference, Notes — editable/deletable) plus a form to log a new one. Every add/edit/delete immediately recomputes the invoice's Status: 0 received → Unpaid, something but less than the total → Partially Paid, the full total or more → Paid.

**Print** produces an "INVOICE" (or "RECEIPT" with a PAID stamp, once Status is Paid) letterhead: dates, project, a "Bill To" block, every line item, total, and signature lines for Authorized Signature and Customer Signature.

### Customers tab

**"+ Add Customer" fields:** Company / Customer Name, Contact Person, Phone, Email, Address.

---

## 12. Purchasing & Suppliers

**Who sees it:** Admin, Accounts.

Three tabs: **Purchase Orders, Suppliers, Fuel Credit.**

### Purchase Orders tab

Table: PO #, Supplier, Date, Total, Status, actions.

**"+ New Purchase Order" fields:** Supplier (required), Order Date, Item Description, Quantity, Unit Price (₦), **Restocks Inventory Item** (optional), Status (Pending / Received). Like invoices, a PO currently holds one line item; Total = Quantity × Unit Price.

> If you link a PO to an Inventory item, marking it **Received** automatically adds the PO's quantity to that item's stock — you don't update it separately. Changing it back to Pending (a correction) subtracts the same quantity back out. Leave the link blank for services or one-off spend that was never going to touch inventory.

**Print** produces a "PURCHASE ORDER" document with signature lines for Authorized Signature and Supplier Signature.

### Suppliers tab

**"+ Add Supplier" fields:** Supplier Name, Contact Person, Phone, Email, Address.

### Fuel Credit tab

**Purpose:** tracks diesel/PMS the company collects on credit from filling stations, so the office always knows what's owed to each one.

**Filter:** Station dropdown. Stat cards: Total Owed Across All Stations, Stations With a Balance. A **Station Balances** table shows each station's total collected, total paid, balance owed, and status (Fully Settled / Partially Settled / Outstanding).

**"+ Log Collection" fields:** Date, Filling Station, Fuel Type (Diesel / PMS), Litres Collected, Unit Price (₦/litre), Reference, Notes.

**"+ Log Payment" fields:** Date, Filling Station, Amount Paid (₦), Reference, Notes.

> There is no stored "balance" anywhere — every balance is recalculated live from every collection and payment on record: **Balance = Total Collected − Total Paid.** Deleting or editing an old entry recalculates the balance automatically; there's no separate reconciliation step to run.
>
> **This is the collect-now, pay-later direction** (balance owed *by* the company). If a station instead requires payment up front and supplies diesel afterward, use the separate Station Ledger under [Resource Management → Diesel Management](#10-resource-management) instead — the two can coexist per station, whichever matches how that station actually does business with you.

No print button.

---

## 13. Accounting & Expenses

**Who sees it:** Admin, Accounts.

Four tabs: **Expenses, Income & Expenditure, Profitability, Loans.**

### Expenses tab

Stat cards: Total Revenue (Paid) — only counts invoices explicitly marked Paid — Total Expenses, Net Position.

A bar chart, **Expenses by Category**, plus a search box (matches description, category, payee, paid by, project, or equipment).

**"+ Add Expense" fields:**

| Field | Notes |
|---|---|
| Date | required |
| Category | required — Fuel, Maintenance, Payroll, Logistics, Administration, Bull Dozer Rentals, Mobilization & Demobilization, Salary and Allowance, Labour, MSc, M&E, IMPREST, Other |
| Description | required |
| Amount (₦) | required |
| Paid To / Recipient | optional |
| Paid By | required |
| Project | optional — links this expense into that project's Profitability cost |
| Equipment | optional — for per-dozer cost tracking |

> **Category names matter more than they look.** "Fuel," "Logistics," and "Payroll" are read by name elsewhere in the system: Fuel and Logistics feed the Profitability cost split, and "Payroll" is written automatically whenever a Payroll or Operator Allowance run is marked Paid. Don't rename those three categories.

No print button on this tab.

### Income & Expenditure tab

**Purpose:** a single consolidated cash-flow report — company-wide income and expenditure in one place, filterable by project, period, type, and cost head.

**Filters:** Project, Type (Income & Expenditure / Income Only / Expenditure Only), Cost Head, From, To.

**Stat cards:** Total Income, Total Expenditure, Net Position — all recalculated for whatever you've currently filtered to.

> **This report auto-assembles itself from four sources — you don't build it by hand:**
> 1. Every **Paid** or **Partially Paid** invoice → Income, Cost Head "Invoicing / Sales", for the amount actually **received** so far (not the full invoice total if it's only partially paid). Unpaid invoices never appear here.
> 2. Every **Expense** record → Expenditure, grouped by its own Category.
> 3. Every fund request that's **Approved** or **Paid** → Expenditure, grouped by its Cost Head (Pending/Draft/Rejected fund requests are excluded — only money that's been approved or actually disbursed counts).
> 4. **Manual Entries** you add directly on this screen — for anything that isn't one of the three above, like a loan received, an equity injection, or interest income.

**"+ Add Manual Entry" fields:** Date, Type (Income / Expenditure), Project, Cost Head (Invoicing / Sales, Loan / Advance, Equity Injection, Interest Income, Other Income, or any Expense category), Amount (₦), Description, Notes.

Only Manual Entry rows have an Edit/Delete action in the table — rows sourced from invoices, expenses, or fund requests show "—" and must be changed at their original screen instead.

No print button.

### Profitability tab

**Purpose:** whether each project is actually profitable — revenue earned versus the real cost of the dozers, diesel, and other spend behind it. (The identical screen also appears inside [Projects](#7-projects).)

**Filters:** Project (or "All Projects"), From, To, and **Group By** (Project / Dozer / Supervisor / Date / Week / Block).

**Group By: Project** (the default) behaves exactly as before — see the two views below.

**Group By: Dozer / Supervisor / Date / Week / Block** shows a table with Area Cleared and **Revenue (Provisional)** — quantity × the contract rate in effect that day, straight from Daily Operations reports, the same same-day figure the Revenue Reconciliation tab calls "Reported Revenue." Dozer Cost and Diesel Cost still show (they're per-report-row figures), but **Logistics Cost, Other Cost, Total Cost, and Profit always show "—"** at these groupings — clients invoice against a measured project period, never against an individual dozer, supervisor, date, or block, so verified revenue and project-level expenses genuinely can't be split this finely. Use Group By: Project for a real Total Cost/Profit number.

**All Projects view (Group By: Project, "All Projects"):** a "Profit by Project" bar chart, and a table per project — Area Cleared (ha), Provisional Revenue, Verified Revenue, Dozer Cost, Diesel Cost, Logistics Cost, Other Cost, Total Cost, Profit, Margin (%), Verified Revenue/ha.

**Single project view (Group By: Project, one project selected):** stat cards (Area Cleared, Provisional Revenue, Verified Revenue, Total Cost, Profit, Margin, Verified Revenue/ha, Cost/ha, Diesel Used), a Cost Breakdown chart, and — if the project has an **Expected Rate/Day** set (Projects tab) — a **Weekly Productivity** table comparing actual hectares cleared per week against that target.

> **How the numbers are actually built — read this once, it explains a lot of "why doesn't this match" questions:**
> - **Area Cleared** only counts Ha-unit operation types (Felling, Stacking, Direct Stacking, Root Picking, Bonding) — Road (KM) and Trekking (hrs) are deliberately excluded so they don't distort a hectares total.
> - **Dozer Cost** = for every operation logged, hours worked × the hourly rate **that was actually in effect on that day** (from Fleet Management's Rate History) — not today's rate applied backward.
> - **Diesel Cost** = litres used × the diesel price **in effect on that day** (from the most recent Diesel Receipt on or before that date, or the current inventory cost if no receipt exists yet).
> - **Provisional Revenue** = quantity × the contract rate in effect that day **for that report's Operation Type** (Rate History), summed across every Daily Operations report logged for the project — a same-day figure, available the moment a report is submitted, whether or not it's been invoiced yet. This is the number to check if an active project shows ₦0 Verified Revenue but real work has clearly gone in — it means the work hasn't been invoiced yet, not that nothing happened. **Trekking always contributes ₦0** here — it's repositioning time between sites/blocks, not billable production, even if a general fallback contract rate happens to be on file for the project.
> - **Verified Revenue** = every Invoice explicitly tagged to that project on the Sales screen, **regardless of whether it's Paid or Unpaid**. (This is different from Accounting & Expenses' "Total Revenue (Paid)" stat card, which only counts Paid invoices — so don't be surprised if the two numbers don't match; Profitability's Verified Revenue also includes work that's been invoiced but not yet collected.)
> - **Logistics Cost** = expenses tagged to the project with category "Logistics."
> - **Other Cost** = every other expense tagged to the project, **except** "Fuel" — Fuel-category expenses are deliberately left out here, because Diesel Cost above is already computed from actual litres used, and adding Fuel expenses too would double-count the same diesel spend.
> - **Profit** = Verified Revenue − (Dozer + Diesel + Logistics + Other). **Margin** = Profit ÷ Verified Revenue. Both are always based on Verified Revenue, never Provisional — see the Fixed Constraint note under Revenue Reconciliation for why the two can't be mixed into one profit figure.

This is a read-only report — nothing here can be added or edited directly.

### Loans tab

**Purpose:** everything the company has borrowed — from banks, directors, investors, or cooperatives — with terms, computed interest, and repayment status in one place.

**Stat cards:** Total Outstanding, Total Interest Accrued, Loans Overdue.

**"+ Add Loan" fields:** Category (Bank Loan / Director-Personal Loan / Investor Loan / Cooperative-Society Loan / Other), Lender / Source, Date Taken, Principal (₦), **Interest Type** — which changes what shows next:

- **Fixed** — Interest Rate (%, informational only), Interest Basis (Flat / Per Annum / Per Month, also informational), and **Total Repayable (₦)** entered directly as agreed with the lender. This tab is a *tracker* for fixed loans, not an amortization calculator — it doesn't derive compounding or day-count interest itself, since a real loan agreement already states the figure.
- **Turnover-Based / Profit-Based** — for money channeled into operations and repaid as a share of what it helped generate. Linked Project (or leave as "Company-wide"), Interest Percentage (%), and an Evaluation Period (Start/End). Interest is **computed automatically**: your percentage × that project's (or the whole company's) turnover or profit for the period, the exact same figures Profitability produces. A **Manual Interest Override (₦)** field, if set, replaces the computed figure entirely — useful if the assessed amount is disputed or needs a manual correction; the loan row shows "(override)" next to the Interest figure whenever one is active.

Every loan also has a **Due Date** (next repayment or review date) and a **Status** (Active / Partially Repaid / Repaid / Restructured / Defaulted / Written Off) — Status is set by hand, not computed, since default/write-off/restructure decisions are judgment calls; Repaid/Outstanding amounts stay accurate regardless of which Status is chosen.

**Log a Repayment (💰 button on the loans table):** same pattern as invoice payments — a window showing that loan's repayment history (Date, Amount, Method, Reference, Notes — editable/deletable) plus a form to log a new one. Outstanding recalculates immediately; nothing on the loan record itself needs updating.

**Overdue loans** (Due Date passed with a real balance outstanding) highlight red in the table and surface on the **Dashboard's Executive Alert Center** (Critical tier), the same trigger mechanism used for overdue invoices, overdue maintenance, and pending approvals elsewhere in this app.

**Print** produces a "LOAN STATEMENT" document: terms, a Principal/Interest/Total Owed breakdown, the full repayment history, and the outstanding balance.

---

## 14. Fund Requests & Approvals

**Who sees it:** everyone. **Approvals tab is only visible to Admin and Supervisor.**

Two tabs: **Requests**, **Approvals.**

### Requests tab

**Purpose:** where any staff member asks for company funds, with the payee's bank details attached, and where the request's status is tracked.

Search box and a Status filter (All / Pending / Approved / Rejected / Paid). Stat cards: Total Requests, Pending Approval, Pending Amount.

**"+ Submit Fund Request" fields:**

| Field | Notes |
|---|---|
| Date | required |
| Project | optional |
| Submitted By | defaults to you |
| Cost Head | for Income & Expenditure reporting — any Expense category |
| Description | free text |
| Line items | one or more rows of: Description, Amount (₦), Account Name, Account Number, Bank — click **+ Add Line** for more than one payment in the same request |
| Status / Approved By | **only editable if you're an Admin** — everyone else sees these as read-only text: "&lt;Status&gt; — only an Admin can approve or reject a fund request." |
| Receipts / Photos | attach supporting documents |

**Total Amount** is calculated live from the line items as you type.

**Print** produces a "FUND REQUEST" voucher with the line items, total, and signature lines for Submitted By and Approved By.

> **Who can see which requests (this matters — it's not a bug if you can't see a colleague's request):**
> - **Admin / Accounts** see every fund request.
> - **Supervisor** sees only requests tagged to their own assigned project.
> - **Staff** see only their own submitted requests.

### Approvals tab (Admin, Supervisor only)

**Purpose:** one combined inbox of everything currently waiting on a decision — pending Fund Requests, pending Leave Requests, and pending Fueling Vouchers — pulled from three different modules so you don't have to check each one separately.

Stat cards: Total Pending, Fund Requests, Leave Requests, Fueling Vouchers.

For each row you get **Approve** and **Reject** buttons (Reject asks you to confirm first), plus a **🖨 Print** button for Fund Requests and Fueling Vouchers (Leave Requests have no print document).

> **Only Admin ever sees Fund Requests in this inbox** — a Supervisor's Approvals tab will show pending Leave Requests and Fueling Vouchers from their own project, but never a fund request (even though the tab itself is visible to them). Approving or rejecting here directly updates the underlying record and records **you** (whoever clicks the button) as the decision-maker. There is no "mark as Paid" here — once a fund request is Approved, moving it on to Paid still requires editing it directly on the Requests tab (Admin only).

---

## 15. HR & Employees

**Who sees it:** Admin only.

Six tabs: **Employees, Memos & Notices, Query / Commendation, Assets Tracker, Payroll, Operator Allowance.**

### Employees tab

The master staff roster.

**"+ Add Employee" fields, in order:**

| Field | Notes |
|---|---|
| Full Name | required |
| Job Role | required, free text |
| Department | required — Operations, Finance, Human Resources, Maintenance, Administration |
| Phone | |
| Email | |
| Monthly Salary (₦) | feeds the office **Payroll** tab |
| Day Rate (₦) | for dozer operators paid per day instead of a monthly salary — feeds **Operator Allowance** |
| Date Hired | |
| Annual Leave Entitlement (days/year) | defaults to 21 — drives leave-balance math on Leave & Attendance |
| Status | Active, Suspended, or Disengaged — defaults to Active |
| ERP Access Level | Admin / Accounts / Supervisor / Staff — defaults to Staff |
| Assigned Project | restricts what a **Supervisor** (or Staff/Accounts submitting requests) sees to just this project — see the tier notes throughout this manual |

### Memos & Notices tab

General formal written correspondence — memos, notices, warning letters, query letters, commendation letters, confirmation letters, or "Other."

**"+ New Memo / Notice" fields:** Date, Document Type, Addressed To (a specific employee, or leave blank for "All Staff"), Subject, Body, Issued By.

**Print** produces a letterhead titled with the document type (e.g. "QUERY LETTER"), the subject and body, and signature lines for Issued By and Received By.

### Query / Commendation tab

**Purpose:** a quick shortcut for issuing a Query (disciplinary) or Commendation (praise) letter to one named staff member, without filling out the full Memos form.

**"+ Issue Query / Commendation" fields:** Date, Type (Query or Commendation), Staff Member (required — unlike the general Memos form, this one isn't optional here), Subject, Reason / Details, Issued By.

> Query and Commendation letters are **not a separate system** — they're saved into the exact same list as Memos & Notices, just filtered to show only those two types on this tab. Editing one from the Memos tab and changing its Document Type will move it in or out of this view accordingly. Printing here produces the identical letterhead document as the Memos tab.

### Assets Tracker tab

**Purpose:** a register of movable company property that isn't part of the dozer fleet — furniture, electronics, generators, and the like — tracking where it currently lives.

**"+ Add Asset" fields:** Asset Name, Category (free text, e.g. Furniture, Electronics, Generator), Serial / Tag Number, Assigned To (A Project / A Staff Member / Unassigned–General Use), Project (if assigned to a project), Staff Member (if assigned to a person), Date Assigned, Status (Deployed / Returned / Damaged / Lost), Notes.

No print button.

### Payroll tab

**Purpose:** generates monthly salary payroll for every Active employee, starting from their HR salary, with room to add a bonus or deduction before finalizing.

Stat cards: Payroll Runs, Draft Runs, Total Paid (All Time).

**"+ New Payroll Run":** pick a **Pay Period** (month) and **Status** (Draft / Approved / Paid). Every Active employee is automatically added as a line, pre-filled with their HR salary as **Base Salary** — you can then adjust **Bonus** and **Deductions** per person; **Net Pay** (Base + Bonus − Deductions) recalculates live. Use the **"+ Add an employee to this run"** dropdown to bring in anyone missing, and the ✕ icon to drop someone from just this run.

**Print (per row in the runs table)** produces a **Payroll Register** — everyone on that run, with a grand total, signed "Prepared By" / "Approved By." **Print (per line, inside the edit form)** produces one employee's individual **Payslip**.

> **Marking a run "Paid" automatically creates a matching entry in Accounting & Expenses** (Category "Payroll," amount = the run's total net pay) — this only happens once per run, even if you edit it again afterward.

### Operator Allowance tab

**Purpose:** a separate payroll system for field dozer operators paid **per day actually worked** (8 hours = 1 day) plus overtime, computed straight from Daily Operations records rather than typed in.

Stat cards: Day-Rate Runs, Draft Runs, Total Paid (All Time).

**"+ New Day-Rate Run":** set **Period Start**, **Period End**, an **Overtime Rate (₦/hr, after 8h/day)** (defaults to ₦10,000), and Status. Unlike office Payroll, this starts **empty** — add operators one at a time via the **"+ Add an operator to this run"** dropdown, which immediately pulls their Days, Overtime Hours, and Business earnings from the field records for the chosen dates. Use **"↻ Recompute All from Records"** any time to refresh every line from the underlying data (this overwrites any hand-edits to Days/OT/Business).

> **How pay is actually computed:**
> - Only equipment owned by **Company** or **Partnership** counts toward normal day-rate pay — a **Rented** dozer's operator is paid by the equipment owner directly, so those hours are excluded here.
> - **Days Worked is fractional, not a flat 1.0 per day worked** — for each date, `min(hours, 8) ÷ 8` counts as that day's fraction, and anything over 8 hours becomes Overtime.
> - **Business Earnings** are summed from every "Business" work-type entry for that operator, regardless of the equipment's ownership category, since it's the operator's own side arrangement.
> - **Net Pay = (Days Worked × Day Rate) + (Overtime Hours × Overtime Rate) + Business Earnings − Deductions.**

An **Operator Balances** table at the bottom flags anyone still owed money (or overpaid) across every run that's Approved or Paid — Draft runs don't count toward this balance.

**Print** works the same as office Payroll: a Register per run, or an individual Payslip per line.

---

## 16. Leave & Attendance

**Who sees it:** everyone.

Two tabs: **Leave Requests, Attendance.**

### Leave Requests tab

**Your Leave Balance** stat card shows your remaining days for the year (Entitlement − Used, where "Used" only counts leave requests that are **Approved** and started this calendar year — Pending or Rejected requests never reduce your balance).

**"+ Apply for Leave" fields:** Employee (defaults to you), Leave Type (Annual, Sick, Casual, Compassionate, Unpaid), Start Date, End Date, Reason, Status, Approved By.

A **Leave Balances table** (visible to Admin/Supervisor only) shows every relevant employee's Entitlement, Used, and Remaining — a Supervisor sees only staff on their own assigned project.

> Normal decisions on a leave request should be made from the [Approvals inbox](#14-fund-requests--approvals), which correctly records who actually approved it. Who can *see* a request follows the same rule as fund requests: Admin/Accounts see all, a Supervisor sees their project's staff, Staff see only their own.

No print button for leave requests.

### Attendance tab

Simple daily clock-in/clock-out, with GPS location captured automatically where your device allows it.

- Pick an **Employee** and, optionally, a **Project / Site**, then click **Clock In**. You can't clock in twice the same day — the app blocks it and tells you your existing clock-in time.
- Click **Clock Out** later the same day (you must have clocked in first).
- Each clocked time shows a 📍 icon if location was captured — click it to open that location in Google Maps.

Attendance times **cannot be edited** through the app — clicking Edit just tells you to ask your site supervisor for a correction. Only deleting a record is possible.

---

## 17. Backup & Data

**Who sees it:** Admin only.

Everything in this ERP lives in one shared, central database — not on any one device — so everyone always sees the same, current data. This screen is your safety net against accidental data loss.

- **⬇ Download Backup** — downloads every record in the entire system as one JSON file. Do this regularly (the Dashboard nudges you if it's been more than 7 days).
- **Restore from a Backup** — choose a previously downloaded file and click **Restore This File** to replace **every record in the shared database, for the whole company, on every device** with that file's contents. You'll be asked to confirm twice. **This cannot be undone** — only restore a backup if you're certain, and ideally after downloading a fresh backup of the current state first, in case you need to go back.

---

## 18. Step-by-Step Workflows

### Onboard a new employee
1. Go to **HR & Employees → Employees → + Add Employee**.
2. Fill in Full Name, Job Role, Department, contact details.
3. Set **Monthly Salary** (office staff) or **Day Rate** (dozer operators), whichever applies.
4. Set **ERP Access Level** based on their role (see [Access Tiers](#3-access-tiers--who-can-see-what)).
5. If they're a Supervisor (or any tier whose visibility should be limited to one job), set **Assigned Project**.
6. **Separately, have whoever administers the underlying system set up their actual login** (a username and an initial password, linked to this employee record) — adding someone in HR & Employees on its own does **not** give them the ability to log in. Once that's done, give them the username and password and ask them to use **Change Password** on first login.

### Log a day's work in the field
1. Go to **Daily Operations → + Log Daily Report**.
2. Fill in Date, Site/Project, Equipment, Operator, Supervisor.
3. Enter Hours Worked, Operation Type, Quantity, Fuel Used.
4. If the equipment is Partnership/Rented, choose Work Type (Office or Business).
5. Attach any KML boundary file or site photos — these will automatically show up under **Projects → Map View / Photo Gallery**.

### Submit and approve a fund request
1. Requester: **Fund Requests & Approvals → Requests → + Submit Fund Request**, fill in the line items with payee bank details, submit.
2. Approver (Admin or Supervisor): go to **Fund Requests & Approvals → Approvals**, find the request, click **Approve** or **Reject**.
3. Once Approved, an Admin can move it on to **Paid** by editing the request directly on the Requests tab and changing Status.

### Run monthly office payroll
1. **HR & Employees → Payroll → + New Payroll Run.**
2. Pick the Pay Period. Every Active employee is added automatically with their HR salary as Base Salary.
3. Adjust Bonus/Deductions per person as needed.
4. Set Status to **Paid** once finalized — this automatically posts a matching Expense record.
5. Print the Payroll Register for your records, or print individual payslips per employee.

### Run dozer operator day-rate pay (Operator Allowance)
1. **HR & Employees → Operator Allowance → + New Day-Rate Run.**
2. Set Period Start/End and the Overtime Rate.
3. Add each operator via the dropdown — their Days, OT Hours, and Business earnings pull in automatically from Daily Operations.
4. Adjust Deductions if needed, then set Status to Paid when finalized.
5. Check the **Operator Balances** table periodically for anyone still owed money from a past run.

### Track and settle a Partnership dozer owner
1. Set the dozer's Ownership to **Partnership** on **Fleet Management → Fleet Roster**.
2. Log each day's work in Daily Operations as normal, choosing **Office** or **Business** as the Work Type.
3. When it's time to settle: **Resource Management → Dozer Rent Payments → + New Settlement**, choose the dozer and period, click **↻ Fill Days, Repairs & Rates from Records**, review, then save.
4. Print the settlement statement to hand to the owner.

### Order and track dozer parts
1. Add the part to the catalog: **Resource Management → Bulldozer Parts & Supplies → + Add Part.**
2. When a part is used on a job: **+ Log Withdrawal**, pick the part, quantity, and which dozer it went into — stock deducts automatically.
3. Watch for amber-highlighted rows in the catalog (at or below Reorder Level) to know what to reorder.

### Restock inventory from a Purchase Order
1. **Purchasing & Suppliers → Purchase Orders → + New Purchase Order.**
2. Fill it in as normal, and set **Restocks Inventory Item** to the item this order is for (leave it blank if the order isn't for stocked inventory — a service, a one-off).
3. When the order arrives, edit it and set **Status** to **Received** — the item's stock updates automatically.

### Log a tool withdrawal
1. **Fleet Management → Inventory & Equipment → + Log Withdrawal** (below the main item table).
2. Pick the item (Tools/Safety Gear only), quantity, and who it was issued to — stock deducts automatically.
3. If you logged one by mistake, edit it rather than deleting it, so the stock correction actually happens.

### Log a consumable withdrawal (oil, grease, hydraulic fluid, etc.)
1. **Resource Management → Lubricants & Consumables → + Log Withdrawal.**
2. Pick the item, quantity, and who it was issued to (and which dozer, if relevant) — stock deducts automatically.
3. If you logged one by mistake, edit it rather than deleting it, so the stock correction actually happens.

### Track diesel from a station down to a dozer
1. **Station Ledger:** when you prepay a station, log it under **Resource Management → Diesel Management → Station Ledger → + Log Prepayment.**
2. As deliveries arrive, log them under **Resource Management → Diesel Management → Diesel Tracking → + Log Diesel Receipt**, tagging the **Filling Station** it came from and, if it's going straight to a site's bulk tank, the **Site / Project** too — this single receipt is what draws down the Station Ledger balance and feeds the site's stock.
3. **Site Distribution:** the Distributed figure on this tab already tracks itself from every Daily Operations report's Diesel Supplied field for that site — nothing to log here for it to count. Optionally, log it under **Resource Management → Diesel Management → Site Distribution → + Log Distribution** first if you want an accountability record of who handed it over; this auto-fills that dozer's Diesel Supplied field the next time a matching Daily Operations report is logged (same equipment, date, and site).
4. **Dozer Discrepancy Report:** periodically check **Resource Management → Diesel Management → Dozer Discrepancy Report** for any dozer whose actual tank reading (a physical dip, saved as Closing Diesel on a Daily Operations report) doesn't match what the numbers say it should be — that gap is your signal to investigate.

### Back up the company's data
1. **Backup & Data → ⬇ Download Backup**, at least weekly.
2. Store the downloaded file somewhere safe outside the app (e.g. a shared drive).
3. Only use **Restore This File** in a genuine emergency — it overwrites everyone's data everywhere, with no undo.

---

## 19. Glossary

| Term | Meaning |
|---|---|
| **Ownership (Company / Partnership / Rented)** | **Company**: owned and maintained by Emagrims, operators paid per day worked. **Partnership**: owned by a 2nd party; Emagrims pays a day-rate rental and keeps a management fee, but still pays the operators directly. **Rented**: owned by a 3rd party who pays their own operators; Emagrims just pays a day rate. |
| **Office vs. Business (Work Type)** | Only relevant for Partnership/Rented equipment. **Office** = the normal, formal arrangement shared with the owner. **Business** = a private arrangement, visible only to Admin in Dozer Economics' Internal Ledger, and always excluded from owner settlements (Resource Management → Dozer Rent Payments). |
| **Station Ledger vs. Fuel Credit** | Two different directions a filling-station relationship can run. **Fuel Credit** (Purchasing & Suppliers): collect diesel/PMS on credit, pay the station later — a balance means the company owes the station. **Station Ledger** (Resource Management → Diesel Management): pay the station up front, it supplies diesel afterward — a balance means the station owes the company. Both can be used, station by station, whichever matches the real arrangement. |
| **Site Dump Tank** | A project's own bulk diesel stock (Resource Management → Diesel Management → Site Distribution): Opening + New Supply (receipts tagged to that site) − Distributed (handed to individual dozers) = Closing. |
| **Closing Diesel Expected vs. Reported** | On the Dozer Discrepancy Report: **Expected** is opening + supplied − used, recomputed from the numbers; **Reported** is whatever was actually saved as Closing Diesel on a Daily Operations report (a real tank dip, if one overrode the computed estimate). A gap between the two is a discrepancy worth investigating. |
| **Ha-unit operation types** | Felling, Stacking, Direct Stacking, Root Picking, Bonding — measured in hectares. Road is measured in KM, Trekking in hours; both are excluded from "hectares cleared" totals everywhere in the app. |
| **Rate History / "as of a date"** | Every rate that matters (dozer hourly rate, project rate, diesel price) is tracked with an effective date. Reports always use whichever rate was in effect on the actual day the work happened — never today's rate applied backward to old work. |
| **Cost Head** | The category a cost or income item is grouped under for the Income & Expenditure report — the same list as Expense Categories, plus a few income-only categories. |
| **Assigned Project** | Set per employee in HR. For Supervisors, this scopes almost everything they see (Daily Operations, Fund Requests, Leave Requests, Fueling Vouchers, Map View, Photo Gallery) down to just that one project. |
| **Status pill** | The colored badge on a status field — green (good/paid/active), amber (pending/needs attention), red (a problem). |
| **Manual Entry** | An Income & Expenditure row you type in directly, for money movements that don't come from an invoice, expense, or fund request (e.g. a loan, an equity injection). |

---

## 20. Known Limitations

Worth knowing about, so nothing here surprises you:

- **The access-tier system is a UI convenience, not hard security.** It hides the wrong screens from the wrong people, but it isn't a database-level lock.
- **Email notifications for new/decided fund and leave requests are wired into the app but currently inactive** (the email service isn't yet configured) — don't wait for an email; check the **Approvals** tab directly.
- **Invoices and Purchase Orders currently hold a single line item each** — for a multi-item sale or order, you'd need to raise one per item for now.
- **Deleting a Bulldozer Parts, Consumables, or general Inventory withdrawal does not restore the stock it deducted** — if you logged one by mistake, edit it instead of deleting it.
- **"Filling Station" is still a fixed list of names, not a manageable record** — Station Ledger, Fuel Credit, and Fueling Vouchers all draw from the same fixed list; there's no separate screen to add/edit a station's own details.
- **Attendance times can't be edited in the app** — only deleted; corrections go through a site supervisor.
- **Restoring a backup replaces data for the entire company on every device, with no undo** — treat it as a last resort.
- **Adding someone in HR & Employees does not, by itself, give them a login.** The employee record (name, role, salary, access tier, etc.) and the actual username/password login are two separate things — a new hire's login has to be set up by whoever administers the underlying system, outside this app, and linked to their employee record before they can sign in.
- **There's no in-app "forgot password" or admin password reset** — a locked-out user needs whoever administers the underlying system to issue them a new one; it isn't a self-service or HR action.

---

*This manual reflects the app as of the current build. If a screen looks different from what's described here, the app has likely gained a new feature since this was written — ask an Admin, or check with whoever maintains the ERP, to get this document updated.*
