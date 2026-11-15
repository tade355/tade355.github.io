// Reads an operator's historical allowance worksheet and checks every running
// balance before treating a value in "Payment Made" as an actual payment.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function amount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const clean = String(value ?? '').replace(/[₦,\s]/g, '');
  return clean ? Number(clean) : NaN;
}

function isoDate(value, year) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return new Date(Date.UTC(1899, 11, 30 + value)).toISOString().slice(0, 10);
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{1,2})[\s\-/]+([A-Za-z]+|\d{1,2})(?:[\s,\-/]+(\d{2,4}))?$/);
  if (!m) return null;
  const month = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS[m[2].slice(0, 3).toLowerCase()];
  const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : year;
  const d = Number(m[1]);
  if (!month || month > 12 || d < 1 || d > 31 || !y) return null;
  const date = new Date(Date.UTC(y, month - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === month - 1 && date.getUTCDate() === d
    ? date.toISOString().slice(0, 10) : null;
}

export function parseOperatorAllowanceSheet(rows) {
  const headerIndex = rows.findIndex((r) => /date/i.test(String(r[0])) && /allowance/i.test(String(r[2])) && /payment/i.test(String(r[3])));
  if (headerIndex < 0) throw new Error('This is not an operator allowance reconciliation sheet. Expected Date, Allowance and Payment Made columns.');
  const title = String(rows[0]?.[0] || '').trim();
  const subtitle = String(rows[1]?.[0] || '');
  const year = Number((subtitle.match(/20\d{2}/g) || []).at(-1)) || new Date().getFullYear();
  let opening = NaN;
  let balance = NaN;
  const allowances = [];
  const payments = [];
  let lastDate = '';
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const label = String(row[0] ?? '').trim();
    if (/balance\s*b\/?f/i.test(label)) {
      opening = amount(row[4]);
      if (!Number.isFinite(opening)) throw new Error(`Row ${i + 1}: opening balance is missing.`);
      balance = opening;
      continue;
    }
    if (/cycle summary/i.test(label)) break;
    const date = isoDate(row[0], year);
    if (!date) continue;
    if (!Number.isFinite(balance)) throw new Error('Opening balance must come before dated entries.');
    if (lastDate && date < lastDate) throw new Error(`Row ${i + 1}: dates are out of order.`);
    const earned = amount(row[2]);
    if (!Number.isFinite(earned) || earned < 0) throw new Error(`Row ${i + 1}: invalid allowance.`);
    const next = balance + earned;
    const d = amount(row[3]);
    const e = amount(row[4]);
    let paid = 0;
    if (Number.isFinite(e)) {
      paid = Number.isFinite(d) ? d : 0;
      if (paid < 0 || Math.abs(next - paid - e) > 0.02) throw new Error(`Row ${i + 1}: payment and running balance do not reconcile.`);
      balance = e;
    } else if (Number.isFinite(d)) {
      if (Math.abs(next - d) > 0.02) throw new Error(`Row ${i + 1}: the running balance does not reconcile.`);
      balance = d;
    } else {
      balance = next;
    }
    allowances.push({ date, amount: earned, hours: String(row[1] ?? ''), row: i + 1 });
    if (paid) payments.push({ date, amount: paid, row: i + 1 });
    lastDate = date;
  }
  if (!lastDate) throw new Error('No dated allowance entries found.');
  const allowanceTotal = allowances.reduce((sum, r) => sum + r.amount, 0);
  const paymentTotal = payments.reduce((sum, r) => sum + r.amount, 0);
  const summary = Object.fromEntries(rows.filter((r) => /^(balance b\/?f|new cycle allowances|total before payments|payments made|closing outstanding)/i.test(String(r[0] ?? '').trim()))
    .map((r) => [String(r[0]).trim().toLowerCase(), amount(r[3])]));
  for (const [label, actual] of [['balance b/f', opening], ['new cycle allowances', allowanceTotal], ['total before payments', opening + allowanceTotal], ['payments made', paymentTotal], ['closing outstanding', balance]]) {
    const entry = Object.entries(summary).find(([key]) => key.startsWith(label));
    if (entry && Number.isFinite(entry[1]) && Math.abs(entry[1] - actual) > 0.02) throw new Error(`Worksheet ${label} summary disagrees with its dated rows.`);
  }
  return { title, opening, allowances, allowanceTotal, payments, paymentTotal, closing: balance, lastDate };
}

