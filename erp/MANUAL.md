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
10. [Sales & Invoicing](#10-sales--invoicing)
11. [Purchasing & Suppliers](#11-purchasing--suppliers)
12. [Accounting & Expenses](#12-accounting--expenses)
13. [Fund Requests & Approvals](#13-fund-requests--approvals)
14. [HR & Employees](#14-hr--employees)
15. [Leave & Attendance](#15-leave--attendance)
16. [Backup & Data](#16-backup--data)
17. [Step-by-Step Workflows](#17-step-by-step-workflows)
18. [Glossary](#18-glossary)
19. [Known Limitations](#19-known-limitations)

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
| **Accounts** | Office / accounts staff | Dashboard, Documents and Notices, Projects (including Profitability and Rate History), Sales & Invoicing, Purchasing & Suppliers, Accounting & Expenses, Fund Requests & Approvals, Leave & Attendance. **Not**: Daily Operations, Fleet Management, HR & Employees. |
| **Supervisor** | Site supervisors | Documents and Notices, Projects (Map View, Photo Gallery, and Weekly Report only — no Projects list, Rate History, or Profitability tab), Daily Operations, Fleet Management, Fund Requests & Approvals (including the Approvals inbox), Leave & Attendance. A Supervisor's view of Fund Requests, Leave Requests, and Fueling Vouchers is further narrowed to their own **Assigned Project** (set on their HR record) — see the note under each relevant module. **Not**: Dashboard, Sales, Purchasing, Accounting, HR. |
| **Staff** | Everyone else (general/field staff) | Documents and Notices, Fund Requests & Approvals (their own requests only — no Approvals tab), Leave & Attendance (their own leave/attendance only). Nothing else. |

> **Important caveat:** this tier system controls what the app's screens *show and offer* — it is not a database-level security wall. Anyone determined enough with technical access to the underlying system could bypass it. Treat it as "the right doors are hidden from the wrong people," not "the wrong people are locked out even if they try to force their way in."

**Setting a tier:** an Admin sets this per person on the **Employees** tab of HR & Employees, field **"ERP Access Level."** New employees default to **Staff** until changed.

---

## 4. Common Screen Patterns

These conventions repeat across almost every module — learn them once here instead of re-reading them on every page.

- **`+ Add / New / Log / Submit …` button** — top-right of most list screens. Opens a form (a "modal" popup) to create a new record. Required fields are marked with `*`.
- **Row icons**:
  - **✎ Edit** — opens the same form, pre-filled, to change that record.
  - **🗑 Delete** — always asks to confirm first (*"Delete '&lt;record name&gt;'? This cannot be undone."*). There is no undo after confirming, other than restoring from a backup (see [Backup & Data](#16-backup--data)).
  - **🖨 Print** — only appears where a printable document exists for that record (see each module's Print section below). Opens your browser's print dialog with a formatted letterhead document — print it, or use "Save as PDF" in the print dialog to get a PDF file instead of paper.
- **Status pills** — colored badges showing a record's status. As a rough guide: **green** = good/complete/paid/active, **amber** = pending/in-progress/needs attention, **red** = a problem, rejected, overdue, or unpaid.
- **Search and filter bars** — most list screens have a search box and/or dropdown filters just above the table. These only change what's *displayed*; they never delete or alter data.
- **Row highlighting** — some tables tint a whole row amber or red to flag something (e.g. low stock, overdue invoice, pending approval) without you having to read every column.
- **Tabs** — most modules are split into tabs (e.g. Fleet Management has 7). The tab bar sits just under the page title. Which tabs you see can depend on your access tier.

---

## 5. Dashboard

**Who sees it:** Admin, Accounts.

The Dashboard is the executive landing page — a live, always-current snapshot of the whole company, with no forms to fill in (everything here is read-only, sourced from every other module).

**What's on it, top to bottom:**
- **Backup nudge** — if no backup has ever been exported, or it's been more than 7 days, a warning banner appears with a link straight to [Backup & Data](#16-backup--data).
- **Top stat row**: Active Employees, Low Stock Items, Expenses This Month, Land Cleared This Month, Active Sites.
- **Fleet Health**: Fleet Size, Active, Down / Under Maintenance, Overdue for Service, Due Soon for Service.
- **Money Owed**: Outstanding Invoices (money owed *to* the company), Fuel Credit Owed (money the company owes filling stations), Dozer Owner Settlements Owed (money owed to Partnership dozer owners).
- **Pending Approvals**: counts of Fund Requests, Leave Requests, and Fueling Vouchers still waiting on a decision — a quick nudge to check the [Approvals tab](#13-fund-requests--approvals).
- **Charts** (last 6 months unless noted): Revenue vs Cost vs Profit (company-wide, all projects — same math as Profitability), Sales Trend, Land Cleared Trend, Expenses by Category (all-time), Land Cleared by Site (all-time).

There's nothing to click here except the backup nudge link — this page exists purely to answer "how are we doing right now?" at a glance.

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

**Weekly Performance sub-tab:** pick a **Project** and a **Week Of** date (it auto-snaps to that week's Monday). Shows one row per fleet asset currently assigned to that project (set via **Current Project** on its Fleet Roster record), with a Mon–Sun breakdown of hectares cleared, a weekly total, its speed (Ha/Day, based on days it actually worked that week — not divided by 7), and a bolded **Cumulative** row summing every dozer. Click **🖨 Print Report** for a printable "WEEKLY PERFORMANCE REPORT."

If nothing shows: check that the fleet asset's **Current Project** is set correctly on the Fleet Roster.

**Milestone Tracker sub-tab:** pick a **Project**. Shows all-time (not week-limited) progress: Project Start Date, Days on Project, Project Speed (Ha/Day), Grand Cumulative Achieved, Total Contract Area, and Remaining to Complete — plus a table of every machine/operator that's ever worked the project, broken down by operation type. Requires **Project Start Date** and **Total Contract Area (Ha)** to be set on the Projects tab for the full set of figures to compute (otherwise they show "—"). Click **🖨 Print Tracker** for a printable "MILESTONE REPORT TRACKING SYSTEM" document.

### Rate History tab (Admin/Accounts only)

A dated log of every contract-rate change per project. **"+ Log Rate Change"** fields: Project (required), Effective From (date, required), Rate (₦), Rate Unit, Notes. Normally these entries are created automatically when you edit a project's rate (see above) — add one manually here only to backdate a correction.

### Profitability tab (Admin/Accounts only)

The same screen also appears inside [Accounting & Expenses](#12-accounting--expenses) — see that section for the full breakdown of how revenue, cost, and margin are calculated. It's a read-only report; there's nothing to add or edit here.

---

## 8. Daily Operations

**Who sees it:** Admin, Supervisor.

This is the field log book — one entry per piece of equipment per day, capturing what was worked, how much got done, fuel burned, and any site files.

**List screen:** a search box ("Search by site, equipment, operator, or notes…"), stat cards (Total Area Cleared, Total Road, Total Trekking, Total Fuel Used, Ongoing Sites, Reports Logged), and a table of every report. A Supervisor only sees rows from their own assigned project.

**"+ Log Daily Report" fields, in order:**

| Field | Notes |
|---|---|
| Date | required, defaults to today |
| Site / Project Name | dropdown of Projects; pre-fills to a Supervisor's own assigned project |
| Client | optional, dropdown of Customers |
| Equipment Used | dropdown — only shows items whose Category is Heavy Equipment, Tools, or Vehicles |
| Operator | dropdown of employees |
| Supervisor | dropdown of employees |
| Hours Worked | ⚠ marked required on screen, but in practice a blank value silently saves as 0 rather than blocking the save |
| Time Resumed | optional — feeds the fleet's average resumption-time stat |
| Time Closed | optional — feeds the fleet's average close-time stat |
| Operation Type | Felling (Ha), Stacking (Ha), Direct Stacking (Ha), Root Picking (Ha), Bonding (Ha), Road (KM), or Trekking (hrs) |
| Quantity | the amount done, in whatever unit the chosen Operation Type uses (shown next to it) — same "required label but silently saves as 0" caveat as Hours Worked |
| Fuel Used (litres) | same caveat |
| Status | Completed, Ongoing, or Halted (defaults to Completed) |
| Work Type + Business Amount (₦) | **only appears if the selected equipment's Ownership is Partnership or Rented.** Choose "Office" for the normal, owner-shareable arrangement, or "Business" for a private arrangement that's never shown to the owner (and pays the operator an extra Business Amount for that day). See [Dozer Economics](#9-fleet-management) for how this splits downstream. |
| Notes | free text |
| KML Boundary File / Photos | attach a `.kml` site-boundary file and/or photos — these automatically feed the Projects → Map View and Photo Gallery tabs |

Date, Site, Equipment, Operator, Supervisor, and Operation Type genuinely block saving if left blank; the rest do not (see the caveat above — fill them in anyway, since downstream stats depend on real numbers).

No print button on this screen.

---

## 9. Fleet Management

**Who sees it:** Admin, Supervisor.

Seven tabs cover everything about the company's dozers, excavators, and vehicles: **Fleet Roster, Maintenance Log, Diesel Tracking, Fueling Vouchers, Inventory & Equipment, Rate History, Dozer Economics.**

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
| Current Project | which project it's currently deployed to — this drives the Weekly Report tab |
| Location | required |
| Acquisition Value (₦) | |
| Service Interval (engine hours) | default 250 |

> Saving a new asset, or changing its rates, automatically logs an entry to the **Rate History** tab (an opening entry on creation; a new entry on edit only if a rate actually changed) — so historical costing always uses the rate that was really in effect at the time, not today's rate applied retroactively.

Deleting a fleet asset deletes the underlying inventory record — the Fleet Roster is really just Inventory & Equipment filtered down to Heavy Equipment and Vehicles. No print button on this tab.

### Maintenance Log tab

Stat cards: Total Maintenance Spend (all-time), This Month, Scheduled / In Progress.

**"+ Log Maintenance" fields:** Date, Dozer/Equipment, Type (Service / Repair / Inspection / Breakdown), Description, Parts Cost (₦), Labor Cost (₦), Performed By (a staff member, or leave blank and fill in an External Contractor / Vendor instead), Status (Completed / Scheduled / In Progress).

The record's total cost is always Parts Cost + Labor Cost added automatically — there's no separate "total" field to fill in. No print button.

### Diesel Tracking tab

Buttons: **+ Log Diesel Receipt**, **+ Log Stock Count**.

Stat cards: Total Received (All-Time), Total Issued (from Daily Logs), Expected Balance, and — once at least one physical count has been logged — Last Count Variance.

**"+ Log Diesel Receipt" fields:** Date, Litres Received, Unit Cost (₦/litre), Supplier, Reference (PO #, waybill, etc.), Notes.

**"+ Log Stock Count" fields:** Date, Counted Litres (the physical tank reading), Counted By, Notes.

Below the buttons, four sections:
1. **Diesel Receipts** — every delivery logged.
2. **Stock Counts & Reconciliation** — every physical count, compared against what the records say *should* be in the tank as of that date, with a Variance pill (green if under 1 L off, amber if under 2% off, red if worse).
3. **Diesel Ledger by Asset** — filter by date range; shows each dozer's Opening / New / Used / Closing litre balances over that period. "New" comes from Fulfilled fueling vouchers issued to that asset; "Used" comes from its Daily Operations fuel figures; "Opening" is derived from everything before your start date — none of this is entered by hand.
4. **Diesel Replenishment Request — &lt;tomorrow's date&gt;** — a planning table projecting tomorrow's likely need per active dozer (based on its average diesel use per *worked* day over its last 14 worked days), with a **🖨 Print Request** button producing a printable "DIESEL REPLENISHMENT REQUEST." This is a planning estimate, not a confirmed work schedule — the app has no next-day scheduling of its own.

> **Expected Balance** is always calculated, never typed in: total litres received (up to a date) minus total litres used on Daily Operations reports (up to that date).

### Fueling Vouchers tab

**Purpose:** an authorization slip a driver/operator takes to a filling station to get fuel on the company's account.

**"+ New Fueling Voucher" fields:** Date, Fuel Station (Midejab Ltd, SK Gold, Asolak Ltd, Iloamachi Ltd, Total Enugu, Akuebuolo Ltd, Kabir Ltd), Project, Dozer/Equipment, Litres Requested, Estimated Cost (₦), Requested By, Status (Pending Approval / Approved / Rejected / Fulfilled), Approved By, Notes, Receipts / Photos.

A voucher only counts toward the Diesel Ledger's "New" litres once it's marked **Fulfilled**. Approving or rejecting a pending voucher is normally done from the [Approvals inbox](#13-fund-requests--approvals) rather than from here.

**Print** (🖨 on any row) produces a "FUELING VOUCHER" document to hand to the station attendant, with signature lines for Requested By, Approved By, and Station Attendant.

### Inventory & Equipment tab

The master stock list of everything the company owns or holds: machinery, vehicles, tools, consumables, and safety gear. (Fleet Roster above is this same list, filtered to just Heavy Equipment + Vehicles.)

**"+ Add Item" fields:** Item Name, Category (Heavy Equipment, Vehicles, Tools, Consumables, Safety Gear, or Dozer Parts — the last one is really managed from Purchasing & Suppliers, see below), SKU, Quantity, Unit, Unit Cost (₦), Reorder Level, Location, Current Project.

Rows where **Quantity ≤ Reorder Level** are flagged with an amber row highlight — your visual cue to reorder. There is no automatic stock deduction anywhere in this screen; Quantity is a plain number you update by hand whenever stock changes (the one exception is Bulldozer Parts withdrawals, which *do* auto-deduct — see [Purchasing & Suppliers](#11-purchasing--suppliers)).

No print button.

### Rate History tab (dozer rates)

A dated log of hourly-rate/rental-rate/management-fee changes per fleet asset. **"+ Log Rate Change"** fields: Equipment, Effective From, Hourly Rate (₦), Rental Rate/Day (₦), Management Fee/Day (₦), Notes. As with Projects' Rate History, entries are normally created automatically when you edit an asset's rates on the Fleet Roster — add one manually here to backdate a correction.

This "rate as of a date" system is what lets Profitability and Dozer Economics always use the rate that was *actually in effect* on each day worked, even after a rate has since changed.

### Dozer Economics tab

**Purpose:** dozer-level profitability, and Partnership owner accountability.

**Company-Owned Dozer Performance** (top of the tab, filterable by From/To dates): per Company dozer, Hours Worked, Downtime (days without a logged report — only computable with both dates set), % Optimization, Actual Revenue (estimated as hours worked × the rate in effect each day — clients are billed per project, not per machine, so this is always an estimate), Potential Revenue (what it *could* have earned working a full 8h every day in the period), Shortfall, Maintenance Cost, and Profit (estimated).

**Partnership Owner Settlements:** a per-dozer summary (Total Generated, Management Retained, Repairs Cost, Already Paid, Balance Owed — red if still owed), then a full settlement history.

**"+ New Settlement" fields:** Partnership Dozer, Period Start, Period End, Days Worked (Office days only), Rental Rate/Day (₦), Management Fee/Day (₦), Repairs Cost (₦), Amount Paid to Owner (₦), Notes — plus a live-updating **Balance Owed to Owner** preview, and a **↻ Fill Days, Repairs & Rates from Records** button that auto-computes Days Worked, Repairs Cost, and the historically-correct rates for you (requires the dozer and both dates set first).

> **The Office/Business split matters here:** "Days Worked" only counts days logged as **Office** work type in Daily Operations. Any day logged as **Business** never appears in this settlement — it's excluded entirely, by design, since it's a private arrangement never meant to be shown to the outside owner.

**Balance Owed** = (Days Worked × Rental Rate/Day) − (Days Worked × Management Fee/Day) − Repairs Cost − Amount Paid to Owner.

**Print** produces a "DOZER OWNER SETTLEMENT STATEMENT" the owner can be shown directly, with signature lines for Prepared By and Owner Acknowledgement.

**Internal Ledger — Office vs Business** *(Admin only — Supervisors do not see this section at all, even though they can open this tab)*: every day logged against a Partnership or Rented dozer, both Office and Business, side by side, with Business Earnings totaled. This exists purely for internal audit of the "Business" arrangement — none of it ever appears in the owner-facing settlement above.

---

## 10. Sales & Invoicing

**Who sees it:** Admin, Accounts.

Two tabs: **Invoices** and **Customers.**

### Invoices tab

Table: Invoice #, Customer, Project, Date, Due, Total, Status, actions. Any **Unpaid** invoice past its Due Date is flagged with a red row highlight.

**"+ New Invoice" fields:** Customer (required), Project (optional — links this invoice into that project's Profitability revenue), Invoice Date, Due Date, Description of Work, Quantity (e.g. hectares), Price per Unit (₦), Status (Unpaid / Paid).

> An invoice currently holds a single line item (one description/quantity/price combination) — Total = Quantity × Price.

**Print** produces an "INVOICE" (or "RECEIPT" with a PAID stamp, if status is Paid) letterhead: dates, project, a "Bill To" block, the line item, total, and signature lines for Authorized Signature and Customer Signature.

### Customers tab

**"+ Add Customer" fields:** Company / Customer Name, Contact Person, Phone, Email, Address.

---

## 11. Purchasing & Suppliers

**Who sees it:** Admin, Accounts.

Four tabs: **Purchase Orders, Suppliers, Fuel Credit, Bulldozer Parts & Supplies.**

### Purchase Orders tab

Table: PO #, Supplier, Date, Total, Status, actions.

**"+ New Purchase Order" fields:** Supplier (required), Order Date, Item Description, Quantity, Unit Price (₦), Status (Pending / Received). Like invoices, a PO currently holds one line item; Total = Quantity × Unit Price. Marking a PO **Received** is a status label only — it does **not** automatically add stock to Inventory & Equipment; update that separately if needed.

**Print** produces a "PURCHASE ORDER" document with signature lines for Authorized Signature and Supplier Signature.

### Suppliers tab

**"+ Add Supplier" fields:** Supplier Name, Contact Person, Phone, Email, Address.

### Fuel Credit tab

**Purpose:** tracks diesel/PMS the company collects on credit from filling stations, so the office always knows what's owed to each one.

**Filter:** Station dropdown. Stat cards: Total Owed Across All Stations, Stations With a Balance. A **Station Balances** table shows each station's total collected, total paid, balance owed, and status (Fully Settled / Partially Settled / Outstanding).

**"+ Log Collection" fields:** Date, Filling Station, Fuel Type (Diesel / PMS), Litres Collected, Unit Price (₦/litre), Reference, Notes.

**"+ Log Payment" fields:** Date, Filling Station, Amount Paid (₦), Reference, Notes.

> There is no stored "balance" anywhere — every balance is recalculated live from every collection and payment on record: **Balance = Total Collected − Total Paid.** Deleting or editing an old entry recalculates the balance automatically; there's no separate reconciliation step to run.

No print button.

### Bulldozer Parts & Supplies tab

**Purpose:** the spare-parts store room — what's in stock, reorder thresholds, and a log of every part taken out to service a specific dozer. (Behind the scenes, the parts catalog is really the same Inventory & Equipment list, tagged with Category = "Dozer Parts.")

**"+ Add Part" fields:** Part Name, Part Number / SKU, Current Stock, Unit, Unit Cost (₦), Reorder Level, Storage Location. Rows at or below Reorder Level are flagged amber.

**"+ Log Withdrawal" fields:** Date, Part (its dropdown shows current stock right in the label), Quantity Withdrawn, Dozer / Equipment, Withdrawn By, Notes.

> **This is the one place in the whole app where stock deducts itself automatically.** Logging a withdrawal immediately reduces that part's stock count by the quantity withdrawn — you never edit the stock number by hand for a withdrawal. If you need to correct a withdrawal you logged by mistake, **edit it** rather than deleting it: editing correctly restores the old quantity and re-applies the corrected one, while deleting a withdrawal record does *not* put the stock back.

No print button.

---

## 12. Accounting & Expenses

**Who sees it:** Admin, Accounts.

Three tabs: **Expenses, Income & Expenditure, Profitability.**

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
> 1. Every **Paid** invoice → Income, Cost Head "Invoicing / Sales" (Unpaid invoices never appear here).
> 2. Every **Expense** record → Expenditure, grouped by its own Category.
> 3. Every fund request that's **Approved** or **Paid** → Expenditure, grouped by its Cost Head (Pending/Draft/Rejected fund requests are excluded — only money that's been approved or actually disbursed counts).
> 4. **Manual Entries** you add directly on this screen — for anything that isn't one of the three above, like a loan received, an equity injection, or interest income.

**"+ Add Manual Entry" fields:** Date, Type (Income / Expenditure), Project, Cost Head (Invoicing / Sales, Loan / Advance, Equity Injection, Interest Income, Other Income, or any Expense category), Amount (₦), Description, Notes.

Only Manual Entry rows have an Edit/Delete action in the table — rows sourced from invoices, expenses, or fund requests show "—" and must be changed at their original screen instead.

No print button.

### Profitability tab

**Purpose:** whether each project is actually profitable — revenue earned versus the real cost of the dozers, diesel, and other spend behind it. (The identical screen also appears inside [Projects](#7-projects).)

**Filters:** Project (or "All Projects"), From, To.

**All Projects view:** a "Profit by Project" bar chart, and a table per project — Area Cleared (ha), Revenue, Dozer Cost, Diesel Cost, Logistics Cost, Other Cost, Total Cost, Profit, Margin (%), Revenue/ha.

**Single project view:** stat cards (Area Cleared, Revenue Earned, Total Cost, Profit, Margin, Revenue/ha, Cost/ha, Diesel Used), a Cost Breakdown chart, and — if the project has an **Expected Rate/Day** set (Projects tab) — a **Weekly Productivity** table comparing actual hectares cleared per week against that target.

> **How the numbers are actually built — read this once, it explains a lot of "why doesn't this match" questions:**
> - **Area Cleared** only counts Ha-unit operation types (Felling, Stacking, Direct Stacking, Root Picking, Bonding) — Road (KM) and Trekking (hrs) are deliberately excluded so they don't distort a hectares total.
> - **Dozer Cost** = for every operation logged, hours worked × the hourly rate **that was actually in effect on that day** (from Fleet Management's Rate History) — not today's rate applied backward.
> - **Diesel Cost** = litres used × the diesel price **in effect on that day** (from the most recent Diesel Receipt on or before that date, or the current inventory cost if no receipt exists yet).
> - **Revenue** = every Invoice explicitly tagged to that project on the Sales screen, **regardless of whether it's Paid or Unpaid**. (This is different from Accounting & Expenses' "Total Revenue (Paid)" stat card, which only counts Paid invoices — so don't be surprised if the two numbers don't match; Profitability's Revenue also includes work that's been invoiced but not yet collected.)
> - **Logistics Cost** = expenses tagged to the project with category "Logistics."
> - **Other Cost** = every other expense tagged to the project, **except** "Fuel" — Fuel-category expenses are deliberately left out here, because Diesel Cost above is already computed from actual litres used, and adding Fuel expenses too would double-count the same diesel spend.
> - **Profit** = Revenue − (Dozer + Diesel + Logistics + Other). **Margin** = Profit ÷ Revenue.

This is a read-only report — nothing here can be added or edited directly.

---

## 13. Fund Requests & Approvals

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

## 14. HR & Employees

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

## 15. Leave & Attendance

**Who sees it:** everyone.

Two tabs: **Leave Requests, Attendance.**

### Leave Requests tab

**Your Leave Balance** stat card shows your remaining days for the year (Entitlement − Used, where "Used" only counts leave requests that are **Approved** and started this calendar year — Pending or Rejected requests never reduce your balance).

**"+ Apply for Leave" fields:** Employee (defaults to you), Leave Type (Annual, Sick, Casual, Compassionate, Unpaid), Start Date, End Date, Reason, Status, Approved By.

A **Leave Balances table** (visible to Admin/Supervisor only) shows every relevant employee's Entitlement, Used, and Remaining — a Supervisor sees only staff on their own assigned project.

> Normal decisions on a leave request should be made from the [Approvals inbox](#13-fund-requests--approvals), which correctly records who actually approved it. Who can *see* a request follows the same rule as fund requests: Admin/Accounts see all, a Supervisor sees their project's staff, Staff see only their own.

No print button for leave requests.

### Attendance tab

Simple daily clock-in/clock-out, with GPS location captured automatically where your device allows it.

- Pick an **Employee** and, optionally, a **Project / Site**, then click **Clock In**. You can't clock in twice the same day — the app blocks it and tells you your existing clock-in time.
- Click **Clock Out** later the same day (you must have clocked in first).
- Each clocked time shows a 📍 icon if location was captured — click it to open that location in Google Maps.

Attendance times **cannot be edited** through the app — clicking Edit just tells you to ask your site supervisor for a correction. Only deleting a record is possible.

---

## 16. Backup & Data

**Who sees it:** Admin only.

Everything in this ERP lives in one shared, central database — not on any one device — so everyone always sees the same, current data. This screen is your safety net against accidental data loss.

- **⬇ Download Backup** — downloads every record in the entire system as one JSON file. Do this regularly (the Dashboard nudges you if it's been more than 7 days).
- **Restore from a Backup** — choose a previously downloaded file and click **Restore This File** to replace **every record in the shared database, for the whole company, on every device** with that file's contents. You'll be asked to confirm twice. **This cannot be undone** — only restore a backup if you're certain, and ideally after downloading a fresh backup of the current state first, in case you need to go back.

---

## 17. Step-by-Step Workflows

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
3. When it's time to settle: **Fleet Management → Dozer Economics → + New Settlement**, choose the dozer and period, click **↻ Fill Days, Repairs & Rates from Records**, review, then save.
4. Print the settlement statement to hand to the owner.

### Order and track dozer parts
1. Add the part to the catalog: **Purchasing & Suppliers → Bulldozer Parts & Supplies → + Add Part.**
2. When a part is used on a job: **+ Log Withdrawal**, pick the part, quantity, and which dozer it went into — stock deducts automatically.
3. Watch for amber-highlighted rows in the catalog (at or below Reorder Level) to know what to reorder.

### Back up the company's data
1. **Backup & Data → ⬇ Download Backup**, at least weekly.
2. Store the downloaded file somewhere safe outside the app (e.g. a shared drive).
3. Only use **Restore This File** in a genuine emergency — it overwrites everyone's data everywhere, with no undo.

---

## 18. Glossary

| Term | Meaning |
|---|---|
| **Ownership (Company / Partnership / Rented)** | **Company**: owned and maintained by Emagrims, operators paid per day worked. **Partnership**: owned by a 2nd party; Emagrims pays a day-rate rental and keeps a management fee, but still pays the operators directly. **Rented**: owned by a 3rd party who pays their own operators; Emagrims just pays a day rate. |
| **Office vs. Business (Work Type)** | Only relevant for Partnership/Rented equipment. **Office** = the normal, formal arrangement shared with the owner. **Business** = a private arrangement, visible only to Admin in Dozer Economics' Internal Ledger, and always excluded from owner settlements. |
| **Ha-unit operation types** | Felling, Stacking, Direct Stacking, Root Picking, Bonding — measured in hectares. Road is measured in KM, Trekking in hours; both are excluded from "hectares cleared" totals everywhere in the app. |
| **Rate History / "as of a date"** | Every rate that matters (dozer hourly rate, project rate, diesel price) is tracked with an effective date. Reports always use whichever rate was in effect on the actual day the work happened — never today's rate applied backward to old work. |
| **Cost Head** | The category a cost or income item is grouped under for the Income & Expenditure report — the same list as Expense Categories, plus a few income-only categories. |
| **Assigned Project** | Set per employee in HR. For Supervisors, this scopes almost everything they see (Daily Operations, Fund Requests, Leave Requests, Fueling Vouchers, Map View, Photo Gallery) down to just that one project. |
| **Status pill** | The colored badge on a status field — green (good/paid/active), amber (pending/needs attention), red (a problem). |
| **Manual Entry** | An Income & Expenditure row you type in directly, for money movements that don't come from an invoice, expense, or fund request (e.g. a loan, an equity injection). |

---

## 19. Known Limitations

Worth knowing about, so nothing here surprises you:

- **The access-tier system is a UI convenience, not hard security.** It hides the wrong screens from the wrong people, but it isn't a database-level lock.
- **Email notifications for new/decided fund and leave requests are wired into the app but currently inactive** (the email service isn't yet configured) — don't wait for an email; check the **Approvals** tab directly.
- **Invoices and Purchase Orders currently hold a single line item each** — for a multi-item sale or order, you'd need to raise one per item for now.
- **Marking a Purchase Order "Received" does not automatically add stock to Inventory & Equipment** — update the relevant inventory item's quantity separately if needed.
- **Deleting a Bulldozer Parts withdrawal does not restore the stock it deducted** — if you logged one by mistake, edit it instead of deleting it.
- **Attendance times can't be edited in the app** — only deleted; corrections go through a site supervisor.
- **Restoring a backup replaces data for the entire company on every device, with no undo** — treat it as a last resort.
- **Adding someone in HR & Employees does not, by itself, give them a login.** The employee record (name, role, salary, access tier, etc.) and the actual username/password login are two separate things — a new hire's login has to be set up by whoever administers the underlying system, outside this app, and linked to their employee record before they can sign in.
- **There's no in-app "forgot password" or admin password reset** — a locked-out user needs whoever administers the underlying system to issue them a new one; it isn't a self-service or HR action.

---

*This manual reflects the app as of the current build. If a screen looks different from what's described here, the app has likely gained a new feature since this was written — ask an Admin, or check with whoever maintains the ERP, to get this document updated.*
