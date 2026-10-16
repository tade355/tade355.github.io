// Excel data import: turns the rows of the upload template into a plan of what
// would be added to / changed in the ERP, before anything is written.
//
// Pure (no store / DOM imports): the page reads the workbook, builds `book`
// and `ctx`, calls planImport(), shows the preview, and only then writes.
//
// book = { [sheet name]: { rows: [{ rowNumber, cells: { <normalised header>: value } }] } }
// Nothing is ever deleted. A row that already exists is skipped, or — only
// when "replace" is switched on — updated in place.
import { OPERATION_TYPES, EXPENSE_CATEGORIES, dieselUsedFor } from './constants.js';
import { findEquipment } from './askErpFacts.js';

export const SHEET_KEYS = {
  'daily reports': 'operations',
  'diesel supply': 'distributions',
  'station collections': 'collections',
  'station payments': 'stationPayments',
  'fund requests': 'fundRequests',
  'payments made': 'requestPayments',
  'stock count': 'stockCounts',
};
export const SHEET_TITLES = {
  operations: 'Daily Reports', distributions: 'Diesel Supply', collections: 'Station Collections',
  stationPayments: 'Station Payments', fundRequests: 'Fund Requests', requestPayments: 'Payments Made', stockCounts: 'Stock Count',
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const normHeader = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const blank = (v) => v === undefined || v === null || String(v).trim() === '';
const text = (v) => (blank(v) ? '' : String(v).trim());
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const validYMD = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };

// ---------------------------------------------------------------- parsing
// Excel stores dates as day numbers (1900 system) and times as day fractions.
export function toDateISO(v) {
  if (blank(v)) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return undefined;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim().toLowerCase();
  let m = s.match(/^(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return validYMD(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : undefined;
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})$/);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return validYMD(y, +m[2], +m[1]) ? iso(y, +m[2], +m[1]) : undefined; }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[-/. ]*([a-z]{3,9})[-/. ,]*(\d{2}|\d{4})?$/);
  if (m && MONTHS.includes(m[2].slice(0, 3))) { const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null; return y && validYMD(y, MONTHS.indexOf(m[2].slice(0, 3)) + 1, +m[1]) ? iso(y, MONTHS.indexOf(m[2].slice(0, 3)) + 1, +m[1]) : undefined; }
  return undefined;
}

// -> 'HH:MM' (24h), null when blank, undefined when it cannot be read.
export function toTime(v) {
  if (blank(v)) return null;
  const hhmm = (h, mi) => (h >= 0 && h < 24 && mi >= 0 && mi < 60 ? `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` : undefined);
  if (typeof v === 'number') {
    if (v < 0 || v >= 1) return undefined;
    const mins = Math.round(v * 1440);
    return hhmm(Math.floor(mins / 60) % 24, mins % 60);
  }
  const s = String(v).trim().toLowerCase().replace(/\s+/g, '');
  const m = s.match(/^(\d{1,2})(?:[:.h](\d{2}))?(am|pm)?$/);
  if (!m) return undefined;
  let h = +m[1]; const mi = m[2] ? +m[2] : 0;
  if (m[3]) { if (h < 1 || h > 12) return undefined; h = (h % 12) + (m[3] === 'pm' ? 12 : 0); }
  return hhmm(h, mi);
}

export function toNumber(v) {
  if (blank(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = Number(String(v).replace(/[₦,\s]/g, '').replace(/(litres?|liters?|ltrs?|l|ha|hrs?|hours?)$/i, ''));
  return Number.isFinite(n) ? n : undefined;
}

const cell = (row, ...names) => {
  for (const n of names) if (!blank(row.cells[n])) return row.cells[n];
  return '';
};

// ------------------------------------------------------------ resolvers
const ALIASES = [[/jassie|jessy|jesse/g, 'jessie'], [/god'?s\s*time/g, 'godstime']];
const aliased = (s) => ALIASES.reduce((t, [re, to]) => t.replace(re, to), String(s).toLowerCase());
const tokensOf = (s) => aliased(s).replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((t) => t.length >= 3);

export function resolveSite(v, ctx) {
  const s = text(v);
  if (!s) return { error: 'Site is missing.' };
  const names = (ctx.projects || []).map((p) => p.name);
  const n = normHeader(s);
  const exact = names.filter((x) => normHeader(x) === n);
  if (exact.length === 1) return { value: exact[0] };
  const loose = names.filter((x) => normHeader(x).includes(n) || n.includes(normHeader(x)));
  if (loose.length === 1) return { value: loose[0] };
  return { error: loose.length ? `Site "${s}" matches more than one project (${loose.join(', ')}).` : `Site "${s}" is not a project in the ERP.` };
}

export function resolveDozer(v, ctx) {
  const s = text(v);
  if (!s) return { error: 'Dozer is missing.' };
  const heavy = ctx.inventory.filter((i) => i.category === 'Heavy Equipment');
  const exact = heavy.filter((i) => normHeader(i.name) === normHeader(s));
  if (exact.length === 1) return { value: exact[0].name, item: exact[0] };
  const found = findEquipment(s, { ...ctx, inventory: heavy });
  if (found.length === 1) return { value: found[0].name, item: found[0] };
  return { error: found.length ? `Dozer "${s}" matches more than one machine (${found.map((f) => f.name).join(', ')}).` : `Dozer "${s}" is not in the fleet.` };
}

// People are matched by staff ID or by name. When a first name fits several
// people, the operator whose role names this dozer wins, then active staff.
export function resolvePerson(v, ctx, { dozer, kind } = {}) {
  const s = text(v);
  if (!s) return { value: null };
  const people = ctx.employees || [];
  const byId = people.find((e) => e.id.toLowerCase() === s.toLowerCase());
  if (byId) return { value: byId.id, name: byId.name };
  const tokens = tokensOf(s);
  if (!tokens.length) return { error: `Could not read the name "${s}".` };
  let scored = people.map((e) => {
    const parts = tokensOf(e.name);
    return { e, hits: tokens.filter((t) => parts.some((p) => p === t || (t.length >= 4 && p.startsWith(t)))).length };
  }).filter((x) => x.hits > 0);
  if (!scored.length) return { error: `"${s}" is not a staff member in the ERP.` };
  const best = Math.max(...scored.map((x) => x.hits));
  scored = scored.filter((x) => x.hits === best);
  if (scored.length > 1 && dozer) {
    const code = dozer.toLowerCase().replace(/[^a-z0-9]/g, '');
    const byRole = scored.filter((x) => (x.e.role || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(code));
    if (byRole.length === 1) scored = byRole;
  }
  if (scored.length > 1) {
    const active = scored.filter((x) => (x.e.status || 'Active') === 'Active');
    if (active.length >= 1 && active.length < scored.length) scored = active;
  }
  if (scored.length > 1 && kind === 'operator') {
    const ops = scored.filter((x) => /operator/i.test(x.e.role || ''));
    if (ops.length >= 1) scored = ops;
  }
  if (scored.length > 1) return { error: `"${s}" matches ${scored.map((x) => `${x.e.name} (${x.e.id})`).join(' and ')} — use the staff ID.` };
  return { value: scored[0].e.id, name: scored[0].e.name };
}

const sumItems = (r) => (r.items || []).reduce((t, i) => t + (i.amount || 0), 0);

// ---------------------------------------------------------- row builders
// Each returns { record, messages: [errors], warnings: [] , ...matching info }.
function readDate(row, ctx, errs, ...names) {
  const raw = cell(row, ...names);
  const d = toDateISO(raw);
  if (d === null) { errs.push('Date is missing.'); return null; }
  if (d === undefined) { errs.push(`Date "${raw}" is not a valid date (use dd/mm/yyyy).`); return null; }
  if (ctx.today && d > ctx.today) { errs.push(`Date ${d} is in the future.`); return null; }
  return d;
}
function num(row, errs, label, { required = false, min = 0, max = Infinity, names }) {
  const raw = cell(row, ...names);
  const n = toNumber(raw);
  if (n === null) { if (required) errs.push(`${label} is missing.`); return null; }
  if (n === undefined) { errs.push(`${label} "${raw}" is not a number.`); return null; }
  if (n < min || n > max) { errs.push(`${label} ${n} is outside the allowed range (${min} to ${max === Infinity ? 'any' : max}).`); return null; }
  return n;
}

function buildOperation(row, ctx) {
  const errs = []; const warns = [];
  const date = readDate(row, ctx, errs, 'date');
  const site = resolveSite(cell(row, 'site', 'project'), ctx); if (site.error) errs.push(site.error);
  const dozer = resolveDozer(cell(row, 'dozer', 'machine', 'equipment'), ctx); if (dozer.error) errs.push(dozer.error);
  const operator = resolvePerson(cell(row, 'operator'), ctx, { dozer: dozer.value, kind: 'operator' }); if (operator.error) errs.push(operator.error);
  const supervisor = resolvePerson(cell(row, 'supervisor', 'site manager'), ctx, { kind: 'supervisor' }); if (supervisor.error) errs.push(supervisor.error);
  if (!operator.error && operator.value === null) warns.push('No operator given, so no operator allowance is counted for this report.');
  if (!supervisor.error && supervisor.value === null) warns.push('No supervisor given.');
  const hours = num(row, errs, 'Hours Worked', { required: true, max: 24, names: ['hours worked', 'hours', 'hrs worked'] });
  const ha = num(row, errs, 'Hectares', { required: true, max: 20, names: ['hectares', 'ha', 'hectares achieved', 'hectares cleared'] });
  const supplied = num(row, errs, 'Diesel Supplied', { names: ['diesel supplied l', 'diesel supplied'] });
  const opening = num(row, errs, 'Opening Diesel', { names: ['opening diesel l', 'opening diesel'] });
  const closing = num(row, errs, 'Closing Diesel', { names: ['closing diesel l', 'closing diesel'] });
  let used = num(row, errs, 'Diesel Used', { names: ['diesel used l', 'diesel used'] });
  const startRaw = cell(row, 'start time', 'time started', 'started'); const stopRaw = cell(row, 'stop time', 'time stopped', 'closed', 'time closed');
  const start = toTime(startRaw); const stop = toTime(stopRaw);
  if (start === undefined) errs.push(`Start Time "${startRaw}" is not a time (use e.g. 7:50 AM).`);
  if (stop === undefined) errs.push(`Stop Time "${stopRaw}" is not a time (use e.g. 4:00 PM).`);
  const typeRaw = text(cell(row, 'operation type', 'type')) || 'Phase 1';
  const type = OPERATION_TYPES.find((t) => normHeader(t.value) === normHeader(typeRaw));
  if (!type) errs.push(`Operation Type "${typeRaw}" is not one of: ${OPERATION_TYPES.map((t) => t.value).join(', ')}.`);
  const statusRaw = text(cell(row, 'status')) || 'Completed';
  const status = ['Completed', 'Ongoing', 'Halted'].find((s) => s.toLowerCase() === statusRaw.toLowerCase());
  if (!status) errs.push(`Status "${statusRaw}" must be Completed, Ongoing or Halted.`);
  let workType = text(cell(row, 'work type'));
  if (workType) { const w = ['Office', 'Business'].find((x) => x.toLowerCase() === workType.toLowerCase()); if (!w) errs.push('Work Type must be Office or Business (or blank).'); workType = w || ''; }
  const bizAmount = num(row, errs, 'Business Amount', { names: ['business amount'] });
  if (workType === 'Business' && bizAmount === null) warns.push('Business day without a Business Amount.');
  if (errs.length) return { errs, warns };

  const item = dozer.item;
  if (!workType && item && item.ownership && item.ownership !== 'Company') workType = 'Office';
  if (used === null) used = dieselUsedFor(item || {}, type.value, hours);
  if (ha > 5) warns.push(`${ha} ha in one day is unusually high — check.`);
  if (hours > 0 && ha / ((hours / 8) * 1.3) > 2) warns.push('Output is more than twice the expected 1.3 ha per 8 hrs — check.');
  if (hours > 12) warns.push(`${hours} hours is a long day — check.`);
  const remarks = text(cell(row, 'remarks', 'notes', 'remark'));
  const who = [operator.name ? `Operator: ${operator.name}.` : null, supervisor.name ? `Supervisor: ${supervisor.name}.` : null].filter(Boolean).join(' ');
  const record = {
    date, siteName: site.value, equipment: dozer.value, operatorId: operator.value, supervisorId: supervisor.value,
    hoursWorked: hours, quantity: ha, fuelUsed: used, status, operationType: type.value,
    workType: workType || null, businessAmount: workType === 'Business' ? bizAmount : null,
    timeResumed: start, timeClosed: stop, blockNumber: text(cell(row, 'block', 'block number', 'plot')) || null,
    dieselSupplied: supplied, openingDiesel: opening, closingDiesel: closing,
    notes: [who, remarks].filter(Boolean).join(' ') || null, attachments: [],
  };
  return { record, warns, summary: `${date} · ${dozer.value} · ${hours} hrs · ${ha} ha`, key: { date, equipment: dozer.value, siteName: site.value } };
}

function buildDistribution(row, ctx) {
  const errs = []; const warns = [];
  const date = readDate(row, ctx, errs, 'date');
  const site = resolveSite(cell(row, 'site', 'project'), ctx); if (site.error) errs.push(site.error);
  const dozer = resolveDozer(cell(row, 'dozer', 'machine', 'equipment'), ctx); if (dozer.error) errs.push(dozer.error);
  const litres = num(row, errs, 'Litres', { required: true, max: 5000, names: ['litres', 'liters', 'diesel supplied', 'diesel litres'] });
  if (litres === 0) errs.push('Litres must be more than zero.');
  if (errs.length) return { errs, warns };
  if (litres > 600) warns.push(`${litres} L to one dozer in a day is a lot — check.`);
  return { record: { date, project: site.value, equipment: dozer.value, litres, notes: text(cell(row, 'notes', 'remarks')) || null }, warns, summary: `${date} · ${dozer.value} · ${litres} L`, key: { date, project: site.value, equipment: dozer.value } };
}

function stationOf(row, ctx, errs) {
  const s = text(cell(row, 'station'));
  const known = [...new Set([...(ctx.fuelCreditCollections || []).map((c) => c.station), ...(ctx.fuelCreditPayments || []).map((c) => c.station)].filter(Boolean))];
  if (!s) { if (known.length === 1) return known[0]; errs.push('Station is missing.'); return null; }
  const hit = known.filter((k) => normHeader(k) === normHeader(s) || normHeader(k).includes(normHeader(s)));
  if (hit.length === 1) return hit[0];
  return s; // a new station name is allowed — it is created by the first record
}

function buildCollection(row, ctx) {
  const errs = []; const warns = [];
  const date = readDate(row, ctx, errs, 'date');
  const station = stationOf(row, ctx, errs);
  const fuelRaw = text(cell(row, 'fuel', 'fuel type', 'product'));
  const fuel = ['Diesel', 'PMS'].find((f) => f.toLowerCase() === fuelRaw.toLowerCase() || (f === 'Diesel' && /^ago$/i.test(fuelRaw)));
  if (!fuel) errs.push(`Fuel "${fuelRaw}" must be Diesel (AGO) or PMS.`);
  const litres = num(row, errs, 'Litres', { required: true, max: 100000, names: ['litres', 'liters'] });
  if (litres === 0) errs.push('Litres must be more than zero.');
  let price = num(row, errs, 'Price per Litre', { names: ['price per litre', 'price', 'unit price', 'rate'] });
  if (errs.length) return { errs, warns };
  if (price === null) {
    if (fuel === 'Diesel') price = ctx.dieselRateAsOf ? ctx.dieselRateAsOf(date) : 1900;
    else { const last = [...(ctx.fuelCreditCollections || [])].filter((c) => c.fuelType === 'PMS').sort((a, b) => (a.date < b.date ? 1 : -1))[0]; price = last ? last.unitPrice : 1385; }
    warns.push(`No price given, so ₦${price.toLocaleString()} per litre was used.`);
  }
  return { record: { date, station, fuelType: fuel, litres, unitPrice: price, notes: text(cell(row, 'notes', 'remarks')) || null }, warns, summary: `${date} · ${litres} L ${fuel} · ₦${Math.round(litres * price).toLocaleString()}`, key: { date, station, fuelType: fuel, litres, unitPrice: price } };
}

function buildStationPayment(row, ctx) {
  const errs = []; const warns = [];
  const date = readDate(row, ctx, errs, 'date', 'date paid');
  const station = stationOf(row, ctx, errs);
  const amount = num(row, errs, 'Amount', { required: true, max: 1e9, names: ['amount', 'amount paid'] });
  if (amount === 0) errs.push('Amount must be more than zero.');
  if (errs.length) return { errs, warns };
  return { record: { date, station, amount, reference: text(cell(row, 'reference', 'ref')) || null, notes: text(cell(row, 'notes', 'remarks')) || null }, warns, summary: `${date} · ₦${amount.toLocaleString()} to ${station}`, key: { date, station, amount } };
}

function buildStockCount(row, ctx) {
  const errs = []; const warns = [];
  const date = readDate(row, ctx, errs, 'date');
  const litres = num(row, errs, 'Litres on Ground', { required: true, max: 100000, names: ['litres on ground', 'litres', 'on ground', 'counted litres'] });
  const by = resolvePerson(cell(row, 'counted by'), ctx); if (by.error) errs.push(by.error);
  if (errs.length) return { errs, warns };
  return { record: { date, countedLitres: litres, countedBy: by.value, notes: text(cell(row, 'notes', 'remarks')) || null }, warns, summary: `${date} · ${litres} L on ground`, key: { date } };
}

function buildRequestPayment(row, ctx) {
  const errs = []; const warns = [];
  const id = text(cell(row, 'request id', 'request', 'id')).toUpperCase();
  const paidOn = readDate(row, ctx, errs, 'date paid', 'date');
  const amount = num(row, errs, 'Amount', { names: ['amount', 'amount paid'] });
  if (!id) errs.push('Request ID is missing (for example FR-96).');
  const req = id ? (ctx.fundRequests || []).find((r) => r.id.toUpperCase() === id) : null;
  if (id && !req) errs.push(`Request ${id} is not in the ERP.`);
  if (req && req.status === 'Rejected') errs.push(`Request ${id} was rejected, so it cannot be marked Paid.`);
  if (errs.length) return { errs, warns };
  const total = sumItems(req);
  if (amount !== null && Math.round(amount) !== Math.round(total)) warns.push(`The request totals ₦${total.toLocaleString()} but the payment is ₦${amount.toLocaleString()}.`);
  return { record: { status: 'Paid' }, existingId: req.id, alreadyDone: req.status === 'Paid', warns, summary: `${req.id} · ${req.description || ''}`.slice(0, 90) + ` · ₦${total.toLocaleString()}`, key: {} };
}

// Fund requests: rows sharing a "Request Ref" are the line items of one request.
function buildFundRequests(rows, ctx) {
  const groups = new Map();
  rows.forEach((row, i) => {
    const ref = text(cell(row, 'request ref', 'ref', 'request')) || `__row${i}`;
    if (!groups.has(ref)) groups.set(ref, []);
    groups.get(ref).push(row);
  });
  return [...groups.entries()].map(([ref, lines]) => {
    const first = lines[0];
    const errs = []; const warns = [];
    const date = readDate(first, ctx, errs, 'date');
    const site = resolveSite(cell(first, 'site', 'project'), ctx); if (site.error) errs.push(site.error);
    const by = resolvePerson(cell(first, 'submitted by'), ctx, { kind: 'supervisor' }); if (by.error) errs.push(by.error);
    const headRaw = text(cell(first, 'category', 'cost head'));
    const head = headRaw ? EXPENSE_CATEGORIES.find((c) => normHeader(c) === normHeader(headRaw)) : '';
    if (headRaw && !head) errs.push(`Category "${headRaw}" must be one of: ${EXPENSE_CATEGORIES.join(', ')}.`);
    const statusRaw = text(cell(first, 'status')) || 'Pending';
    const status = ['Pending', 'Approved', 'Paid', 'Rejected'].find((s) => s.toLowerCase() === statusRaw.toLowerCase());
    if (!status) errs.push(`Status "${statusRaw}" must be Pending, Approved, Paid or Rejected.`);
    const description = text(cell(first, 'request description', 'description'));
    if (!description) errs.push('Request Description is missing.');
    const items = [];
    lines.forEach((l, k) => {
      const amount = toNumber(cell(l, 'amount'));
      const label = text(cell(l, 'item', 'item description')) || description;
      if (amount === null || amount === undefined || amount <= 0) errs.push(`Line ${k + 1}: Amount must be a number above zero.`);
      else items.push({ description: label, amount, accountName: text(cell(l, 'account name')) || null, accountNumber: text(cell(l, 'account number')) || null, bankName: text(cell(l, 'bank')) || null });
    });
    const rowNumbers = lines.map((l) => l.rowNumber);
    if (errs.length) return { rowNumber: rowNumbers[0], rowNumbers, errs, warns };
    const record = { date, project: site.value, submittedBy: by.value, description, costHead: head || null, status, items, attachments: [] };
    const total = items.reduce((t, i) => t + i.amount, 0);
    return { rowNumber: rowNumbers[0], rowNumbers, record, warns, summary: `${date} · ${description.slice(0, 60)} · ₦${total.toLocaleString()} · ${status}`, key: { date, project: site.value, description: normHeader(description), total } };
  });
}

// ------------------------------------------------------------------ planner
const BUILDERS = { operations: buildOperation, distributions: buildDistribution, collections: buildCollection, stationPayments: buildStationPayment, stockCounts: buildStockCount, requestPayments: buildRequestPayment };

function existingFor(key, built, ctx) {
  const k = built.key;
  const eq = (a, b) => a === b;
  if (key === 'operations') return ctx.operations.filter((o) => eq(o.date, k.date) && eq(o.equipment, k.equipment) && eq(o.siteName, k.siteName));
  if (key === 'distributions') return (ctx.distributions || []).filter((d) => eq(d.date, k.date) && eq(d.equipment, k.equipment) && eq(d.project, k.project));
  if (key === 'collections') return (ctx.fuelCreditCollections || []).filter((c) => eq(c.date, k.date) && eq(c.station, k.station) && eq(c.fuelType, k.fuelType) && Number(c.litres) === k.litres && Number(c.unitPrice) === k.unitPrice);
  if (key === 'stationPayments') return (ctx.fuelCreditPayments || []).filter((p) => eq(p.date, k.date) && eq(p.station, k.station) && Number(p.amount) === k.amount);
  if (key === 'stockCounts') return (ctx.dieselStockCounts || []).filter((c) => eq(c.date, k.date));
  if (key === 'fundRequests') return (ctx.fundRequests || []).filter((r) => eq(r.date, k.date) && eq(r.project, k.project) && normHeader(r.description) === k.description && Math.round(sumItems(r)) === Math.round(k.total));
  return [];
}
const COLLECTION_OF = { operations: 'operations', distributions: 'dieselSiteDistributions', collections: 'fuelCreditCollections', stationPayments: 'fuelCreditPayments', stockCounts: 'dieselStockCounts', fundRequests: 'fundRequests', requestPayments: 'fundRequests' };
const REPLACEABLE = new Set(['operations', 'distributions', 'stockCounts']);

export function planImport(book, ctx, { replace = false } = {}) {
  const sheets = [];
  const unknown = [];
  Object.entries(book).forEach(([name, sheet]) => {
    const key = SHEET_KEYS[normHeader(name)];
    if (!key) { if (!/^(instructions?|lists?|read me|readme)$/i.test(name.trim())) unknown.push(name); return; }
    const rows = (sheet.rows || []).filter((r) => {
      const vals = Object.values(r.cells).filter((v) => !blank(v));
      if (!vals.length) return false;
      return !/^e\.?g\.?/i.test(String(vals[0]).trim()); // the grey example row
    });
    let items;
    if (key === 'fundRequests') items = buildFundRequests(rows, ctx);
    else items = rows.map((row) => ({ rowNumber: row.rowNumber, rowNumbers: [row.rowNumber], ...BUILDERS[key](row, ctx) }));

    const seen = new Set();
    const out = items.map((b) => {
      const base = { rowNumber: b.rowNumber, rowNumbers: b.rowNumbers, collection: COLLECTION_OF[key], warnings: b.warns || [], summary: b.summary };
      if (b.errs && b.errs.length) return { ...base, action: 'error', messages: b.errs };
      if (key === 'requestPayments') {
        if (b.alreadyDone) return { ...base, action: 'skip', messages: ['Already marked Paid.'] };
        const dupKey = `pay|${b.existingId}`;
        if (seen.has(dupKey)) return { ...base, action: 'skip', messages: ['Listed twice in this file.'] };
        seen.add(dupKey);
        return { ...base, action: 'update', id: b.existingId, record: b.record, messages: [] };
      }
      const dupKey = `${key}|${JSON.stringify(b.key)}`;
      if (seen.has(dupKey)) return { ...base, action: 'skip', messages: ['Listed twice in this file.'] };
      seen.add(dupKey);
      const existing = existingFor(key, b, ctx);
      if (existing.length) {
        if (replace && REPLACEABLE.has(key)) {
          if (existing.length === 1) return { ...base, action: 'update', id: existing[0].id, record: b.record, messages: ['Replaces the report already in the ERP for this day.'] };
          return { ...base, action: 'error', messages: [`${existing.length} records already exist for this day — edit them in the ERP instead.`] };
        }
        return { ...base, action: 'skip', messages: ['Already in the ERP.'] };
      }
      return { ...base, action: 'add', record: b.record, messages: [] };
    });
    sheets.push({ key, name: SHEET_TITLES[key], rows: out });
  });
  const counts = { add: 0, update: 0, skip: 0, error: 0 };
  sheets.forEach((s) => s.rows.forEach((r) => { counts[r.action] += 1; }));
  return { sheets, counts, unknownSheets: unknown };
}

// Header row + rows -> the `book` shape, from a sheet as an array of arrays.
export function sheetFromAoa(aoa, offset = 0) {
  const headerIndex = aoa.findIndex((r) => r.filter((c) => !blank(c)).length >= 2);
  if (headerIndex < 0) return { rows: [] };
  const headers = aoa[headerIndex].map(normHeader);
  const rows = [];
  for (let i = headerIndex + 1; i < aoa.length; i += 1) {
    const cells = {};
    headers.forEach((h, c) => { if (h) cells[h] = aoa[i][c]; });
    rows.push({ rowNumber: i + 1 + offset, cells });
  }
  return { rows };
}
