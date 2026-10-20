import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, statCard, statusPill, sectionHeader, dateRangeFields } from '../ui.js';
import { buildPersonHistory } from '../personHistory.js';
import { personHistoryContext } from '../reportContext.js';

const money = (n) => (n === null || n === undefined ? '—' : formatCurrency(n));
const hrs = (n) => `${n || 0} hrs`;

// Person History: for one employee over a date range, the days, machines,
// overtime, hectares, allowances, fund requests naming them and (for
// mechanics) maintenance logs. All figures come from personHistory.js.
export function renderPersonHistory(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('Person History', 'Operator, supervisor and mechanic records for a chosen person and period'));

  const today = todayISOString();
  const select = el('select', {}, [
    el('option', { value: '' }, '— Choose a person —'),
    ...store.get('employees').slice().sort((a, b) => (a.name < b.name ? -1 : 1)).map((e) => el('option', { value: e.id }, `${e.name} (${e.role})`)),
  ]);
  const range = dateRangeFields({ from: `${today.slice(0, 7)}-01`, to: today, onChange: () => render() });
  select.addEventListener('change', () => render());

  container.appendChild(el('div', { class: 'filter-bar' }, [
    el('label', { class: 'filter-field' }, [el('span', {}, 'Person'), select]),
    ...range.elements,
  ]));

  const out = el('div');
  container.appendChild(out);

  function section(title, hint, rows, columns, emptyText) {
    out.appendChild(el('h3', { class: 'subsection-title' }, title));
    if (hint) out.appendChild(el('p', { class: 'section-subtitle' }, hint));
    const holder = el('div');
    out.appendChild(holder);
    renderTable(holder, { columns, rows, emptyText, exportFilename: `person-history-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` });
  }

  function render() {
    out.innerHTML = '';
    if (!select.value) {
      out.appendChild(el('p', { class: 'table-empty' }, 'Choose a person to see their history.'));
      return;
    }
    const h = buildPersonHistory(personHistoryContext(), select.value, { from: range.fromInput.value, to: range.toInput.value });
    if (!h) {
      out.appendChild(el('p', { class: 'table-empty' }, 'That employee could not be found.'));
      return;
    }
    const s = h.summary;
    const cards = [];
    if (h.roles.operator || s.operatorDays) {
      cards.push(
        statCard({ label: 'Days Worked (Operator)', value: String(s.operatorDays), hint: hrs(s.operatorHours) }),
        statCard({ label: 'Overtime Beyond 8 Hrs', value: hrs(s.overtimeHours) }),
        statCard({ label: 'Hectares Cleared', value: String(s.operatorHectares) }),
        statCard({ label: 'Operator Allowance (owned fleet)', value: money(s.operatorAllowance), hint: 'Shared allowance rule' }),
      );
    }
    if (h.roles.supervisor || s.supervisorDays) {
      cards.push(
        statCard({ label: 'Days Supervised', value: String(s.supervisorDays), hint: hrs(s.supervisorHours) }),
        statCard({ label: 'Hectares Supervised', value: String(s.supervisedHectares) }),
        statCard({ label: 'Sunday Bonus (policy)', value: money(s.sundayBonusTotal) }),
      );
    }
    cards.push(statCard({ label: 'Sunday Days', value: String(s.sundayDays) }));
    if (s.payrollPaid || s.payrollNet || h.payrollLines.length) {
      cards.push(
        statCard({ label: 'Day-Rate Payroll Net', value: money(s.payrollNet), hint: 'Approved and Paid runs' }),
        statCard({ label: 'Day-Rate Payroll Paid', value: money(s.payrollPaid) }),
      );
    }
    if (h.allowancePayments.length) cards.push(statCard({ label: 'Allowance Lump Sums (Expenses)', value: money(s.allowancePaymentsTotal) }));
    if (h.monthlyLines.length) cards.push(statCard({ label: 'Monthly Salary Paid', value: money(s.monthlyPaid), hint: `Net ${money(s.monthlyNet)}` }));
    if (s.balanceOwed !== null && (h.roles.operator || s.balanceOwed)) {
      cards.push(statCard({ label: 'Allowance Balance Owed (to date)', value: money(s.balanceOwed), hint: 'Not limited to the dates chosen', tone: s.balanceOwed > 0 ? 'warning' : undefined }));
    }
    cards.push(statCard({
      label: 'Fund Requests Naming Them',
      value: String(s.requestCount),
      hint: `${money(s.requestsTotal)} (${Object.entries(s.requestsByStatus).map(([k, v]) => `${k} ${money(v)}`).join(', ') || 'none'})`,
    }));
    if (h.roles.mechanic || s.maintenanceCount) {
      cards.push(statCard({ label: 'Maintenance Jobs (Performed)', value: String(s.maintenancePerformed), hint: `Cost ${money(s.maintenanceCost)}` }));
    }
    out.appendChild(el('div', { class: 'stats-grid' }, cards));

    if (h.machines.length) {
      section('Machines', 'Days and hours per machine, as operator and as supervisor.', h.machines, [
        { key: 'role', label: 'As' },
        { key: 'equipment', label: 'Machine' },
        { key: 'days', label: 'Days' },
        { key: 'hours', label: 'Hours' },
        { key: 'sundayDays', label: 'Sundays' },
        { key: 'hectares', label: 'Ha' },
      ]);
    }
    if (h.daily.length) {
      section('Day by Day', 'Overtime is the hours beyond 8 on a date, all machines added together. Sunday bonus follows the supervisor policy (from 10 Oct 2026).', h.daily, [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'sunday', label: 'Day', render: (r) => (r.sunday ? 'Sunday' : '—') },
        { key: 'role', label: 'As' },
        { key: 'machines', label: 'Machines', wrap: true },
        { key: 'hours', label: 'Hours' },
        { key: 'overtimeHours', label: 'Overtime Hrs' },
        { key: 'hectares', label: 'Ha' },
        { key: 'allowance', label: 'Allowance', render: (r) => (r.role === 'Operator' ? formatCurrency(r.allowance) : '—') },
        { key: 'sundayBonus', label: 'Sunday Bonus', render: (r) => (r.role === 'Supervisor' && r.sunday ? formatCurrency(r.sundayBonus) : '—') },
      ]);
    }
    if (h.payrollLines.length) {
      section('Day-Rate Payroll Lines', 'Draft runs are shown but not counted in the totals above.', h.payrollLines, [
        { key: 'period', label: 'Period', render: (r) => `${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}` },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        { key: 'daysWorked', label: 'Days' },
        { key: 'dayRate', label: 'Day Rate', render: (r) => formatCurrency(r.dayRate) },
        { key: 'overtimeHours', label: 'OT Hrs' },
        { key: 'businessEarnings', label: 'Business', render: (r) => formatCurrency(r.businessEarnings) },
        { key: 'deductions', label: 'Deductions', render: (r) => formatCurrency(r.deductions) },
        { key: 'netPay', label: 'Net Pay', render: (r) => money(r.netPay) },
        { key: 'amountPaid', label: 'Paid', render: (r) => formatCurrency(r.amountPaid) },
      ]);
    }
    if (h.allowancePayments.length) {
      section('Allowance Payments Recorded as Expenses', null, h.allowancePayments, [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'payee', label: 'Payee' },
        { key: 'description', label: 'Description', wrap: true },
        { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
      ]);
    }
    if (h.monthlyLines.length) {
      section('Monthly Payroll Lines', null, h.monthlyLines, [
        { key: 'month', label: 'Month' },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        { key: 'baseSalary', label: 'Base', render: (r) => formatCurrency(r.baseSalary) },
        { key: 'bonus', label: 'Bonus', render: (r) => formatCurrency(r.bonus) },
        { key: 'deductions', label: 'Deductions', render: (r) => formatCurrency(r.deductions) },
        { key: 'netPay', label: 'Net Pay', render: (r) => money(r.netPay) },
        { key: 'amountPaid', label: 'Paid', render: (r) => formatCurrency(r.amountPaid) },
      ]);
    }
    section('Fund Requests Naming Them', 'Matched on the first name or full name in the description or an item (Tope, Joshua, Jessy, God\'s time...). "Amount" is the whole request; "Naming Them" is the lines that mention the person.', h.fundRequests, [
      { key: 'id', label: 'Request' },
      { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
      { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
      { key: 'description', label: 'Description', wrap: true, render: (r) => r.itemText ? `${r.description} (${r.itemText})` : r.description },
      { key: 'total', label: 'Amount', render: (r) => formatCurrency(r.total) },
      { key: 'namedAmount', label: 'Naming Them', render: (r) => formatCurrency(r.namedAmount) },
    ], 'No fund requests name this person in the period.');
    if (h.roles.mechanic || h.maintenance.length) {
      section('Maintenance Logs', '"Performed by" is the log\'s Performed By field; "Named in log" only mentions the person in the description or contractor name and is not costed to them.', h.maintenance, [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'equipment', label: 'Machine' },
        { key: 'type', label: 'Type' },
        { key: 'description', label: 'Description', wrap: true },
        { key: 'how', label: 'Link' },
        { key: 'status', label: 'Status', render: (r) => (r.status ? statusPill(r.status) : '—') },
        { key: 'cost', label: 'Cost', render: (r) => formatCurrency(r.cost) },
      ], 'No maintenance logs for this person in the period.');
    }
  }

  render();
}
