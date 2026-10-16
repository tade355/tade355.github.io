// Rex Forestry payment-request letters: the land-clearing invoice built from work
// orders (Phase 1 / Phase 2 hectares, each rate split into Diesel, Machine,
// Service Charge and VAT on the service charge) and the monthly site-security
// letter. Pure (no store / DOM imports).
//
// How a rate splits (matches the letters sent so far): Diesel 30% and Machine
// 55% of the rate; the remaining 15% is Service Charge plus VAT at 7.5% of the
// Service Charge. The Service Charge rate is rounded DOWN to the kobo and the
// VAT rate is whatever is left, so a rate always adds back to exactly itself
// (845,000 = 253,500 + 464,750 + 117,906.97 + 8,843.03).
export const SPLIT = { diesel: 0.30, machine: 0.55, vat: 0.075 };
export const DEFAULT_RATES = { 'Phase 1': 845000, 'Phase 2': 455000 };
export const BANK = { name: 'Zenith Bank', account: '1310919286', holder: 'Emagrims Company Ltd' };
export const ADDRESSEE = ['The Plantation Manager,', 'Rex Forestry,', 'Onipetesi, Ondo State.'];
export const SIGNATORY = { name: 'Engineer Agrimo Gideon', title: 'Chief Executive Officer' };

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const floor2 = (n) => Math.floor(n * 100 + 1e-7) / 100;

export function splitRate(rate, split = SPLIT) {
  const diesel = r2(rate * split.diesel);
  const machine = r2(rate * split.machine);
  const rest = r2(rate - diesel - machine);
  const serviceCharge = floor2(rest / (1 + split.vat));
  const vat = r2(rest - serviceCharge);
  return { diesel, machine, serviceCharge, vat };
}

// One phase's block of the letter: four lines and a sub-total.
export function phaseBlock(name, rate, ha, split = SPLIT) {
  const per = splitRate(rate, split);
  const lines = [
    { label: 'Diesel', rate: per.diesel },
    { label: 'Machine', rate: per.machine },
    { label: 'Service Charge (SC)', rate: per.serviceCharge },
    { label: `VAT (${(split.vat * 100).toFixed(1).replace(/\.0$/, '')}% of SC)`, rate: per.vat },
  ].map((l) => ({ ...l, ha, total: r2(l.rate * ha) }));
  const subTotal = r2(lines.reduce((s, l) => s + l.total, 0));
  return { name, rate, ha, lines, subTotal };
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`);
const below1000 = (n) => {
  const h = Math.floor(n / 100); const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? `${h ? 'and ' : ''}${below100(rest)}` : ''].filter(Boolean).join(' ');
};
const UNITS = ['', 'Thousand', 'Million', 'Billion'];

// 35,846,850.00 -> "Thirty-Five Million, Eight Hundred and Forty-Six Thousand,
// Eight Hundred and Fifty Naira Only"
export function amountInWords(amount) {
  const kobo = Math.round(amount * 100);
  let naira = Math.floor(kobo / 100); const k = kobo % 100;
  if (naira === 0 && k === 0) return 'Zero Naira Only';
  const parts = [];
  for (let i = 0; naira > 0; i += 1, naira = Math.floor(naira / 1000)) {
    const chunk = naira % 1000;
    if (chunk) parts.unshift(`${below1000(chunk)}${UNITS[i] ? ` ${UNITS[i]}` : ''}`);
  }
  let words = parts.join(', ');
  // "…Million and Fifty" when the last group is below 100 and follows bigger ones
  if (parts.length > 1 && /^[A-Za-z-]+$/.test(parts[parts.length - 1])) words = `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  const koboWords = k ? `, ${below100(k)} Kobo` : '';
  return `${words || ''}${words ? ' Naira' : ''}${koboWords}${words ? '' : ''} Only`.replace(/^ Only$/, 'Zero Naira Only').replace('Naira, ', 'Naira, ');
}

export const naira = (n) => `N${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const num2 = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const suffix = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th';
  return { day: d, suffix, month: MONTHS[m - 1], year: y, text: `${d}${suffix} ${MONTHS[m - 1]} ${y}` };
}

const joinList = (items) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} & ${items[items.length - 1]}`);

// workOrders: [{ wo, project, phase1, phase2, compartments }]
export function buildLandClearingInvoice({ date, workOrders, rates = DEFAULT_RATES, split = SPLIT }) {
  const wos = workOrders.filter((w) => (w.phase1 || 0) > 0 || (w.phase2 || 0) > 0);
  const sum = (key) => r2(wos.reduce((s, w) => s + (Number(w[key]) || 0), 0));
  const phases = [];
  const p1 = sum('phase1'); const p2 = sum('phase2');
  if (p1 > 0) phases.push(phaseBlock('Phase 1', rates['Phase 1'], p1, split));
  if (p2 > 0) phases.push(phaseBlock('Phase 2', rates['Phase 2'], p2, split));
  const total = r2(phases.reduce((s, p) => s + p.subTotal, 0));
  const woNumbers = [...new Set(wos.map((w) => String(w.wo || '').trim()).filter(Boolean))];
  return {
    kind: 'landClearing', date, dateParts: longDate(date), phases, total, totalText: naira(total), totalWords: amountInWords(total),
    woNumbers, woLabel: joinList(woNumbers),
    subject: `PAYMENT FOR LAND CLEARING SERVICES${woNumbers.length ? ` – (WO No: ${joinList(woNumbers)})` : ''}`,
    workOrders: wos,
  };
}

// sites: [{ name, rate, months }]
export function buildSecurityInvoice({ date, monthLabel, sites }) {
  const rows = sites.filter((s) => s.name && s.months > 0).map((s) => ({ ...s, total: r2(s.rate * s.months) }));
  const total = r2(rows.reduce((s, r) => s + r.total, 0));
  const names = rows.map((r) => r.name);
  const rates = [...new Set(rows.map((r) => r.rate))];
  return {
    kind: 'security', date, dateParts: longDate(date), rows, total, totalText: naira(total), totalWords: amountInWords(total), monthLabel, siteNames: names,
    rateText: rates.length === 1 ? naira(rates[0]) : null,
    subject: `PAYMENT FOR LAND CLEARING – SITE SECURITY (${names.map((n) => n.toUpperCase()).join(' & ')} SITES)`,
  };
}

// The ERP invoice records behind a land-clearing letter: one invoice per project,
// with a Phase 1 and a Phase 2 line, like the invoices already in the ERP.
export function landClearingRecords({ date, customerId, workOrders, rates = DEFAULT_RATES }) {
  const byProject = new Map();
  workOrders.forEach((w) => {
    if (!w.project) return;
    const g = byProject.get(w.project) || { project: w.project, wos: [], phase1: 0, phase2: 0 };
    if (w.wo) g.wos.push(String(w.wo).trim());
    g.phase1 += Number(w.phase1) || 0; g.phase2 += Number(w.phase2) || 0;
    byProject.set(w.project, g);
  });
  return [...byProject.values()].map((g) => {
    const label = joinList([...new Set(g.wos)]);
    const items = [];
    if (g.phase1 > 0) items.push({ description: `Land Clearing — Phase 1${label ? ` (WO ${label})` : ''}`, qty: r2(g.phase1), price: rates['Phase 1'], operationType: 'Phase 1' });
    if (g.phase2 > 0) items.push({ description: `Land Clearing — Phase 2${label ? ` (WO ${label})` : ''}`, qty: r2(g.phase2), price: rates['Phase 2'], operationType: 'Phase 2' });
    return { project: g.project, invoice: { customerId, date, project: g.project, status: 'Unpaid', items } };
  }).filter((r) => r.invoice.items.length);
}

export function securityRecords({ date, customerId, monthLabel, sites }) {
  return sites.filter((s) => s.project && s.months > 0).map((s) => ({
    project: s.project,
    invoice: { customerId, date, project: s.project, status: 'Unpaid', items: [{ description: `Site Security - ${s.name} (${monthLabel})`, qty: s.months, price: s.rate }] },
  }));
}
