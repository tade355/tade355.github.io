// "Ask the ERP", part two: the questions a manager, accountant, supervisor or
// member of staff asks day to day that are not about a single day's profit —
// how things work here (policies and report formats), where to find a screen,
// fund request lookups, who was paid what, spending, invoices, diesel history,
// a machine's repair history, who worked, a daily brief, what needs attention,
// stock, notices and training.
//
// Same rules as askErp.js: pure (no store / DOM imports), answers only from the
// loaded records, never invents a figure, and says plainly when the ERP holds
// nothing on the subject. `ctx.tier` (Admin, Accounts, Supervisor, Staff) limits
// money answers; when it is missing everything is allowed (tests, scripts).
import { buildDailyDashboard, DIESEL_FILL_LITRES } from './dailyDashboardData.js';
import { EXPECTED_HA_PER_8HRS } from './opEconomics.js';
import { IDEAL_START_MINUTES, LATE_MINUTES } from './profitReportData.js';
import { DASHBOARD_BASIS_FROM } from './dashboardBasis.js';
import { CATALOGUE } from './searchCatalogue.js';
import { addDays } from './dateUtils.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (n, dp = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const money = (n) => `${n < 0 ? '−' : ''}₦${fmt(Math.abs(Math.round(n)))}`;
const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) || 0), 0);
const dmy = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTH_NAMES[m - 1].slice(0, 3)} ${y}`; };
const dayNo = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const ago = (date, today) => { const n = dayNo(today) - dayNo(date); return n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; };
const reply = (text, table, notes) => ({ text, table, notes });
const tokens = (t) => t.toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/).map((x) => x.replace(/^'+|'+$/g, '')).filter(Boolean);
const total = (r) => sum(r.items || [], (i) => i.amount);
const STOP = new Set(['the', 'for', 'and', 'with', 'from', 'that', 'this', 'what', 'when', 'which', 'were', 'was', 'are', 'have', 'has', 'did', 'does', 'much', 'many', 'last', 'all', 'any', 'show', 'list', 'give', 'tell', 'about', 'request', 'requests', 'payment', 'payments', 'paid', 'pending', 'approved', 'status', 'amount', 'total', 'how', 'who', 'our', 'your', 'you', 'we', 'me', 'my', 'please', 'of', 'to', 'in', 'on', 'by', 'is', 'it', 'a', 'an', 'been', 'made', 'make', 'since', 'oct', 'october', 'sep', 'september']);

const canSeeMoney = (ctx) => !ctx.tier || ctx.tier === 'Admin' || ctx.tier === 'Accounts';
const noMoney = () => reply('Money figures (payments, spending, invoices, loans) are only shown to Admin and Accounts accounts. Ask the accounts office, or open Fund Requests to see the status of your own request.');

// ------------------------------------------------------- how things work here
const POLICIES = [
  {
    when: (t) => /sunday (bonus|allowance)|supervisor bonus|mechanic bonus/.test(t) && !/request|\bfr-?\d|pending|\bpaid\b|owed|claim/.test(t),
    text: [
      'Sunday bonus policy (supervisors and mechanics): bonuses follow actual productivity, not entitlement.',
      'Supervisors (1 supervisor to 2 dozers): 3 or more dozers working at least 6 hours each = ₦20,000; 2 dozers = ₦10,000; 1 dozer = ₦5,000; under 6 hours or poor reporting = no bonus.',
      'Days worked in the same week: 5 full days = full bonus; 3 to 4 days = 50%; 2 days or fewer = none.',
      'Mechanics: ₦5,000 to ₦10,000 for minor on-site support repairs that keep a machine running on Sunday. No bonus for major repairs such as engine or transmission work.',
      'Only for field staff supporting active, revenue-generating work. Staff resting at home because of downtime have it adjusted. False claims or poor documentation mean disqualification and possible disciplinary action.',
    ].join('\n'),
  },
  {
    when: (t) => /overtime|extra hours?|extra hrs?|beyond 8|after 8 (hours?|hrs?)/.test(t) && /rate|how much|pay|paid|policy|per hour|worth|entitle/.test(t) && !/who|which|how many hours/.test(t),
    text: 'Extra hours: owned-fleet operators are paid ₦10,000 for every hour worked beyond 8 hours in a day. The normal day rate is shared out by hours worked (hours ÷ 8) for the first 8 hours. On a Sunday the day rate is a flat ₦50,000 for everyone, shared the same way, with overtime still paid beyond 8 hours. Diesel after the 8th hour is counted at 20 L an hour instead of 25 L.',
  },
  {
    when: (t) => /(diesel|fuel|ago).*(norm|standard|per hour|an hour|a hour|consum|burn|use[sd]? (a|per|in an)|rule)|litres? (per|an|a) hour|liters? (per|an|a) hour|how much diesel (does|should|must) (a|each|one|the|every)/.test(t) && !/yesterday|today|\bon \d|collected|supplied/.test(t),
    text: `Diesel norms: a dozer is counted at 25 litres for every hour worked, and 20 litres an hour after the 8th hour. Each active dozer should start the next working day with ${DIESEL_FILL_LITRES} litres (8 hours × 25 L plus a 50 L reserve), so tomorrow's need is ${DIESEL_FILL_LITRES} L less the closing diesel in its tank. A keg is 30 litres. Always report opening diesel, diesel supplied and closing diesel in the end-of-day report; the closing figure you report is taken as what is physically in the tank. Diesel moved from one machine to another must be reported as a transfer.`,
  },
  {
    when: (t) => /(end.?of.?day|eod|daily|operations?) report.*(format|template|fields?|include|contain|what|how|submit|send|write|post)|how (do|should|can|must) (i|we) (report|submit|send|write|post|do|make)( (my|the|a|an|our))? .*report|report (format|template)|what (should|must) (i|we) (put|include) in .*report/.test(t),
    text: 'End-of-day report: send one message per dozer with Date, Machine, Status, Operator, Supervisor, Diesel supplied, Opening diesel, Time started, Time stopped, Hours worked, Closing diesel, Hectares achieved, Block, Next day work, Remarks and Cumulative hectares. Use the hours you actually worked and the real start and stop times; if they disagree, the hours reported are used. Reports should arrive the same evening; a missing report shows as a flag on the Daily Operations Dashboard.',
  },
  {
    when: (t) => /(how|what).*(raise|submit|make|write|send|create|log|file|put in).*(request|requisition)|request (format|template)|fund request.*(format|how|steps?)/.test(t),
    text: 'Fund request: send one request per purchase or job with Date, Description, each item with its amount, the Total and the Account details (account name, number and bank) of whoever is to be paid. Do not resend a request that is already pending, and say which earlier request a re-send repeats. In the ERP: Fund Requests & Approvals, then New Request. A request starts Pending, management Approves it, and it is marked Paid once the transfer is made (the date moves to the payment date).',
  },
  {
    when: (t) => /who approves|approval (process|flow|steps?)|how long (does|will|for).*(approv|paid|payment)|what happens (after|when).*(request|approv)|(pending|approved|paid) mean/.test(t),
    text: 'Fund request flow: Pending (submitted, waiting) → Approved (management agreed, not yet paid) → Paid (money sent; the request takes the payment date). Rejected requests cannot be paid. Only management (Admin accounts) approves; the ERP does not set a time limit, so ask management if a request has waited long.',
  },
  {
    when: (t) => /(supply|station|collection).*(message|format|wording|text)|how (do|should) i (order|ask for|request|get) (the )?(diesel|ago|pms|fuel)|message (to|for) (the )?station/.test(t),
    text: 'Station supply message: "No 1. Please supply Christopher with 480 liters Diesel today - 19 Oct 2026. Thank you." Send diesel (AGO) and PMS as separate numbered messages, with the date and "today" or "tomorrow". Only what was collected is recorded; do not post what will be collected later. The station manager\'s daily "Grand Total / Analysis" message is the authority for what was collected.',
  },
  {
    when: (t) => /(expected|target|required|standard).*(output|hectares?|\bha\b)|how many (hectares?|ha) (should|must|is a dozer|per day)|(what time|when).*(should|must|do|is).*(start|resume|resumption)|ideal (start|resum)|late (start|rule|resum)/.test(t) && !/yesterday|today|\bon \d|did |has |have /.test(t),
    text: `Expected output is ${EXPECTED_HA_PER_8HRS} hectares for every 8 hours worked. The ideal start is ${Math.floor(IDEAL_START_MINUTES / 60)}:00 AM; a start ${LATE_MINUTES} minutes or more after that is flagged as late. Productivity is hectares cleared against the hectares expected for the hours worked.`,
  },
  {
    when: (t) => /fueling voucher|fuel voucher|voucher/.test(t) && /how|what|raise|create|make|where/.test(t),
    text: 'Fueling voucher: open Resource Management, Diesel Management, AGO Planner, choose the station, supply date and the dozers working, and use "Raise fueling voucher". It creates a Pending voucher for the diesel (and PMS) and gives the supply message to send to the station.',
  },
  {
    when: (t) => /(transfer|moved?|drill(ed)?|siphon|take|taken).*(diesel).*(between|from|another|other|machine)|diesel (transfer|moved)/.test(t),
    text: 'Diesel moved from one machine\'s tank to another must be reported with the litres, the machine it came from and the machine it went to. It is recorded as litres supplied to the receiving machine and litres taken out of the donor, so the site stock only shows what came from the station.',
  },
  {
    when: (t) => /(policy|rule|entitle|allowed|allowance|advance|loan to staff|annual leave|leave days|sick|resign|disciplin|dress|working hours)/.test(t) && /\b(what|is|are|can|do|does|how|am i|should)\b/.test(t),
    text: null, // handled by the "not written here" answer below
  },
];

function policyAnswer(t) {
  for (const p of POLICIES) {
    if (p.text && p.when(t)) return reply(p.text, null, ['This is the standing company practice written into the ERP. For anything not listed, ask management.']);
  }
  const generic = POLICIES[POLICIES.length - 1];
  if (generic.when(t)) {
    return reply('That is not written down in the ERP, so I cannot give an answer. Policies recorded here: the Sunday bonus policy, extra-hours pay, diesel norms, the end-of-day report and fund request formats, how requests are approved, the station supply message, expected output and the late-start rule. Ask management for anything else, or look in Documents and Notices.');
  }
  return null;
}

// ---------------------------------------------------------- where is / how do I
function navigationAnswer(t) {
  if (!/where (do|can|should|would|will|is|are)|how (do|can|should) i (find|open|get to|access|go to|see|view|check|log|record|add|raise|create|print|download|export|upload|import|enter)|which (page|tab|screen|menu)|take me to|open the|show me where|find the/.test(t)) return null;
  const q = tokens(t).filter((w) => w.length >= 3 && !STOP.has(w) && !['where', 'find', 'open', 'page', 'tab', 'screen', 'menu', 'log', 'see', 'view', 'check', 'record', 'add', 'raise', 'create', 'enter', 'can', 'get'].includes(w));
  if (!q.length) return null;
  const scored = CATALOGUE.map((e) => {
    const hay = `${e.label} ${e.words || ''}`.toLowerCase();
    const s = sum(q, (w) => (e.label.toLowerCase().includes(w) ? 3 : hay.includes(w) ? 1 : 0));
    return { e, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 4);
  if (!scored.length) return null;
  const routeName = (r) => CATALOGUE.find((e) => e.kind === 'Page' && e.route === r)?.label || r;
  const rows = scored.map(({ e }) => [e.kind, routeName(e.route), (e.tabs || []).join(' → ') || '—', e.label]);
  const best = scored[0].e;
  return reply(`Open ${routeName(best.route)}${best.tabs ? `, then the "${best.tabs.join('" → "')}" tab` : ''}${best.kind === 'Feature' ? ` and use "${best.label}"` : ''}. You can also type it into the search bar at the top.`, { head: ['Type', 'Page', 'Tab', 'Name'], rows });
}

// ------------------------------------------------------------ fund requests
function requestAnswer(t, ctx, { today, range, ent }) {
  const idMatch = t.match(/\bfr[-\s]?(\d{1,4})\b/);
  const reqs = ctx.fundRequests || [];
  const personName = (id) => ctx.employees.find((e) => e.id === id)?.name || id || '—';
  if (idMatch) {
    const r = reqs.find((x) => x.id === `FR-${idMatch[1]}`);
    if (!r) return reply(`I cannot find request FR-${idMatch[1]} in the ERP.`);
    const lines = (r.items || []).map((i) => [i.description || '—', money(i.amount || 0)]);
    return reply(`FR-${idMatch[1]}: ${r.description}. ${r.status}, ${money(total(r))}, dated ${dmy(r.date)} (${ago(r.date, today)}), category ${r.costHead || '—'}, submitted by ${personName(r.submittedBy)}.`, lines.length ? { head: ['Item', 'Amount'], rows: lines } : null, ['Bank details are not shown here.']);
  }
  const askReq = /request|requisition|waiting|approval|approve|awaiting|\bfr\b/.test(t);
  if (!askReq) return null;
  if (range.explicit && !/oldest|largest|biggest|highest|longest|waiting|awaiting/.test(t)) return null; // dated questions go to the period report
  const pendingLike = reqs.filter((r) => r.status === 'Pending' || r.status === 'Approved');
  const byAge = (a, b) => (a.date < b.date ? -1 : 1);
  const row = (r) => [r.id, dmy(r.date), `${Math.max(0, dayNo(today) - dayNo(r.date))}d`, r.description.slice(0, 70), r.costHead || '—', money(total(r)), r.status];
  const head = ['Ref', 'Date', 'Age', 'Description', 'Category', 'Amount', 'Status'];
  if (/oldest|longest|been waiting|waited/.test(t)) {
    const list = reqs.filter((r) => r.status === 'Pending').sort(byAge).slice(0, 8);
    if (!list.length) return reply('There are no pending requests.');
    return reply(`The oldest pending request is ${list[0].id} (${list[0].description.slice(0, 80)}), waiting since ${dmy(list[0].date)}, ${ago(list[0].date, today)}, for ${money(total(list[0]))}.`, { head, rows: list.map(row) });
  }
  if (/largest|biggest|highest|most expensive|top \d+/.test(t)) {
    const pool = /\ball\b|paid/.test(t) ? reqs : reqs.filter((r) => r.status === 'Pending');
    const list = [...pool].sort((a, b) => total(b) - total(a)).slice(0, 6);
    return reply(`The biggest ${/\ball\b|paid/.test(t) ? '' : 'pending '}request is ${list[0]?.id} at ${money(list[0] ? total(list[0]) : 0)} (${list[0]?.description.slice(0, 80)}).`, { head, rows: list.map(row) });
  }
  const statusWord = /\bpending\b|waiting|awaiting|unapproved|not (yet )?approved|outstanding/.test(t) ? 'Pending' : /\bapproved\b|not (yet )?paid|unpaid/.test(t) ? 'Approved' : /\bpaid\b/.test(t) ? 'Paid' : /rejected|declined/.test(t) ? 'Rejected' : null;
  // by person
  if (/(by|from|submitted by|raised by|sent by)\b/.test(t) && ent.people.length) {
    const ids = new Set(ent.people.map((p) => p.id));
    const list = reqs.filter((r) => ids.has(r.submittedBy) && (!statusWord || r.status === statusWord)).sort((a, b) => (a.date < b.date ? 1 : -1));
    return reply(`${list.length} request(s) submitted by ${ent.people.map((p) => p.name).join(', ')}${statusWord ? ` (${statusWord.toLowerCase()})` : ''}, worth ${money(sum(list, total))}.`, list.length ? { head, rows: list.slice(0, 12).map(row) } : null);
  }
  // by keyword (machine, item, person named inside the request)
  const subject = [...new Set(ent.dozers.map((d) => d.toLowerCase()))];
  const words = tokens(t).filter((w) => w.length >= 4 && !STOP.has(w) && !['pending', 'approved', 'waiting', 'awaiting', 'outstanding', 'rejected', 'unpaid', 'category', 'machine', 'dozer', 'requests', 'approval', 'approve', 'oldest', 'newest', 'latest', 'recent', 'there', 'there', 'still', 'those', 'these', 'each'].includes(w));
  const named = [...new Set([...subject, ...words.filter((w) => !subject.some((d) => d.replace('-', '') === w.replace('-', '')))])];
  if (named.length && /(for|about|on|regarding|concerning|related to|against)\b/.test(t)) {
    const hits = reqs.filter((r) => {
      const text = `${r.description} ${(r.items || []).map((i) => i.description).join(' ')}`.toLowerCase().replace(/jassie|jessy/g, 'jessie');
      return named.every((w) => text.includes(w.replace(/jassie|jessy/g, 'jessie').replace(/^emg(\d)/, 'emg-$1'))) || named.some((w) => w.length >= 5 && text.includes(w));
    }).filter((r) => !statusWord || r.status === statusWord).sort((a, b) => (a.date < b.date ? 1 : -1));
    if (hits.length) return reply(`${hits.length} request(s) match "${named.join(' ')}"${statusWord ? ` that are ${statusWord.toLowerCase()}` : ''}, worth ${money(sum(hits, total))} in all.`, { head, rows: hits.slice(0, 12).map(row) }, hits.length > 12 ? ['Showing the 12 most recent.'] : null);
  }
  // overall position
  const s = (st) => reqs.filter((r) => r.status === st);
  const lines = ['Pending', 'Approved', 'Paid', 'Rejected'].map((st) => [st, String(s(st).length), money(sum(s(st), total))]);
  if (statusWord && statusWord !== 'Paid') {
    const list = s(statusWord).sort((a, b) => (a.date < b.date ? 1 : -1));
    const cats = {};
    list.forEach((r) => { cats[r.costHead || 'Other'] = (cats[r.costHead || 'Other'] || 0) + total(r); });
    const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, v]) => `${c} ${money(v)}`).join(', ');
    return reply(`${list.length} ${statusWord.toLowerCase()} request(s) worth ${money(sum(list, total))}${topCats ? ` (largest categories: ${topCats})` : ''}. The oldest is ${list.length ? `${[...list].sort(byAge)[0].id} from ${dmy([...list].sort(byAge)[0].date)}` : 'none'}.`, list.length ? { head, rows: list.slice(0, 15).map(row) } : null, list.length > 15 ? ['Showing the 15 most recent.'] : null);
  }
  return reply(`Fund requests in the ERP: ${s('Pending').length} pending (${money(sum(s('Pending'), total))}), ${s('Approved').length} approved but unpaid (${money(sum(s('Approved'), total))}), ${s('Paid').length} paid (${money(sum(s('Paid'), total))}).`, { head: ['Status', 'Requests', 'Amount'], rows: lines }, [`${pendingLike.length} request(s) still need action.`]);
}

// --------------------------------------------------------- who was paid what
function payeeIndex(ctx) {
  const rows = [];
  (ctx.fundRequests || []).filter((r) => r.status === 'Paid').forEach((r) => {
    const names = [...new Set((r.items || []).map((i) => i.accountName).filter(Boolean))];
    rows.push({ date: r.date, amount: total(r), who: names.join(', '), text: `${r.description} ${(r.items || []).map((i) => i.description).join(' ')}`, ref: r.id, kind: 'Fund request' });
  });
  (ctx.expenses || []).forEach((e) => rows.push({ date: e.date, amount: e.amount || 0, who: e.payee || '', text: e.description || '', ref: e.id, kind: 'Expense' }));
  (ctx.fuelCreditPayments || []).forEach((p) => rows.push({ date: p.date, amount: p.amount || 0, who: p.station || 'Midejab Ltd', text: 'Payment to the filling station', ref: p.id, kind: 'Station payment' }));
  return rows;
}

function paymentAnswer(t, ctx, { today, range, ent }) {
  if (!/\b(paid|pay|payment|payments|sent|transfer|transferred)\b/.test(t)) return null;
  if (!/(how much|total|last|latest|when|recent|history|payments? (to|for|made)|did we (pay|send)|have we (paid|sent))/.test(t)) return null;
  if (!canSeeMoney(ctx)) return noMoney();
  // Who is being paid: the words that are not generic, matched against payee names, descriptions and machines.
  const idx = payeeIndex(ctx);
  const words = tokens(t).filter((w) => w.length >= 4 && !STOP.has(w) && !['payment', 'transfer', 'transferred', 'received', 'latest', 'recent', 'history', 'much', 'month', 'week', 'today', 'yesterday', 'total'].includes(w));
  const named = ent.people.flatMap((p) => tokens(p.name).filter((w) => w.length >= 3 && tokens(t).includes(w)));
  const seeds = [...new Set([...words.map((w) => w.replace(/jassie|jessy/, 'jessie')), ...named, ...ent.dozers.map((d) => d.toLowerCase())])];
  if (!seeds.length) return null;
  const hits = idx.filter((r) => {
    const hay = `${r.who} ${r.text}`.toLowerCase().replace(/jassie|jessy/g, 'jessie');
    return seeds.every((w) => hay.includes(w));
  });
  const inRange = range.explicit ? hits.filter((r) => r.date >= range.from && r.date <= range.to) : hits;
  if (!inRange.length) return reply(`I found no payment on record for "${seeds.join(' ')}"${range.explicit ? ` in ${range.label}` : ''}.`, null, ['Searched paid fund requests, expenses and station payments by payee name, description and machine.']);
  const sorted = [...inRange].sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = sorted[0];
  const rows = sorted.slice(0, 10).map((r) => [dmy(r.date), r.kind, r.ref, r.who || '—', r.text.slice(0, 60), money(r.amount)]);
  return reply(`${inRange.length} payment(s) match "${seeds.join(' ')}"${range.explicit ? ` in ${range.label}` : ''}, ${money(sum(inRange, (r) => r.amount))} in all. The latest was ${money(last.amount)} on ${dmy(last.date)} (${ago(last.date, today)}), ${last.ref}.`, { head: ['Date', 'Type', 'Ref', 'Paid to', 'For', 'Amount'], rows }, sorted.length > 10 ? ['Showing the 10 most recent.'] : ['A payment recorded both as a request and as an expense may appear twice.']);
}

// ----------------------------------------------------------------- spending
const SPEND_CATEGORIES = [[/maintenance|repair/, 'Maintenance'], [/logistic|transport/, 'Logistics'], [/\bfuel\b|diesel|\bpms\b/, 'Fuel'], [/salary|allowance|bonus|wage/, 'Salary and Allowance'], [/administration|\badmin\b/, 'Administration'], [/rental|bull ?dozer rent/, 'Bull Dozer Rentals']];

function spendAnswer(t, ctx, { today, range, ent }) {
  if (!/(how much|total|what).*(spen[dt]|spending|expenses?|expenditure|paid out|costs?)|(spent|spending|expenditure|expenses)\b/.test(t)) return null;
  if (/profit|margin|revenue|per hectare|operations cost|diesel cost|to maintain|cost the most|most to/.test(t) || ent.dozers.length) return null;
  if (!canSeeMoney(ctx)) return noMoney();
  const from = range.explicit ? range.from : `${today.slice(0, 8)}01`;
  const to = range.explicit ? range.to : today;
  const label = range.explicit ? range.label : `${MONTH_NAMES[+today.slice(5, 7) - 1]} ${today.slice(0, 4)} so far`;
  const cat = SPEND_CATEGORIES.find(([re]) => re.test(t))?.[1];
  const paid = (ctx.fundRequests || []).filter((r) => r.status === 'Paid' && r.date >= from && r.date <= to && (!cat || (r.costHead || 'Other') === cat));
  const exp = (ctx.expenses || []).filter((e) => e.date >= from && e.date <= to && (!cat || (e.category || 'Other') === cat));
  const station = cat && cat !== 'Fuel' ? [] : (ctx.fuelCreditPayments || []).filter((p) => p.date >= from && p.date <= to);
  const stationTotal = sum(station, (p) => p.amount);
  if (cat) {
    const rows = [...paid.map((r) => [dmy(r.date), r.id, r.description.slice(0, 70), money(total(r))]), ...exp.map((e) => [dmy(e.date), e.id, (e.description || '').slice(0, 70), money(e.amount || 0)])]
      .sort((a, b) => 0).slice(0, 15);
    return reply(`${cat}, ${label}: ${money(sum(paid, total) + sum(exp, (e) => e.amount) + stationTotal)} — ${money(sum(paid, total))} on ${paid.length} paid request(s) and ${money(sum(exp, (e) => e.amount))} on ${exp.length} expense(s)${stationTotal ? `, plus ${money(stationTotal)} paid to the station` : ''}.`, rows.length ? { head: ['Date', 'Ref', 'Description', 'Amount'], rows } : null, ['Paid requests and expenses are both counted; one payment entered in both places would be counted twice.']);
  }
  const cats = {};
  paid.forEach((r) => { const k = r.costHead || 'Other'; cats[k] = (cats[k] || 0) + total(r); });
  exp.forEach((e) => { const k = e.category || 'Other'; cats[k] = (cats[k] || 0) + (e.amount || 0); });
  const totalSpend = sum(Object.values(cats), (v) => v);
  const rows = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, money(v)]);
  if (stationTotal) rows.push(['Station payments (Midejab)', money(stationTotal)]);
  return reply(`${label}: ${money(totalSpend + stationTotal)} paid out — ${money(sum(paid, total))} on paid fund requests, ${money(sum(exp, (e) => e.amount))} on expenses and ${money(stationTotal)} to the station.`, rows.length ? { head: ['Category', 'Amount'], rows } : null, ['Paid requests and expenses are both counted; one payment entered in both places would be counted twice.']);
}

// ----------------------------------------------------------------- invoices
const invoiceTotal = (inv) => sum(inv.items || [], (i) => (i.qty || 0) * (i.price || 0));
function invoiceAnswer(t, ctx, { today }) {
  if (!/invoice|receivable|owe us|owed to us|customers? owe|bill(ed|ing)|outstanding sales|who owes (us|emagrims)|rex owe/.test(t)) return null;
  if (!canSeeMoney(ctx)) return noMoney();
  const invs = ctx.invoices || [];
  if (!invs.length) return reply('There are no invoices in the ERP yet.');
  const paidOn = (id) => sum((ctx.invoicePayments || []).filter((p) => p.invoiceId === id), (p) => p.amount);
  const cust = (c) => ctx.customers?.find((x) => x.id === c)?.name || c || '—';
  const rowOf = (i) => [i.id, dmy(i.date), cust(i.customerId), (i.project || '').replace('REX Forestry Project - ', ''), money(invoiceTotal(i)), money(Math.max(0, invoiceTotal(i) - (i.status === 'Paid' ? invoiceTotal(i) : paidOn(i.id)))), i.status];
  const head = ['Invoice', 'Date', 'Customer', 'Project', 'Total', 'Outstanding', 'Status'];
  const idm = t.match(/inv-?(\d{4})?-?(\d{1,3})\b/);
  if (idm) {
    const want = invs.find((i) => i.id.toLowerCase().endsWith(`-${idm[2]}`));
    if (want) return reply(`${want.id} for ${cust(want.customerId)}: ${money(invoiceTotal(want))}, ${want.status}, dated ${dmy(want.date)}.`, { head: ['Item', 'Qty', 'Price', 'Amount'], rows: (want.items || []).map((i) => [(i.description || '').slice(0, 60), fmt(i.qty, 2), money(i.price), money(i.qty * i.price)]) });
  }
  const outstanding = invs.filter((i) => i.status !== 'Paid');
  const billed = sum(invs, invoiceTotal);
  const owing = sum(outstanding, (i) => Math.max(0, invoiceTotal(i) - paidOn(i.id)));
  if (/unpaid|outstanding|owe|owed|receivable|not paid/.test(t)) {
    return reply(owing > 0 ? `${outstanding.length} invoice(s) are not fully paid; customers owe ${money(owing)}.` : `All ${invs.length} invoices are paid. Customers owe nothing (invoiced ${money(billed)} in all).`, outstanding.length ? { head, rows: outstanding.map(rowOf) } : null);
  }
  return reply(`${invs.length} invoice(s) worth ${money(billed)} in all: ${invs.filter((i) => i.status === 'Paid').length} paid, ${outstanding.length} not fully paid (${money(owing)} outstanding).`, { head, rows: [...invs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12).map(rowOf) }, invs.length > 12 ? ['Showing the 12 most recent.'] : null);
}

// ------------------------------------------------------------- diesel history
function dieselMoreAnswer(t, ctx, { today, range, ent: entIn, project }) {
  // A person asked about stands for the machine they last ran.
  const ent = { ...entIn, dozers: [...new Set([...entIn.dozers, ...entIn.people.map((p) => ctx.operations.filter((o) => o.operatorId === p.id && o.siteName === project).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.equipment).filter(Boolean)])] };
  if (!/diesel|\bago\b|\bpms\b|petrol|litres?|liters?|fuel|stock count|on (the )?ground|left on site/.test(t)) return null;
  const coll = ctx.fuelCreditCollections || [];
  const dist = (ctx.distributions || []).filter((d) => !project || d.project === project);
  const counts = [...(ctx.dieselStockCounts || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  const inR = (d) => d.date >= range.from && d.date <= range.to;
  const label = range.explicit ? range.label : 'since 10 Oct 2026';
  const from = range.explicit ? range.from : DASHBOARD_BASIS_FROM;
  const to = range.explicit ? range.to : today;
  const within = (d) => d.date >= from && d.date <= to;
  const isSold = (c) => /^\s*sold|sold to/i.test(c.notes || '');
  // last stock count
  if (/(last|latest|recent).*(stock )?count|when.*(counted|stock count)|stock count/.test(t)) {
    const c = counts[0];
    if (!c) return reply('No diesel stock count has been recorded in the ERP.');
    return reply(`The last diesel stock count was ${fmt(c.countedLitres)} L on ${dmy(c.date)} (${ago(c.date, today)}). ${c.notes || ''}`.trim(), { head: ['Date', 'Litres counted', 'Note'], rows: counts.slice(0, 6).map((x) => [dmy(x.date), fmt(x.countedLitres), (x.notes || '').slice(0, 90)]) });
  }
  // diesel on site now
  if (/on (the )?ground|left on site|on site|in stock|balance (of|on)|how much diesel (do we have|is (there|left)|remain)/.test(t) && !/midejab|owe|credit/.test(t)) {
    const date = today;
    const dash = buildDailyDashboard({ ...ctx, project, date, since: DASHBOARD_BASIS_FROM });
    const x = dash.diesel;
    if (x.onGround === null) return reply('No diesel stock count has been recorded, so I cannot work out what is on site.');
    return reply(`Diesel on site is about ${fmt(x.onGround)} L: the stock count of ${dmy(x.onGroundDate)} (${fmt(x.onGroundBase)} L) plus ${fmt(x.onGroundIn)} L supplied since, less ${fmt(x.onGroundOut)} L given to dozers since. It is a calculation, not a count; ask the site manager to count if it matters.`);
  }
  // collected / sold / supplied totals by fuel type
  if (/collect|picked|lift|sold|supplied from|bought|received|buy|purchase/.test(t) && !/oil/.test(t) && !(ent.dozers.length && !/station|collect|midejab|sold/.test(t))) {
    const pms = /\bpms\b|petrol/.test(t);
    const list = coll.filter((c) => within(c) && (pms ? c.fuelType === 'PMS' : c.fuelType === 'Diesel'));
    if (!list.length) return reply(`No ${pms ? 'PMS' : 'diesel'} collections recorded ${label}.`);
    const sold = list.filter(isSold);
    const lines = [`${label}: ${fmt(sum(list, (c) => c.litres))} L of ${pms ? 'PMS' : 'diesel'} collected from the station (${money(sum(list, (c) => c.litres * c.unitPrice))})`];
    if (!pms) lines.push(`${fmt(sum(sold, (c) => c.litres))} L of it sold to the CEO and ${fmt(sum(list, (c) => c.litres) - sum(sold, (c) => c.litres))} L for the farm`);
    const byDay = {};
    list.forEach((c) => { byDay[c.date] = (byDay[c.date] || 0) + c.litres; });
    return reply(`${lines.join(', ')}.`, { head: ['Date', 'Litres'], rows: Object.entries(byDay).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 12).map(([d, l]) => [dmy(d), fmt(l)]) });
  }
  // supplied to each dozer
  if (/supplied|given|distribut|received|got|issued/.test(t) && (ent.dozers.length || /each|per|every|dozer|machine/.test(t))) {
    const list = dist.filter(within).filter((d) => !ent.dozers.length || ent.dozers.includes(d.equipment));
    if (!list.length) return reply(`No diesel was distributed to ${ent.dozers.join(', ') || 'dozers'} ${label}.`);
    const by = {};
    list.forEach((d) => { by[d.equipment] = (by[d.equipment] || 0) + d.litres; });
    return reply(`${label}: ${fmt(sum(list, (d) => d.litres))} L of diesel given to ${Object.keys(by).length} machine(s).`, { head: ['Machine', 'Litres supplied'], rows: Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, fmt(v)]) }, ['Negative figures are diesel taken out of that machine and moved to another.']);
  }
  return null;
}

// ----------------------------------------------------------- machine history
function machineAnswer(t, ctx, { today, ent, project }) {
  const logs = ctx.maintenanceLogs || [];
  const heavy = ctx.inventory.filter((i) => i.category === 'Heavy Equipment');
  if (!/(maintenance|maintain|repair|repairs|servic|breakdown|spares?|fixed|fix)/.test(t)) return null;
  if (/profit|margin|recovered/.test(t)) return null;
  const costOf = (m) => m.cost || 0;
  const row = (m) => [dmy(m.date), m.equipment, m.type, (m.description || '').slice(0, 70), m.cost ? money(m.cost) : '—', m.status];
  const head = ['Date', 'Machine', 'Type', 'Description', 'Cost', 'Status'];
  if (ent.dozers.length) {
    const list = logs.filter((m) => ent.dozers.includes(m.equipment)).sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!list.length) return reply(`No maintenance or repair records for ${ent.dozers.join(', ')}.`);
    const open = list.filter((m) => m.status !== 'Completed');
    const lastBreak = list.find((m) => m.type === 'Breakdown');
    const days = dayNo(today) - dayNo(list[0].date);
    return reply(`${ent.dozers.join(', ')}: ${list.length} maintenance record(s) costing ${money(sum(list, costOf))} in all; ${open.length} still open. The most recent was ${dmy(list[0].date)} (${days === 0 ? 'today' : `${days} days ago`}): ${list[0].description.slice(0, 90)}.${lastBreak ? ` Last breakdown logged ${dmy(lastBreak.date)}.` : ''}`, { head, rows: list.slice(0, 10).map(row) }, list.length > 10 ? ['Showing the 10 most recent.'] : null);
  }
  if (/most|highest|which (machine|dozer)|rank|worst|cost the most/.test(t) && /cost|spent|expens|repair|maint/.test(t)) {
    const by = {};
    logs.forEach((m) => { by[m.equipment] = (by[m.equipment] || 0) + costOf(m); });
    const rows = Object.entries(by).filter(([k]) => heavy.some((h) => h.name === k)).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return reply('No maintenance costs are recorded against any dozer.');
    return reply(`${rows[0][0]} has cost the most to maintain: ${money(rows[0][1])} across ${logs.filter((m) => m.equipment === rows[0][0]).length} record(s).`, { head: ['Machine', 'Maintenance cost logged'], rows: rows.map(([k, v]) => [k, money(v)]) }, ['From the Maintenance Log; approved requests that were not logged there are not included.']);
  }
  if (/open|outstanding|in progress|ongoing|current|pending|unfinished|not (yet )?(done|fixed|completed)/.test(t)) {
    const open = logs.filter((m) => m.status !== 'Completed').sort((a, b) => (a.date < b.date ? 1 : -1));
    return reply(`${open.length} maintenance record(s) are still open.`, open.length ? { head, rows: open.slice(0, 15).map(row) } : null);
  }
  if (/total|how much|cost|spent|spend/.test(t)) {
    const list = logs.filter((m) => !/range/.test(t));
    return reply(`Maintenance logged in the ERP: ${money(sum(list, costOf))} across ${list.length} record(s), ${list.filter((m) => m.status !== 'Completed').length} still open.`, null, ['Per period, ask "maintenance cost this month" for the dashboard figure that includes approved requests.']);
  }
  const recent = [...logs].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  return recent.length ? reply('The latest maintenance records:', { head, rows: recent.map(row) }) : null;
}

// ----------------------------------------------- what a person or dozer did
function activityAnswer(t, ctx, { today, range, project, ent }) {
  if (!ent.people.length && !ent.dozers.length) return null;
  const days = /how many days|number of days|days did/.test(t);
  const what = /what (did|has|was|were)\b.*\b(do|done|work|working|on)\b|did\b.*\bwork\b|was\b.*\bworking|worked (on|yesterday|today)|activity|attendance/.test(t);
  if (!days && !what) return null;
  if (/hectare|\bha\b|hours?|profit|cost|diesel|paid|pay|request/.test(t) && !days) return null; // the period report covers these
  const ids = new Set(ent.people.map((p) => p.id));
  const from = range.explicit ? range.from : DASHBOARD_BASIS_FROM;
  const to = range.explicit ? range.to : today;
  const list = ctx.operations.filter((o) => o.siteName === project && o.date >= from && o.date <= to && (o.hoursWorked || 0) > 0 && (ids.has(o.operatorId) || ent.dozers.includes(o.equipment))).sort((a, b) => (a.date < b.date ? 1 : -1));
  const who = [...ent.people.map((p) => p.name), ...ent.dozers].join(' and ');
  const label = range.explicit ? range.label : 'since 10 Oct 2026';
  if (!list.length) return reply(`No work by ${who} is on record ${label}.`);
  const nameOf = (id) => ctx.employees.find((e) => e.id === id)?.name || '—';
  const distinct = new Set(list.map((o) => o.date)).size;
  return reply(`${who}, ${label}: worked ${distinct} day(s), ${fmt(sum(list, (o) => o.hoursWorked), 1)} hours and ${fmt(sum(list, (o) => o.quantity), 1)} ha. The latest day was ${dmy(list[0].date)} (${ago(list[0].date, today)}).`, { head: ['Date', 'Machine', 'Operator', 'Hours', 'Ha', 'Block / remarks'], rows: list.slice(0, 12).map((o) => [dmy(o.date), o.equipment, nameOf(o.operatorId), fmt(o.hoursWorked, 1), fmt(o.quantity, 1), (o.block || o.remarks || '—').toString().slice(0, 50)]) }, list.length > 12 ? ['Showing the 12 most recent.'] : null);
}

// ------------------------------------------------------- who worked / didn't
function workedAnswer(t, ctx, { today, range, project }) {
  if (!/(who|which (dozers?|machines?|operators?|supervisors?)|how many (dozers?|machines?|operators?))/.test(t)) return null;
  if (!/(worked|reported|working|did not|didn't|didnt|no report|absent|not (work|report)|supervis|on site|came|resumed|off)/.test(t)) return null;
  if (/late|start|best|worst|perform|profit|hectare|diesel/.test(t) && !/not|didn't|didnt|no report/.test(t)) return null;
  const ops = ctx.operations.filter((o) => o.siteName === project);
  const last = [...new Set(ops.map((o) => o.date))].sort().pop();
  const date = range.explicit ? range.from : (last || today);
  const day = ops.filter((o) => o.date === date && (o.hoursWorked || 0) > 0);
  const nameOf = (id) => ctx.employees.find((e) => e.id === id)?.name || '—';
  const heavy = ctx.inventory.filter((i) => i.category === 'Heavy Equipment' && (i.currentProject === project || ops.some((o) => o.equipment === i.name)));
  const worked = new Set(day.map((o) => o.equipment));
  const idle = heavy.filter((i) => !worked.has(i.name));
  const notes = range.explicit ? [] : [`No date given, so I used the latest report day, ${dmy(date)}.`];
  if (/did not|didn't|didnt|no report|not (work|report)|absent|idle|off/.test(t)) {
    const active = idle.filter((i) => (i.fleetStatus || 'Active') === 'Active');
    const down = idle.filter((i) => (i.fleetStatus || 'Active') !== 'Active');
    return reply(`${dmy(date)}: ${active.length} active machine(s) did not report${active.length ? ` (${active.map((i) => i.name).join(', ')})` : ''}; ${down.length} more are down or under maintenance${down.length ? ` (${down.map((i) => i.name).join(', ')})` : ''}.`, null, notes);
  }
  if (/supervis/.test(t)) {
    const sup = [...new Set(day.map((o) => nameOf(o.supervisorId)))];
    return reply(`${dmy(date)}: supervised by ${sup.join(', ') || 'nobody on record'}.`, null, notes);
  }
  if (!day.length) return reply(`No operations reports for ${dmy(date)}.`, null, notes);
  return reply(`${dmy(date)}: ${worked.size} machine(s) worked, ${fmt(sum(day, (o) => o.hoursWorked), 1)} hours and ${fmt(sum(day, (o) => o.quantity), 1)} ha in all.`, { head: ['Machine', 'Operator', 'Supervisor', 'Hours', 'Ha', 'Started'], rows: day.map((o) => [o.equipment, nameOf(o.operatorId), nameOf(o.supervisorId), fmt(o.hoursWorked, 1), fmt(o.quantity, 1), o.timeResumed || '—']) }, notes);
}

// --------------------------------------------- daily brief and what needs me
function briefAnswer(t, ctx, { today, range, project }) {
  const brief = /summar(y|ise|ize)|brief|recap|what happened|how (did|was|were) (we|yesterday|today)|overview|catch me up|status report|daily report|how are we doing|how is (the )?(site|work|kangidi|rex)|report for/.test(t);
  const attention = /(what|anything).*(need|require|want).*(attention|action|decision|approval|doing)|any (issues|problems|alerts|flags|concerns|risks)|what should i (know|do|focus|check|look)|urgent|red flags?|what is (wrong|pending)|what('?s| is) (outstanding|waiting)|to.?do/.test(t);
  if (!brief && !attention) return null;
  if (/profit|margin|revenue|hectare|\bha\b/.test(t) && !/summar|brief|recap|overview|attention/.test(t)) return null;
  const ops = ctx.operations.filter((o) => o.siteName === project);
  const last = [...new Set(ops.map((o) => o.date))].sort().pop() || today;
  const date = range.explicit ? range.from : last;
  const dash = buildDailyDashboard({ ...ctx, project, date, since: DASHBOARD_BASIS_FROM > date ? date : DASHBOARD_BASIS_FROM });
  const reqs = ctx.fundRequests || [];
  const pending = reqs.filter((r) => r.status === 'Pending');
  const vouchers = (ctx.fuelingVouchers || []).filter((v) => /pending/i.test(v.status || ''));
  const down = ctx.inventory.filter((i) => i.category === 'Heavy Equipment' && ['Down', 'Under Maintenance'].includes(i.fleetStatus));
  const s = ctx.statsFor ? ctx.statsFor(date, date) : null;
  const items = [];
  dash.flags.forEach((f) => items.push(`${f.text}${f.action ? ` Action: ${f.action}` : ''}`));
  if (pending.length) items.push(`${pending.length} fund request(s) are pending, worth ${money(sum(pending, total))}; the oldest is from ${dmy([...pending].sort((a, b) => (a.date < b.date ? -1 : 1))[0].date)}.`);
  if (vouchers.length) items.push(`${vouchers.length} fueling voucher(s) are waiting for approval.`);
  if (down.length && !dash.flags.some((f) => /Not available/.test(f.text))) items.push(`${down.length} dozer(s) are down or under maintenance (${down.map((i) => i.name).join(', ')}).`);
  if (attention && !brief) {
    return reply(items.length ? `For ${dmy(date)}, these need attention:\n• ${items.join('\n• ')}` : `Nothing needs attention for ${dmy(date)}: no flags, no pending requests and no vouchers waiting.`, null, range.explicit ? [] : [`Based on the latest report day, ${dmy(date)}.`]);
  }
  const d = dash.diesel; const o = dash.operations;
  const lines = [
    `${dmy(date)}: ${o.reporting} machine(s) reported, ${fmt(o.todayHa, 1)} ha cleared in ${fmt(o.todayHours, 1)} hours.`,
    `Diesel: ${fmt(d.collectedAgo)} L collected${d.soldAgo ? ` (${fmt(d.soldAgo)} L of it sold to the CEO)` : ''}, ${fmt(d.distributedToday)} L given to dozers, ${fmt(d.usedToday)} L used${d.onGround !== null ? `, about ${fmt(d.onGround)} L on site` : ''}.`,
    s && canSeeMoney(ctx) ? `Money: revenue ${money(s.provisionalRevenue)}, cost ${money(s.totalCost)}, operations profit ${money(s.opsProfit)}.` : null,
    canSeeMoney(ctx) ? `Requests: ${money(dash.requests.requestedToday)} requested and ${money(dash.requests.paidToday)} paid that day; ${pending.length} pending in all (${money(sum(pending, total))}).` : null,
    items.length ? `Needs attention:\n• ${items.join('\n• ')}` : 'Nothing is flagged.',
  ].filter(Boolean);
  return reply(lines.join('\n'), null, range.explicit ? [] : [`Based on the latest report day, ${dmy(date)}.`]);
}

// ----------------------------------------------- stock, notices, training, leave
function stockAnswer(t, ctx) {
  if (!/(out of stock|low stock|stock level|inventory|spares?|consumables?|parts? (in|on) stock|how many .* (in stock|do we have))/.test(t)) return null;
  const items = (ctx.inventory || []).filter((i) => i.category !== 'Heavy Equipment' && i.category !== 'Vehicles');
  if (!items.length) return reply('There are no stock items (parts, consumables or lubricants) recorded in the ERP yet. Only dozers and vehicles are listed in Inventory & Equipment.');
  const low = items.filter((i) => (i.quantity || 0) <= (i.reorderLevel || 0));
  return reply(`${items.length} stock item(s) recorded; ${low.length} at or below their reorder level.`, { head: ['Item', 'Category', 'Quantity', 'Reorder level'], rows: (/low|out|reorder/.test(t) ? low : items).slice(0, 20).map((i) => [i.name, i.category || '—', fmt(i.quantity || 0), i.reorderLevel != null ? fmt(i.reorderLevel) : '—']) });
}

function noticeAnswer(t, ctx) {
  if (!/notice|memo|announcement|circular|minutes?( of meeting)?|meeting/.test(t)) return null;
  const posts = [...(ctx.noticeBoardPosts || [])].sort((a, b) => ((a.createdAt || a.date || '') < (b.createdAt || b.date || '') ? 1 : -1));
  if (!posts.length) return reply('There are no notices or documents posted in the ERP.');
  return reply(`${posts.length} notice(s) and document(s) are posted; the latest is "${posts[0].title}"${posts[0].category ? ` (${posts[0].category})` : ''}.`, { head: ['Title', 'Category', 'Posted'], rows: posts.slice(0, 8).map((p) => [p.title, p.category || '—', (p.createdAt || p.date || '').slice(0, 10) ? dmy((p.createdAt || p.date).slice(0, 10)) : '—']) }, ['Open Documents and Notices to read them.']);
}

function trainingAnswer(t, ctx) {
  if (!/training|course|programme|program(?!s? of)|syllabus|trainee/.test(t) || /who is|who are/.test(t)) return null;
  const progs = ctx.trainingPrograms || [];
  if (!progs.length) return reply('There are no training programmes in the ERP yet.');
  return reply(`${progs.length} training programme(s): ${progs.map((p) => p.name).join('; ')}.`, { head: ['Programme', 'About'], rows: progs.map((p) => [p.name, (p.description || '—').slice(0, 100)]) }, ['Open Training to see the manuals, syllabus and your submissions.']);
}

function leaveAnswer(t, ctx, { today }) {
  if (!/(on leave|annual leave|leave (request|balance|days|status)|who is (off|away|absent)|time off|leave today)/.test(t)) return null;
  const reqs = ctx.leaveRequests || [];
  if (!reqs.length) return reply('No leave requests are recorded in the ERP, so nobody is shown on leave.');
  const now = reqs.filter((r) => r.status === 'Approved' && r.startDate <= today && r.endDate >= today);
  const name = (id) => ctx.employees.find((e) => e.id === id)?.name || id;
  return reply(now.length ? `${now.length} staff are on approved leave today: ${now.map((r) => name(r.employeeId)).join(', ')}.` : `Nobody is on approved leave today. ${reqs.filter((r) => r.status === 'Pending').length} request(s) are waiting for a decision.`, null);
}

// ---------------------------------------------------------- projects and rates
function projectAnswer(t, ctx, { project }) {
  if (/(rate|price|revenue|paid|pay).*(per )?(hectare|\bha\b)|per hectare|contract rate|rate per ha/.test(t) && !/dozer|machine|operator/.test(t)) {
    const types = [...new Set(ctx.operations.filter((o) => o.siteName === project).map((o) => o.operationType).filter(Boolean))];
    const date = ctx.operations.map((o) => o.date).sort().pop();
    const rows = types.map((ty) => [ty, money(ctx.projectRateAsOf(project, ty, date).rate || 0)]).filter((r) => r[1] !== '₦0');
    if (!rows.length) return null;
    return reply(`${project} pays ${rows.map((r) => `${r[1]} per hectare for ${r[0]}`).join(', ')}.`, { head: ['Operation', 'Rate per ha'], rows });
  }
  if (/(total|cumulative|altogether|so far|to date|in all|overall|since (the )?(start|begin)).*(hectare|\bha\b|cleared)|(hectare|\bha\b).*(so far|to date|in total|altogether|overall)/.test(t) && !/dozer|operator|tope|joshua|jessie|collins|ephraim/.test(t)) {
    const ops = ctx.operations.filter((o) => o.siteName === project && (o.operationType || '').startsWith('Phase'));
    const byMonth = {};
    ops.forEach((o) => { const k = o.date.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + (o.quantity || 0); });
    const rows = Object.entries(byMonth).sort().map(([k, v]) => [`${MONTH_NAMES[+k.slice(5) - 1]} ${k.slice(0, 4)}`, fmt(v, 1)]);
    return reply(`${project}: ${fmt(sum(ops, (o) => o.quantity), 1)} ha cleared in all, over ${new Set(ops.map((o) => o.date)).size} reporting day(s), since ${dmy([...ops].map((o) => o.date).sort()[0])}.`, { head: ['Month', 'Hectares'], rows });
  }
  return null;
}

// ---------------------------------------------------------------- the router
export function answerMore(question, ctx, opts) {
  const q = (question || '').trim();
  const t = ` ${q.toLowerCase().replace(/god'?s\s*time/g, 'godstime').replace(/\bjassie\b|\bjessy\b/g, 'jessie')} `;
  const run = [
    () => policyAnswer(t),
    () => navigationAnswer(t),
    () => requestAnswer(t, ctx, opts),
    () => paymentAnswer(t, ctx, opts),
    () => spendAnswer(t, ctx, opts),
    () => invoiceAnswer(t, ctx, opts),
    () => dieselMoreAnswer(t, ctx, opts),
    () => machineAnswer(t, ctx, opts),
    () => activityAnswer(t, ctx, opts),
    () => workedAnswer(t, ctx, opts),
    () => briefAnswer(t, ctx, opts),
    () => stockAnswer(t, ctx),
    () => noticeAnswer(t, ctx),
    () => trainingAnswer(t, ctx),
    () => leaveAnswer(t, ctx, opts),
    () => projectAnswer(t, ctx, opts),
  ];
  for (const f of run) {
    const r = f();
    if (r) return r;
  }
  return null;
}

export const MORE_EXAMPLES = [
  'What is the Sunday bonus policy?',
  'How much is an extra hour worth?',
  'How do I submit an end-of-day report?',
  'Where do I raise a fueling voucher?',
  'What requests are pending?',
  'What is the status of FR-107?',
  'When did we last pay Abdulsalam?',
  'How much did we spend this month?',
  'Which invoices are unpaid?',
  'How much diesel is on site?',
  'How much has EMG-004 cost to maintain?',
  'Which dozers did not work yesterday?',
  'Give me a summary of yesterday',
  'What needs my attention?',
];
