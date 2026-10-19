// "Ask the ERP" — factual look-ups about the organisation itself: who a person
// is, how many staff are suspended, how many sites are active, how many dozers
// are down and since when, counts of invoices / suppliers / loans and so on.
//
// Same rules as askErp.js: rule-based, answers only from records already loaded
// in the ERP, pure (no store / DOM imports). Returns null when the question is
// not one of these so the caller can try the operations / money answers.
//
// Staff records (who is who, suspensions, headcount) are HR data that only
// Admin accounts can open in the ERP, so they are answered only when the caller
// sets `ctx.canViewStaffRecords`. Pay, phone numbers, e-mail and login details
// are never given.
import { addDays } from './dateUtils.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dmy = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTH_NAMES[m - 1]} ${y}`; };
const fmt = (n) => Number(n).toLocaleString('en-US');
const money = (n) => `₦${fmt(Math.round(n))}`;
const reply = (text, table, notes) => ({ text, table, notes });
const dayNumber = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);
const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const countBy = (arr, key) => arr.reduce((o, x) => { const k = x[key] || '—'; o[k] = (o[k] || 0) + 1; return o; }, {});
const breakdown = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ');
const ago = (date, today) => {
  const n = daysBetween(date, today);
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
};
const tenure = (from, today) => {
  const months = Math.max(0, Math.round(daysBetween(from, today) / 30.44));
  const y = Math.floor(months / 12); const m = months % 12;
  return [y ? plural(y, 'year') : null, m ? plural(m, 'month') : null].filter(Boolean).join(' ') || 'under a month';
};
const TABLE_LIMIT = 30;

const STOP = new Set(['who', 'what', 'whos', 'is', 'are', 'was', 'the', 'a', 'an', 'of', 'about', 'tell', 'me', 'please', 'in', 'on', 'at', 'to', 'for', 'and', 'staff', 'employee', 'person', 'name', 'does', 'do', 'know', 'you', 'give', 'details', 'detail', 'info', 'information', 'profile', 'show', 'role', 'position', 'job', 'work', 'works', 'there', 'our', 'company', 'here', 'this', 'that', 'his', 'her', 'mr', 'mrs', 'ms', 'engr', 'eng']);

// Role words people use → what to look for in the employee's role text.
const ROLE_WORDS = [
  [/\bceo\b|chief executive/, /chief executive/i, 'Chief Executive Officer'],
  [/\bcoo\b|chief operat/, /chief operations/i, 'Chief Operations Officer'],
  [/\bmd\b|managing director/, /managing director/i, 'Managing Director'],
  [/\bhr\b|human resources?/, /\bhr\b|human resources/i, 'HR'],
  [/site manager/, /site manager/i, 'Site Manager'],
  [/diesel manager/, /diesel manager/i, 'Diesel Manager'],
  [/maintenance manager/, /maintenance manager/i, 'Maintenance Manager'],
  [/general manager/, /general manager/i, 'General Manager'],
  [/procurement/, /procurement/i, 'Procurement Officer'],
  [/executive assistant/, /executive assistant/i, 'Executive Assistant'],
  [/executive director/, /executive director/i, 'Executive Director'],
  [/mechanic/, /mechanic/i, 'Mechanic'],
  [/operators?/, /operator/i, 'Operator'],
  [/transporters?|drivers?/, /transporter|driver/i, 'Transporter / driver'],
  [/trainee/, /trainee/i, 'Trainee'],
  [/supervisors?/, /supervisor|site manager/i, 'Supervisor'],
];
const DEPARTMENTS = [
  [/\boperations?\b(?! report)/, 'Operations'], [/\badministration\b|\badmin\b/, 'Administration'],
  [/\bmaintenance\b/, 'Maintenance'], [/\bhuman resources\b|\bhr\b/, 'Human Resources'],
];
const STATUS_WORDS = [
  [/suspen(d|ded|sion)/, 'Suspended'], [/disengag|terminat|sacked|resign|left the company|former/, 'Disengaged'],
  [/\bactive\b|\bworking\b|\bcurrent\b|\bemployed\b/, 'Active'],
];

const cleanTokens = (text) => text.toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/).map((t) => t.replace(/^'+|'+$/g, '').replace(/'s$/, '')).filter(Boolean);

// ---------------------------------------------------------------- equipment
const heavyOf = (ctx) => ctx.inventory.filter((i) => i.category === 'Heavy Equipment');

export function findEquipment(text, ctx) {
  const t = text.toLowerCase();
  const names = ctx.inventory.map((i) => i.name);
  const found = new Set();
  // Full code ("EMG-007", "emg 7", "chi001").
  for (const m of t.matchAll(/\b(emg|chi|ema|big)\s*-?\s*0*(\d{1,3})\b/g)) {
    const want = `${m[1].toUpperCase()}-${String(m[2]).padStart(3, '0')}`;
    names.filter((n) => n === want).forEach((n) => found.add(n));
  }
  // Bare three-digit number with a leading zero ("007", "004") — never a date.
  for (const m of t.matchAll(/(?<![\d/:.-])0\d{2}(?![\d/:.-])/g)) {
    names.filter((n) => /-\d{3}$/.test(n) && n.endsWith(m[0])).forEach((n) => found.add(n));
  }
  if (/\bd8k\b|\bcollins?\b/.test(t) && names.includes('D8K Collins')) found.add('D8K Collins');
  ctx.inventory.forEach((i) => { if (/^(bike|tacoma)/i.test(i.name) && t.includes(i.name.toLowerCase())) found.add(i.name); });
  return ctx.inventory.filter((i) => found.has(i.name));
}

function lastWork(ctx, name) {
  return ctx.operations.filter((o) => o.equipment === name && (o.hoursWorked || 0) > 0).sort((a, b) => (a.date < b.date ? 1 : -1))[0] || null;
}
const isOut = (item) => item.fleetStatus === 'Down' || item.fleetStatus === 'Under Maintenance';
const statusOf = (item) => item.fleetStatus || 'Active';
const nameOf = (ctx, id) => ctx.employees.find((e) => e.id === id)?.name || null;

// Best available answer to "since when has it been down?". The ERP keeps the
// current fleet status, not a history of it, so the start date comes from an
// open breakdown / repair record, or failing that from the last day the
// machine worked.
function downSince(ctx, item, today) {
  const open = ctx.maintenanceLogs
    .filter((m) => m.equipment === item.name && m.status !== 'Completed' && m.date <= today)
    .sort((a, b) => (a.type === 'Breakdown' ? -1 : 0) - (b.type === 'Breakdown' ? -1 : 0) || (a.date < b.date ? 1 : -1))[0];
  const last = lastWork(ctx, item.name);
  if (open) return { date: open.date, basis: `${open.type.toLowerCase()} record logged ${dmy(open.date)}: ${open.description.length > 150 ? `${open.description.slice(0, 147)}…` : open.description}`, open, last };
  if (last) return { date: addDays(last.date, 1), basis: `no breakdown record, so counted from the day after its last report on ${dmy(last.date)}`, open: null, last };
  return { date: null, basis: 'no breakdown record and no operations report for it', open: null, last: null };
}

function equipmentAnswer(items, text, ctx, today) {
  const wantsSince = /since when|how long|down since|when (did|was|has|have)|for how long|how many days|started? (being )?down|went down|broke/.test(text);
  const wantsOperator = /who (operates|drives|runs|is the operator|operate)|operator of|operated by/.test(text);
  const wantsService = /service|serviced|servicing|repair|maintenance|fixed/.test(text);
  const blocks = items.map((item) => {
    const status = statusOf(item);
    const last = lastWork(ctx, item.name);
    const operators = [...new Set(ctx.operations.filter((o) => o.equipment === item.name && o.operatorId).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12).map((o) => nameOf(ctx, o.operatorId)).filter(Boolean))];
    const lines = [];
    const owner = item.ownership === 'Rented' ? `rented from ${item.ownerName || 'a third party'}` : item.ownership === 'Partnership' ? `partnership dozer${item.ownerName ? ` (${item.ownerName})` : ''}` : item.ownership === 'Company' ? 'company-owned' : '';
    lines.push(`${item.name} is ${status}${owner ? ` — ${owner}` : ''}${item.currentProject ? `, on ${item.currentProject}` : ''}.`);
    if (isOut(item)) {
      const s = downSince(ctx, item, today);
      lines.push(s.date ? `Down since about ${dmy(s.date)} (${daysBetween(s.date, today)} day${daysBetween(s.date, today) === 1 ? '' : 's'}): ${s.basis}.` : `Down — ${s.basis}.`);
    } else if (wantsSince) {
      lines.push('It is not down.');
    }
    if (last) lines.push(`Last worked ${dmy(last.date)} (${ago(last.date, today)}), ${last.hoursWorked} hrs, ${last.quantity ?? 0} ha${last.operatorId ? `, operator ${nameOf(ctx, last.operatorId)}` : ''}.`);
    else lines.push('No operations report on record for it.');
    if (operators.length && (wantsOperator || items.length === 1)) lines.push(`Recent operator${operators.length > 1 ? 's' : ''}: ${operators.join(', ')}.`);
    if (wantsService || items.length === 1) {
      const done = ctx.maintenanceLogs.filter((m) => m.equipment === item.name && m.status === 'Completed' && m.date <= today).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      if (done) lines.push(`Last completed ${done.type.toLowerCase()}: ${dmy(done.date)} — ${done.description.length > 110 ? `${done.description.slice(0, 107)}…` : done.description}`);
      const open = ctx.maintenanceLogs.filter((m) => m.equipment === item.name && m.status !== 'Completed' && m.date <= today);
      if (open.length && !isOut(item)) lines.push(`${plural(open.length, 'open maintenance record')} (${open.map((m) => m.type.toLowerCase()).join(', ')}).`);
    }
    return lines.join(' ');
  });
  const notes = items.some(isOut) ? ['The ERP stores each dozer\'s current status, not a status history, so the start of a breakdown is taken from its open breakdown record or its last working day.'] : [];
  return reply(blocks.join('\n'), null, notes);
}

function fleetAnswer(text, ctx, today) {
  const wantsVehicles = /\b(vehicles?|bikes?|motorbikes?|tacoma)\b/.test(text) && !/\b(dozers?|bulldozers?)\b/.test(text);
  const pool = wantsVehicles ? ctx.inventory.filter((i) => i.category === 'Vehicles') : heavyOf(ctx);
  const noun = wantsVehicles ? 'vehicle' : 'dozer';
  let list = pool;
  let qualifier = '';
  const siteMatch = (ctx.projects || []).find((p) => text.includes(p.name.toLowerCase()) || (p.name.includes(' - ') && text.includes(p.name.split(' - ').pop().toLowerCase())));
  if (siteMatch) { list = list.filter((i) => i.currentProject === siteMatch.name); qualifier += ` on ${siteMatch.name}`; }
  if (/under maintenance|being repaired|in the workshop/.test(text)) { list = list.filter((i) => statusOf(i) === 'Under Maintenance'); qualifier = ` under maintenance${qualifier}`; }
  else if (/\b(down|broken|broke|grounded|not working|out of action|faulty|breakdown|parked|idle)\b/.test(text)) { list = list.filter(isOut); qualifier = ` down or under maintenance${qualifier}`; }
  else if (/\b(active|working|available|running|operational)\b/.test(text)) { list = list.filter((i) => statusOf(i) === 'Active'); qualifier = ` active${qualifier}`; }
  if (/\brented|hired\b/.test(text)) { list = list.filter((i) => i.ownership === 'Rented'); qualifier = ` rented${qualifier}`; }
  else if (/\bpartnership|partner|chizon|third.?party|2nd|3rd\b/.test(text)) { list = list.filter((i) => i.ownership === 'Partnership'); qualifier = ` under partnership${qualifier}`; }
  else if (/\bcompany.?owned|\bour own|owned by (the )?company|company dozers?\b/.test(text)) { list = list.filter((i) => i.ownership === 'Company'); qualifier = ` owned by the company${qualifier}`; }
  const out = pool.filter(isOut);
  const rows = list.sort((a, b) => (a.name < b.name ? -1 : 1)).map((i) => {
    const s = isOut(i) ? downSince(ctx, i, today) : null;
    const last = lastWork(ctx, i.name);
    return [i.name, statusOf(i), i.ownership || '—', i.currentProject || '—', last ? dmy(last.date) : '—', s && s.date ? dmy(s.date) : '—'];
  });
  const total = pool.length;
  const byStatus = breakdown(countBy(pool, 'fleetStatus'));
  const head = `${plural(list.length, noun)}${qualifier}${list.length === total ? '' : ` of ${total} in the fleet`}.`;
  const summary = ` Fleet overall: ${byStatus}${wantsVehicles ? '' : `; by ownership ${breakdown(countBy(pool, 'ownership'))}`}.`;
  const names = list.length && list.length <= 8 ? ` (${list.map((i) => i.name).join(', ')})` : '';
  return reply(`${head.replace(/\.$/, '')}${names}.${summary}`, rows.length ? { head: ['Name', 'Status', 'Ownership', 'Site', 'Last worked', 'Down since (est.)'], rows } : null, out.length ? ['"Down since" is taken from the open breakdown record, or the day after the last report when there is none — the ERP keeps current status, not a status history.'] : []);
}

// ------------------------------------------------------------------ sites
function sitesAnswer(text, ctx, today) {
  const projects = ctx.projects || [];
  if (!projects.length) return reply('There are no projects (sites) recorded in the ERP.');
  const weekAgo = addDays(today, -6);
  const rows = projects.map((p) => {
    const ops = ctx.operations.filter((o) => o.siteName === p.name);
    const recent = ops.filter((o) => o.date >= weekAgo && o.date <= today);
    const last = ops.map((o) => o.date).sort().pop();
    const dozers = heavyOf(ctx).filter((i) => i.currentProject === p.name);
    return { p, ops, recent, last, dozers, working: recent.length > 0 };
  });
  const active = rows.filter((r) => (r.p.status || 'Active') === 'Active');
  const working = rows.filter((r) => r.working);
  const wantsWorking = /working|operating|operational|in operation|running|on the ground|reporting/.test(text);
  const shown = wantsWorking ? working : rows;
  const statuses = breakdown(countBy(projects, 'status'));
  return reply(`${plural(projects.length, 'project (site)', 'projects (sites)')} on record: ${statuses}. ${plural(working.length, 'site')} had Daily Operations reports in the last 7 days${working.length ? ` (${working.map((r) => r.p.name).join(', ')})` : ''}.`,
    { head: ['Project / site', 'Status', 'Dozers deployed', 'Reports, last 7 days', 'Last report'], rows: shown.map((r) => [r.p.name, r.p.status || 'Active', String(r.dozers.length), String(r.recent.length), r.last ? dmy(r.last) : 'none']) },
    ['"Active" is the status set on the project; a site is "working" when it has Daily Operations reports in the last 7 days.']);
}

// ------------------------------------------------------------------ staff
function matchPeople(text, ctx) {
  const t = text.toLowerCase();
  const people = ctx.employees;
  const byId = people.filter((e) => new RegExp(`\\b${e.id.toLowerCase()}\\b`).test(t));
  if (byId.length) return byId;
  const tokens = cleanTokens(t).filter((x) => x.length >= 3 && !STOP.has(x));
  if (!tokens.length) return [];
  const scored = people.map((e) => {
    const parts = cleanTokens(e.name).filter((x) => x.length >= 2);
    const hits = tokens.filter((tk) => parts.some((p) => p === tk || (tk.length >= 4 && p.startsWith(tk)))).length;
    return { e, hits, full: hits === parts.filter((p) => p.length >= 3).length };
  }).filter((x) => x.hits > 0);
  if (!scored.length) return [];
  const best = Math.max(...scored.map((x) => x.hits));
  return scored.filter((x) => x.hits === best).map((x) => x.e);
}

function personCard(e, ctx, today) {
  const lines = [];
  lines.push(`${e.name} (${e.id}) is ${e.role ? `the ${e.role}` : 'on staff'}${e.department ? ` in ${e.department}` : ''}.`);
  lines.push(`Status: ${e.status || 'Active'}${e.dateHired ? `; hired ${dmy(e.dateHired)} (${tenure(e.dateHired, today)} ago)` : ''}${e.assignedProject ? `; assigned to ${e.assignedProject}` : ''}.`);
  const asOp = ctx.operations.filter((o) => o.operatorId === e.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  const asSup = ctx.operations.filter((o) => o.supervisorId === e.id).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (asOp.length) {
    const machines = [...new Set(asOp.slice(0, 15).map((o) => o.equipment))];
    lines.push(`Operates ${machines.join(', ')}; ${plural(new Set(asOp.map((o) => o.date)).size, 'day')} of reports on record, last on ${dmy(asOp[0].date)} (${ago(asOp[0].date, today)}).`);
  }
  if (asSup.length) lines.push(`Supervised ${plural(new Set(asSup.map((o) => o.date)).size, 'working day')} on site, last on ${dmy(asSup[0].date)} (${ago(asSup[0].date, today)}).`);
  const leave = (ctx.leaveRequests || []).filter((l) => l.employeeId === e.id && l.status === 'Approved' && l.startDate <= today && l.endDate >= today);
  if (leave.length) lines.push(`Currently on approved leave until ${dmy(leave[0].endDate)}.`);
  return lines.join(' ');
}

function staffAnswer(text, ctx, today) {
  let list = ctx.employees;
  const parts = [];
  const st = STATUS_WORDS.find(([re]) => re.test(text));
  if (st) { list = list.filter((e) => (e.status || 'Active') === st[1]); parts.push(st[1].toLowerCase()); }
  const dept = DEPARTMENTS.find(([re]) => re.test(text));
  if (dept) { list = list.filter((e) => e.department === dept[1]); parts.push(`in ${dept[1]}`); }
  const role = ROLE_WORDS.find(([re]) => re.test(text));
  if (role) { list = list.filter((e) => role[1].test(e.role || '')); parts.push(`${role[2].toLowerCase()}s`); }
  if (/on leave/.test(text)) {
    const onLeave = new Set((ctx.leaveRequests || []).filter((l) => l.status === 'Approved' && l.startDate <= today && l.endDate >= today).map((l) => l.employeeId));
    list = list.filter((e) => onLeave.has(e.id)); parts.push('on approved leave today');
  }
  const total = ctx.employees.length;
  const by = breakdown(countBy(ctx.employees, 'status'));
  const noun = role ? role[2].toLowerCase() + (list.length === 1 ? '' : 's') : (list.length === 1 ? 'staff member' : 'staff members');
  const adj = st ? `${st[1].toLowerCase()} ` : '';
  const where = [dept ? `in ${dept[1]}` : null, /on leave/.test(text) ? 'on approved leave today' : null].filter(Boolean).join(' ');
  const names = list.length && list.length <= 10 && list.length > 0 ? ` — ${list.map((e) => e.name).join(', ')}` : '';
  const split = !st && list.length > 1 ? ` (${breakdown(countBy(list, 'status'))})` : '';
  const text1 = `${fmt(list.length)} ${adj}${noun}${where ? ` ${where}` : (!role && !st ? ' on record' : '')}${split}${names}.${(role || st || dept || /on leave/.test(text)) ? ` All staff records: ${total} (${by}).` : ''}`;
  const rows = list.sort((a, b) => (a.name < b.name ? -1 : 1)).slice(0, TABLE_LIMIT).map((e) => [e.name, e.role || '—', e.department || '—', e.status || 'Active']);
  return reply(text1, rows.length ? { head: ['Name', 'Role', 'Department', 'Status'], rows } : null, list.length > TABLE_LIMIT ? [`Showing the first ${TABLE_LIMIT}.`] : []);
}

// ------------------------------------------------------- other record counts
const COUNTERS = [
  { re: /\binvoices?\b/, label: 'invoice', key: 'invoices', status: true, money: false },
  { re: /\bcustomers?\b|\bclients?\b/, label: 'customer', key: 'customers' },
  { re: /\bsuppliers?\b|\bvendors?\b/, label: 'supplier', key: 'suppliers' },
  { re: /purchase orders?|\bpos\b/, label: 'purchase order', key: 'purchaseOrders', status: true },
  { re: /\bloans?\b/, label: 'loan', key: 'loans', status: true },
  { re: /leave (requests?|applications?)|\bleaves?\b/, label: 'leave request', key: 'leaveRequests', status: true },
  { re: /\bassets?\b/, label: 'asset', key: 'assets', status: true },
  { re: /maintenance (logs?|records?|jobs?)|repairs? (logs?|records?)/, label: 'maintenance record', key: 'maintenanceLogs', status: true },
  { re: /\bexpenses?\b/, label: 'expense', key: 'expenses' },
  { re: /(daily )?operations? reports?|\breports? (submitted|filed)\b/, label: 'daily operations report', key: 'operations' },
  { re: /fund requests?/, label: 'fund request', key: 'fundRequests', status: true },
];

function counterAnswer(text, ctx, today) {
  const c = COUNTERS.find((x) => x.re.test(text) && Array.isArray(ctx[x.key]));
  if (!c) return null;
  let rows = ctx[c.key];
  let label = '';
  const st = text.match(/\b(pending|paid|unpaid|approved|rejected|received|active|repaid|defaulted|completed|in progress|scheduled|overdue)\b/);
  if (st && c.status) { const want = st[1]; rows = rows.filter((r) => (r.status || '').toLowerCase() === want || (want === 'unpaid' && (r.status || '').toLowerCase() === 'unpaid')); label = ` ${want}`; }
  if (c.key === 'operations' && /today|yesterday/.test(text)) { const d = /yesterday/.test(text) ? addDays(today, -1) : today; rows = rows.filter((r) => r.date === d); label = ` for ${dmy(d)}`; }
  if (!rows.length) return reply(`There are no${label} ${c.label}s recorded in the ERP${label ? '' : ' yet'}.`);
  const sample = c.status && !st ? ` (${breakdown(countBy(ctx[c.key], 'status'))})` : '';
  const names = rows.length && rows.length <= 8 && ['customers', 'suppliers', 'loans'].includes(c.key) ? ` — ${rows.map((r) => r.name || r.lender).join(', ')}` : '';
  return reply(`${plural(rows.length, c.label)}${label}${names}${sample}.`);
}

// ------------------------------------------------------------------ router
const OPS_WORDS = /hectare|\bha\b|profit|revenue|\bcost\b|diesel|litre|liter|\bhours?\b|output|late\b|started|resum|target|break.?even|margin|request|midejab|\bowe|payment|worked|working yesterday|reported|cleared|perform|best|worst|rank|compare|expense|spent/;
const COUNT_WORDS = /how many|number of|count|total number|list|which|what are|show|names? of|who are|how much staff|headcount/;


// ---------------------------------------------------------------------- oil
// "When did we last give Tope, Joshua and Jessy oil?" Looks for oil in paid or
// logged records (fund requests, maintenance logs, expenses) for each machine
// asked about, or for every owned dozer when none is named, and shows any oil
// request that is still waiting.
const OIL = /\boil\b/;
const NOT_OIL = /oil seal|oil filter|oil pump|oil cooler|oil pressure|oil leak|pumping into/;
// Names are spelt several ways in the chats (Jassie, Jessy, Jessie), so also compare them without vowels.
const skeleton = (w) => w[0] + w.slice(1).replace(/[aeiouy]/g, '');
const sameName = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b.slice(0, 4)) || b.startsWith(a.slice(0, 4)) || (skeleton(a).length >= 3 && skeleton(a) === skeleton(b))));

function oilKeywords(ctx, item) {
  const code = item.name.toLowerCase();
  const num = (code.match(/-(\d{3})$/) || [])[1];
  const keys = new Set([code, code.replace('-', ' '), code.replace('-', '')]);
  if (num) { keys.add(`emg${num}`); }
  const operators = new Set(ctx.operations.filter((o) => o.equipment === item.name && o.operatorId).map((o) => o.operatorId));
  ctx.employees.filter((e) => operators.has(e.id) || (e.role || '').toLowerCase().replace(/[^a-z0-9/]/g, '') === `operator/${code.replace('-', '')}`)
    .forEach((e) => cleanTokens(e.name).forEach((t) => { if (t.length >= 4) keys.add(`~${t}`); }));
  return [...keys];
}
const mentions = (text, keys) => {
  const t = text.toLowerCase();
  const words = cleanTokens(t);
  return keys.some((k) => (k.startsWith('~') ? words.some((w) => sameName(w, k.slice(1))) : t.includes(k)));
};

function oilRecords(ctx, item, today) {
  const keys = oilKeywords(ctx, item);
  const total = (r) => (r.items || []).reduce((n, i) => n + (i.amount || 0), 0);
  const out = [];
  ctx.fundRequests.forEach((r) => {
    const text = `${r.description || ''} ${(r.items || []).map((i) => i.description).join(' ')}`;
    if (OIL.test(text.toLowerCase()) && !NOT_OIL.test(text.toLowerCase()) && mentions(text, keys) && r.date <= today) out.push({ date: r.date, what: (r.items?.[0]?.description || r.description || '').slice(0, 70), amount: total(r), status: r.status, ref: r.id, kind: 'request' });
  });
  ctx.maintenanceLogs.forEach((m) => {
    const text = m.description || '';
    if (m.equipment === item.name && OIL.test(text.toLowerCase()) && !NOT_OIL.test(text.toLowerCase()) && m.date <= today) out.push({ date: m.date, what: text.slice(0, 70), amount: m.cost || 0, status: m.status, ref: m.id, kind: 'log' });
  });
  (ctx.expenses || []).forEach((e) => {
    const text = `${e.description || ''}`;
    if (OIL.test(text.toLowerCase()) && !NOT_OIL.test(text.toLowerCase()) && (e.equipment === item.name || mentions(text, keys)) && e.date <= today) out.push({ date: e.date, what: text.slice(0, 70), amount: e.amount || 0, status: 'Paid', ref: e.id, kind: 'expense' });
  });
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

function oilAnswer(text, ctx, today) {
  let items = findEquipment(text, ctx);
  // Operators named instead of machines ("Tope", "Joshua", "Jessy").
  const words = cleanTokens(text);
  heavyOf(ctx).forEach((item) => {
    if (items.some((i) => i.name === item.name)) return;
    if (words.some((w) => w.length >= 4 && oilKeywords(ctx, item).some((k) => k.startsWith('~') && sameName(w, k.slice(1))))) items = [...items, item];
  });
  const asked = items.length > 0;
  if (!asked) items = heavyOf(ctx).filter((i) => i.ownership === 'Company');
  const rows = []; const lines = [];
  items.forEach((item) => {
    const recs = oilRecords(ctx, item, today);
    const done = recs.find((r) => r.status === 'Paid' || r.status === 'Completed');
    const waiting = recs.filter((r) => r.status === 'Pending' || r.status === 'Approved');
    const operator = ctx.employees.find((e) => e.id === ctx.operations.filter((o) => o.equipment === item.name && o.operatorId).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.operatorId);
    const label = operator ? `${item.name} (${operator.name.split(' ')[0]})` : item.name;
    rows.push([label, done ? dmy(done.date) : 'none on record', done ? `${ago(done.date, today)}` : '—', done ? done.what : '—', done ? money(done.amount) : '—', waiting.length ? waiting.map((w) => `${w.ref} ${dmy(w.date)} ${money(w.amount)} (${w.status.toLowerCase()})`).join('; ') : '—']);
    lines.push(done ? `${label}: last oil ${dmy(done.date)}, ${ago(done.date, today)}` : `${label}: no oil purchase on record`);
  });
  const head = ['Machine', 'Last oil (paid or logged)', 'How long ago', 'Item', 'Amount', 'Waiting requests'];
  return reply(`${asked ? 'Last oil for the machines asked about' : 'Last oil purchase for each company dozer'}: ${lines.join('; ')}.`, { head, rows },
    ['Oil is matched by machine code, operator name and the maintenance logs. A request that only names the operator and not the machine is counted for that operator\'s machine.',
     'Records marked waiting are requests not yet paid.']);
}

export function answerFacts(question, ctx, { today }) {
  const text = ` ${(question || '').toLowerCase().replace(/god'?s\s*time/g, 'godstime')} `;
  const staffOk = !!ctx.canViewStaffRecords;
  const noStaff = () => reply('Staff records (who is who, headcount and suspensions) are HR information that only Admin accounts can see in the ERP, so I cannot answer that from this account.');
  const sensitive = /salary|salaries|\bpay\b|paid per|wage|phone|email|e-mail|password|username|login|bank account|account number/;

  // --- oil purchases ---------------------------------------------------------------
  if (OIL.test(text) && /\b(last|when|history|purchase[ds]?|bought|buy|gave|give|given|supplied|topped|recent|latest|since)\b/.test(text)) return oilAnswer(text, ctx, today);

  // --- a specific dozer / machine ------------------------------------------------
  const equipment = findEquipment(text, ctx);
  const equipmentIntent = /status|down|since when|how long|broke|broken|working|active|last (worked|service|repair)|service|who (operates|drives|runs)|operator of|tell me about|details|what is|about|where is|when|maintenance|available/.test(text);
  if (equipment.length && equipmentIntent && !(OPS_WORDS.test(text) && !/since when|how long|status|down|last/.test(text))) return equipmentAnswer(equipment, text, ctx, today);

  // --- sites / projects -----------------------------------------------------------
  const siteText = text.replace(/\bsite (managers?|assistants?|supervisors?|staff|engineers?)\b/g, ' ');
  if (/\b(sites?|projects?|locations?)\b/.test(siteText) && COUNT_WORDS.test(text) && !OPS_WORDS.test(text) && !/\b(dozers?|machines?)\b/.test(text)) return sitesAnswer(text, ctx, today);
  if (/\b(sites?|projects?)\b/.test(siteText) && /\bactive\b/.test(text) && !OPS_WORDS.test(text)) return sitesAnswer(text, ctx, today);

  // --- fleet ------------------------------------------------------------------------
  if (/\b(dozers?|bulldozers?|machines?|equipment|fleet|vehicles?|bikes?|motorbikes?)\b/.test(text) && (COUNT_WORDS.test(text) || /\b(down|broken|active|rented|status|idle|available|grounded|faulty)\b/.test(text)) && !OPS_WORDS.test(text.replace(/\bworking\b/g, ''))) return fleetAnswer(text, ctx, today);

  // --- people -----------------------------------------------------------------------
  const whoQuery = /\bwho\s+(is|are|was|s)\b|\bwho's\b|\btell me about\b|\bwhat does\b.*\bdo\b|\bprofile (of|for)\b|\bdetails? (of|on|about|for)\b|\binfo(rmation)? (on|about)\b|\bfind\b/.test(text);
  const staffWord = /\b(staff|employees?|workers|personnel|people|headcount|manpower|operators?|mechanics?|managers?|supervisors?|drivers?|transporters?|trainees?)\b/.test(text);
  const statusWord = STATUS_WORDS.some(([re]) => re.test(text)) && !/\b(dozers?|machines?)\b/.test(text);
  if (whoQuery && !/who (started|worked|was late|is (best|worst|late|top))|who (has|have|did|does|made|cleared)/.test(text)) {
    const roleHit = ROLE_WORDS.find(([re]) => re.test(text));
    const named = matchPeople(text.replace(/\bwho\s+(is|are|was)\b/g, ' '), ctx);
    // A role word with no name ("who is the CEO") lists people in that role.
    const roleOnly = roleHit && (!named.length || named.length === ctx.employees.length);
    if (roleOnly) {
      if (!staffOk) return noStaff();
      const hits = ctx.employees.filter((e) => roleHit[1].test(e.role || ''));
      if (hits.length === 1) return reply(personCard(hits[0], ctx, today));
      if (hits.length) return reply(`${plural(hits.length, roleHit[2].toLowerCase())}: ${hits.map((e) => `${e.name} (${e.status || 'Active'})`).join(', ')}.`, { head: ['Name', 'Role', 'Department', 'Status'], rows: hits.map((e) => [e.name, e.role || '—', e.department || '—', e.status || 'Active']) });
    }
    if (named.length && named.length < ctx.employees.length) {
      if (!staffOk) return noStaff();
      if (named.length === 1) return reply(personCard(named[0], ctx, today), null, ['Pay, phone, e-mail and login details are not shown here.']);
      return reply(`${named.length} staff records match that name:`, { head: ['Name', 'Role', 'Department', 'Status'], rows: named.map((e) => [e.name, e.role || '—', e.department || '—', e.status || 'Active']) }, ['Ask again with the full name or ID to see one person in full.']);
    }
    if (roleHit === undefined && !named.length && /who (is|are|was)/.test(text) && !staffWord && staffOk && /\w+\s+\w+/.test(text.trim())) {
      return reply('I could not find a staff member, dozer or site by that name in the ERP. Try the full name or the staff ID (for example EMP-26).');
    }
  }

  if (sensitive.test(text) && /(salary|salaries|wage|phone|email|e-mail|password|username|login|bank account|account number|\bpay\b)/.test(text) && matchPeople(text, ctx).length && staffWord !== true) {
    return reply('I do not give out pay, contact or login details. Those are in HR & Employees and Payroll for the accounts allowed to see them.');
  }

  if ((staffWord || statusWord) && (COUNT_WORDS.test(text) || statusWord) && !OPS_WORDS.test(text)) {
    if (!staffOk) return noStaff();
    return staffAnswer(text, ctx, today);
  }

  // --- counts of other records -------------------------------------------------------
  if (COUNT_WORDS.test(text) && !OPS_WORDS.test(text.replace(/\bexpenses?\b|\bpayments?\b/g, ''))) {
    const c = counterAnswer(text, ctx, today);
    if (c) return c;
  }
  return null;
}

export const FACT_EXAMPLES = [
  'Who is Davidson Olumide?',
  'How many sites are active?',
  'How many dozers are down?',
  'Since when has EMG-004 been down?',
  'How many staff are on suspension?',
  'Who are the site managers?',
  'How many dozers are rented?',
  'Which dozers are on Kangidi?',
  'When did we last give Tope, Joshua and Jessy oil?',
];
