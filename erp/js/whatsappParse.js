// Paste Entry: reads a WhatsApp message (or a whole pasted chat) and turns it
// into a preview of ERP rows. Nothing is written here — the page shows the rows
// and only saves the ones the user confirms.
//
// Pure (no store / DOM imports): the page passes `ctx` (see reportContext.js:
// operations, inventory, employees, projects, distributions, fuelCreditCollections,
// fuelCreditPayments, fundRequests) and today's date.
//
// parseWhatsApp(text, ctx, { today }) -> { kind, rows, warnings, unmatched, reconciliation, ignored }
//   kind   'dailyReport' | 'dieselDistribution' | 'fundRequest' | 'stationCollection'
//          | 'mixed' (several kinds pasted together) | 'unknown'
//   rows   [{ n, kind, collection, record, title, status, flags, selected, existing }]
//            status 'ok'      ready to save
//                   'check'   saveable, but something needs a look (unticked by default)
//                   'exists'  already in the ERP (or listed twice): not saved again
//                   'blocked' something is missing or not matched: cannot be saved
//            flags  [{ level: 'info' | 'check' | 'block', text }]
//   unmatched  names (operators, supervisors, machines, sites) that did not match
//              the ERP. A row with an unmatched name is blocked, never guessed.
//
// Dates without a year use today's year. A date is never invented: a message
// with no date gives a blocked row.
import { planImport, resolveDozer, resolvePerson, resolveSite, normHeader, toTime } from './importPlan.js';
import { findDuplicateRequests, duplicateKind, requestTotal } from './requestDuplicates.js';

export const KIND_LABELS = {
  dailyReport: 'End-of-day report',
  dieselDistribution: 'Diesel distribution',
  fundRequest: 'Fund request',
  stationCollection: 'Station collection',
};

// ------------------------------------------------------------------ helpers
const clean = (s) => String(s ?? '').replace(/[‎‏‪-‮⁦-⁩﻿]/g, '').replace(/ /g, ' ');
const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const stripMark = (l) => String(l).replace(/[*_~]/g, '');
const stripLead = (l) => String(l).replace(/^[^\p{L}\p{N}#₦(]+/u, '');
const fmt = (n) => String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const naira = (n) => `₦${fmt(n)}`;
const flag = (level, text) => ({ level, text });
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const validYMD = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthIndex = (w) => { const s = String(w).toLowerCase().replace(/[^a-z]/g, ''); return s.length < 3 ? -1 : MONTH_NAMES.findIndex((n) => n.startsWith(s)); };

// Finds the first date written in `text`. -> null (none) | { error } | { iso, assumedYear, dayOnly }
//   17/10/26  17-10-2026  17th October 2026  17 Oct  Oct 14, 2026  13th
export function findDate(text, { today, stamp } = {}) {
  const s = clean(text);
  const thisYear = stamp?.y || +(today || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const yearOf = (raw) => {
    if (!raw) return null;
    const y = raw.length === 2 ? 2000 + +raw : +raw;
    return y >= 2000 && y <= 2100 ? y : null; // "@1900" after a date is a price, not a year
  };
  const make = (d, m, rawYear) => {
    const y = yearOf(rawYear) || thisYear;
    if (!validYMD(y, m, d)) return { error: `"${squash(s).slice(0, 40)}" is not a valid date.` };
    return { iso: iso(y, m, d), assumedYear: !yearOf(rawYear), dayOnly: false };
  };
  let m = s.match(/(?<![\d/])(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4}|\d{2})(?!\d)/);
  if (m) return make(+m[1], +m[2], m[3]);
  m = s.match(/(?<![\d/.:])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/:])/); // 19/10 (no year)
  if (m) return make(+m[1], +m[2], null);
  for (const x of s.matchAll(/(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([A-Za-z]{3,9})\.?[\s,.]*(\d{4}|\d{2})?(?!\d)/g)) {
    const mi = monthIndex(x[2]);
    if (mi >= 0) return make(+x[1], mi + 1, x[3]);
  }
  for (const x of s.matchAll(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?(?!\d)/g)) {
    const mi = monthIndex(x[1]);
    if (mi >= 0) return make(+x[2], mi + 1, x[3]);
  }
  m = s.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
  if (m) {
    const mo = stamp?.m || +(today || new Date().toISOString().slice(0, 10)).slice(5, 7);
    const r = make(+m[1], mo, null);
    return r.error ? r : { ...r, dayOnly: true };
  }
  return null;
}

// "8hrs", "8 hours", "8hrs + 2 Extra hours (1 hour paid)", "7hrs 30mins" -> { hours, extra, note }
function readHours(raw) {
  const s = squash(raw);
  if (!s) return null;
  const note = (s.match(/\(([^)]*)\)/) || [])[1] || '';
  const body = s.replace(/\([^)]*\)/g, ' ');
  const first = body.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)?/i);
  if (!first) return { error: `Hours "${s}" could not be read.` };
  let hours = +first[1];
  const rest = body.slice(first.index + first[0].length);
  const mins = rest.match(/(\d+)\s*(?:mins?|minutes?)\b/i);
  const more = rest.match(/(\d+(?:\.\d+)?)\s*(?:extra\s+)?(?:hours?|hrs?)\b/i);
  let extra = 0;
  if (mins) hours += +mins[1] / 60;
  else if (more) { extra = +more[1]; hours += extra; }
  return { hours: Math.round(hours * 100) / 100, extra, note };
}

const numOf = (v) => {
  const s = squash(v);
  if (!s) return null;
  if (/^(nil+|none|zero|empty)\b/i.test(s)) return 0;
  const m = s.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
};

function timeOf(v) {
  const m = squash(v).match(/(\d{1,2})\s*[:.hH]\s*(\d{2})\s*([AaPp][Mm])?|(\d{1,2})\s*([AaPp][Mm])/);
  if (!m) return squash(v) ? undefined : null;
  return toTime(m[1] ? `${m[1]}:${m[2]}${m[3] || ''}` : `${m[4]}${m[5]}`);
}

// Spellings seen in the chats -> the spelling the ERP names use.
export function cleanName(s) {
  return squash(String(s ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(engr|mr|mrs|oga|d8[hk])\b\.?/gi, ' ')
    .replace(/\bconlins?\b/gi, 'Collins')
    .replace(/\bj[ae]s{1,2}(?:[iy]e?|e)\b/gi, 'Jessie')
    .replace(/\bgod[’']?s\s*t?ime\b/gi, 'Godstime')
    .replace(/[^\p{L}\p{N}'’\s.-]/gu, ' '));
}

// ------------------------------------------------------------ splitting
const STAMP_A = String.raw`\d{1,2}/\d{1,2}(?:/\d{2,4})?,\s*\d{1,2}:\d{2}(?::\d{2})?\s*[AaPp][Mm]`; // [10/16, 1:04 AM]  [9/16/26, 9:50:55 PM]  (month first)
const STAMP_B = String.raw`\d{1,2}:\d{2}(?::\d{2})?\s*[AaPp][Mm],\s*\d{1,2}/\d{1,2}/\d{2,4}`; // [12:50 am, 11/10/2026]  (day first)
const STAMP_C = String.raw`\d{1,2}/\d{1,2}/\d{4},\s*\d{1,2}:\d{2}(?::\d{2})?`; // [19/10/2026, 21:51:00]  (day first)
const STAMP_RE = new RegExp(String.raw`\[(${STAMP_A}|${STAMP_B}|${STAMP_C})\]\s*([^:\n[\]]{1,60}):`, 'g');

function stampDate(raw, today) {
  const yr = +(today || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const full = (y) => (String(y).length === 2 ? 2000 + +y : +y);
  let m;
  if (/^\d{1,2}:\d{2}.*[AaPp][Mm],/.test(raw)) { // [12:50 am, 11/10/2026]: day first
    m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    return m && validYMD(full(m[3]), +m[2], +m[1]) ? { y: full(m[3]), m: +m[2], d: +m[1] } : null;
  }
  if (/[AaPp][Mm]\s*$/.test(raw)) { // [10/16, 1:04 AM]: month first
    m = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?,/);
    const y = m && m[3] ? full(m[3]) : yr;
    return m && validYMD(y, +m[1], +m[2]) ? { y, m: +m[1], d: +m[2] } : null;
  }
  m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // [19/10/2026, 21:51:00]: day first
  return m && validYMD(+m[3], +m[2], +m[1]) ? { y: +m[3], m: +m[2], d: +m[1] } : null;
}

// A pasted chat -> [{ sender, stamp: {y,m,d}|null, body }]. Text with no
// "[time] Name:" prefixes is one message with no sender.
export function splitMessages(raw, today) {
  const text = clean(raw);
  const out = [];
  let last = 0; let cur = { sender: null, stamp: null };
  for (const m of text.matchAll(STAMP_RE)) {
    out.push({ ...cur, body: text.slice(last, m.index) });
    cur = { sender: squash(m[2]), stamp: stampDate(m[1], today) };
    last = m.index + m[0].length;
  }
  out.push({ ...cur, body: text.slice(last) });
  return out.filter((x) => x.body.trim());
}

const START = {
  dailyReport: /end\s*of\s*(?:the\s*)?day\s*report/i,
  fundRequest: /request\s*submission/i,
  stationCollection: /grands?\s*total\s*\/?\s*analysis/i,
  dieselDistribution: /diesel\s+distributed/i,
};
const isDateLine = (line) => /^date\s*[:\-=]/i.test(stripLead(stripMark(line)).trim());
const REPORT_LABELS = [
  ['date', /^date\b/i], ['machine', /^machine\b/i], ['status', /^status\b/i], ['operator', /^operator\b/i],
  ['supervisor', /^(?:site\s+)?(?:supervisor|manager)\b/i], ['supplied', /^diesel\s*supplied(?:\s*\([^)]*\))?/i],
  ['opening', /^opening\s*diesel/i], ['closing', /^closing\s*diesel/i], ['start', /^time\s*(?:started|start|resumed)/i],
  ['stop', /^time\s*(?:stopped|stop|closed)/i], ['hours', /^hours?\s*worked/i], ['ha', /^hectares?(?:\s*(?:achieve[ds]?|cleared))?/i],
  ['block', /^block\b/i], ['next', /^next\s*(?:day|work)/i], ['remarks', /^remarks?\b/i], ['cumulative', /^cumulative\b/i],
  ['request', /^diesel\s*request/i],
];
const labelOf = (line) => {
  const t = stripLead(stripMark(line)).trim();
  for (const [key, re] of REPORT_LABELS) {
    const m = t.match(re);
    if (m) return { key, value: t.slice(m[0].length).replace(/^\s*[:\-–=]*\s*/, '').trim() };
  }
  return null;
};
const LIST_END = /^(total|left\s*-?\s*over|leftove)/i;

function splitUnits(body) {
  const lines = body.split(/\r?\n/);
  const units = []; const left = [];
  let cur = null;
  const close = () => { if (cur) units.push(cur); cur = null; };
  const ahead = (i, re, n = 4) => lines.slice(i + 1, i + 1 + n).some((l) => re.test(stripLead(stripMark(l))));
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const t = stripMark(line);
    const bare = stripLead(t).trim();
    const kind = line.length <= 100 ? Object.keys(START).find((k) => START[k].test(t)) : null;
    if (kind) { close(); cur = { kind, lines: [line], seen: 0 }; continue; }
    if (isDateLine(line) && !(cur && cur.kind === 'fundRequest')) {
      const startsReport = ahead(i, /^machine\b/i, 3);
      const startsRequest = !startsReport && ahead(i, /^description\b/i, 2);
      const hasDate = cur && cur.kind === 'dailyReport' && cur.lines.some(isDateLine);
      if (startsReport && (!cur || cur.kind !== 'dailyReport' || hasDate)) { close(); cur = { kind: 'dailyReport', lines: [line], seen: 0 }; continue; }
      if (startsRequest && !cur) { cur = { kind: 'fundRequest', lines: [line], seen: 0 }; continue; }
    }
    if (!cur) { if (bare && !/^diesel\s*supply\b/i.test(bare)) left.push(line); continue; }
    if (cur.kind === 'fundRequest') {
      cur.lines.push(line);
      if (/^thank\s*you/i.test(bare)) close();
    } else if (cur.kind === 'dailyReport') {
      cur.lines.push(line);
      if (/^cumulative\b/i.test(bare)) close();
    } else if (cur.kind === 'dieselDistribution') {
      const isList = /^[*•▪\-–—·]/u.test(line.trim()) || LIST_END.test(bare) || /^[A-Za-z][^\d]*?\s*[-–—:=]?\s*\d/.test(bare);
      if (!bare) { cur.lines.push(line); continue; }
      if (isList) { cur.seen += 1; cur.lines.push(line); continue; }
      if (cur.seen) { close(); left.push(line); } else cur.lines.push(line);
    } else {
      cur.lines.push(line);
    }
  }
  close();
  return { units, left };
}

// ---------------------------------------------------------------- matching
function resolveOperator(text, ctx) {
  const name = cleanName(text);
  if (!name) return { value: null };
  // Prefer staff who have actually worked as operators: "Joshua" can be two staff records.
  const ran = new Set((ctx.operations || []).map((o) => o.operatorId).filter(Boolean));
  const active = (ctx.employees || []).filter((e) => ran.has(e.id));
  if (active.length) {
    const r = resolvePerson(name, { ...ctx, employees: active }, { kind: 'operator' });
    if (r.value) return r;
  }
  return resolvePerson(name, ctx, { kind: 'operator' });
}

const heavy = (ctx) => (ctx.inventory || []).filter((i) => i.category === 'Heavy Equipment');
function latestRun(ctx, personId, onOrBefore) {
  const runs = (ctx.operations || []).filter((o) => o.operatorId === personId && o.equipment && heavy(ctx).some((i) => i.name === o.equipment))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return runs.find((o) => !onOrBefore || o.date <= onOrBefore) || runs[0] || null;
}
function siteOfMachine(ctx, machine) {
  const run = (ctx.operations || []).filter((o) => o.equipment === machine && o.siteName).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return run ? run.siteName : null;
}

// A name from a message -> the dozer it refers to: a machine code or "Collins",
// else the operator's latest run (or, failing that, the machine in their role).
function machineFor(text, ctx, dateISO) {
  const name = cleanName(text);
  if (!name) return { error: 'No name given.' };
  const direct = resolveDozer(name, ctx);
  if (direct.value) return { machine: direct.value, how: null };
  const p = resolveOperator(name, ctx);
  if (!p.value) return { error: p.error || `"${name}" is not matched.` };
  const run = latestRun(ctx, p.value, dateISO);
  if (run) return { machine: run.equipment, site: run.siteName, how: `${p.name}: ${run.equipment} (latest run ${run.date})` };
  const role = ((ctx.employees || []).find((e) => e.id === p.value) || {}).role || '';
  const code = role.match(/\b(emg|chi|ema|big)\s*-?\s*0*(\d{1,3})\b/i);
  const byRole = code ? `${code[1].toUpperCase()}-${String(code[2]).padStart(3, '0')}` : null;
  if (byRole && heavy(ctx).some((i) => i.name === byRole)) return { machine: byRole, how: `${p.name}: ${byRole} (from the staff role, no recorded run)` };
  return { error: `${p.name} is matched but has no recorded run, so the machine is not known.` };
}

// The project for a row: a project named in the text, else the machine's latest site.
function siteFor(machine, hint, ctx, item) {
  if (hint) {
    const r = resolveSite(hint, ctx);
    if (r.value) return r.value;
  }
  const s = machine ? siteOfMachine(ctx, machine) : null;
  if (s) { item.flags.push(flag('info', `Project ${s} taken from ${machine}'s latest report.`)); return s; }
  if ((ctx.projects || []).length === 1) return ctx.projects[0].name;
  item.flags.push(flag('block', 'The project could not be worked out.'));
  return null;
}

// ----------------------------------------------------------------- items
const newItem = (kind, collection) => ({ kind, collection, flags: [], record: null, cells: null, title: '', existing: [], status: null });
const block = (item, text) => item.flags.push(flag('block', text));

function readDateField(raw, st, meta, item, what = 'date') {
  if (!squash(raw)) { block(item, `No ${what} in the message.`); return null; }
  const r = findDate(raw, { today: st.today, stamp: meta.stamp });
  if (!r) block(item, `Could not read a ${what} from "${squash(raw).slice(0, 40)}".`);
  return dateResult(r, st, item);
}

// A findDate() result -> the ISO date, or null with a blocking flag on the item.
function dateResult(r, st, item) {
  if (!r) { if (!item.flags.some((x) => x.level === 'block')) block(item, 'No date in the message.'); return null; }
  if (r.error) { block(item, r.error); return null; }
  if (r.iso > st.today) { block(item, `Date ${r.iso} is in the future.`); return null; }
  if (r.dayOnly) item.flags.push(flag('check', `Only a day number was given; read as ${r.iso} (month taken from the message time or today).`));
  else if (r.assumedYear) item.flags.push(flag('info', `No year in the date; ${r.iso.slice(0, 4)} used.`));
  return r.iso;
}

function addUnmatched(st, item, kind, text, reason) {
  st.unmatched.push({ kind, text: squash(text), reason, item });
  item.flags.push(flag('block', reason));
}

const STATUS_MAP = [[/^(active|working|worked|on site)\b/i, 'Completed'], [/^(inactive|not active|down|break\s*down|broken|parked|halted|idle)\b/i, 'Halted']];

// ------------------------------------------------------- end-of-day report
function buildDailyReport(unit, meta, ctx, st) {
  const item = newItem('dailyReport', 'operations');
  const f = {};
  unit.lines.forEach((l) => { const x = labelOf(l); if (x && f[x.key] === undefined) f[x.key] = x.value; });
  if (f.date === undefined && f.hours === undefined && f.operator === undefined) { st.ignored.push({ text: squash(unit.lines[0]).slice(0, 80), reason: 'Mentions an end-of-day report but has none of its fields.' }); return []; }
  const date = readDateField(f.date, st, meta, item);

  // machine: a code on the Machine line, else the operator's latest run
  const opText = squash(cleanName(f.operator));
  let operator = { value: null };
  if (opText) {
    operator = resolveOperator(opText, ctx);
    if (operator.error) addUnmatched(st, item, 'operator', f.operator, operator.error);
  }
  let machine = null; let siteHint = null;
  const named = f.machine ? resolveDozer(cleanName(f.machine), ctx) : {};
  const byRun = operator.value ? latestRun(ctx, operator.value, date) : null;
  if (named.value) {
    machine = named.value;
    if (byRun && byRun.equipment !== machine) item.flags.push(flag('check', `The report says ${machine}, but ${operator.name}'s latest run was ${byRun.equipment}.`));
  } else if (byRun) {
    machine = byRun.equipment; siteHint = byRun.siteName;
    item.flags.push(flag('info', `Machine ${machine} taken from ${operator.name}'s latest run (${byRun.date}); the report only says "${squash(f.machine) || 'no machine'}".`));
  } else if (opText && !operator.error) {
    const viaName = machineFor(opText, ctx, date);
    if (viaName.machine) { machine = viaName.machine; item.flags.push(flag('info', viaName.how || `Machine ${machine} matched from the operator name.`)); }
  }
  if (!machine && !operator.error) addUnmatched(st, item, 'machine', f.machine || opText || '(none)', `Could not tell which dozer this is: "${squash(f.machine) || '—'}" with operator "${opText || '—'}".`);

  const hint = (unit.lines[0].match(/\(([^)]+)\)/) || [])[1];
  const site = machine ? siteFor(machine, hint, ctx, item) : null;
  if (siteHint && site && site !== siteHint && !hint) item.flags.push(flag('check', `Project ${site} differs from the operator's latest run (${siteHint}).`));

  // supervisors: "Christopher/Godstime" -> the first one is recorded, all are noted
  const supNames = squash(f.supervisor).split(/\s*(?:\/|&|,|\+|\band\b)\s*/i).map(cleanName).filter(Boolean);
  let supervisor = { value: null }; const supSeen = [];
  supNames.forEach((n) => {
    const r = resolvePerson(n, ctx, { kind: 'supervisor' });
    if (r.value) { if (!supervisor.value) supervisor = r; supSeen.push(r.name); } else {
      st.unmatched.push({ kind: 'supervisor', text: n, reason: r.error, item });
      item.flags.push(flag('check', `Supervisor "${n}" is not matched (${r.error})`));
    }
  });
  if (supNames.length && !supervisor.value) item.flags.push(flag('check', 'No supervisor could be matched, so none is recorded.'));
  else if (supNames.length > 1) item.flags.push(flag('info', `${supNames.length} supervisors named; ${supervisor.name} is recorded and the others are in the notes.`));

  // numbers
  const hrs = readHours(f.hours);
  let hours = null;
  if (!hrs) block(item, 'Hours Worked is missing.');
  else if (hrs.error) block(item, hrs.error);
  else {
    hours = hrs.hours;
    if (hrs.extra) item.flags.push(flag('check', `"${squash(f.hours)}" read as ${hours} hrs (${hrs.hours - hrs.extra} + ${hrs.extra} extra). Extra hours are paid on a separate request.`));
  }
  const read = (key, label) => {
    const v = numOf(f[key]);
    if (v === undefined) block(item, `${label} "${squash(f[key])}" is not a number.`);
    return v === undefined ? null : v;
  };
  const ha = read('ha', 'Hectares');
  const supplied = read('supplied', 'Diesel Supplied'); const opening = read('opening', 'Opening Diesel'); const closing = read('closing', 'Closing Diesel');
  const start = timeOf(f.start); const stop = timeOf(f.stop);
  if (start === undefined) block(item, `Time started "${squash(f.start)}" is not a time.`);
  if (stop === undefined) block(item, `Time stopped "${squash(f.stop)}" is not a time.`);
  if (opening !== null && closing !== null && closing > opening + (supplied || 0)) item.flags.push(flag('check', `Closing diesel (${closing} L) is more than opening plus supplied (${opening + (supplied || 0)} L).`));

  // status, type, block
  let status = 'Completed';
  if (squash(f.status)) {
    const hit = STATUS_MAP.find(([re]) => re.test(squash(f.status)));
    if (hit) status = hit[1]; else item.flags.push(flag('check', `Status "${squash(f.status)}" is not recognised; Completed used.`));
  }
  const blockText = squash(f.block);
  const blockNumber = squash(blockText.replace(/\([^)]*\)/g, '')) || null;
  const phaseText = `${blockText} ${f.ha || ''}`;
  let opType = null;
  if (/\b(first|1st|one)\s*phase\b|\bphase\s*1\b/i.test(phaseText)) opType = 'Phase 1';
  else if (/\b(second|2nd|two)\s*phase\b|\bphase\s*2\b/i.test(phaseText)) opType = 'Phase 2';
  else {
    const t = (String(f.ha || '').match(/\(([^)]+)\)/) || [])[1];
    const known = ['Felling', 'Stacking', 'Direct Stacking', 'Root Picking', 'Bonding', 'Cross Cutting'].find((x) => t && normHeader(x) === normHeader(t));
    if (known) opType = known;
  }

  const remarkText = squash(f.remarks);
  const notes = [
    remarkText && !/^(active|nil|none|n\/a|-)$/i.test(remarkText) ? remarkText : null,
    numOf(f.cumulative) ? `Cumulative reported: ${numOf(f.cumulative)} ha.` : null,
    hrs && hrs.extra ? `Reported as ${squash(f.hours)}.` : null,
    supNames.length > 1 ? `Supervisors reported: ${supNames.join(' / ')}.` : null,
  ].filter(Boolean).join(' ');

  if (!item.flags.some((x) => x.level === 'block')) {
    item.sheet = 'operations';
    item.cells = {
      date, site, dozer: machine, operator: operator.value || '', supervisor: supervisor.value || '',
      'start time': start || '', 'stop time': stop || '', 'hours worked': hours, hectares: ha === null ? '' : ha, block: blockNumber || '',
      'diesel supplied l': supplied === null ? '' : supplied, 'opening diesel l': opening === null ? '' : opening, 'closing diesel l': closing === null ? '' : closing,
      status, 'operation type': opType || '', remarks: notes,
    };
  }
  item.title = [date || 'no date', machine || 'no machine', operator.name, hours === null ? null : `${hours} hrs`, ha === null ? null : `${ha} ha`].filter(Boolean).join(' · ');
  return [item];
}

// ------------------------------------------------------- diesel distribution
const LITRE_UNIT = '(?:l|ltrs?|litres?|liters?|lits?)';
const LIST_WITH_SEP = new RegExp(String.raw`^(.+?)\s*[-–—:=]\s*(\d[\d,]*(?:\.\d+)?)\s*(${LITRE_UNIT})?(?![A-Za-z])\s*(.*)$`, 'i');
const LIST_NO_SEP = new RegExp(String.raw`^([A-Za-z][A-Za-z.'’ ]*?)\s+(\d[\d,]*(?:\.\d+)?)\s*(${LITRE_UNIT})?(?![A-Za-z])\s*(.*)$`, 'i');
const TRANSFER = new RegExp(String.raw`(\d[\d,]*)\s*${LITRE_UNIT}?\s*(?:was\s+|were\s+)?(?:drilled|moved|transferred|transfered|siphoned|taken|pumped)\s+(?:out\s+)?(?:from|of)\s+([^)]*?)(?:\s+(?:machine|tank|dozer))?\s*(?:\)|$)`, 'i');

function buildDistribution(unit, meta, ctx, st) {
  const items = [];
  const header = unit.lines.find((l) => START.dieselDistribution.test(stripMark(l))) || unit.lines[0];
  const hdr = findDate(stripMark(header), { today: st.today, stamp: meta.stamp });
  let supplyTotal = null; let firstTotal = null; let leftover = null;
  const entries = [];
  unit.lines.forEach((line) => {
    if (line === header) return;
    const bare = stripLead(stripMark(line)).trim();
    if (!bare) return;
    const tot = bare.match(/^total\s*(supply|supplied)?\b[\s:=\-–]*(\d[\d,]*)/i);
    if (tot) { const v = Number(tot[2].replace(/,/g, '')); if (tot[1]) supplyTotal = supplyTotal ?? v; else firstTotal = firstTotal ?? v; return; }
    const lo = bare.match(/^(?:left\s*-?\s*over|leftove)\w*\s*[:=\-–]*\s*(\d[\d,]*)/i);
    if (lo) { leftover = Number(lo[1].replace(/,/g, '')); return; }
    if (/^diesel\s*supply\b/i.test(bare)) return;
    const line2 = bare.replace(/\b(emg|chi|ema|big)\s*-\s*(?=\d)/i, '$1 '); // "EMG-007 - 200L"
    const m = line2.match(LIST_WITH_SEP) || line2.match(LIST_NO_SEP);
    if (m && !LIST_END.test(bare)) entries.push({ name: squash(m[1]), litres: Number(m[2].replace(/,/g, '')), rest: squash(m[4]).replace(/^(litres?|liters?|ltrs?)$/i, '') });
  });
  const totalSupply = supplyTotal ?? firstTotal;

  entries.forEach((e) => {
    const item = newItem('dieselDistribution', 'dieselSiteDistributions');
    const date = dateResult(hdr, st, item);
    const who = machineFor(e.name, ctx, date);
    let notes = null;
    if (who.error) addUnmatched(st, item, 'machine', e.name, who.error);
    else if (who.how) item.flags.push(flag('info', who.how));
    if (e.litres <= 0) block(item, 'Litres must be more than zero.');

    // a transfer note: positive row for the receiver, negative row for the donor
    let donorRow = null;
    if (e.rest) {
      const t = e.rest.match(TRANSFER);
      if (t) {
        const moved = Number(t[1].replace(/,/g, ''));
        const donorName = squash(t[2]);
        const donor = machineFor(donorName, ctx, date);
        notes = `${moved} L drilled from ${donorName} (internal transfer).`;
        if (donor.error) {
          st.unmatched.push({ kind: 'machine', text: donorName, reason: `Donor: ${donor.error}`, item });
          item.flags.push(flag('check', `${moved} L was drilled from "${donorName}", which is not matched, so no negative row was made for it. Add the negative row for the donor by hand.`));
        } else if (moved > e.litres) {
          item.flags.push(flag('check', `The note says ${moved} L was drilled in, more than the ${e.litres} L listed.`));
        } else {
          donorRow = newItem('dieselDistribution', 'dieselSiteDistributions');
          donorRow.donorOf = item;
          donorRow.moved = { machine: donor.machine, litres: moved, receiver: who.machine, name: donorName };
          if (donor.how) donorRow.flags.push(flag('info', donor.how));
        }
      } else {
        item.flags.push(flag('check', `Note not read: "${e.rest}". Check it for a diesel transfer.`));
        notes = e.rest;
      }
    }
    if (!who.error && e.litres > 0 && date) {
      item.sheet = 'distributions';
      item.cells = { date, site: siteFor(who.machine, who.site, ctx, item), dozer: who.machine, litres: e.litres, notes: notes || '' };
      if (!item.cells.site) item.cells = null;
    }
    item.title = `${date || (hdr && hdr.iso) || 'no date'} · ${who.machine || e.name} · ${e.litres} L`;
    item.litres = e.litres;
    items.push(item);
    if (donorRow) {
      const m = donorRow.moved;
      donorRow.date = date;
      donorRow.record = date && !item.flags.some((x) => x.level === 'block') ? {
        date, project: item.cells ? item.cells.site : null, equipment: m.machine, litres: -m.litres,
        notes: `${m.litres} L drilled out of this machine into ${m.receiver} (internal transfer).`,
      } : null;
      donorRow.title = `${date || (hdr && hdr.iso) || 'no date'} · ${m.machine} · -${m.litres} L (donor)`;
      donorRow.flags.push(flag('info', `Internal transfer to ${m.receiver}: booked as a negative row so the site total counts only site stock.`));
      if (!donorRow.record) block(donorRow, 'The receiving row is blocked, so this row is not made.');
      items.push(donorRow);
    }
  });

  const listed = entries.reduce((t, e) => t + e.litres, 0);
  if (!entries.length) { st.ignored.push({ text: squash(header).slice(0, 80), reason: 'A "diesel distributed" line with no "name - litres" list under it.' }); return []; }
  if (totalSupply !== null && listed !== totalSupply) {
    const text = `The list adds up to ${fmt(listed)} L but the message says total supply ${fmt(totalSupply)} L.`;
    st.warnings.push(text);
    items.forEach((i) => i.flags.push(flag('check', text)));
  }
  if (leftover !== null) st.warnings.push(`Leftover of ${fmt(leftover)} L stated in the distribution message; it is not saved. Record it as a stock count if it is the tank count.`);
  return items;
}

// ------------------------------------------------------------ fund request
const BANKS = [
  [/\b[o0]pay\b/i, 'OPay'], [/\bpalm\s*pay\b/i, 'PalmPay'], [/\buba\b/i, 'UBA'], [/\bgt\s*bank\b|\bgtb\b|\bguaranty\s+trust\b/i, 'GTBank'],
  [/\baccess(?:\s*bank)?\b/i, 'Access Bank'], [/\bzenith(?:\s*bank)?\b/i, 'Zenith Bank'], [/\bfirst\s*bank\b|\bfbn\b|\bfirst\b/i, 'First Bank'],
  [/\bfcmb\b/i, 'FCMB'], [/\bkuda\b/i, 'Kuda'], [/\bmonie\s*point\b/i, 'Moniepoint'], [/\bwema\b/i, 'Wema Bank'], [/\bsterling\b/i, 'Sterling Bank'],
  [/\bunion\s*bank\b/i, 'Union Bank'], [/\bpolaris\b/i, 'Polaris Bank'], [/\bfidelity\b/i, 'Fidelity Bank'], [/\beco\s*bank\b/i, 'Ecobank'],
  [/\bstanbic\b/i, 'Stanbic IBTC'], [/\bkeystone\b/i, 'Keystone Bank'], [/\bprovidus\b/i, 'Providus Bank'],
];
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

export function parseAccount(text) {
  let s = squash(text);
  if (!s) return null;
  const num = s.match(/\b\d{10}\b/) || s.match(/\b\d{8,12}\b/);
  if (num) s = s.replace(num[0], ' ');
  let bank = null;
  for (const [re, name] of BANKS) { if (re.test(s)) { bank = name; s = s.replace(re, ' '); break; } }
  const name = squash(s.replace(/\bbank\b/gi, ' ').replace(/\b\d{1,3}\b/g, ' ').replace(/[^\p{L}\s'’.-]/gu, ' '));
  return { accountName: name ? titleCase(name) : null, accountNumber: num ? num[0] : null, bankName: bank, oddNumber: !!num && num[0].length !== 10 };
}

const NUMTXT = /\d[\d,]*(?:\.\d+)?/;
const asNum = (x) => Number(String(x).replace(/,/g, ''));
export function amountIn(line) {
  const eq = line.lastIndexOf('=');
  if (eq >= 0) { const m = line.slice(eq + 1).match(NUMTXT); if (m) return { amount: asNum(m[0]), label: line.slice(0, eq) }; }
  const marks = [...line.matchAll(/(?:#|₦|\bN(?=\s*\d))\s*(\d[\d,]*(?:\.\d+)?)/g)];
  if (marks.length) { const mk = marks[marks.length - 1]; return { amount: asNum(mk[1]), label: line.slice(0, mk.index) }; }
  const tail = line.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:naira)?\s*$/i);
  if (tail && !/^0\d/.test(tail[1]) && asNum(tail[1]) >= 100) return { amount: asNum(tail[1]), label: line.slice(0, tail.index) };
  return null;
}
const trimLabel = (s) => squash(String(s).replace(/[\s\-–—:=@;.,]+$/, '').replace(/^[\s\-–—:=@;.,]+/, ''));
const dateish = (s) => /^\d{1,2}\s*[/.-]\s*\d{1,2}(?:\s*[/.-]\s*\d{2,4})?$/.test(s);

function buildFundRequest(unit, meta, ctx, st) {
  const item = newItem('fundRequest', 'fundRequests');
  const lines = unit.lines.map((l) => stripLead(stripMark(l)).trim());
  const find = (re) => lines.findIndex((l) => re.test(l));
  if (find(/^description\s*[:\-=]/i) < 0 && find(/^total\s*amount\b/i) < 0) { st.ignored.push({ text: squash(unit.lines[0]).slice(0, 80), reason: 'Mentions a request but has no description or total.' }); return []; }
  const iDate = find(/^date\s*[:\-=]/i); const iDesc = find(/^description\s*[:\-=]/i);
  const iTotal = find(/^total\s*amount\b|^grand\s*total\b/i); const iAcct = find(/^account\b/i);
  const iThanks = find(/^thank\s*you/i);
  const after = (i, re) => lines[i].replace(re, '').replace(/^\s*[:\-=]*\s*/, '');
  const date = readDateField(iDate >= 0 ? after(iDate, /^date/i) : '', st, meta, item);
  const description = iDesc >= 0 ? squash(after(iDesc, /^description/i)) : '';
  if (!description) block(item, 'No description in the message.');

  // lines between the description and the total are the items
  const from = iDesc >= 0 ? iDesc + 1 : 0;
  let to = [iTotal, iAcct, iThanks].filter((i) => i > from).sort((a, b) => a - b)[0];
  if (to === undefined) to = lines.length;
  const parts = [];
  let context = '';
  lines.slice(from, to).forEach((l) => {
    if (!l || /^[\s\-–—=_.•]{3,}$/.test(l) || /^sub\s*-?\s*total\b/i.test(l)) return;
    const a = amountIn(l);
    if (!a) { context = trimLabel(l); return; }
    const label = trimLabel(a.label);
    let text;
    if (!label) text = context ? `${description} (${context})` : description;
    else if (dateish(label)) text = `${description} (${label})`;
    else if (context) text = dateish(context) ? `${label} (${context})` : `${context} - ${label}`;
    else text = label;
    parts.push({ description: text, amount: a.amount });
  });
  let stated = null;
  if (iTotal >= 0) {
    const v = after(iTotal, /^(total\s*amount|grand\s*total)/i);
    const a = amountIn(v) || (NUMTXT.test(v) ? { amount: asNum(v.match(NUMTXT)[0]) } : null);
    stated = a ? a.amount : null;
  }
  const sum = parts.reduce((t, p) => t + p.amount, 0);
  if (!parts.length && stated) {
    parts.push({ description, amount: stated });
    item.flags.push(flag('info', 'No item lines; one line was made from the total.'));
  } else if (!parts.length) block(item, 'No amounts found in the message.');
  else if (stated === null) item.flags.push(flag('check', `No total in the message; the items add up to ${naira(sum)}.`));
  else if (Math.round(sum) !== Math.round(stated)) item.flags.push(flag('check', `The items add up to ${naira(sum)} but the message total is ${naira(stated)}. Check which is right.`));

  // account details
  let acct = null;
  if (iAcct >= 0) {
    const end = lines.slice(iAcct).findIndex((l, k) => k > 0 && /^thank\s*you/i.test(l));
    const chunk = lines.slice(iAcct, end > 0 ? iAcct + end : lines.length);
    acct = parseAccount([after(iAcct, /^account\s*(?:details?|name|no\.?|number)?/i), ...chunk.slice(1)].join(' '));
  }
  if (!acct || (!acct.accountNumber && !acct.accountName)) item.flags.push(flag('info', 'No account details in the message.'));
  else if (acct.oddNumber) item.flags.push(flag('check', `Account number ${acct.accountNumber} is not 10 digits.`));
  const items = parts.map((p) => ({ description: p.description, amount: p.amount, accountName: acct?.accountName || null, accountNumber: acct?.accountNumber || null, bankName: acct?.bankName || null }));

  // submitted by: the sender of the WhatsApp message
  let submittedBy = null;
  if (meta.sender) {
    const r = resolvePerson(cleanName(meta.sender), ctx, { kind: 'supervisor' });
    if (r.value) submittedBy = r.value;
    else { st.unmatched.push({ kind: 'person', text: meta.sender, reason: r.error, item }); item.flags.push(flag('check', `Sender "${meta.sender}" is not matched to a staff member (${r.error}), so Submitted By is left empty.`)); }
  } else item.flags.push(flag('info', 'No sender in the paste, so Submitted By is left empty.'));

  // project: "REX Forestry Project" fits several sites; the one with the latest reports is used
  let project = null;
  const headerText = squash((unit.lines[0] || '').replace(/[*_~]/g, '').replace(/request\s*submission/i, '').replace(/^[^\p{L}\p{N}]+/u, ''));
  if (headerText && START.fundRequest.test(unit.lines[0])) {
    const r = resolveSite(headerText, ctx);
    if (r.value) project = r.value;
    else if (/more than one/.test(r.error || '')) {
      const n = normHeader(headerText);
      const names = (ctx.projects || []).map((p) => p.name).filter((x) => normHeader(x).includes(n) || n.includes(normHeader(x)));
      const latest = (ctx.operations || []).filter((o) => names.includes(o.siteName)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      if (latest) { project = latest.siteName; item.flags.push(flag('info', `"${headerText}" fits several projects; ${project} used (the one with the latest daily reports).`)); }
      else item.flags.push(flag('check', `"${headerText}" fits several projects (${names.join(', ')}); Project is left empty.`));
    } else item.flags.push(flag('check', `Project "${headerText}" is not matched; Project is left empty.`));
  }

  const total = parts.reduce((t, p) => t + p.amount, 0);
  item.title = `${date || 'no date'} · ${description.slice(0, 60)} · ${naira(total)}`;
  if (!item.flags.some((x) => x.level === 'block')) {
    item.record = { date, project, submittedBy, description, costHead: null, status: 'Pending', items, attachments: [] };
    // the same request resent: look in the ERP and earlier in this paste
    const cand = { date, description, items };
    const hits = findDuplicateRequests(cand, [...(ctx.fundRequests || []), ...st.requests]);
    const recent = hits.filter((r) => duplicateKind(cand, r) === 'recent');
    const earlier = hits.filter((r) => duplicateKind(cand, r) === 'earlier');
    const lab = (r) => `${r.id} (${r.date}, ${r.status || 'Pending'}, ${naira(requestTotal(r))})`;
    if (recent.length) { item.flags.push(flag('check', `Possible duplicate of ${recent.map(lab).join(', ')}.`)); item.existing = recent.map((r) => r.id).filter((id) => !/paste/.test(id)); }
    if (earlier.length) item.flags.push(flag('info', `Same description and amount earlier: ${earlier.slice(0, 3).map(lab).join(', ')}.`));
    st.requests.push({ id: 'an earlier message in this paste', date, description, items, status: 'Pending' });
  }
  return [item];
}

// ------------------------------------------------------- station collection
const FUELS = [[/^(?:ago|diesel)$/i, 'Diesel'], [/^pms$/i, 'PMS']];
const fuelName = (w) => (FUELS.find(([re]) => re.test(w)) || [])[1];
const GT_LINE = new RegExp(String.raw`^g(?:rands?)?\.?\s*total\s*(ago|diesel|pms)\s*[=:\-]?\s*(\d[\d,]*(?:\.\d+)?)\s*${LITRE_UNIT}?\s*(?:@\s*(\d[\d,]*(?:\.\d+)?))?`, 'i');
const COL_LINE = new RegExp(String.raw`^(ago|diesel|pms)\s*[=:\-]?\s*(\d[\d,]*(?:\.\d+)?)\s*${LITRE_UNIT}?\s*(?:@\s*(\d[\d,]*(?:\.\d+)?))?`, 'i');

function knownStation(ctx) {
  const names = [...new Set([...(ctx.fuelCreditCollections || []), ...(ctx.fuelCreditPayments || [])].map((c) => c.station).filter(Boolean))];
  return names.find((n) => /midejab/i.test(n)) || 'Midejab Ltd';
}

export function reconcileStation({ station, fuelType, date, messageTotal, collectedToday }, ctx) {
  const rows = (ctx.fuelCreditCollections || []).filter((c) => c.station === station && c.fuelType === fuelType);
  const sum = (pred) => rows.filter(pred).reduce((t, c) => t + (Number(c.litres) || 0), 0);
  const paid = [...new Set((ctx.fuelCreditPayments || []).filter((p) => p.station === station && p.date && p.date <= date).map((p) => p.date))].sort().reverse().slice(0, 4);
  // The station's running total starts again after a settlement, so it is also tried from each recent payment.
  const bases = [{ label: 'all collections on record' }];
  paid.forEach((p) => { bases.push({ label: `collections after the ${p} payment`, after: p }); bases.push({ label: `collections from the ${p} payment date`, from: p }); });
  const results = bases.map((b) => {
    const inRange = (r) => (!b.after || r.date > b.after) && (!b.from || r.date >= b.from);
    const before = sum((r) => r.date < date && inRange(r));
    const onDate = sum((r) => r.date === date && inRange(r));
    const erpTotal = onDate > 0 ? before + onDate : before + collectedToday;
    return { ...b, erpTotal, onDate, difference: messageTotal - erpTotal };
  });
  const best = results.reduce((a, b) => (Math.abs(b.difference) < Math.abs(a.difference) ? b : a));
  const unit = fuelType === 'PMS' ? 'PMS' : 'diesel';
  const ok = best.difference === 0;
  const text = ok
    ? `${station} ${unit}: station grand total ${fmt(messageTotal)} L matches the ERP (${best.label}${best.onDate > 0 ? '' : `, counting the ${fmt(collectedToday)} L in this message`}).`
    : `${station} ${unit}: station grand total ${fmt(messageTotal)} L, ERP ${fmt(best.erpTotal)} L (${best.label}${best.onDate > 0 ? '' : `, counting the ${fmt(collectedToday)} L in this message`}). Difference ${fmt(Math.abs(best.difference))} L: the station is ${best.difference > 0 ? 'higher' : 'lower'}.`;
  return { station, fuelType, date, messageTotal, collectedToday, erpTotal: best.erpTotal, difference: best.difference, basis: best.label, ok, text };
}

function buildStation(unit, meta, ctx, st) {
  const text = unit.lines.join('\n');
  const asLine = stripMark(unit.lines.find((l) => START.stationCollection.test(stripMark(l))) || '');
  const after = asLine.replace(/^.*?analysis/i, '').replace(/^\s*as\s+(at\s+)?/i, '');
  const dateRaw = after.replace(/@.*$/, '');
  const probe = newItem('stationCollection', 'fuelCreditCollections');
  const date = readDateField(dateRaw, st, meta, probe, 'date');
  const station = knownStation(ctx);
  const today = {}; const grand = {};
  unit.lines.forEach((line) => {
    const bare = stripLead(stripMark(line)).trim();
    const g = bare.match(GT_LINE);
    if (g) { grand[fuelName(g[1])] = { litres: asNum(g[2]), price: g[3] ? asNum(g[3]) : null }; return; }
    const c = bare.match(COL_LINE);
    if (c) today[fuelName(c[1])] = { litres: asNum(c[2]), price: c[3] ? asNum(c[3]) : null };
  });
  const items = [];
  if (!Object.keys(today).length && !Object.keys(grand).length) { st.ignored.push({ text: squash(asLine).slice(0, 80), reason: 'Station analysis message with no collected or grand total lines.' }); return []; }
  const sold = /\bsold\b/i.test(text) ? squash((text.match(/[^\n]*\bsold\b[^\n]*/i) || [''])[0]) : '';
  ['Diesel', 'PMS'].forEach((fuel) => {
    const t = today[fuel];
    if (!t || !(t.litres > 0)) return;
    const item = newItem('stationCollection', 'fuelCreditCollections');
    item.flags.push(...probe.flags);
    if (!/midejab/i.test(`${meta.sender || ''} ${text}`)) item.flags.push(flag('info', `Station taken as ${station}, the station that sends the "Grands Total/Analysis" message.`));
    const price = t.price || (grand[fuel] && grand[fuel].price) || null;
    if (!t.price && price) item.flags.push(flag('info', `No price on the collected line; the grand total line's ₦${fmt(price)} used.`));
    if (!price) item.flags.push(flag('check', 'No price in the message; the ERP default price is used.'));
    if (sold && fuel === 'Diesel') item.flags.push(flag('check', `The message mentions a sale ("${sold.slice(0, 80)}"). If part of this collection was sold, save it as two rows (supplied and sold) instead.`));
    if (date) {
      item.sheet = 'collections';
      item.cells = { date, station, fuel, litres: t.litres, price: price || '', notes: grand[fuel] ? `Station analysis: grand total ${fmt(grand[fuel].litres)} L.` : '' };
      // same date, same fuel, different litres: the 2,550 vs 2,250 typo
      const other = (ctx.fuelCreditCollections || []).filter((c) => c.date === date && c.station === station && c.fuelType === fuel && Number(c.litres) !== t.litres);
      if (other.length) item.flags.push(flag('check', `The ERP already has ${other.map((c) => `${fmt(c.litres)} L (${c.id})`).join(', ')} for this day; the message says ${fmt(t.litres)} L.`));
    }
    item.title = `${date || 'no date'} · ${fmt(t.litres)} L ${fuel}${price ? ` @ ${naira(price)}` : ''}`;
    items.push(item);
  });
  if (!items.length && !probe.flags.length) st.warnings.push('The station message has no collected diesel or PMS for the day.');
  if (!items.length && probe.flags.length) { probe.title = 'station message'; items.push(probe); }
  if (date) {
    ['Diesel', 'PMS'].forEach((fuel) => {
      if (!grand[fuel]) return;
      const r = reconcileStation({ station, fuelType: fuel, date, messageTotal: grand[fuel].litres, collectedToday: (today[fuel] || {}).litres || 0 }, ctx);
      st.reconciliation.push(r);
      if (!r.ok) st.warnings.push(r.text);
    });
  }
  return items;
}

// ------------------------------------------------------------------- main
const BUILD = { dailyReport: buildDailyReport, dieselDistribution: buildDistribution, fundRequest: buildFundRequest, stationCollection: buildStation };
const SHEETS = { operations: ['Daily Reports', 'operations'], distributions: ['Diesel Supply', 'distributions'], collections: ['Station Collections', 'collections'] };

const idsOf = (list, pred) => (list || []).filter(pred).map((r) => r.id);

// Runs the rows that have all their names matched through the Data Import
// planner, so the paste is checked by the same rules as the Excel upload.
function plan(items, ctx, st) {
  const full = { ...ctx, today: st.today, operations: ctx.operations || [], inventory: ctx.inventory || [], employees: ctx.employees || [], projects: ctx.projects || [] };
  Object.entries(SHEETS).forEach(([sheetKey, [sheetName]]) => {
    const group = items.filter((i) => i.sheet === sheetKey && i.cells);
    if (!group.length) return;
    const book = { [sheetName]: { rows: group.map((g, k) => ({ rowNumber: k + 2, cells: g.cells })) } };
    const out = planImport(book, full).sheets[0].rows;
    group.forEach((g, k) => {
      const r = out[k];
      g.record = r.record || null;
      if (r.summary) g.summary = r.summary;
      (r.warnings || []).forEach((w) => g.flags.push(flag('check', w)));
      if (r.action === 'error') r.messages.forEach((m) => g.flags.push(flag('block', m)));
      if (r.action === 'skip') {
        g.exists = true;
        g.flags.push(flag('info', r.messages.join(' ').replace('this file', 'this paste')));
        const c = g.cells;
        if (sheetKey === 'operations') g.existing = idsOf(ctx.operations, (o) => o.date === c.date && o.equipment === c.dozer && o.siteName === c.site);
        if (sheetKey === 'distributions') g.existing = idsOf(ctx.distributions, (d) => d.date === c.date && d.equipment === c.dozer && d.project === c.site);
        if (sheetKey === 'collections') g.existing = idsOf(ctx.fuelCreditCollections, (x) => x.date === c.date && x.station === c.station && x.fuelType === c.fuel && Number(x.litres) === c.litres);
      }
    });
  });
  // a negative donor row is saved only if the same row is not already in the ERP
  items.filter((i) => i.moved && i.record).forEach((d) => {
    const dup = (ctx.distributions || []).filter((x) => x.date === d.record.date && x.equipment === d.record.equipment && Number(x.litres) === d.record.litres);
    if (dup.length) { d.exists = true; d.existing = dup.map((x) => x.id); d.flags.push(flag('info', 'Already in the ERP.')); }
    if (d.donorOf && d.donorOf.exists) { d.exists = true; d.flags.push(flag('info', 'The receiving row is already in the ERP.')); }
    else if (d.donorOf && !d.donorOf.record) { block(d, 'The receiving row is blocked, so this row is not made.'); d.record = null; }
  });
}

export function parseWhatsApp(text, ctx = {}, { today } = {}) {
  const st = {
    today: today || ctx.today || new Date().toISOString().slice(0, 10),
    unmatched: [], warnings: [], reconciliation: [], ignored: [], requests: [],
  };
  const items = [];
  const messages = splitMessages(text, st.today);
  messages.forEach((meta) => {
    const { units, left } = splitUnits(meta.body);
    units.forEach((u) => { items.push(...BUILD[u.kind](u, meta, ctx, st)); });
    const stray = squash(left.join(' '));
    if (stray.length > 12) st.ignored.push({ text: stray.slice(0, 80), reason: 'Not a message type Paste Entry reads (reports, diesel lists, fund requests, station analysis).' });
  });
  plan(items, ctx, st);

  const rows = items.map((it, i) => {
    const flags = it.flags;
    let status = 'ok';
    if (flags.some((f) => f.level === 'block') || (!it.record && !it.exists)) status = 'blocked';
    else if (it.exists) status = 'exists';
    else if (flags.some((f) => f.level === 'check')) status = 'check';
    if (status === 'blocked' && !flags.some((f) => f.level === 'block')) flags.push(flag('block', 'This row could not be built.'));
    return {
      n: i + 1, kind: it.kind, collection: it.collection, record: status === 'blocked' ? null : it.record, title: it.title || it.summary,
      status, flags, selected: status === 'ok', existing: it.existing || [],
    };
  });
  const unmatched = st.unmatched.map((u) => ({ kind: u.kind, text: u.text, reason: u.reason, row: items.indexOf(u.item) + 1 }));
  const kinds = [...new Set(rows.map((r) => r.kind))];
  if (!rows.length && !hasSupported(messages)) st.warnings.push('No end-of-day report, diesel list, fund request or station message was found in this text.');
  return {
    kind: kinds.length === 1 ? kinds[0] : kinds.length ? 'mixed' : 'unknown',
    rows, warnings: st.warnings, unmatched, reconciliation: st.reconciliation, ignored: st.ignored,
  };
}

// true when at least one supported message start is present
function hasSupported(messages) {
  return messages.some((m) => splitUnits(m.body).units.length);
}
