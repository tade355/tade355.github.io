// What the search bar can locate besides records: pages, the tabs inside them,
// and individual features (buttons / tools). Each entry says where it lives as
// a route plus the chain of tab labels to click to reach it, so the search can
// take the user straight there. Pure data + a scorer — no store / DOM imports —
// so it can be tested on its own.
//
// `tabs` labels must match the visible tab-button text in the views exactly.
// `perm: 'profitReports'` marks features only Olumide's account can use.

export const CATALOGUE = [
  // ---- pages (route titles come from ROUTES; these add aliases) -----------
  { kind: 'Page', route: 'dashboard', label: 'Dashboard', words: 'overview home headline profit kpi' },
  { kind: 'Page', route: 'dailyDashboard', label: 'Daily Operations Dashboard', words: 'daily dashboard html flags fueling diesel start times output daily report' },
  { kind: 'Page', route: 'askErp', label: 'Ask the ERP', words: 'ask question assistant ai chat prompt query answer' },
  { kind: 'Page', route: 'noticeBoard', label: 'Documents and Notices', words: 'notice board documents memo announcements' },
  { kind: 'Page', route: 'projects', label: 'Projects', words: 'project site contract rate' },
  { kind: 'Page', route: 'operations', label: 'Daily Operations', words: 'operations report hectares hours worked log dozer output' },
  { kind: 'Page', route: 'fleet', label: 'Fleet Management', words: 'fleet dozers equipment machines' },
  { kind: 'Page', route: 'resourceManagement', label: 'Resource Management', words: 'resources diesel parts consumables rent' },
  { kind: 'Page', route: 'sales', label: 'Sales & Invoicing', words: 'sales invoices customers billing income' },
  { kind: 'Page', route: 'purchasing', label: 'Purchasing & Suppliers', words: 'purchasing suppliers purchase orders procurement' },
  { kind: 'Page', route: 'accounting', label: 'Accounting & Expenses', words: 'accounts accounting expenses money books' },
  { kind: 'Page', route: 'fundRequests', label: 'Fund Requests & Approvals', words: 'fund requests approvals payment requests' },
  { kind: 'Page', route: 'hr', label: 'HR & Employees', words: 'hr staff employees people' },
  { kind: 'Page', route: 'leave', label: 'Leave & Attendance', words: 'leave attendance absence holiday' },
  { kind: 'Page', route: 'mySalary', label: 'My Salary', words: 'salary payslip pay' },
  { kind: 'Page', route: 'training', label: 'Training', words: 'training courses learning' },
  { kind: 'Page', route: 'backup', label: 'Backup & Data', words: 'backup export restore data' },

  // ---- tabs ---------------------------------------------------------------
  { kind: 'Tab', route: 'projects', tabs: ['Projects'], label: 'Projects', words: 'project list' },
  { kind: 'Tab', route: 'projects', tabs: ['Map View'], label: 'Map View', words: 'map gps location site boundary' },
  { kind: 'Tab', route: 'projects', tabs: ['Photo Gallery'], label: 'Photo Gallery', words: 'photos pictures images' },
  { kind: 'Tab', route: 'projects', tabs: ['Weekly Report'], label: 'Weekly Report', words: 'weekly performance milestone' },
  { kind: 'Tab', route: 'projects', tabs: ['Contract Rate History'], label: 'Contract Rate History', words: 'rates per hectare revenue rate' },
  { kind: 'Tab', route: 'projects', tabs: ['Revenue Reconciliation'], label: 'Revenue Reconciliation', words: 'revenue reconcile payments received' },
  { kind: 'Tab', route: 'accounting', tabs: ['Expenses'], label: 'Expenses', words: 'expense record cost' },
  { kind: 'Tab', route: 'accounting', tabs: ['Income & Expenditure'], label: 'Income & Expenditure', words: 'income expenditure statement' },
  { kind: 'Tab', route: 'accounting', tabs: ['Profitability'], label: 'Profitability', words: 'profit margin operations profit machine recovery total profit verified' },
  { kind: 'Tab', route: 'accounting', tabs: ['Loans'], label: 'Loans', words: 'loan lender repayment interest' },
  { kind: 'Tab', route: 'fleet', tabs: ['Fleet Roster'], label: 'Fleet Roster', words: 'roster dozers list status' },
  { kind: 'Tab', route: 'fleet', tabs: ['Maintenance Log'], label: 'Maintenance Log', words: 'maintenance repair service breakdown' },
  { kind: 'Tab', route: 'fleet', tabs: ['Daily Status Report'], label: 'Daily Status Report', words: 'status available down under maintenance' },
  { kind: 'Tab', route: 'fleet', tabs: ['Inventory & Equipment'], label: 'Inventory & Equipment', words: 'inventory stock equipment items' },
  { kind: 'Tab', route: 'fleet', tabs: ['Fleet Rate History'], label: 'Fleet Rate History', words: 'dozer rate hourly history' },
  { kind: 'Tab', route: 'fleet', tabs: ['Dozer Economics'], label: 'Dozer Economics', words: 'dozer economics break-even cost per hour' },
  { kind: 'Tab', route: 'resourceManagement', tabs: ['Diesel Management'], label: 'Diesel Management', words: 'diesel fuel litres' },
  { kind: 'Tab', route: 'resourceManagement', tabs: ['Diesel Management', 'Station Ledger'], label: 'Station Ledger', words: 'diesel station ledger collected' },
  { kind: 'Tab', route: 'resourceManagement', tabs: ['Diesel Management', 'Site Distribution'], label: 'Site Distribution', words: 'diesel distribution supplied to dozers' },
  { kind: 'Tab', route: 'resourceManagement', tabs: ['Diesel Management', 'Dozer Discrepancy Report'], label: 'Dozer Discrepancy Report', words: 'diesel discrepancy shortfall used supplied' },
  { kind: 'Tab', route: 'resourceManagement', tabs: ['Diesel Management', 'Diesel Tracking'], label: 'Diesel Tracking', words: 'diesel tracking stock count closing opening' },
  { kind: 'Tab', route: 'resourceManagement', tabs: ['Diesel Management', 'Fueling Vouchers'], label: 'Fueling Vouchers', words: 'vouchers fueling' },
  { kind: 'Tab', route: 'resourceManagement', tabs: ['Bulldozer Parts & Supplies'], label: 'Bulldozer Parts & Supplies', words: 'parts spares supplies' },
  { kind: 'Tab', route: 'resourceManagement', tabs: ['Dozer Rent Payments'], label: 'Dozer Rent Payments', words: 'rent hire payments collins chizon' },
  { kind: 'Tab', route: 'resourceManagement', tabs: ['Lubricants & Consumables'], label: 'Lubricants & Consumables', words: 'oil lubricants consumables grease' },
  { kind: 'Tab', route: 'resourceManagement', tabs: ['Project Items'], label: 'Project Items', words: 'bikes vehicles tacoma pms petrol' },
  { kind: 'Tab', route: 'purchasing', tabs: ['Purchase Orders'], label: 'Purchase Orders', words: 'orders purchase po' },
  { kind: 'Tab', route: 'purchasing', tabs: ['Suppliers'], label: 'Suppliers', words: 'supplier vendor' },
  { kind: 'Tab', route: 'purchasing', tabs: ['Fuel Credit'], label: 'Fuel Credit', words: 'fuel credit station midejab collections payments balance owed' },
  { kind: 'Tab', route: 'sales', tabs: ['Invoices'], label: 'Invoices', words: 'invoice bill' },
  { kind: 'Tab', route: 'sales', tabs: ['Customers'], label: 'Customers', words: 'customer client' },
  { kind: 'Tab', route: 'fundRequests', tabs: ['Requests'], label: 'Requests', words: 'request fund' },
  { kind: 'Tab', route: 'fundRequests', tabs: ['Approvals'], label: 'Approvals', words: 'approve approvals pending' },
  { kind: 'Tab', route: 'hr', tabs: ['Employees'], label: 'Employees', words: 'employee staff list' },
  { kind: 'Tab', route: 'hr', tabs: ['Staff Memos & Letters'], label: 'Staff Memos & Letters', words: 'memo letter query warning' },
  { kind: 'Tab', route: 'hr', tabs: ['Assets Tracker'], label: 'Assets Tracker', words: 'assets issued laptop phone' },
  { kind: 'Tab', route: 'hr', tabs: ['Payroll'], label: 'Payroll', words: 'payroll salaries wages' },
  { kind: 'Tab', route: 'hr', tabs: ['Operator Allowance'], label: 'Operator Allowance', words: 'operator allowance 30000 per 8 hrs sunday' },
  { kind: 'Tab', route: 'hr', tabs: ['Training Programs'], label: 'Training Programs', words: 'training programs' },
  { kind: 'Tab', route: 'leave', tabs: ['Leave Requests'], label: 'Leave Requests', words: 'leave request' },
  { kind: 'Tab', route: 'leave', tabs: ['Attendance'], label: 'Attendance', words: 'attendance sign in' },

  // ---- features -----------------------------------------------------------
  { kind: 'Feature', route: 'dailyDashboard', label: 'Download the daily dashboard (HTML)', words: 'download html daily dashboard file same design' },
  { kind: 'Feature', route: 'dailyDashboard', label: 'Print the daily dashboard', words: 'print pdf daily dashboard' },
  { kind: 'Feature', route: 'dailyDashboard', label: 'Fueling request for tomorrow (250 L target)', words: 'fueling request tomorrow target 250 litres opening diesel' },
  { kind: 'Feature', route: 'dailyDashboard', label: 'Late starts and flags', words: 'flags late start no report not available' },
  { kind: 'Feature', route: 'dailyDashboard', label: 'Operations Profit, Machine Recovery and Total Profit', words: 'ops profit machine recovery total profit tables' },
  { kind: 'Feature', route: 'askErp', label: 'Ask a question about the data', words: 'question what was the profit yesterday which dozer best operator compare diesel' },
  { kind: 'Feature', route: 'dailyDashboard', label: 'Operations Profitability Report builder (download)', words: 'report builder download profitability review date range sections html', perm: 'profitReports' },
  { kind: 'Feature', route: 'accounting', tabs: ['Profitability'], label: 'Profitability report and print', words: 'print profitability report export' },
  { kind: 'Feature', route: 'purchasing', tabs: ['Fuel Credit'], label: 'Record fuel credit collection or payment', words: 'record add collection payment station credit' },
  { kind: 'Feature', route: 'resourceManagement', tabs: ['Diesel Management', 'Site Distribution'], label: 'Record diesel supplied to a dozer', words: 'add diesel distribution supply dozer litres' },
  { kind: 'Feature', route: 'operations', label: 'Add a daily operation report', words: 'add new operation report log hours hectares' },
  { kind: 'Feature', route: 'fundRequests', tabs: ['Requests'], label: 'Raise a fund request', words: 'new fund request raise payment cash' },
  { kind: 'Feature', route: 'accounting', tabs: ['Expenses'], label: 'Record an expense', words: 'add expense record spend' },
  { kind: 'Feature', route: 'mySalary', label: 'View my payslip', words: 'payslip salary my pay' },
];

const norm = (s) => String(s || '').toLowerCase();

// Rank: whole-label match > label starts with > a label word starts with >
// label contains > keyword contains. Every query word must hit somewhere.
function score(entry, q) {
  const label = norm(entry.label);
  const hay = `${label} ${norm(entry.words)} ${norm(entry.kind)}`;
  const parts = q.split(/\s+/).filter(Boolean);
  if (!parts.every((p) => hay.includes(p))) return 0;
  let s = 1;
  if (label === q) s += 100;
  else if (label.startsWith(q)) s += 60;
  else if (label.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) s += 40;
  else if (label.includes(q)) s += 25;
  parts.forEach((p) => { if (label.includes(p)) s += 5; });
  if (entry.kind === 'Page') s += 3;
  return s;
}

// `routes` is the ROUTES array (path, label, tiers) — only entries whose route
// the user may open are returned. `canUse(perm)` gates permissioned features.
export function searchCatalogue(query, { routes, canAccess, canUse = () => false, limit = 12 }) {
  const q = norm(query).trim();
  if (!q) return [];
  const routeBy = Object.fromEntries(routes.map((r) => [r.path, r]));
  return CATALOGUE
    .filter((e) => routeBy[e.route] && canAccess(routeBy[e.route].tiers))
    .filter((e) => !e.perm || canUse(e.perm))
    .map((e) => ({ e, s: score(e, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ e }) => ({ ...e, routeLabel: routeBy[e.route].label }));
}

// Pages shown before the user types anything.
export function quickLinks({ routes, canAccess, canUse = () => false }) {
  const routeBy = Object.fromEntries(routes.map((r) => [r.path, r]));
  return ['askErp', 'dailyDashboard', 'dashboard', 'operations', 'fleet', 'fundRequests']
    .map((p) => CATALOGUE.find((e) => e.kind === 'Page' && e.route === p))
    .filter((e) => e && routeBy[e.route] && canAccess(routeBy[e.route].tiers))
    .map((e) => ({ ...e, routeLabel: routeBy[e.route].label }));
}
