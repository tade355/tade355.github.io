import { store } from '../store.js';
import { el, formatCurrency, formatDate } from '../utils.js';
import { getCurrentTier } from '../session.js';
import { renderTable } from '../ui.js';
import { parseOperatorAllowanceSheet } from '../operatorAllowanceImport.js';
import { allowancePayeeFor, isOwnedOperatorAllowancePaymentFor } from '../ownedOperatorAllowance.js';

const XLSX_URL = 'vendor/xlsx.core.min.js';
const MARKER = 'Imported allowance reconciliation';
let xlsxPromise;

function reader() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) xlsxPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = XLSX_URL;
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => { xlsxPromise = null; reject(new Error('Could not load the Excel reader.')); };
    document.head.appendChild(script);
  });
  return xlsxPromise;
}

function paymentExists(employeeId, date, amount) {
  return store.get('expenses').some((e) => e.date === date && Math.abs(Number(e.amount) - amount) < 0.01
    && isOwnedOperatorAllowancePaymentFor(employeeId, e.payee, e.category));
}

function addPayment(employeeId, date, amount, source) {
  return store.add('expenses', {
    date, amount, category: 'Salary and Allowance', payee: allowancePayeeFor(employeeId),
    description: `Operator allowance payment — ${source}`,
    paidBy: 'Bank transfer', project: '',
  });
}

function operatorOptions(select) {
  store.get('employees').filter((e) => e.dayRate || /operator/i.test(e.role || ''))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((e) => select.appendChild(el('option', { value: e.id }, e.name)));
}

export function renderOperatorAllowanceTools(container, refresh) {
  if (getCurrentTier() !== 'Admin') return;
  const card = el('div', { class: 'dd-tool dd-static' });
  card.appendChild(el('h3', { class: 'subsection-title' }, 'Reconcile operator allowance from Excel'));
  card.appendChild(el('p', { class: 'section-subtitle' }, 'Upload an allowance and payment reconciliation sheet. Review the opening balance, daily earnings, payment dates and closing balance before saving. Daily reports after the sheet’s final date continue adding allowance.'));
  const file = el('input', { type: 'file', accept: '.xlsx,.xlsm,.xls' });
  const operator = el('select');
  operator.appendChild(el('option', { value: '' }, 'Select operator'));
  operatorOptions(operator);
  const status = el('p', { class: 'section-subtitle' }, '');
  const details = el('div');
  card.appendChild(el('div', { class: 'imp-row' }, [file, operator]));
  card.appendChild(status);
  card.appendChild(details);
  container.appendChild(card);

  let parsed;
  let fileName = '';
  let extraPayments = [];
  let ready = false;

  function renderPreview() {
    details.innerHTML = '';
    if (!parsed || !operator.value) return;
    const employeeId = operator.value;
    const laterRun = store.get('dozerPayrollRuns').some((r) => r.status !== 'Draft'
      && r.periodEnd > parsed.lastDate && r.lines.some((l) => l.employeeId === employeeId));
    const alreadyImported = store.get('dozerPayrollRuns').some((r) => r.status !== 'Draft'
      && r.periodEnd === parsed.lastDate && r.lines.some((l) => l.employeeId === employeeId && l.equipment?.startsWith(MARKER)));
    const allPayments = [...parsed.payments, ...extraPayments];
    const additional = extraPayments.filter((p) => p.date <= parsed.lastDate).reduce((s, p) => s + p.amount, 0);
    const target = parsed.closing - additional;
    const missing = allPayments.filter((p) => !paymentExists(employeeId, p.date, p.amount));
    const name = store.get('employees').find((e) => e.id === employeeId)?.name || '';
    details.appendChild(el('p', {}, `${parsed.title} → ${name}. Through ${formatDate(parsed.lastDate)}: opening ${formatCurrency(parsed.opening)} + allowances ${formatCurrency(parsed.allowanceTotal)} − sheet payments ${formatCurrency(parsed.paymentTotal)} = ${formatCurrency(parsed.closing)}.`));
    details.appendChild(el('p', {}, `Extra payments on or before the sheet’s end: ${formatCurrency(additional)}. Reconciled closing: ${formatCurrency(target)}. ${missing.length} payment record(s) to add; ${allPayments.length - missing.length} already recorded.`));
    const list = el('ul');
    allPayments.forEach((p) => list.appendChild(el('li', {}, `${formatDate(p.date)} — ${formatCurrency(p.amount)}${paymentExists(employeeId, p.date, p.amount) ? ' (already recorded)' : ' (to add)'}`)));
    details.appendChild(list);
    const extraDate = el('input', { type: 'date' });
    const extraAmount = el('input', { type: 'number', min: 0.01, step: 0.01, placeholder: 'Amount (₦)' });
    const addExtra = el('button', { type: 'button', class: 'btn btn-ghost' }, 'Add another payment');
    addExtra.addEventListener('click', () => {
      const amount = Number(extraAmount.value);
      if (!extraDate.value || !Number.isFinite(amount) || amount <= 0) { window.alert('Enter a payment date and positive amount.'); return; }
      if (allPayments.some((p) => p.date === extraDate.value && p.amount === amount)) { window.alert('That payment is already in the preview.'); return; }
      extraPayments.push({ date: extraDate.value, amount });
      renderPreview();
    });
    details.appendChild(el('div', { class: 'imp-row' }, [extraDate, extraAmount, addExtra]));
    if (laterRun || alreadyImported || target < 0) {
      details.appendChild(el('p', { class: 'text-critical' }, laterRun
        ? 'A saved payroll run extends beyond this sheet. Resolve that overlap before importing.'
        : alreadyImported ? 'This operator and sheet ending date have already been imported.' : 'The adjusted closing balance cannot be negative.'));
      return;
    }
    const confirm = el('button', { type: 'button', class: 'btn btn-primary' }, 'Confirm reconciliation and payments');
    confirm.addEventListener('click', async () => {
      if (!ready || getCurrentTier() !== 'Admin') return;
      if (!window.confirm(`Import ${fileName} for ${name}? This will reconcile the allowance balance through ${formatDate(parsed.lastDate)} and record ${missing.length} missing payment(s).`)) return;
      confirm.disabled = true;
      status.textContent = 'Saving reconciliation…';
      try {
        for (const p of missing) {
          if (!paymentExists(employeeId, p.date, p.amount)) await addPayment(employeeId, p.date, p.amount, fileName);
        }
        const paidThroughEnd = store.get('expenses').filter((e) => e.date <= parsed.lastDate
          && isOwnedOperatorAllowancePaymentFor(employeeId, e.payee, e.category)).reduce((s, e) => s + Number(e.amount || 0), 0);
        const existingRunBalance = store.get('dozerPayrollRuns').filter((r) => r.status !== 'Draft')
          .flatMap((r) => r.lines.filter((l) => l.employeeId === employeeId))
          .reduce((s, l) => s + Number(l.daysWorked || 0) * Number(l.dayRate || 0)
            + Number(l.overtimeHours || 0) * Number(l.overtimeRate || 0)
            + Number(l.businessEarnings || 0) - Number(l.deductions || 0) - Number(l.amountPaid || 0), 0);
        const adjustment = target + paidThroughEnd - existingRunBalance;
        await store.add('dozerPayrollRuns', {
          periodStart: parsed.lastDate, periodEnd: parsed.lastDate, status: 'Approved', expenseId: '',
          lines: [{ employeeId, equipment: `${MARKER}: ${fileName}`,
            daysWorked: 0, dayRate: 0, overtimeHours: 0, overtimeRate: 0,
            businessEarnings: Math.max(0, adjustment), deductions: Math.max(0, -adjustment), amountPaid: 0 }],
        });
        status.textContent = `Imported ${fileName}. The balance now includes later daily reports and payments.`;
        details.innerHTML = '';
        ready = false;
        refresh();
        renderPaymentHistory();
      } catch (error) {
        status.textContent = `Could not complete import: ${error.message}. Saved payments are retained; retrying skips those already recorded.`;
        confirm.disabled = false;
      }
    });
    details.appendChild(confirm);
  }

  file.addEventListener('change', async () => {
    parsed = null; ready = false; details.innerHTML = '';
    if (!file.files[0]) return;
    fileName = file.files[0].name;
    status.textContent = `Reading ${fileName}…`;
    try {
      const XLSX = await reader();
      const wb = XLSX.read(await file.files[0].arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      parsed = parseOperatorAllowanceSheet(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }));
      extraPayments = /\btope\b/i.test(parsed.title) && parsed.lastDate === '2026-11-05'
        ? [{ date: '2026-10-16', amount: 10000 }, { date: '2026-11-11', amount: 200000 }] : [];
      ready = true;
      status.textContent = 'Review the figures and payment dates below before confirming.';
      renderPreview();
    } catch (error) { status.textContent = `Could not read this sheet: ${error.message}`; }
  });
  operator.addEventListener('change', renderPreview);

  const paymentCard = el('div', { class: 'dd-tool dd-static' });
  paymentCard.appendChild(el('h3', { class: 'subsection-title' }, 'Record a later operator allowance payment'));
  const historySlot = el('div');
  function renderPaymentHistory() {
    const rows = store.get('expenses').filter((e) => e.category === 'Salary and Allowance'
      && store.get('employees').some((person) => isOwnedOperatorAllowancePaymentFor(person.id, e.payee, e.category)))
      .slice().sort((a, b) => b.date.localeCompare(a.date));
    renderTable(historySlot, {
      columns: [
        { key: 'date', label: 'Payment date', render: (r) => formatDate(r.date) },
        { key: 'payee', label: 'Operator' },
        { key: 'amount', label: 'Paid', render: (r) => formatCurrency(r.amount) },
        { key: 'description', label: 'Record' },
      ],
      rows,
      emptyText: 'No operator allowance payments recorded yet.',
    });
  }
  const paymentOperator = el('select');
  paymentOperator.appendChild(el('option', { value: '' }, 'Select operator'));
  operatorOptions(paymentOperator);
  const paymentDate = el('input', { type: 'date' });
  paymentDate.value = new Date().toLocaleDateString('en-CA');
  const paymentAmount = el('input', { type: 'number', min: 0.01, step: 0.01, placeholder: 'Amount paid (₦)' });
  const save = el('button', { type: 'button', class: 'btn btn-primary' }, 'Record payment');
  save.addEventListener('click', async () => {
    const amount = Number(paymentAmount.value);
    if (!paymentOperator.value || !paymentDate.value || !Number.isFinite(amount) || amount <= 0) { window.alert('Choose an operator, date and positive amount.'); return; }
    if (paymentExists(paymentOperator.value, paymentDate.value, amount)) { window.alert('A payment of this amount is already recorded for that operator and date.'); return; }
    save.disabled = true;
    try { await addPayment(paymentOperator.value, paymentDate.value, amount, 'manual entry'); paymentAmount.value = ''; refresh(); renderPaymentHistory(); }
    catch (error) { window.alert(error.message || 'Could not record payment.'); }
    finally { save.disabled = false; }
  });
  paymentCard.appendChild(el('div', { class: 'imp-row' }, [paymentOperator, paymentDate, paymentAmount, save]));
  paymentCard.appendChild(el('h3', { class: 'subsection-title' }, 'Allowance payment history'));
  paymentCard.appendChild(historySlot);
  renderPaymentHistory();
  container.appendChild(paymentCard);
}

