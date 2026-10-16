// Builds the downloadable Daily Operations Dashboard: one self-contained HTML
// file with the same design, colours, sections and behaviour as the daily
// dashboard reports (sortable tables, bar charts, mobile layout).
//
// Pure: takes the data object from buildDailyDashboard() (see
// dailyDashboardData.js) and returns the HTML text. The CSS and the small
// chart/sort script are the report template, kept verbatim.

import { DIESEL_FILL_LITRES } from './dailyDashboardData.js';

export const DASHBOARD_CSS = String.raw`  :root {
    color-scheme: light;
    --brand: #166534;
    --brand-dark: #14261c;
    --surface-1: #ffffff;
    --surface-2: #f4f8f5;
    --surface-3: #eef2ef;
    --text-primary: #16201a;
    --text-secondary: #52615a;
    --text-muted: #7c8a82;
    --border: #d9e2dc;
    --good: #0ca30c;
    --good-bg: #e6f6e6;
    --warning: #fab219;
    --warning-bg: #fff6e0;
    --serious: #ec835a;
    --serious-bg: #fdece4;
    --critical: #d03b3b;
    --critical-bg: #fbe7e7;
    --s1: #2a78d6;
    --s2: #eb6834;
    --s3: #1baf7a;
    --s4: #eda100;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, 'Segoe UI', Arial, sans-serif;
    background: var(--surface-2);
    color: var(--text-primary);
    font-size: 14px;
    line-height: 1.5;
  }
  header.top {
    background: linear-gradient(135deg, var(--brand-dark), var(--brand));
    color: #fff;
    padding: 28px 24px 22px;
  }
  header.top .eyebrow {
    text-transform: uppercase;
    letter-spacing: 1.5px;
    font-size: 11px;
    font-weight: 700;
    opacity: .85;
  }
  header.top h1 { margin: 6px 0 4px; font-size: 24px; }
  header.top .sub { opacity: .9; font-size: 13px; }
  nav.tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 24px;
    background: var(--brand-dark);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  nav.tabs a {
    color: #d7e8dc;
    text-decoration: none;
    font-size: 12.5px;
    font-weight: 600;
    padding: 7px 12px;
    border-radius: 6px;
  }
  nav.tabs a:hover { background: rgba(255,255,255,.12); color: #fff; }
  main { max-width: 1180px; margin: 0 auto; padding: 20px 24px 60px; }

  .banner {
    background: var(--warning-bg);
    border: 1px solid #f3d38a;
    border-left: 3px solid var(--warning);
    border-radius: 7px;
    padding: 8px 14px;
    margin-bottom: 18px;
    font-size: 11.5px;
  }
  .banner h3 { margin: 0 0 3px; font-size: 11.5px; color: #7a5600; }
  .banner ul { margin: 0; padding-left: 15px; }
  .banner li { margin: 1px 0; color: #5c4300; line-height: 1.35; }

  section { margin-bottom: 38px; scroll-margin-top: 54px; }
  section h2 {
    font-size: 17px;
    color: var(--brand-dark);
    border-bottom: 2px solid var(--brand);
    padding-bottom: 7px;
    margin: 0 0 14px;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  section h2 .n { color: var(--brand); font-size: 20px; }
  section p.lead { color: var(--text-secondary); margin: 0 0 16px; font-size: 13px; }

  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 10px; margin-bottom: 18px; }
  .tile {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px 14px;
  }
  .tile .label { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--text-muted); font-weight: 600; }
  .tile .value { font-size: 20px; font-weight: 700; margin-top: 4px; color: var(--text-primary); }
  .tile .value.good { color: var(--good); }
  .tile .value.warn { color: #a97200; }
  .tile .value.crit { color: var(--critical); }
  .tile .note { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 10px; margin-bottom: 4px; }
  table { width: 100%; min-width: 100%; border-collapse: collapse; background: var(--surface-1); font-size: 12.8px; }
  thead th {
    background: var(--brand);
    color: #fff;
    text-align: left;
    padding: 9px 10px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
  }
  thead th[data-type="num"] { text-align: right; }
  thead th.nosort { cursor: default; }
  thead th .arrow { opacity: .55; font-size: 10px; margin-left: 3px; }
  tbody td { padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:nth-child(even) { background: var(--surface-2); }
  tbody tr.flag { background: var(--serious-bg) !important; }
  tbody tr.missing td { color: var(--text-muted); font-style: italic; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }

  .badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 99px;
    white-space: nowrap;
  }
  .badge.paid { background: var(--good-bg); color: #075c07; }
  .badge.partial { background: var(--warning-bg); color: #7a5600; }
  .badge.approved { background: #e3edf8; color: #1c4c84; }
  .badge.pending { background: var(--serious-bg); color: #9a3f1f; }
  .badge.na { background: var(--surface-3); color: var(--text-muted); }
  .badge.critical { background: var(--critical-bg); color: #8a2323; }
  .badge.redo { background: #ece3f8; color: #4b2a84; }

  .src { font-size: 10.5px; color: var(--text-muted); }

  .grid-2 { display: grid; grid-template-columns: 1.3fr 1fr; gap: 18px; align-items: start; }
  @media (max-width: 860px) { .grid-2 { grid-template-columns: 1fr; } }

  .chart-card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
  .chart-card h4 { margin: 0 0 10px; font-size: 12.5px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: .4px; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin: 7px 0; font-size: 12px; }
  .bar-row .lbl { width: 110px; flex-shrink: 0; color: var(--text-secondary); text-align: right; }
  .bar-row .track { flex: 1; background: var(--surface-3); border-radius: 4px; height: 16px; position: relative; overflow: visible; }
  .bar-row .fill { height: 100%; border-radius: 4px; display: flex; align-items: center; }
  .bar-row .val { margin-left: 6px; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .bar-row.flagged .track { outline: 2px solid var(--warning); outline-offset: 1px; }
  .legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; font-size: 11px; color: var(--text-secondary); }
  .legend span { display: inline-flex; align-items: center; gap: 4px; }
  .legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }

  .kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; font-size: 12.5px; }
  .kv dt { color: var(--text-muted); }
  .kv dd { margin: 0; font-weight: 600; }

  h3.sub-h { font-size: 14px; color: var(--brand-dark); margin: 22px 0 10px; }

  @media (max-width: 640px) {
    header.top { padding: 18px 16px 14px; }
    header.top h1 { font-size: 19px; }
    header.top .sub { font-size: 12px; }
    nav.tabs { padding: 8px 14px; gap: 4px; }
    nav.tabs a { font-size: 11.5px; padding: 6px 9px; }
    main { padding: 16px 14px 44px; }
    section h2 { font-size: 15px; }
    .tiles { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .tile { padding: 10px 11px; }
    .tile .value { font-size: 17px; }
    table { font-size: 12px; }
    thead th { padding: 7px 8px; }
    tbody td { padding: 7px 8px; }
    .bar-row .lbl { width: 84px; font-size: 11px; }
    .chart-card { padding: 12px 13px; }
  }

  @media (max-width: 420px) {
    .tiles { grid-template-columns: 1fr 1fr; }
    header.top h1 { font-size: 17px; }
  }`;
const SCRIPT_HEAD = String.raw`(function() {
  function bar(container, rows, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, rows.map(function(r){ return r.value; }));
    rows.forEach(function(r) {
      var pct = max ? (r.value / max * 100) : 0;
      var div = document.createElement('div');
      div.className = 'bar-row' + (r.flag ? ' flagged' : '');
      div.innerHTML =
        '<div class="lbl">' + r.label + '</div>' +
        '<div class="track"><div class="fill" style="width:' + pct + '%;background:' + (r.color || 'var(--s1)') + '"></div></div>' +
        '<div class="val">' + r.value.toLocaleString() + (opts.unit || '') + '</div>';
      container.appendChild(div);
    });
  }

`;
export const SCRIPT_TAIL = String.raw`  document.querySelectorAll('table').forEach(function(table) {
    var thead = table.querySelector('thead');
    if (!thead) return;
    var ths = Array.prototype.slice.call(thead.querySelectorAll('th[data-type]'));
    ths.forEach(function(th, idx) {
      var arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '⇅';
      th.appendChild(arrow);
      th.addEventListener('click', function() {
        var tbody = table.querySelector('tbody');
        var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
        var asc = th.getAttribute('data-sort') !== 'asc';
        ths.forEach(function(t) { t.removeAttribute('data-sort'); t.querySelector('.arrow').textContent = '⇅'; });
        th.setAttribute('data-sort', asc ? 'asc' : 'desc');
        arrow.textContent = asc ? '▲' : '▼';
        var type = th.getAttribute('data-type');
        rows.sort(function(a, b) {
          var cellsA = a.children, cellsB = b.children;
          if (!cellsA[idx] || !cellsB[idx]) return 0;
          var va = cellsA[idx].textContent.trim();
          var vb = cellsB[idx].textContent.trim();
          if (type === 'num') {
            var na = parseFloat(va.replace(/[^0-9.\-]/g, ''));
            var nb = parseFloat(vb.replace(/[^0-9.\-]/g, ''));
            if (isNaN(na)) na = asc ? Infinity : -Infinity;
            if (isNaN(nb)) nb = asc ? Infinity : -Infinity;
            return asc ? na - nb : nb - na;
          }
          return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        });
        rows.forEach(function(r) { tbody.appendChild(r); });
      });
    });
  });
})();`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n, dp = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const lit = (n) => (n === null || n === undefined ? '—' : fmt(n, Number.isInteger(n) ? 0 : 1));
const signed = (n, dp = 0) => `${n < 0 ? '−' : ''}${fmt(Math.abs(n), dp)}`;
const money = (n) => `${n < 0 ? '−' : ''}₦${fmt(Math.abs(n))}`;
const pct = (n) => (n === null || n === undefined ? '—' : `${n.toFixed(1)}%`);

function parts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}
const longDate = (iso) => { const p = parts(iso); return `${DAYS[p.dow]}, ${p.d} ${MONTHS[p.m - 1]} ${p.y}`; };
const shortDate = (iso) => { const p = parts(iso); return `${p.d} ${MONTHS[p.m - 1].slice(0, 3)} ${p.y}`; };
const dayMonth = (iso) => { const p = parts(iso); return `${p.d} ${MONTHS[p.m - 1].slice(0, 3)}`; };

// "Adebayo Tope" -> "Tope", "Jessie Daniel Jenom" -> "Jessie" (names with three
// or more parts lead with the first name).
function shortName(full) {
  if (!full) return '';
  const t = full.trim().split(/\s+/);
  return t.length >= 3 ? t[0] : t[t.length - 1];
}
const clip = (t, n) => (t && t.length > n ? `${t.slice(0, n - 1)}…` : t);
const badge = (cls, text) => `<span class="badge ${cls}">${esc(text)}</span>`;
const siteShort = (project) => (/kangidi/i.test(project) ? 'Kangidi' : project);
const siteLabel = (project) => (/kangidi/i.test(project) ? 'Kangidi (Rex Forestry)' : project);

function tile(label, value, { cls = '', note = '' } = {}) {
  return `<div class="tile"><div class="label">${esc(label)}</div><div class="value${cls ? ` ${cls}` : ''}">${esc(value)}</div>${note ? `<div class="note">${esc(note)}</div>` : ''}</div>`;
}

export function buildDashboardHtml(d, { expectedHaPer8 = 1.3, idealStart = '7:00 AM', fueling } = {}) {
  const proj = d.project;
  const onDay = (s) => dayMonth(s);
  const t = d.profit.today; const c = d.profit.cumulative;
  const breakEven = 71.9;

  // ------------------------------------------------------------- banner
  const flagItems = d.flags.length
    ? d.flags.map((f) => `    <li>${esc(f.text)}${f.action ? ` <strong>Action:</strong> ${esc(f.action)}` : ''}</li>`).join('\n')
    : '    <li>Nothing to flag for this day.</li>';

  // --------------------------------------------------------- 1 operations
  const opRows = d.operations.rows.map((r) => {
    const label = r.operator ? `${r.reported ? `<strong>${esc(r.equipment)}</strong>` : esc(r.equipment)} <span class="src">· ${esc(shortName(r.operator))}</span>` : (r.reported ? `<strong>${esc(r.equipment)}</strong>` : esc(r.equipment));
    if (!r.reported) {
      return `      <tr class="missing"><td>${label}</td><td>—</td><td>—</td><td class="num">0</td><td class="num">0</td><td class="num">—</td><td class="num">—</td><td class="num">${r.cumulativeHa > 0 ? fmt(r.cumulativeHa, 1) : '—'}</td></tr>`;
    }
    const low = r.pctExpected !== null && r.pctExpected < breakEven;
    return `      <tr${low ? ' class="flag"' : ''}><td>${label}</td><td>${esc(shortName(r.supervisor) || '—')}</td><td>${esc(siteShort(proj))} — Block ${esc(r.block)}</td><td class="num">${fmt(r.hours, 1)}</td><td class="num">${fmt(r.ha, 1)}</td><td class="num">${fmt(r.expected, 2)}</td><td class="num">${pct(r.pctExpected)}</td><td class="num">${fmt(r.cumulativeHa, 1)}</td></tr>`;
  }).join('\n');
  const blocks = [...new Set(d.operations.rows.filter((r) => r.reported && r.block && r.block !== '—').flatMap((r) => r.block.split(', ')))].sort();
  const ratio = d.operations.fleetCount ? d.operations.reporting / d.operations.fleetCount : 0;
  const opsTiles = [
    tile('Dozers reporting', `${d.operations.reporting} of ${d.operations.fleetCount}`, { cls: ratio <= 0.25 ? 'crit' : ratio < 0.6 ? 'warn' : '' }),
    tile('Ha cleared today', `${fmt(d.operations.todayHa, 1)} ha`, { note: blocks.length ? `Block${blocks.length > 1 ? 's' : ''} ${blocks.join(' & ')}, first phase` : '' }),
    tile('Hours worked today', `${fmt(d.operations.todayHours, 1)} hrs`),
    tile('Site cumulative', `${fmt(d.operations.cumulativeHa, 1)} ha`, { cls: 'good', note: `since ${onDay(d.since)}` }),
  ].map((x) => `    ${x}`).join('\n');

  // ------------------------------------------------------------- 2 diesel
  const x = d.diesel;
  const dist = x.distributionChart;
  const distNote = dist.length ? dist.map((b) => `${shortName((d.operations.rows.find((r) => r.equipment === b.label) || {}).operator) || b.label} ${fmt(b.value)}`).join(', ') : '';
  const fr = fueling || { rows: x.fuelingRequest, onGround: x.onGround ?? 0 };
  const frTotal = fr.rows.reduce((s, r) => s + r.need, 0);
  const frActual = Math.max(0, frTotal - (fr.onGround || 0));
  const nextDayLong = (() => { const p = parts(d.date); const n = parts(new Date(Date.UTC(p.y, p.m - 1, p.d + 1)).toISOString().slice(0, 10)); return `${n.d} ${MONTHS[n.m - 1]}`; })();
  const operatorOf = (code) => shortName((d.operations.rows.find((r) => r.equipment === code) || {}).operator);
  const frLines = fr.rows.map((r) => `        <dt>${esc(operatorOf(r.equipment) ? `${operatorOf(r.equipment)} (${r.equipment})` : r.equipment)}</dt><dd>closing ${lit(r.closing)}L → needs ${lit(r.need)}L</dd>`).join('\n');
  const dieselRows = x.rows.map((r) => {
    const cls = r.status === 'Closing restated' ? 'partial' : r.status === 'Reconciled' ? 'paid' : 'na';
    const text = r.status === 'Closing restated' ? `Closing restated (reported ${lit(r.reportedClosing)}L)` : r.status;
    return `      <tr${r.status === 'Closing restated' ? ' class="flag"' : ''}><td><strong>${esc(r.equipment)}</strong></td><td class="num">${lit(r.opening)}</td><td class="num">${lit(r.distributed)}</td><td class="num">${lit(r.used)}</td><td class="num">${lit(r.closing)}</td><td class="num">${r.efficiency === null ? '—' : fmt(r.efficiency, 1)}</td><td>${badge(cls, text)}</td></tr>`;
  }).join('\n');
  const dieselTiles = [
    tile('Supplied today (AGO)', `${fmt(x.collectedAgo)} L`, { note: 'Midejab station, supplied to the farm' }),
    x.soldAgo ? tile('Sold to CEO', `${fmt(x.soldAgo)} L`, { note: 'Not site diesel; left out of the supply' }) : '',
    tile('Supplied today (PMS)', `${fmt(x.collectedPms)} L`),
    tile('Distributed to dozers', `${fmt(x.distributedToday)} L`, { note: distNote }),
    tile('Used today (25L/hr)', `${fmt(x.usedToday)} L`, { note: `@${money(x.dieselRate)}/L = ${money(x.usedCost)}` }),
    tile('On ground, undistributed', x.onGround === null ? '—' : `${fmt(x.onGround)} L`, { cls: x.onGround === 0 ? 'crit' : (x.onGround ? 'warn' : ''), note: !x.onGroundDate ? 'No stock count logged' : ((x.onGroundIn || x.onGroundOut) ? `Count of ${onDay(x.onGroundDate)} (${fmt(x.onGroundBase)}L) + ${fmt(x.onGroundIn)}L collected − ${fmt(x.onGroundOut)}L distributed since` : `Stock count of ${onDay(x.onGroundDate)}`) }),
  ].filter(Boolean).map((y) => `    ${y}`).join('\n');

  // -------------------------------------------------------------- 3 fleet
  const fleetBadge = (r) => {
    if (r.status === 'Working') return badge('paid', 'Active');
    if (r.status === 'Not reporting') return badge('partial', 'No report');
    if (r.fleetStatus === 'Down') return badge('critical', 'Down');
    if (r.fleetStatus === 'Under Maintenance') return badge('critical', 'Under maintenance');
    return badge('na', 'Not active');
  };
  const ownerCell = (r) => {
    const rate = `₦${fmt(r.hourlyRate)}/hr`;
    if (r.ownership === 'Company') return `Company <span class="src">· ${rate}</span>`;
    const day = `₦${fmt(r.hourlyRate * 8)}/day`;
    return `${esc(r.ownership)} <span class="src">· ${esc(r.ownerName ? `${r.ownerName}, ` : '')}${rate}${r.ownership === 'Rented' ? ` (${day})` : `, ${day}`}</span>`;
  };
  const fleetRows = d.fleet.map((r) => {
    const op = operatorOf(r.equipment);
    const bad = r.fleetStatus === 'Down' || r.fleetStatus === 'Under Maintenance' || r.status === 'Not reporting';
    return `      <tr${bad ? ' class="flag"' : ''}><td><strong>${esc(r.equipment)}</strong>${op ? ` <span class="src">· ${esc(op)}</span>` : ''}</td><td>${ownerCell(r)}</td><td>${fleetBadge(r)}</td><td class="num">${r.hours ? fmt(r.hours, 1) : '—'}</td><td class="num">${r.optimization === null ? '—' : pct(r.optimization)}</td><td>${esc(clip(r.remarks, 110))}</td></tr>`;
  }).join('\n');
  const vendorRows = d.vendorAccrual.map((v) => `      <tr><td>${esc(v.vendor)}</td><td>${esc(v.dozers.join(', '))}</td><td class="num">${fmt(v.accrued)}</td></tr>`).join('\n');

  // ------------------------------------------------------- 4 requests
  const rq = d.requests;
  const catName = (c) => (c === 'Maintenance' ? 'Repairs & Parts' : c);
  const reqRows = rq.rows.map((r) => {
    const cls = r.status === 'Paid' ? 'paid' : r.status === 'Approved' ? 'approved' : 'pending';
    return `        <tr><td>${esc(r.description)}${r.isNew ? ' <span class="src">· new today</span>' : ''}</td><td>${esc(catName(r.category))}</td><td class="num">${fmt(r.amount)}</td><td>${badge(cls, r.status)}</td></tr>`;
  }).join('\n');
  const catBars = rq.paidByCategory.map((b) => ({ label: b.label === 'Maintenance' ? 'Repairs/Parts' : b.label, value: b.value }));
  const reqTiles = [
    tile('Requested today', money(rq.requestedToday), { note: `${money(rq.requestedCumulative)} cumulative` }),
    tile('Paid today', money(rq.paidToday), { cls: rq.paidToday ? 'good' : '', note: `${money(rq.paidCumulative)} cumulative` }),
    tile('Pending', money(rq.pending), { cls: 'warn' }),
    tile('Approved, payment unconfirmed', money(rq.approved), { cls: 'warn' }),
  ].map((y) => `    ${y}`).join('\n');

  // ------------------------------------------------------ 5 profitability
  const lineDefs = [
    ['Revenue', 'provisionalRevenue', 'Ha × ₦845,000/ha'],
    ['Diesel Cost', 'dieselCost', 'Litres used × diesel price'],
    ['Diesel Logistics', 'logisticsCost', '₦50/L supplied (Company and Rented dozers)'],
    ['Operator Allowance', 'operatorAllowanceCost', 'Owned EMG operators, day rate per 8 hrs'],
    ['Supervisor Sunday Allowance', 'supervisorSundayAllowance', '₦20,000 per supervisor per Sunday'],
    ['Dozer Cost — Owned', 'dozerOwned', 'Hours × hourly rate'],
    ['Dozer Cost — Rented', 'dozerRented', 'Hours × hourly rate'],
    ['Dozer Cost — Partnership', 'dozerPartnership', 'Hours × hourly rate'],
    ['PMS — Tacoma', 'pmsTacoma', 'PMS collected at the station'],
  ];
  const flagRow = 'style="font-weight:700;background:var(--serious-bg)"';
  const goodRow = 'style="font-weight:700;background:var(--good-bg)"';
  const lineRows = lineDefs.map(([l, k, b]) => `      <tr><td>${l}</td><td class="num">${fmt(t[k])}</td><td class="num">${fmt(c[k])}</td><td>${b}</td></tr>`);
  const otherT = t.otherCost - t.supervisorSundayAllowance; const otherC = c.otherCost - c.supervisorSundayAllowance;
  if (Math.abs(otherT) > 0.5 || Math.abs(otherC) > 0.5) lineRows.splice(4, 0, `      <tr><td>Other costs (earlier rules)</td><td class="num">${fmt(otherT)}</td><td class="num">${fmt(otherC)}</td><td>Requests, manager Sunday allowance (before 10 Oct 2026)</td></tr>`);
  if (t.pmsUnexplained || c.pmsUnexplained) lineRows.push(`      <tr class="flag"><td>PMS — unexplained</td><td class="num">${fmt(t.pmsUnexplained)}</td><td class="num">${fmt(c.pmsUnexplained)}</td><td>Not yet explained</td></tr>`);
  lineRows.push(`      <tr ${flagRow}><td>Operations Profit</td><td class="num">${signed(t.opsProfit)}</td><td class="num">${signed(c.opsProfit)}</td><td>Revenue less all costs above</td></tr>`);
  const contribution = d.profit.contribution;
  const contribRows = contribution.map((r) => {
    const low = r.outputPct !== null && r.breakEvenPct !== null && r.outputPct < r.breakEvenPct;
    return `      <tr${low ? ' class="flag"' : ''}><td>${esc(r.equipment)}${r.operator ? ` <span class="src">· ${esc(shortName(r.operator))}</span>` : ''}</td><td class="num">${fmt(r.hours, 1)}</td><td class="num">${fmt(r.ha, 1)}</td><td class="num">${pct(r.outputPct)}</td><td class="num">${pct(r.breakEvenPct)}</td><td class="num">${fmt(r.revenue)}</td><td class="num">${fmt(r.cost)}</td><td class="num">${r.net >= 0 ? '+' : ''}${signed(r.net)}</td></tr>`;
  });
  d.profit.extraRows.forEach((e) => contribRows.push(`      <tr><td>${esc(e.label)}</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">0</td><td class="num">${fmt(e.cost)}</td><td class="num">${signed(-e.cost)}</td></tr>`));
  const totHours = contribution.reduce((s, r) => s + r.hours, 0); const totHa = contribution.reduce((s, r) => s + r.ha, 0);
  const expTot = (totHours / 8) * expectedHaPer8;
  contribRows.push(`      <tr ${flagRow}><td>Operations Profit</td><td class="num">${fmt(totHours, 1)}</td><td class="num">${fmt(totHa, 1)}</td><td class="num">${expTot > 0 ? pct((totHa / expTot) * 100) : '—'}</td><td class="num"></td><td class="num">${fmt(t.provisionalRevenue)}</td><td class="num">${fmt(t.totalCost)}</td><td class="num">${signed(t.opsProfit)}</td></tr>`);
  const profTiles = [
    tile('Revenue, cumulative', money(c.provisionalRevenue), { note: `${money(t.provisionalRevenue)} today` }),
    tile('Total Cost, cumulative', money(c.totalCost), { note: `${money(t.totalCost)} today` }),
    tile('Operations Profit, cumulative', money(c.opsProfit), { cls: c.opsProfit < 0 ? 'crit' : 'good', note: `${money(t.opsProfit)} today` }),
  ].map((y) => `    ${y}`).join('\n');

  // ---------------------------------------------------------- 6 staff
  const first = d.staff[0] && d.staff[0].days[0]; const last = d.staff[0] && d.staff[0].days[d.staff[0].days.length - 1];
  const rangeLabel = first ? `last 3 days: ${parts(first).d} → ${dayMonth(last)}` : '';
  const staffRows = d.staff.map((s, i) => {
    const late = s.lateMinutesToday !== null && s.lateMinutesToday >= 60;
    const prod = s.productivity.map((p) => (p === null ? '—' : `${p.toFixed(1)}%`)).join(' → ');
    return `      <tr${late ? ' class="flag"' : ''}><td class="num">${i + 1}</td><td><strong>${esc(shortName(s.name))}</strong><br><span class="src">${esc(s.role)}</span></td><td>${esc(s.resumption.join(' → '))}</td><td>${esc(s.lateToday)}</td><td class="num">${fmt(s.hoursToday, 1)}</td><td>${prod}</td><td class="num">${pct(s.cumulative)}</td></tr>`;
  }).join('\n');

  const dataCalls = [
    dist.length ? `  bar(document.getElementById('chart-diesel'), ${JSON.stringify(dist.map((b) => ({ label: b.label, value: b.value, color: 'var(--s1)' })))}, { unit: ' L' });` : '',
    catBars.length ? `  bar(document.getElementById('chart-category'), ${JSON.stringify(catBars.map((b) => ({ label: b.label, value: b.value, color: 'var(--s2)' })))}, { unit: '' });` : '',
  ].filter(Boolean).join('\n\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Emagrims — Daily Dashboard, ${shortDate(d.date)}</title>
<style>
${DASHBOARD_CSS}
</style>
</head>
<body>

<header class="top">
  <div class="eyebrow">Emagrims Ltd — Internal Operations</div>
  <h1>Daily Operations Dashboard</h1>
  <div class="sub">${longDate(d.date)} &nbsp;·&nbsp; Sites: ${esc(siteLabel(proj))}</div>
</header>


<nav class="tabs">
  <a href="#operations">1. Operations</a>
  <a href="#diesel">2. Diesel</a>
  <a href="#fleet">3. Fleet</a>
  <a href="#requests">4. Requests &amp; Expenses</a>
  <a href="#profitability">5. Profitability</a>
  <a href="#staff">6. Staff Performance</a>
</nav>

<main>

<div class="banner">
  <h3>Actions/Flags</h3>
  <ul>
${flagItems}
  </ul>
</div>

<!-- ============ SECTION 1 — OPERATIONS ============ -->
<section id="operations">
  <h2><span class="n">1.</span> Operation Reports — Hours Worked &amp; Hectares Cleared</h2>
  <p class="lead">Expected: ${expectedHaPer8} ha per 8 hrs. Cumulative Ha = each dozer's total since ${onDay(d.since)}.</p>

  <div class="tiles">
${opsTiles}
  </div>

  <div class="table-wrap"><table id="tbl-ops">
    <thead>
      <tr>
        <th data-type="text">Dozer</th>
        <th data-type="text">Supervisor</th>
        <th data-type="text">Site — Block</th>
        <th data-type="num">Hrs Worked</th>
        <th data-type="num">Ha Cleared</th>
        <th data-type="num">Expected Ha</th>
        <th data-type="num">% of Expected</th>
        <th data-type="num">Cumulative Ha</th>
      </tr>
    </thead>
    <tbody>
${opRows}
    </tbody>
  </table></div>
</section>

<!-- ============ SECTION 2 — DIESEL ============ -->
<section id="diesel">
  <h2><span class="n">2.</span> Diesel Management</h2>

  <div class="tiles">
${dieselTiles}
  </div>

  <div class="grid-2">
    <div class="chart-card">
      <h4>Distribution per dozer, ${onDay(d.date)}</h4>
      <div id="chart-diesel"></div>
    </div>
    <div class="chart-card">
      <h4>Fueling Request — ${esc(nextDayLong)}</h4>
      <p class="lead" style="margin:0 0 10px;font-size:11.5px">Need = ${DIESEL_FILL_LITRES}L target − closing diesel, for the dozers listed below.</p>
      <div class="kv">
${frLines}
        <dt>Total to balance</dt><dd>${lit(frTotal)} L</dd>
        <dt>Less on ground (Oki)</dt><dd>${lit(fr.onGround || 0)} L</dd>
        <dt>Actually needed</dt><dd><strong>${lit(frActual)} L</strong> (${money(frActual * x.dieselRate)})</dd>
      </div>
    </div>
  </div>

  <div class="table-wrap"><table id="tbl-diesel" style="margin-top:16px">
    <thead>
      <tr>
        <th data-type="text">Dozer</th>
        <th data-type="num">Opening (L)</th>
        <th data-type="num">Distributed (L)</th>
        <th data-type="num">Used (L)</th>
        <th data-type="num">Closing (L)</th>
        <th data-type="num">Efficiency (L/ha)</th>
        <th data-type="text">Status</th>
      </tr>
    </thead>
    <tbody>
${dieselRows}
    </tbody>
  </table></div>

  <h3 class="sub-h">Diesel Balance at Stations</h3>
  <p class="lead" style="margin:0">Midejab — ${money(x.stationBalance)} <span class="src">(as of ${onDay(d.date)})</span></p>
</section>

<!-- ============ SECTION 3 — FLEET ============ -->
<section id="fleet">
  <h2><span class="n">3.</span> Fleet Management — Status, Productivity &amp; Remarks</h2>

  <div class="table-wrap"><table id="tbl-fleet">
    <thead>
      <tr>
        <th data-type="text">Dozer</th>
        <th data-type="text">Ownership</th>
        <th data-type="text">Status (${onDay(d.date)})</th>
        <th data-type="num">Hrs Worked</th>
        <th data-type="num">Optimization</th>
        <th class="nosort">Remarks</th>
      </tr>
    </thead>
    <tbody>
${fleetRows}
    </tbody>
  </table></div>

  <h3 class="sub-h">Vendor Accrual — 2nd &amp; 3rd Party Dozers</h3>
  <div class="table-wrap"><table>
    <thead><tr><th class="nosort">Vendor</th><th class="nosort">Dozer(s)</th><th class="nosort" data-type="num">Accrued, cumulative (₦)</th></tr></thead>
    <tbody>
${vendorRows}
    </tbody>
  </table></div>
</section>

<!-- ============ SECTION 4 — REQUESTS & EXPENSES ============ -->
<section id="requests">
  <h2><span class="n">4.</span> Requests &amp; Expenses</h2>

  <div class="tiles">
${reqTiles}
  </div>

  <div class="grid-2">
    <div class="table-wrap"><table id="tbl-requests">
      <thead>
        <tr>
          <th data-type="text">Description</th>
          <th data-type="text">Category</th>
          <th data-type="num">Amount (₦)</th>
          <th data-type="text">Status</th>
        </tr>
      </thead>
      <tbody>
${reqRows}
      </tbody>
    </table></div>

    <div class="chart-card">
${catBars.length ? `      <h4>Paid today, by category (${money(rq.paidToday)})</h4>\n      <div id="chart-category"></div>` : '      <h4>Paid today, by category</h4>\n      <p class="lead" style="margin:0">No payments made today.</p>'}
    </div>
  </div>
</section>

<!-- ============ SECTION 5 — PROFITABILITY ============ -->
<section id="profitability">
  <h2><span class="n">5.</span> Profitability</h2>
  <p class="lead">${esc(siteShort(proj))}, Phase 1 — ₦845,000/ha. Today vs. cumulative since ${onDay(d.since)}.</p>

  <div class="tiles">
${profTiles}
  </div>

  <div class="table-wrap"><table>
    <thead><tr><th class="nosort">Line</th><th class="nosort" data-type="num">Today (₦)</th><th class="nosort" data-type="num">Cumulative (₦)</th><th class="nosort">Basis</th></tr></thead>
    <tbody>
${lineRows.join('\n')}
    </tbody>
  </table></div>

  <h3 class="sub-h">Contribution by Dozer — Today</h3>
  <div class="table-wrap"><table>
    <thead><tr><th class="nosort">Dozer</th><th class="nosort" data-type="num">Hrs</th><th class="nosort" data-type="num">Ha</th><th class="nosort" data-type="num">Output vs expected</th><th class="nosort" data-type="num">Break-even</th><th class="nosort" data-type="num">Revenue (₦)</th><th class="nosort" data-type="num">Cost (₦)</th><th class="nosort" data-type="num">Net (₦)</th></tr></thead>
    <tbody>
${contribRows.join('\n')}
    </tbody>
  </table></div>
  <p class="lead" style="margin:6px 0 0;font-size:11.5px">Cost = dozer rate + diesel (25L/hr × ₦1,900) + diesel logistics + operator allowance (EMG only). Break-even = output needed to cover cost.</p>

  <h3 class="sub-h">Machine Recovery</h3>
  <div class="table-wrap"><table>
    <thead><tr><th class="nosort">Line</th><th class="nosort" data-type="num">Today (₦)</th><th class="nosort" data-type="num">Cumulative (₦)</th><th class="nosort">Basis</th></tr></thead>
    <tbody>
      <tr><td>M/c Recovered</td><td class="num">${fmt(t.mcRecovered)}</td><td class="num">${fmt(c.mcRecovered)}</td><td>Company dozers, cost avoided vs. renting</td></tr>
      <tr><td>Maintenance Incurred</td><td class="num">${fmt(t.maintenanceIncurred)}</td><td class="num">${fmt(c.maintenanceIncurred)}</td><td>Approved/Paid repairs and maintenance PMS</td></tr>
      <tr ${goodRow}><td>Net M/c Recovered</td><td class="num">${signed(t.netMcRecovered)}</td><td class="num">${signed(c.netMcRecovered)}</td><td></td></tr>
    </tbody>
  </table></div>

  <h3 class="sub-h">Total Profit</h3>
  <div class="table-wrap"><table>
    <thead><tr><th class="nosort">Line</th><th class="nosort" data-type="num">Today (₦)</th><th class="nosort" data-type="num">Cumulative (₦)</th></tr></thead>
    <tbody>
      <tr><td>Operations Profit</td><td class="num">${signed(t.opsProfit)}</td><td class="num">${signed(c.opsProfit)}</td></tr>
      <tr><td>Net M/c Recovered</td><td class="num">${signed(t.netMcRecovered)}</td><td class="num">${signed(c.netMcRecovered)}</td></tr>
      <tr ${t.totalProfit >= 0 ? goodRow : flagRow}><td>Total Profit</td><td class="num">${signed(t.totalProfit)}</td><td class="num">${signed(c.totalProfit)}</td></tr>
    </tbody>
  </table></div>
</section>

<!-- ============ SECTION 6 — STAFF PERFORMANCE ============ -->
<section id="staff">
  <h2><span class="n">6.</span> Staff Performance</h2>
  <p class="lead">Ranked by cumulative productivity since ${onDay(d.since)}. Ideal resumption is ${esc(idealStart)}.</p>

  <div class="table-wrap"><table>
    <thead>
      <tr>
        <th data-type="num">Rank</th>
        <th data-type="text">Name</th>
        <th class="nosort">Resumption (${rangeLabel})</th>
        <th class="nosort">Late vs ${esc(idealStart)}</th>
        <th data-type="num">Hrs Today</th>
        <th class="nosort">Productivity (${rangeLabel})</th>
        <th data-type="num">Cumulative</th>
      </tr>
    </thead>
    <tbody>
${staffRows}
    </tbody>
  </table></div>
</section>

<p style="text-align:center;color:var(--text-muted);font-size:11.5px;margin-top:30px;">Prepared by ERP Software</p>

</main>

<script>
${SCRIPT_HEAD}${dataCalls}${dataCalls ? '\n\n' : ''}${SCRIPT_TAIL}
</script>
</body>
</html>
`;
}

// File name for the downloaded report, e.g. Daily_Dashboard_15Oct2026.html
export function dashboardFileName(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return `Daily_Dashboard_${d}${MONTHS[m - 1].slice(0, 3)}${y}.html`;
}
