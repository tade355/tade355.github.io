import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { el, formatCurrency, formatDate } from '../utils.js';
import { ALLOWANCE_EQUIPMENT, operatorAllowanceForRows, isOwnedOperatorAllowancePaymentFor } from '../ownedOperatorAllowance.js';

const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const clean = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function operatorIds() {
  const fromRuns = store.get('dozerPayrollRuns').flatMap((run) => (run.lines || []).map((line) => line.employeeId));
  const fromWork = store.get('operations').filter((row) => ALLOWANCE_EQUIPMENT.has(row.equipment) && row.operatorId).map((row) => row.operatorId);
  return [...new Set([...fromRuns, ...fromWork])].filter(Boolean)
    .sort((a, b) => operatorName(a).localeCompare(operatorName(b)));
}

function operatorName(id) {
  return store.get('employees').find((person) => person.id === id)?.name || id;
}

export function buildOperatorAllowanceStatement(employeeId, from, to) {
  if (!employeeId || !from || !to || from > to) throw new Error('Choose an operator and a valid date range.');
  const events = [];
  let coveredThrough = '';
  store.get('dozerPayrollRuns').filter((run) => run.status !== 'Draft').forEach((run) => {
    (run.lines || []).filter((line) => line.employeeId === employeeId).forEach((line) => {
      if (run.periodEnd > coveredThrough) coveredThrough = run.periodEnd;
      const dayPay = Number(line.daysWorked || 0) * Number(line.dayRate || 0);
      const overtimePay = Number(line.overtimeHours || 0) * Number(line.overtimeRate || 0);
      const businessPay = Number(line.businessEarnings || 0);
      const deduction = Number(line.deductions || 0);
      const paid = Number(line.amountPaid || 0);
      const reconciliation = String(line.equipment || '').startsWith('Imported allowance reconciliation');
      events.push({
        date: run.periodEnd,
        hours: run.periodStart === run.periodEnd && !reconciliation
          ? Number(line.daysWorked || 0) * 8 + Number(line.overtimeHours || 0) : 0,
        earned: reconciliation ? 0 : dayPay + overtimePay + businessPay,
        paid,
        adjustment: reconciliation ? dayPay + overtimePay + businessPay - deduction : -deduction,
        note: reconciliation ? 'Statement balance reconciliation' : (run.periodStart === run.periodEnd ? 'Approved allowance' : 'Approved allowance run through this date'),
      });
    });
  });
  store.get('expenses').filter((expense) =>
    isOwnedOperatorAllowancePaymentFor(employeeId, expense.payee, expense.category)
  ).forEach((expense) => events.push({
    date: expense.date, hours: 0, earned: 0, paid: Number(expense.amount || 0),
    adjustment: 0, note: expense.description || 'Accounts allowance payment',
  }));
  const uncovered = store.get('operations').filter((row) =>
    row.operatorId === employeeId && ALLOWANCE_EQUIPMENT.has(row.equipment)
    && (!coveredThrough || row.date > coveredThrough)
  );
  const workByDate = new Map();
  uncovered.forEach((row) => {
    if (!workByDate.has(row.date)) workByDate.set(row.date, []);
    workByDate.get(row.date).push(row);
  });
  workByDate.forEach((work, date) => events.push({
    date, hours: work.reduce((sum, row) => sum + Number(row.hoursWorked || 0), 0),
    earned: operatorAllowanceForRows(work), paid: 0, adjustment: 0,
    note: 'Daily work after last approved allowance run',
  }));

  const opening = roundMoney(events.filter((event) => event.date < from)
    .reduce((sum, event) => sum + event.earned - event.paid + event.adjustment, 0));
  const grouped = new Map();
  events.filter((event) => event.date >= from && event.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date)).forEach((event) => {
      if (!grouped.has(event.date)) grouped.set(event.date, {
        date: event.date, hours: 0, earned: 0, paid: 0, adjustment: 0, notes: [],
      });
      const row = grouped.get(event.date);
      row.hours += event.hours;
      row.earned += event.earned;
      row.paid += event.paid;
      row.adjustment += event.adjustment;
      if (!row.notes.includes(event.note)) row.notes.push(event.note);
    });
  let balance = opening;
  const rows = [...grouped.values()].map((row) => {
    balance = roundMoney(balance + row.earned - row.paid + row.adjustment);
    return { ...row, earned: roundMoney(row.earned), paid: roundMoney(row.paid),
      adjustment: roundMoney(row.adjustment), balance };
  });
  return {
    employeeId, name: operatorName(employeeId), from, to, opening, rows,
    earned: roundMoney(rows.reduce((sum, row) => sum + row.earned, 0)),
    paid: roundMoney(rows.reduce((sum, row) => sum + row.paid, 0)),
    adjustments: roundMoney(rows.reduce((sum, row) => sum + row.adjustment, 0)),
    closing: balance,
  };
}

function appendCell(row, value, tag) {
  row.appendChild(el(tag || 'td', {}, value));
}

function previewStatement(container, statement) {
  container.innerHTML = '';
  container.appendChild(el('h4', {}, statement.name + ' — ' + formatDate(statement.from) + ' to ' + formatDate(statement.to)));
  container.appendChild(el('p', { class: 'section-subtitle' },
    'Opening ' + formatCurrency(statement.opening) + ' + earned ' + formatCurrency(statement.earned)
    + ' + adjustments ' + formatCurrency(statement.adjustments) + ' − paid ' + formatCurrency(statement.paid)
    + ' = closing ' + formatCurrency(statement.closing)));
  const table = el('table', { class: 'data-table' });
  const head = el('thead');
  const header = el('tr');
  ['Date', 'Hours', 'Allowance earned', 'Payment made', 'Adjustment', 'Running balance', 'Details']
    .forEach((label) => appendCell(header, label, 'th'));
  head.appendChild(header);
  table.appendChild(head);
  const body = el('tbody');
  const openingRow = el('tr');
  appendCell(openingRow, 'Balance B/F');
  appendCell(openingRow, '—');
  appendCell(openingRow, '—');
  appendCell(openingRow, '—');
  appendCell(openingRow, '—');
  appendCell(openingRow, formatCurrency(statement.opening));
  appendCell(openingRow, 'Before selected period');
  body.appendChild(openingRow);
  statement.rows.forEach((item) => {
    const row = el('tr');
    [formatDate(item.date), item.hours ? String(Math.round(item.hours * 100) / 100) : '—',
      item.earned ? formatCurrency(item.earned) : '—',
      item.paid ? formatCurrency(item.paid) : '—',
      item.adjustment ? formatCurrency(item.adjustment) : '—',
      formatCurrency(item.balance), item.notes.join('; ')].forEach((value) => appendCell(row, value));
    body.appendChild(row);
  });
  table.appendChild(body);
  container.appendChild(el('div', { class: 'table-wrap' }, table));
}

function statementHtml(statement) {
  const body = statement.rows.map((row) => '<tr><td>' + clean(formatDate(row.date)) + '</td><td>'
    + (row.hours ? clean(String(Math.round(row.hours * 100) / 100)) : '—') + '</td><td>'
    + (row.earned ? clean(formatCurrency(row.earned)) : '—') + '</td><td>'
    + (row.paid ? clean(formatCurrency(row.paid)) : '—') + '</td><td>'
    + (row.adjustment ? clean(formatCurrency(row.adjustment)) : '—') + '</td><td>'
    + clean(formatCurrency(row.balance)) + '</td></tr>').join('');
  return '<section style="break-after:page"><div class="print-header"><img src="assets/logo.png" alt="Emagrims Ltd" class="print-logo">'
    + '<div class="print-company"><h1>Emagrims Ltd</h1><p>Your Dependable Agricultural Partner</p></div>'
    + '<div class="print-doc-meta"><div class="print-doc-title">OPERATOR ALLOWANCE STATEMENT</div></div></div>'
    + '<div class="print-meta-grid"><div><strong>Operator:</strong> ' + clean(statement.name)
    + '</div><div><strong>Period:</strong> ' + clean(formatDate(statement.from)) + ' – ' + clean(formatDate(statement.to))
    + '</div><div><strong>Printed:</strong> ' + clean(formatDate(todayISOString())) + '</div></div>'
    + '<table class="print-table"><thead><tr><th>Date</th><th>Hours</th><th>Allowance earned</th><th>Payment made</th>'
    + '<th>Adjustment</th><th>Running balance</th></tr></thead><tbody>'
    + '<tr><td>Balance B/F</td><td>—</td><td>—</td><td>—</td><td>—</td><td>'
    + clean(formatCurrency(statement.opening)) + '</td></tr>'
    + body + '</tbody><tfoot><tr><td colspan="2">Period totals</td><td>' + clean(formatCurrency(statement.earned))
    + '</td><td>' + clean(formatCurrency(statement.paid)) + '</td><td>'
    + clean(formatCurrency(statement.adjustments)) + '</td><td>'
    + clean(formatCurrency(statement.closing)) + '</td></tr></tfoot></table>'
    + '<p>Balance = opening + approved earnings + adjustments − recorded allowance payments. '
    + 'Statement reconciliations are shown separately from earnings.</p></section>';
}

export function renderOperatorAllowanceStatements(container) {
  const card = el('div', { class: 'dd-tool dd-static' });
  card.appendChild(el('h3', { class: 'subsection-title' }, 'Period allowance statement'));
  card.appendChild(el('p', { class: 'section-subtitle' },
    'Select an operator and period to see the opening balance, dated earnings, Accounts payments and running balance. Print and choose Save as PDF.'));
  const selector = el('select');
  selector.appendChild(el('option', { value: 'all' }, 'All operators'));
  operatorIds().forEach((id) => selector.appendChild(el('option', { value: id }, operatorName(id))));
  const from = el('input', { type: 'date' });
  const to = el('input', { type: 'date' });
  const today = todayISOString();
  from.value = today.slice(0, 7) + '-01';
  to.value = today;
  const printButton = el('button', { type: 'button', class: 'btn btn-primary' }, 'Print / Save PDF');
  const status = el('p', { class: 'section-subtitle' }, '');
  const preview = el('div');
  const controls = el('div', { class: 'imp-row' });
  [selector, from, to, printButton].forEach((item) => controls.appendChild(item));
  card.appendChild(controls);
  card.appendChild(status);
  card.appendChild(preview);
  container.appendChild(card);
  function selectedStatements() {
    if (!from.value || !to.value || from.value > to.value) throw new Error('Choose a valid From and To date.');
    const ids = selector.value === 'all' ? operatorIds() : [selector.value];
    return ids.map((id) => buildOperatorAllowanceStatement(id, from.value, to.value));
  }
  function refresh() {
    try {
      const statements = selectedStatements();
      status.textContent = statements.length + ' operator statement(s) for ' + formatDate(from.value) + ' to ' + formatDate(to.value) + '.';
      preview.innerHTML = '';
      if (statements.length === 1) previewStatement(preview, statements[0]);
      else {
        const list = el('ul');
        statements.forEach((item) => list.appendChild(el('li', {},
          item.name + ': ' + formatCurrency(item.opening) + ' opening → ' + formatCurrency(item.closing) + ' closing')));
        preview.appendChild(list);
      }
      printButton.disabled = !statements.length;
    } catch (error) {
      status.textContent = error.message;
      preview.innerHTML = '';
      printButton.disabled = true;
    }
  }
  [selector, from, to].forEach((input) => input.addEventListener('change', refresh));
  printButton.addEventListener('click', () => {
    try {
      const area = document.getElementById('printArea');
      area.innerHTML = selectedStatements().map(statementHtml).join('');
      const logo = area.querySelector('img');
      if (logo && !logo.complete) {
        Promise.race([new Promise((resolve) => { logo.onload = resolve; logo.onerror = resolve; }),
          new Promise((resolve) => setTimeout(resolve, 4000))]).then(() => window.print());
      } else window.print();
    } catch (error) { status.textContent = error.message; }
  });
  refresh();
}
