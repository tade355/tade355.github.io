// "Ask the ERP": type a question in plain English and get an answer worked out
// from the records already loaded in the ERP (Daily Operations, diesel, fund
// requests, fuel credit, fleet, profitability, staff performance).
//
// This is a rule-based assistant, not a generative AI model: it recognises
// dates, dozers, people and what is being asked, and calculates the answer
// from the data. It never invents figures; if it cannot match a question it
// says so and suggests what it can answer.
//
// Pure (no store / DOM imports): `ctx` is built by reportContext.js.
import { addDays, mondayOf } from './dateUtils.js';
import { economicsByOp, expectedHa, toMinutes, EXPECTED_HA_PER_8HRS } from './opEconomics.js';
import { buildDailyDashboard, DIESEL_FILL_LITRES } from './dailyDashboardData.js';
import { IDEAL_START_MINUTES, LATE_MINUTES } from './profitReportData.js';
import { DASHBOARD_BASIS_FROM } from './dashboardBasis.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const fmt = (n, dp = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const money = (n) => `${n < 0 ? '−' : ''}₦${fmt(Math.abs(n))}`;
const pct = (n) => (n === null || n === undefined ? '—' : `${n.toFixed(1)}%`);
const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);
const parts = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
const dm = (iso) => { const p = parts(iso); return `${p.d} ${MONTH_NAMES[p.m - 1].slice(0, 3)}`; };
const dmy = (iso) => `${dm(iso)} ${parts(iso).y}`;
const clock = (mins) => {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(mins / 60); const m = Math.round(mins % 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const rangeLabel = (from, to) => (from === to ? dmy(from) : `${dm(from)} – ${dmy(to)}`);

// ------------------------------------------------------------------- dates
export function parseRange(q, today, { firstDate, lastDate, defaultFrom = DASHBOARD_BASIS_FROM } = {}) {
  const text = ` ${q.toLowerCase()} `;
  const year = parts(today).y;
  const found = [];
  const push = (index, date) => found.push({ index, date });
  let m;
  const reIso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = reIso.exec(text))) push(m.index, iso(+m[1], +m[2], +m[3]));
  const reDMon = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${MONTHS.join('|')})[a-z]*(?:\\s*,?\\s*(20\\d{2}))?`, 'g');
  while ((m = reDMon.exec(text))) push(m.index, iso(m[3] ? +m[3] : year, MONTHS.indexOf(m[2]) + 1, +m[1]));
  const reMonD = new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s*,?\\s*(20\\d{2}))?`, 'g');
  while ((m = reMonD.exec(text))) push(m.index, iso(m[3] ? +m[3] : year, MONTHS.indexOf(m[1]) + 1, +m[2]));
  const reSlash = /\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/g;
  while ((m = reSlash.exec(text))) push(m.index, iso(m[3] ? +m[3] : year, +m[2], +m[1]));
  // De-duplicate overlapping matches (same position) and order by position.
  const dates = found.sort((a, b) => a.index - b.index).filter((d, i, arr) => i === 0 || Math.abs(d.index - arr[i - 1].index) > 2).map((d) => d.date);

  const last = lastDate || today;
  if (/day before yesterday/.test(text)) { const d = addDays(today, -2); return { from: d, to: d, label: dmy(d), explicit: true }; }
  if (/\byesterday\b/.test(text)) { const d = addDays(today, -1); return { from: d, to: d, label: dmy(d), explicit: true }; }
  if (/\btoday\b|\btonight\b|\bthis morning\b/.test(text)) return { from: today, to: today, label: dmy(today), explicit: true };
  if (/last week/.test(text)) { const mon = addDays(mondayOf(today), -7); return { from: mon, to: addDays(mon, 6), label: rangeLabel(mon, addDays(mon, 6)), explicit: true }; }
  if (/this week/.test(text)) { const mon = mondayOf(today); return { from: mon, to: today, label: rangeLabel(mon, today), explicit: true }; }
  if (/last month/.test(text)) { const p = parts(today); const pm = p.m === 1 ? 12 : p.m - 1; const py = p.m === 1 ? p.y - 1 : p.y; const to = addDays(iso(p.y, p.m, 1), -1); return { from: iso(py, pm, 1), to, label: `${MONTH_NAMES[pm - 1]} ${py}`, explicit: true }; }
  if (/this month/.test(text)) { const p = parts(today); return { from: iso(p.y, p.m, 1), to: today, label: `${MONTH_NAMES[p.m - 1]} ${p.y} so far`, explicit: true }; }
  const lastN = text.match(/last\s+(\d{1,3})\s+days?/);
  if (lastN) { const from = addDays(today, -(+lastN[1] - 1)); return { from, to: today, label: rangeLabel(from, today), explicit: true }; }
  if (/\ball time\b|\bsince the beginning\b|\beverything\b|\boverall\b|\bto date\b/.test(text) && firstDate) return { from: firstDate, to: last, label: rangeLabel(firstDate, last), explicit: true };
  if (dates.length >= 2) { const [a, b] = [dates[0], dates[dates.length - 1]].sort(); return { from: a, to: b, label: rangeLabel(a, b), explicit: true }; }
  if (dates.length === 1 && /\b(since|from|after)\b/.test(text)) return { from: dates[0], to: last, label: rangeLabel(dates[0], last), explicit: true };
  if (dates.length === 1) return { from: dates[0], to: dates[0], label: dmy(dates[0]), explicit: true };
  return { from: defaultFrom, to: last, label: `${rangeLabel(defaultFrom, last)} (default period)`, explicit: false };
}

// ---------------------------------------------------------------- entities
export function parseEntities(q, ctx, project) {
  const text = q.toLowerCase().replace(/god'?s\s*time/g, 'godstime').replace(/jassie|jessy|jesse/g, 'jessie');
  const dozers = new Set();
  const codes = text.matchAll(/\b(emg|chi|ema|big)\s*-?\s*0*(\d{1,3})\b/g);
  for (const c of codes) dozers.add(`${c[1].toUpperCase()}-${String(c[2]).padStart(3, '0')}`);
  if (/d8k|collins/.test(text)) dozers.add('D8K Collins');
  const ops = ctx.operations.filter((o) => o.siteName === project);
  const people = [];
  const seen = new Set();
  ops.forEach((o) => [o.operatorId, o.supervisorId].forEach((id) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const name = ctx.employees.find((e) => e.id === id)?.name || '';
    const tokens = name.toLowerCase().replace(/[()']/g, '').split(/\s+/).filter((t) => t.length >= 4 && !['kangidi', 'daniel'].includes(t));
    if (tokens.some((t) => new RegExp(`\\b${t}\\b`).test(text)) || (name === 'Oki Christopher' && /\boki\b/.test(text))) people.push({ id, name });
  }));
  // A person named for a dozer ("Collins") should not also filter by person
  // when the dozer already covers it.
  return { dozers: [...dozers], people };
}

function rowsFor(ctx, project, from, to, ent) {
  const ops = ctx.operations
    .filter((o) => o.siteName === project && o.date >= from && o.date <= to)
    .sort((a, b) => (a.date === b.date ? (a.equipment < b.equipment ? -1 : 1) : (a.date < b.date ? -1 : 1)));
  const all = economicsByOp(ctx, project, ops);
  if (!ent || (!ent.dozers.length && !ent.people.length)) return { rows: all, all };
  const ids = new Set(ent.people.map((p) => p.id));
  const rows = all.filter((r) => ent.dozers.includes(r.op.equipment) || ids.has(r.op.operatorId) || ids.has(r.op.supervisorId));
  return { rows, all };
}

function agg(rows) {
  const hours = sum(rows, (r) => r.op.hoursWorked);
  const ha = sum(rows, (r) => r.op.quantity);
  const starts = rows.map((r) => toMinutes(r.op.timeResumed)).filter((v) => v !== null);
  return {
    days: new Set(rows.map((r) => r.op.date)).size, hours, ha, expected: expectedHa(hours),
    outputPct: expectedHa(hours) > 0 ? (ha / expectedHa(hours)) * 100 : null,
    revenue: sum(rows, (r) => r.revenue), cost: sum(rows, (r) => r.cost), net: sum(rows, (r) => r.net),
    diesel: sum(rows, (r) => r.op.fuelUsed), avgStart: starts.length ? starts.reduce((a, b) => a + b, 0) / starts.length : null,
  };
}

const nameOf = (ctx, id) => ctx.employees.find((e) => e.id === id)?.name || id || '—';
const dozerLabel = (ctx, rows, code) => {
  const names = [...new Set(rows.filter((r) => r.op.equipment === code).map((r) => nameOf(ctx, r.op.operatorId)).filter((n) => n !== '—'))];
  return names.length ? `${code} · ${names.join(', ')}` : code;
};

function groupBy(ctx, rows, kind) {
  const keyFn = kind === 'dozer' ? (r) => r.op.equipment : kind === 'supervisor' ? (r) => r.op.supervisorId : (r) => r.op.operatorId;
  const keys = [...new Set(rows.map(keyFn).filter(Boolean))];
  return keys.map((k) => {
    const rs = rows.filter((r) => keyFn(r) === k);
    return { key: k, label: kind === 'dozer' ? dozerLabel(ctx, rows, k) : nameOf(ctx, k), ...agg(rs) };
  });
}

const reply = (text, table, notes) => ({ text, table, notes });

// ------------------------------------------------------------------ answers
export const EXAMPLE_QUESTIONS = [
  'What was the profit yesterday?',
  'Operations profit from 10 Oct to 15 Oct',
  'Which dozer performed best since 10 Oct?',
  'How many hectares did Tope clear this week?',
  'Who started late on 15 Oct?',
  'How much diesel is needed tomorrow?',
  'What requests are still pending?',
  'How much do we owe Midejab?',
  'Which dozers are down?',
  'How many hectares must each dozer clear for 20% profit?',
  'Compare the supervisors',
];

export function answerQuestion(question, ctx, { today, project }) {
  const q = (question || '').trim();
  if (!q) return reply('Type a question about operations, diesel, requests, fleet, profit or staff performance.');
  const text = q.toLowerCase();
  const allOps = ctx.operations.filter((o) => o.siteName === project);
  const dates = allOps.map((o) => o.date).sort();
  const firstDate = dates[0]; const lastDate = dates[dates.length - 1];
  const range = parseRange(q, today, { firstDate, lastDate });
  const ent = parseEntities(q, ctx, project);
  const { from, to } = range;
  const notes = range.explicit ? [] : [`No date given, so I used ${range.label}.`];
  const entLabel = [...ent.dozers, ...ent.people.map((p) => p.name)].join(', ');
  const has = (re) => re.test(text);

  if (has(/\b(help|what can you|how do i use|what do you know|examples?)\b/)) {
    return reply('I answer questions from the data already loaded in the ERP: profit and costs, hectares and hours, output by dozer, operator or supervisor, start times, diesel, fund requests, fuel credit (Midejab), fleet status and profit targets. Give a date or range (for example "yesterday", "15 Oct", "10 to 15 Oct", "this week") and, if you like, a dozer or person. Try:\n• ' + EXAMPLE_QUESTIONS.join('\n• '));
  }

  // ---------------------------------------------------------------- targets
  if (has(/(target|break.?even|must (each )?(dozer|machine)|need to clear|required hectares|to (reach|make|achieve|hit) \d+ ?%)/)) {
    const mm = text.match(/(\d{1,2})\s*%/); const margin = mm ? Math.min(60, +mm[1]) / 100 : 0.2;
    const price = ctx.dieselRateAsOf(lastDate || today);
    const rate = ctx.projectRateAsOf(project, 'Phase 1', lastDate || today).rate || 845000;
    const active = ctx.inventory.filter((i) => i.category === 'Heavy Equipment' && i.fleetStatus === 'Active' && allOps.some((o) => o.equipment === i.name));
    const list = (ent.dozers.length ? active.filter((i) => ent.dozers.includes(i.name)) : active);
    if (!list.length) return reply('I could not find an active dozer on this site to work the target out for.');
    const rows = list.map((i) => {
      const lastOp = [...allOps].reverse().find((o) => o.equipment === i.name);
      const allowance = ctx.operatorAllowanceForRows([{ equipment: i.name, operatorId: lastOp?.operatorId, date: '2026-10-14', hoursWorked: 8 }]);
      const cost = 8 * ctx.hourlyRateAsOf(i.name, lastDate || today) + 8 * 25 * price + 8 * 25 * 50 + allowance + 27700 / 4;
      return [`${i.name}${lastOp ? ` · ${nameOf(ctx, lastOp.operatorId)}` : ''}`, money(cost), fmt(cost / rate, 2), fmt(cost / (1 - margin) / rate, 2), pct((cost / (1 - margin) / rate / EXPECTED_HA_PER_8HRS) * 100)];
    });
    return reply(`To make ${Math.round(margin * 100)}% profit in an 8-hour day, each active dozer must clear about the hectares below (revenue ${money(rate)} per ha; cost = dozer rate + 200L diesel + diesel logistics + operator allowance + a share of PMS).`, { head: ['Dozer', 'Cost per day', 'Break-even ha', `Ha for ${Math.round(margin * 100)}% profit`, '% of expected output'], rows }, [`Expected output is ${EXPECTED_HA_PER_8HRS} ha per 8 hrs.`]);
  }

  // ----------------------------------------------------------------- fuel credit
  if (has(/midejab|fuel credit|\bowe\b|owed|station balance|credit station/)) {
    const coll = ctx.fuelCreditCollections; const pay = ctx.fuelCreditPayments || [];
    const owed = sum(coll, (c) => c.litres * c.unitPrice) - sum(pay, (p) => p.amount);
    const inR = coll.filter((c) => c.date >= from && c.date <= to);
    const lines = [`The ERP shows ${money(owed)} owed to Midejab (all collections less all payments recorded).`];
    if (range.explicit) lines.push(`In ${range.label}: ${fmt(sum(inR.filter((c) => c.fuelType === 'Diesel'), (c) => c.litres))} L of diesel and ${fmt(sum(inR.filter((c) => c.fuelType === 'PMS'), (c) => c.litres))} L of PMS were collected, worth ${money(sum(inR, (c) => c.litres * c.unitPrice))}; payments made: ${money(sum(pay.filter((p) => p.date >= from && p.date <= to), (p) => p.amount))}.`);
    return reply(lines.join(' '));
  }

  // -------------------------------------------------------------- requests
  if (has(/request|pending|approved|payment|paid|expense|spent|spend/) && !has(/profit|loss|margin|revenue/)) {
    const reqs = ctx.fundRequests.filter((r) => r.project === project && (range.explicit ? (r.date >= from && r.date <= to) : r.date >= DASHBOARD_BASIS_FROM));
    const total = (r) => sum(r.items || [], (it) => it.amount);
    const status = has(/pending|unpaid|outstanding|not paid|awaiting/) ? 'Pending' : has(/approved/) ? 'Approved' : has(/\bpaid\b|payment/) ? 'Paid' : null;
    const shown = status ? reqs.filter((r) => r.status === status) : reqs;
    const t = (s) => sum(reqs.filter((r) => r.status === s), total);
    const head = `Fund requests ${range.explicit ? `in ${range.label}` : 'since 10 Oct 2026'}: requested ${money(sum(reqs, total))}; paid ${money(t('Paid'))}; approved, unpaid ${money(t('Approved'))}; pending ${money(t('Pending'))}.`;
    const rows = shown.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15).map((r) => [dm(r.date), r.description, r.costHead || '—', money(total(r)), r.status]);
    return reply(head, rows.length ? { head: ['Date', 'Description', 'Category', 'Amount', 'Status'], rows } : null, rows.length >= 15 ? ['Showing the 15 most recent.'] : notes);
  }

  // ----------------------------------------------------------------- fleet
  if (has(/\b(down|breakdown|broken|active|available|fleet|machines?|dozers?)\b/) && has(/which|list|status|how many|are down|broken|available|fleet/) && !has(/profit|hectare|\bha\b|hours|diesel|output|best|worst|late|start/)) {
    const heavy = ctx.inventory.filter((i) => i.category === 'Heavy Equipment');
    const rows = heavy.sort((a, b) => (a.name < b.name ? -1 : 1)).map((i) => [i.name, i.fleetStatus || 'Active', i.ownership || 'Company', i.ownerName || '—', i.currentProject || '—']);
    const down = heavy.filter((i) => i.fleetStatus === 'Down' || i.fleetStatus === 'Under Maintenance');
    return reply(`${heavy.length} dozers in the fleet: ${heavy.filter((i) => (i.fleetStatus || 'Active') === 'Active').length} active, ${down.length} down or under maintenance${down.length ? ` (${down.map((i) => i.name).join(', ')})` : ''}.`, { head: ['Dozer', 'Status', 'Ownership', 'Owner', 'Site'], rows });
  }

  // ---------------------------------------------------------------- diesel
  if (has(/diesel|litre|liter|\bago\b|pms|fuel|on ground|fueling|fuelling/)) {
    const day = range.explicit ? to : (lastDate || today);
    const dash = buildDailyDashboard({ ...ctx, project, date: day, since: DASHBOARD_BASIS_FROM > day ? day : DASHBOARD_BASIS_FROM });
    const x = dash.diesel;
    if (has(/tomorrow|needed|need|request|top up|top-up|supply|supplied tomorrow/)) {
      const total = sum(x.fuelingRequest, (r) => r.need);
      const onGround = x.onGround || 0;
      const rows = x.fuelingRequest.map((r) => [r.equipment, fmt(r.closing, 1), fmt(r.need, 1)]);
      return reply(`For the next day (to bring each listed dozer up to ${DIESEL_FILL_LITRES}L): ${fmt(total, 1)} L in total, less ${fmt(onGround)} L on ground, so ${fmt(Math.max(0, total - onGround), 1)} L (${money(Math.max(0, total - onGround) * x.dieselRate)}) still needs to be supplied. Based on closing diesel on ${dmy(day)}; the list is every active dozer that has worked on the site since 10 Oct.`, { head: ['Dozer', 'Closing (L)', 'Needs (L)'], rows });
    }
    if (range.from !== range.to) {
      const dist = ctx.distributions.filter((d) => d.project === project && d.date >= from && d.date <= to);
      const ops = allOps.filter((o) => o.date >= from && o.date <= to);
      const coll = ctx.fuelCreditCollections.filter((c) => c.date >= from && c.date <= to && c.fuelType === 'Diesel' && !/sold to/i.test(c.notes || ''));
      return reply(`Diesel in ${range.label}: ${fmt(sum(coll, (c) => c.litres))} L collected for site, ${fmt(sum(dist, (d) => d.litres))} L distributed to dozers, ${fmt(sum(ops, (o) => o.fuelUsed), 1)} L used (${money(sum(ops, (o) => (o.fuelUsed || 0) * ctx.dieselRateAsOf(o.date)))}).`, null, notes);
    }
    const rows = x.rows.map((r) => [r.equipment, fmt(r.opening, 1), fmt(r.distributed), fmt(r.used, 1), fmt(r.closing, 1), r.status]);
    return reply(`Diesel on ${dmy(day)}: ${fmt(x.collectedAgo)} L collected${x.soldAgo ? ` (plus ${fmt(x.soldAgo)} L sold on)` : ''}, ${fmt(x.collectedPms)} L PMS, ${fmt(x.distributedToday)} L distributed to dozers, ${fmt(x.usedToday, 1)} L used (${money(x.usedCost)}). On ground: ${x.onGround === null ? 'no stock count' : `${fmt(x.onGround)} L`}.`, rows.length ? { head: ['Dozer', 'Opening', 'Distributed', 'Used', 'Closing', 'Status'], rows } : null, notes);
  }

  // ----------------------------------------------------------- start times
  if (has(/late|resum|start(ed|ing)?\b|punctual|on time|7 ?am/)) {
    const { rows } = rowsFor(ctx, project, from, to, ent);
    if (!rows.length) return reply(`No Daily Operations reports for ${range.label}${entLabel ? ` for ${entLabel}` : ''}.`);
    const timed = rows.filter((r) => toMinutes(r.op.timeResumed) !== null);
    if (range.from === range.to) {
      const tr = timed.map((r) => { const s = toMinutes(r.op.timeResumed); return [dozerLabel(ctx, rows, r.op.equipment), clock(s), s <= IDEAL_START_MINUTES ? 'On time' : `${Math.floor((s - IDEAL_START_MINUTES) / 60)}h ${String((s - IDEAL_START_MINUTES) % 60).padStart(2, '0')}m late`]; });
      const late = timed.filter((r) => toMinutes(r.op.timeResumed) - IDEAL_START_MINUTES >= LATE_MINUTES);
      return reply(`${late.length} of ${timed.length} dozer(s) started an hour or more after 7:00 AM on ${dmy(from)}.`, { head: ['Dozer', 'Started', 'Against 7:00 AM'], rows: tr });
    }
    const by = groupBy(ctx, timed, has(/supervisor|oki|christopher|godstime/) ? 'supervisor' : 'operator');
    const trs = by.map((g) => [g.label, String(g.days), clock(g.avgStart), `${timed.filter((r) => (by.length && (has(/supervisor/) ? r.op.supervisorId : r.op.operatorId) === g.key) && toMinutes(r.op.timeResumed) - IDEAL_START_MINUTES >= LATE_MINUTES).length}`]).sort((a, b) => (a[2] < b[2] ? -1 : 1));
    const overall = agg(timed);
    return reply(`In ${range.label} the average start was ${clock(overall.avgStart)} (ideal 7:00 AM).`, { head: ['Name', 'Days', 'Average start', 'Late starts (1 hr+)'], rows: trs }, notes);
  }

  // -------------------------------------------------------------- compare
  if (has(/compare|versus|\bvs\b|\bv\b/)) {
    if (!range.explicit && firstDate) { range.from = firstDate; range.to = lastDate; range.label = `${rangeLabel(firstDate, lastDate)} (all reports)`; notes.splice(0, notes.length, `No date given, so I compared all reports (${rangeLabel(firstDate, lastDate)}).`); }
    const { from, to } = range;
    const kind = ent.dozers.length >= 2 ? 'dozer' : (has(/operator|dozer/) && !has(/supervisor/) ? 'operator' : 'supervisor');
    const { rows } = rowsFor(ctx, project, from, to, ent.dozers.length >= 2 || ent.people.length >= 2 ? ent : null);
    const by = groupBy(ctx, rows, kind).sort((a, b) => (b.outputPct ?? -1) - (a.outputPct ?? -1));
    if (!by.length) return reply(`No reports in ${range.label} to compare.`);
    return reply(`${kind[0].toUpperCase()}${kind.slice(1)} comparison for ${range.label}, ranked by output against expected.`, { head: [kind[0].toUpperCase() + kind.slice(1), 'Days', 'Hrs', 'Ha', 'Output', 'Revenue', 'Cost', 'Net'], rows: by.map((g) => [g.label, String(g.days), fmt(g.hours, 1), fmt(g.ha, 1), pct(g.outputPct), money(g.revenue), money(g.cost), money(g.net)]) }, notes.concat('Cost covers dozer rate, diesel, diesel logistics and operator allowance; PMS and supervisor allowances are site-level.'));
  }

  // -------------------------------------------------------------- rankings
  if (has(/\b(best|worst|top|rank|ranking|lowest|highest|most|least)\b|perform/)) {
    const kind = has(/supervisor|manager/) ? 'supervisor' : has(/operator|driver|staff|who|person/) && !has(/dozer|machine/) ? 'operator' : 'dozer';
    const { rows } = rowsFor(ctx, project, from, to, null);
    const by = groupBy(ctx, rows, kind);
    if (!by.length) return reply(`No reports in ${range.label}.`);
    const metric = has(/profit|net|loss|money|earn/) ? 'net' : has(/hectare|\bha\b|cleared/) ? 'ha' : has(/hour/) ? 'hours' : 'outputPct';
    const sorted = by.sort((a, b) => (b[metric] ?? -Infinity) - (a[metric] ?? -Infinity));
    const worstFirst = has(/worst|lowest|least|poor|under/);
    const pick = worstFirst ? sorted[sorted.length - 1] : sorted[0];
    const label = { net: 'net result', ha: 'hectares cleared', hours: 'hours worked', outputPct: 'output against expected' }[metric];
    const val = (g) => (metric === 'net' ? money(g.net) : metric === 'ha' ? `${fmt(g.ha, 1)} ha` : metric === 'hours' ? `${fmt(g.hours, 1)} hrs` : pct(g.outputPct));
    return reply(`${worstFirst ? 'Lowest' : 'Highest'} ${kind} by ${label} in ${range.label}: ${pick.label} (${val(pick)}).`, { head: [kind[0].toUpperCase() + kind.slice(1), 'Days', 'Hrs', 'Ha', 'Output', 'Net'], rows: sorted.map((g) => [g.label, String(g.days), fmt(g.hours, 1), fmt(g.ha, 1), pct(g.outputPct), money(g.net)]) }, notes);
  }

  // ----------------------------------------------- profit / cost / revenue
  if (has(/profit|loss|margin|revenue|income|cost|expens|made|lost|earn|break/)) {
    if (ent.dozers.length || ent.people.length) {
      const { rows } = rowsFor(ctx, project, from, to, ent);
      if (!rows.length) return reply(`No reports for ${entLabel} in ${range.label}.`);
      const a = agg(rows);
      return reply(`${entLabel}, ${range.label}: ${a.days} day(s), ${fmt(a.hours, 1)} hrs, ${fmt(a.ha, 1)} ha (${pct(a.outputPct)} of expected). Revenue ${money(a.revenue)}, cost ${money(a.cost)}, net ${money(a.net)}.`, null, notes.concat('Cost covers dozer rate, diesel, diesel logistics and operator allowance. PMS and supervisor allowances are site-level and not included.'));
    }
    const s = ctx.statsFor(from, to);
    const days = [...new Set(allOps.filter((o) => o.date >= from && o.date <= to).map((o) => o.date))].sort();
    if (!days.length) return reply(`There are no Daily Operations reports for ${range.label}, so there is no profit to report.`);
    const lines = [`${range.label}: Operations Profit ${money(s.opsProfit)} (revenue ${money(s.provisionalRevenue)} less total cost ${money(s.totalCost)}) from ${fmt(s.areaCleared, 1)} ha. Net machine recovery is ${money(s.netMcRecovered)} (recovered ${money(s.mcRecovered)}, maintenance ${money(s.maintenanceIncurred)}), so Total Profit is ${money(s.totalProfit)}.`];
    if (has(/cost|expens/)) lines.push(`Costs: diesel ${money(s.dieselCost)}, dozers ${money(s.dozerCost)}, logistics ${money(s.logisticsCost)}, operator allowance ${money(s.operatorAllowanceCost)}, PMS ${money(s.pmsCost)}, other ${money(s.otherCost)}.`);
    let table = null;
    if (days.length > 1 && days.length <= 20) table = { head: ['Date', 'Ha', 'Revenue', 'Cost', 'Operations profit', 'Total profit'], rows: days.map((d) => { const x = ctx.statsFor(d, d); return [dm(d), fmt(x.areaCleared, 1), money(x.provisionalRevenue), money(x.totalCost), money(x.opsProfit), money(x.totalProfit)]; }) };
    return reply(lines.join(' '), table, notes);
  }

  // ---------------------------------------------- hectares / hours / output
  if (has(/hectare|\bha\b|cleared|hours?|worked|output|productiv|perform|dozers? (work|report)|how many dozers/)) {
    const { rows } = rowsFor(ctx, project, from, to, ent);
    if (!rows.length) return reply(`No Daily Operations reports for ${range.label}${entLabel ? ` for ${entLabel}` : ''}.`);
    const a = agg(rows);
    const by = groupBy(ctx, rows, ent.people.length && !ent.dozers.length ? 'operator' : 'dozer').sort((x, y) => (y.outputPct ?? -1) - (x.outputPct ?? -1));
    return reply(`${entLabel ? `${entLabel}, ` : ''}${range.label}: ${fmt(a.ha, 1)} ha cleared in ${fmt(a.hours, 1)} hrs by ${new Set(rows.map((r) => r.op.equipment)).size} dozer(s) over ${a.days} day(s) — ${pct(a.outputPct)} of the expected ${EXPECTED_HA_PER_8HRS} ha per 8 hrs.`, { head: ['Name', 'Days', 'Hrs', 'Ha', 'Expected ha', 'Output'], rows: by.map((g) => [g.label, String(g.days), fmt(g.hours, 1), fmt(g.ha, 1), fmt(g.expected, 2), pct(g.outputPct)]) }, notes);
  }

  // ------------------------------------------------------------ maintenance
  if (has(/maintenance|repair|spare|part/)) {
    const s = ctx.statsFor(from, to);
    return reply(`Maintenance incurred in ${range.label}: ${money(s.maintenanceIncurred)} (Approved/Paid maintenance requests and expenses, plus PMS used for maintenance).`, null, notes);
  }

  return reply('I can only answer from the data loaded in the ERP, and I could not match that question. I can answer about profit and costs, hectares and hours, best and worst dozer, operator or supervisor, start times, diesel and fueling needs, fund requests, Midejab fuel credit, fleet status and profit targets. For example:\n• ' + EXAMPLE_QUESTIONS.slice(0, 6).join('\n• '));
}
