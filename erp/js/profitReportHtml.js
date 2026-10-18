// Builds the downloadable Operations Profitability Report: a single
// self-contained HTML file in the same design (colours, fonts, tables, mobile
// layout) as the daily dashboard reports, containing only the sections that
// were selected. Pure: takes the object from buildProfitReport().
import { DASHBOARD_CSS, SCRIPT_TAIL } from './dashboardHtml.js';
import { IDEAL_START_MINUTES } from './profitReportData.js';
import { SUNDAY_BONUS_BASIS_TEXT } from './dashboardBasis.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n, dp = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const signed = (n) => `${n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
const money = (n) => `${n < 0 ? '−' : ''}₦${fmt(Math.abs(n))}`;
const pct = (n) => (n === null || n === undefined ? '—' : `${n.toFixed(1)}%`);
const parts = (iso) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };
const shortDate = (iso) => { const p = parts(iso); return `${p.d} ${MONTHS[p.m - 1].slice(0, 3)}`; };
const longDate = (iso) => { const p = parts(iso); return `${p.d} ${MONTHS[p.m - 1]} ${p.y}`; };
const clock = (mins) => {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(mins / 60); const m = Math.round(mins % 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const lateText = (mins) => {
  if (mins === null || mins === undefined) return '—';
  const late = Math.round(mins - IDEAL_START_MINUTES);
  return late <= 0 ? 'On time' : `${Math.floor(late / 60)}h ${String(late % 60).padStart(2, '0')}m late`;
};
const tone = (n) => (n >= 0 ? 'good' : 'crit');

function tile(label, value, { cls = '', note = '' } = {}) {
  return `<div class="tile"><div class="label">${esc(label)}</div><div class="value${cls ? ` ${cls}` : ''}">${esc(value)}</div>${note ? `<div class="note">${esc(note)}</div>` : ''}</div>`;
}

// A simple responsive SVG line chart with an optional reference line.
function lineChart({ title, labels, values, yMin, yMax, ref, refLabel, fmtY, color = '#166534' }) {
  const W = 640; const H = 240; const L = 56; const R = 16; const T = 20; const B = 36;
  const n = labels.length;
  const x = (i) => (n <= 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (n - 1));
  const y = (v) => T + ((yMax - v) / (yMax - yMin)) * (H - T - B);
  const ticks = 4;
  let g = '';
  for (let i = 0; i <= ticks; i += 1) {
    const v = yMin + ((yMax - yMin) * i) / ticks;
    g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#d8ded9" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="#5a6b62">${esc(fmtY(v))}</text>`;
  }
  labels.forEach((l, i) => { g += `<text x="${x(i)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="#5a6b62">${esc(l)}</text>`; });
  if (ref !== undefined && ref !== null) {
    g += `<line x1="${L}" x2="${W - R}" y1="${y(ref)}" y2="${y(ref)}" stroke="#b42318" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - R}" y="${y(ref) - 5}" font-size="11" text-anchor="end" fill="#b42318">${esc(refLabel)}</text>`;
  }
  let path = ''; let pen = false;
  values.forEach((v, i) => {
    if (v === null || v === undefined) { pen = false; return; }
    path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `; pen = true;
  });
  let dots = '';
  values.forEach((v, i) => { if (v !== null && v !== undefined) dots += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" fill="${color}"/><text x="${x(i)}" y="${y(v) - 8}" font-size="10.5" text-anchor="middle" fill="#14261c">${esc(fmtY(v))}</text>`; });
  return `<div class="chart-card"><h4>${esc(title)}</h4><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}" style="width:100%;height:auto">${g}<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"/>${dots}</svg></div>`;
}

const th = (label, num) => `<th data-type="${num ? 'num' : 'text'}">${label}</th>`;

export function buildProfitReportHtml(r, { title = 'Operations Profitability Report' } = {}) {
  const want = new Set(r.sections);
  const t = r.totals; const o = r.overall;
  const siteName = /kangidi/i.test(r.project) ? 'Kangidi (Rex Forestry)' : r.project;
  const rangeText = r.from === r.to ? longDate(r.from) : `${longDate(r.from)} – ${longDate(r.to)}`;
  const nav = [['summary', 'Summary'], ['daily', 'Day by day'], ['trend', 'Trends'], ['dozers', 'Dozers'], ['operators', 'Operators'], ['supervisors', 'Supervisors'], ['flagged', 'Flagged days'], ['diesel', 'Diesel'], ['requests', 'Requests']]
    .filter(([k]) => want.has(k)).map(([k, l]) => `  <a href="#${k}">${l}</a>`).join('\n');
  const out = [];

  if (want.has('summary')) {
    const lines = [
      ['Revenue', t.provisionalRevenue, `${fmt(t.areaCleared, 1)} ha × contract rate`],
      ['Diesel Cost', t.dieselCost, `${fmt(t.fuelUsed)} L used`],
      ['Logistics', t.logisticsCost, '₦50/L of diesel supplied to Company and Rented dozers'],
      ['Operator Allowance', t.operatorAllowanceCost, 'Owned EMG operators'],
      ['Supervisor Sunday Allowance', t.supervisorSundayAllowance, SUNDAY_BONUS_BASIS_TEXT],
      ['Dozer Cost — Owned', t.dozerOwned, 'Hours × hourly rate'],
      ['Dozer Cost — Rented', t.dozerRented, 'Hours × hourly rate'],
      ['Dozer Cost — Partnership', t.dozerPartnership, 'Hours × hourly rate'],
      ['PMS — Tacoma', t.pmsTacoma, 'PMS collected at the station'],
    ];
    const other = t.otherCost - t.supervisorSundayAllowance;
    const lineRows = lines.map(([l, v, b]) => `      <tr><td>${l}</td><td class="num">${fmt(v)}</td><td>${b}</td></tr>`);
    if (Math.abs(other) > 0.5) lineRows.splice(4, 0, `      <tr><td>Other costs (earlier rules)</td><td class="num">${fmt(other)}</td><td>Requests, manager Sunday allowance (before 10 Oct 2026)</td></tr>`);
    if (t.pmsUnexplained) lineRows.push(`      <tr class="flag"><td>PMS — unexplained</td><td class="num">${fmt(t.pmsUnexplained)}</td><td>Not yet explained</td></tr>`);
    lineRows.push(`      <tr style="font-weight:700;background:var(--serious-bg)"><td>Operations Profit</td><td class="num">${signed(t.opsProfit)}</td><td>Revenue less all costs above</td></tr>`);
    out.push(`<section id="summary">
  <h2><span class="n">1.</span> Summary</h2>
  <p class="lead">${esc(siteName)} · ${rangeText} · ${r.workingDays} working day(s). Expected output ${r.expectedHaPer8} ha per 8 hrs.</p>
  <div class="tiles">
    ${tile('Revenue', money(t.provisionalRevenue), { note: `${fmt(t.areaCleared, 1)} ha cleared` })}
    ${tile('Total Cost', money(t.totalCost))}
    ${tile('Operations Profit', money(t.opsProfit), { cls: tone(t.opsProfit), note: t.provisionalRevenue ? `${((t.opsProfit / t.provisionalRevenue) * 100).toFixed(1)}% margin` : '' })}
    ${tile('Total Profit', money(t.totalProfit), { cls: tone(t.totalProfit), note: 'Operations Profit + Net M/c Recovered' })}
    ${tile('Output vs expected', pct(o.outputPct), { note: `${fmt(o.hours, 1)} hrs worked` })}
    ${tile('Average start', clock(o.avgStart), { note: `${o.lateDays} late start(s)` })}
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th class="nosort">Line</th><th class="nosort" data-type="num">Amount (₦)</th><th class="nosort">Basis</th></tr></thead>
    <tbody>
${lineRows.join('\n')}
    </tbody>
  </table></div>
  <h3 class="sub-h">Machine Recovery and Total Profit</h3>
  <div class="table-wrap"><table>
    <thead><tr><th class="nosort">Line</th><th class="nosort" data-type="num">Amount (₦)</th></tr></thead>
    <tbody>
      <tr><td>Operations Profit</td><td class="num">${signed(t.opsProfit)}</td></tr>
      <tr><td>M/c Recovered (Company dozers, cost avoided vs. renting)</td><td class="num">${fmt(t.mcRecovered)}</td></tr>
      <tr><td>Maintenance Incurred</td><td class="num">${fmt(t.maintenanceIncurred)}</td></tr>
      <tr><td>Net M/c Recovered</td><td class="num">${signed(t.netMcRecovered)}</td></tr>
      <tr style="font-weight:700;background:var(--${t.totalProfit >= 0 ? 'good' : 'serious'}-bg)"><td>Total Profit</td><td class="num">${signed(t.totalProfit)}</td></tr>
    </tbody>
  </table></div>
</section>`);
  }

  if (want.has('daily')) {
    const rows = r.daily.map((d) => `      <tr${d.opsProfit < 0 ? ' class="flag"' : ''}><td>${shortDate(d.date)}</td><td class="num">${d.dozers}</td><td class="num">${fmt(d.hours, 1)}</td><td class="num">${fmt(d.ha, 1)}</td><td class="num">${pct(d.outputPct)}</td><td class="num">${clock(d.avgStart)}</td><td class="num">${fmt(d.revenue)}</td><td class="num">${fmt(d.cost)}</td><td class="num">${signed(d.opsProfit)}</td><td class="num">${signed(d.totalProfit)}</td></tr>`).join('\n');
    out.push(`<section id="daily">
  <h2><span class="n">2.</span> Day by Day</h2>
  <div class="table-wrap"><table id="tbl-daily">
    <thead><tr>${th('Date')}${th('Dozers', 1)}${th('Hrs', 1)}${th('Ha', 1)}${th('Output vs expected', 1)}${th('Avg start', 1)}${th('Revenue (₦)', 1)}${th('Cost (₦)', 1)}${th('Operations Profit (₦)', 1)}${th('Total Profit (₦)', 1)}</tr></thead>
    <tbody>
${rows}
      <tr style="font-weight:700;background:var(--serious-bg)"><td>Total</td><td class="num"></td><td class="num">${fmt(o.hours, 1)}</td><td class="num">${fmt(o.ha, 1)}</td><td class="num">${pct(o.outputPct)}</td><td class="num">${clock(o.avgStart)}</td><td class="num">${fmt(t.provisionalRevenue)}</td><td class="num">${fmt(t.totalCost)}</td><td class="num">${signed(t.opsProfit)}</td><td class="num">${signed(t.totalProfit)}</td></tr>
    </tbody>
  </table></div>
</section>`);
  }

  if (want.has('trend')) {
    const labels = r.trend.days.map(shortDate);
    const maxOut = Math.max(100, ...r.trend.outputPct.filter((v) => v !== null));
    const starts = r.trend.avgStart.filter((v) => v !== null);
    const sMin = Math.min(6 * 60, ...starts) - 0; const sMax = Math.max(12 * 60, ...starts);
    out.push(`<section id="trend">
  <h2><span class="n">3.</span> Output and Start-Time Trend</h2>
  <p class="lead">Output is hectares cleared against the expected figure for the hours worked. The dashed line is the break-even level (71.9%) and the ideal 7:00 AM start.</p>
  <div class="grid-2">
    ${lineChart({ title: 'Output vs expected, by day', labels, values: r.trend.outputPct, yMin: 0, yMax: Math.ceil(maxOut / 20) * 20, ref: 71.9, refLabel: 'Break-even 71.9%', fmtY: (v) => `${Math.round(v)}%` })}
    ${lineChart({ title: 'Average start time, by day', labels, values: r.trend.avgStart, yMin: Math.floor(sMin / 60) * 60, yMax: Math.ceil(sMax / 60) * 60, ref: IDEAL_START_MINUTES, refLabel: 'Ideal 7:00 AM', fmtY: (v) => clock(v).replace(':00 ', ' '), color: '#b45309' })}
  </div>
</section>`);
  }

  const groupTable = (id, number, heading, lead, list, labelHead, extraHead, extraCell) => {
    const rows = list.map((g, i) => `      <tr${g.net < 0 ? ' class="flag"' : ''}><td class="num">${i + 1}</td><td><strong>${esc(g.label)}</strong></td><td class="num">${g.days}</td><td class="num">${fmt(g.hours, 1)}</td><td class="num">${fmt(g.ha, 1)}</td><td class="num">${pct(g.outputPct)}</td>${extraCell ? extraCell(g) : ''}<td class="num">${clock(g.avgStart)}</td><td class="num">${fmt(g.revenue)}</td><td class="num">${fmt(g.cost)}</td><td class="num">${signed(g.net)}</td></tr>`).join('\n');
    return `<section id="${id}">
  <h2><span class="n">${number}.</span> ${heading}</h2>
  <p class="lead">${lead}</p>
  <div class="table-wrap"><table>
    <thead><tr>${th('Rank', 1)}${th(labelHead)}${th('Days', 1)}${th('Hrs', 1)}${th('Ha', 1)}${th('Output vs expected', 1)}${extraHead || ''}${th('Avg start', 1)}${th('Revenue (₦)', 1)}${th('Cost (₦)', 1)}${th('Net (₦)', 1)}</tr></thead>
    <tbody>
${rows || '      <tr><td colspan="11">No reports in this period.</td></tr>'}
    </tbody>
  </table></div>
</section>`;
  };
  let n = (want.has('summary') ? 1 : 0) + (want.has('daily') ? 1 : 0) + (want.has('trend') ? 1 : 0);
  const num = () => { n += 1; return n; };
  if (want.has('dozers')) out.push(groupTable('dozers', num(), 'By Dozer', 'Ranked by output against expected. Cost = dozer rate + diesel + diesel logistics + operator allowance. PMS and supervisor allowances are site-level and not split by dozer.', r.byDozer, 'Dozer', th('Break-even', 1), (g) => `<td class="num">${pct(g.breakEvenPct)}</td>`));
  if (want.has('operators')) out.push(groupTable('operators', num(), 'By Operator', 'Ranked by output against expected for the hours each operator worked.', r.byOperator, 'Operator', th('Dozer(s)'), (g) => `<td>${esc(g.dozers)}</td>`));
  if (want.has('supervisors')) {
    const duty = r.supervisorDays.map((d) => `<li>${shortDate(d.date)}: ${esc(d.supervisors.join(', '))}</li>`).join('');
    out.push(groupTable('supervisors', num(), 'Supervisor Comparison', 'The same figures for the days each supervisor was on duty, so the supervisors can be compared like for like.', r.bySupervisor, 'Supervisor', '', null).replace('</section>', `  <h3 class="sub-h">Who supervised each day</h3>\n  <ul class="lead" style="margin:0;padding-left:18px;columns:2">${duty}</ul>\n</section>`));
  }
  if (want.has('flagged')) {
    const rows = r.flagged.map((f) => `      <tr><td>${shortDate(f.date)}</td><td>${esc(f.equipment)}</td><td>${esc(f.reason)}</td><td class="num">${signed(f.net)}</td></tr>`).join('\n');
    out.push(`<section id="flagged">
  <h2><span class="n">${num()}.</span> Flagged Days</h2>
  <p class="lead">Dozer-days below break-even, correction days (hours with no hectares), deal days and late starts (an hour or more after 7:00 AM).</p>
  <div class="table-wrap"><table>
    <thead><tr>${th('Date')}${th('Dozer')}${th('Reason')}${th('Net for the day (₦)', 1)}</tr></thead>
    <tbody>
${rows || '      <tr><td colspan="4">Nothing flagged in this period.</td></tr>'}
    </tbody>
  </table></div>
</section>`);
  }
  if (want.has('diesel')) {
    const d = r.diesel;
    const rows = d.perDozer.map((x) => `      <tr><td><strong>${esc(x.equipment)}</strong></td><td class="num">${fmt(x.distributed)}</td><td class="num">${fmt(x.used, 1)}</td><td class="num">${x.litresPerHa === null ? '—' : fmt(x.litresPerHa, 1)}</td></tr>`).join('\n');
    out.push(`<section id="diesel">
  <h2><span class="n">${num()}.</span> Diesel Summary</h2>
  <div class="tiles">
    ${tile('Collected at station', `${fmt(d.collected)} L`, { note: d.sold ? `Excludes ${fmt(d.sold)} L sold` : '' })}
    ${tile('Distributed to dozers', `${fmt(d.distributed)} L`)}
    ${tile('Used (standard)', `${fmt(d.used)} L`, { note: money(d.usedCost) })}
  </div>
  <div class="table-wrap"><table>
    <thead><tr>${th('Dozer')}${th('Distributed (L)', 1)}${th('Used (L)', 1)}${th('Litres per ha', 1)}</tr></thead>
    <tbody>
${rows || '      <tr><td colspan="4">No diesel records in this period.</td></tr>'}
    </tbody>
  </table></div>
</section>`);
  }
  if (want.has('requests')) {
    const q = r.requests;
    const rows = q.byCategory.map((c) => `      <tr><td>${esc(c.category)}</td><td class="num">${fmt(c.requested)}</td><td class="num">${fmt(c.paid)}</td><td class="num">${fmt(c.approved)}</td><td class="num">${fmt(c.pending)}</td></tr>`).join('\n');
    out.push(`<section id="requests">
  <h2><span class="n">${num()}.</span> Requests and Expenses</h2>
  <div class="tiles">
    ${tile('Requested', money(q.requested))}
    ${tile('Paid', money(q.paid), { cls: 'good' })}
    ${tile('Approved, unpaid', money(q.approved), { cls: 'warn' })}
    ${tile('Pending', money(q.pending), { cls: 'warn' })}
  </div>
  <div class="table-wrap"><table>
    <thead><tr>${th('Category')}${th('Requested (₦)', 1)}${th('Paid (₦)', 1)}${th('Approved (₦)', 1)}${th('Pending (₦)', 1)}</tr></thead>
    <tbody>
${rows || '      <tr><td colspan="5">No requests in this period.</td></tr>'}
    </tbody>
  </table></div>
</section>`);
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Emagrims — ${esc(title)}, ${shortDate(r.from)}${r.from === r.to ? '' : ` to ${shortDate(r.to)}`}</title>
<style>
${DASHBOARD_CSS}
</style>
</head>
<body>

<header class="top">
  <div class="eyebrow">Emagrims Ltd — Internal Operations</div>
  <h1>${esc(title)}</h1>
  <div class="sub">${rangeText} &nbsp;·&nbsp; Site: ${esc(siteName)}</div>
</header>

<nav class="tabs">
${nav}
</nav>

<main>

${out.join('\n\n')}

<p style="text-align:center;color:var(--text-muted);font-size:11.5px;margin-top:30px;">Prepared by ERP Software</p>

</main>

<script>
(function() {
${SCRIPT_TAIL}
</script>
</body>
</html>
`;
}

export function profitReportFileName(from, to) {
  const f = (iso) => { const p = parts(iso); return `${p.d}${MONTHS[p.m - 1].slice(0, 3)}${p.y}`; };
  return from === to ? `Operations_Profitability_Report_${f(from)}.html` : `Operations_Profitability_Report_${f(from)}-${f(to)}.html`;
}
