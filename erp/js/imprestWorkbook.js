// Workbook parsing and statement calculations for manager imprest imports.
export const IMPREST_COLUMNS = ['Staff Site Logistics', 'Temporary Lodging', 'Staff Welfare', 'Vehicle Maintenance', 'Local Transport', 'Dozer Maintenance', 'Minor Procurement', 'Diesel Transport', 'MSc'];

export function managerIsImprestEligible(employee) {
  return employee && employee.status === 'Active' && !employee.archivedAt && /(?:site|maintenance)\s*manager/i.test(employee.role || '');
}

function amount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value ?? '').replace(/[^\d.\-]/g, '');
  return Number(text) || 0;
}

function dateValue(value) {
  if (typeof value === 'number' && value > 30000 && value < 80000) {
    return new Date(Math.round((value - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const s = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

const normal = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const canon = value => normal(value).replace(/[^a-z0-9]/g, '');
const categoryName = value => IMPREST_COLUMNS.find(name => canon(name) === canon(value)) || String(value ?? '').trim();

export function parseImprestSheet(rows, sheetName) {
  const header = rows.findIndex(row => row.some(cell => canon(cell) === 'debit') && row.some(cell => canon(cell) === 'credit'));
  if (header < 0) return { sheetName, title: String(rows[0]?.[0] || ''), entries: [], categories: [], error: 'No Debit and Credit headings found.' };
  const top = rows[header - 1] || [];
  const sub = rows[header] || [];
  const debitAt = sub.findIndex(cell => canon(cell) === 'debit');
  const creditAt = sub.findIndex(cell => canon(cell) === 'credit');
  const dateAt = top.findIndex(cell => canon(cell) === 'date');
  const purposeAt = top.findIndex(cell => canon(cell) === 'purpose');
  const siteAt = top.findIndex(cell => canon(cell).startsWith('site'));
  const categoryAt = top.findIndex(cell => canon(cell) === 'category');
  const sourceAt = top.findIndex(cell => canon(cell) === 'sourceofcredit');
  const categoryCols = sub.map((cell, col) => ({ col, name: categoryName(cell) }))
    .filter(({ col, name }) => col > creditAt && name && !['debit', 'credit'].includes(normal(name)));
  if (dateAt < 0 || purposeAt < 0 || debitAt < 0 || creditAt < 0) return { sheetName, entries: [], categories: [], error: 'Required Date, Purpose, Debit or Credit column missing.' };
  const categories = [...new Set(categoryCols.map(({ name }) => name))];
  const entries = [];
  for (let i = header + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const debit = amount(row[debitAt]);
    const credit = amount(row[creditAt]);
    if (debit <= 0 && credit <= 0) continue;
    const date = dateValue(row[dateAt]);
    const purpose = String(row[purposeAt] ?? '').trim() || (credit > 0 && debit === 0 ? 'Payment / credit recorded in workbook' : 'Cost recorded in workbook');
    // The first row below the headings is often a category-total summary.
    if (!date) continue;
    const categoryAmounts = {};
    categoryCols.forEach(({ col, name }) => { const value = amount(row[col]); if (value > 0) categoryAmounts[name] = (categoryAmounts[name] || 0) + value; });
    entries.push({ sourceSheet: sheetName, sourceRow: i + 1, date, purpose,
      site: siteAt >= 0 ? String(row[siteAt] ?? '').trim() : '',
      category: categoryAt >= 0 ? String(row[categoryAt] ?? '').trim() : '',
      sourceOfCredit: sourceAt >= 0 ? String(row[sourceAt] ?? '').trim() : '',
      debit, credit, categoryAmounts });
  }
  const totalFor = label => {
    const row = rows.find(item => item.some(cell => canon(cell) === canon(label)));
    return row ? amount(row[2]) : null;
  };
  const reportedInflow = totalFor('Total Inflow');
  const reportedOutflow = totalFor('Total Outflow');
  const calculatedInflow = entries.reduce((sum, item) => sum + item.credit, 0);
  const calculatedOutflow = entries.reduce((sum, item) => sum + item.debit, 0);
  const variance = (reportedInflow === null ? 0 : Math.abs(calculatedInflow - reportedInflow))
    + (reportedOutflow === null ? 0 : Math.abs(calculatedOutflow - reportedOutflow));
  return { sheetName, title: String(rows[1]?.[0] || rows[0]?.[0] || ''), entries, categories,
    reportedInflow, reportedOutflow, calculatedInflow, calculatedOutflow, variance };
}

export function imprestStatement(entries) {
  let running = 0;
  const rows = entries.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id)))
    .map(entry => {
      running += Number(entry.credit || 0) - Number(entry.debit || 0);
      return { ...entry, runningBalance: running, outstanding: Math.max(0, -running) };
    });
  return { rows, debits: rows.reduce((sum, row) => sum + Number(row.debit || 0), 0),
    credits: rows.reduce((sum, row) => sum + Number(row.credit || 0), 0),
    balance: running, outstanding: Math.max(0, -running), held: Math.max(0, running) };
}

