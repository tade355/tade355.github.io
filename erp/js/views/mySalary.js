import { formatCurrency, formatMonthLong, el } from '../utils.js';
import { sectionHeader, statCard, renderTable } from '../ui.js';
import { getCurrentUser } from '../session.js';
import { printPayslip, printSalaryStatement } from '../print.js';
import { salaryStatementRows, netPay } from './payroll.js';

// Self-service view — every tier can see this, but only their own record.
// Reuses payroll.js's salaryStatementRows() directly so this always agrees
// with what an Admin sees on the Payroll tab; there's no separate copy of
// the running-balance math to drift out of sync.
export function renderMySalary(container) {
  container.innerHTML = '';

  const employee = getCurrentUser();
  container.appendChild(sectionHeader('My Salary', 'Your own pay history and outstanding balance, straight from Payroll'));

  if (!employee) {
    container.appendChild(el('p', { class: 'section-subtitle' }, 'No employee record is linked to this login.'));
    return;
  }

  const printAllBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '🖨 Print Salary Statement');
  container.appendChild(el('div', { class: 'filter-bar' }, [printAllBtn]));

  const rows = salaryStatementRows(employee.id);
  const totalDue = rows.reduce((sum, r) => sum + r.netPay, 0);
  const totalPaid = rows.reduce((sum, r) => sum + r.amountPaid, 0);
  const outstanding = totalDue - totalPaid;

  printAllBtn.addEventListener('click', () => printSalaryStatement(employee.name, rows));

  container.appendChild(el('div', { class: 'stats-grid' }, [
    statCard({ label: 'Outstanding Balance', value: formatCurrency(outstanding), tone: outstanding > 0 ? 'critical' : 'good' }),
    statCard({ label: 'Total Paid (All Time)', value: formatCurrency(totalPaid) }),
    statCard({ label: 'Periods Recorded', value: String(rows.length) }),
  ]));

  const tableContainer = el('div');
  container.appendChild(tableContainer);
  renderTable(tableContainer, {
    columns: [
      { key: 'month', label: 'Pay Period', render: (r) => formatMonthLong(r.month) },
      { key: 'baseSalary', label: 'Base Salary', render: (r) => formatCurrency(r.baseSalary) },
      { key: 'bonus', label: 'Bonus', render: (r) => formatCurrency(r.bonus) },
      { key: 'deductions', label: 'Deductions', render: (r) => `-${formatCurrency(r.deductions)}` },
      { key: 'netPay', label: 'Net Pay (Due)', render: (r) => formatCurrency(r.netPay) },
      { key: 'amountPaid', label: 'Paid', render: (r) => formatCurrency(r.amountPaid) },
      { key: 'runningBalance', label: 'Running Balance', render: (r) => el('strong', { class: r.runningBalance > 0 ? 'text-critical' : 'text-good' }, formatCurrency(r.runningBalance)) },
      {
        key: 'actions',
        label: '',
        render: (r) => el('button', {
          type: 'button', class: 'icon-btn', title: 'Print payslip',
          onClick: () => printPayslip({ id: r.runId, month: r.month, status: r.status }, { baseSalary: r.baseSalary, bonus: r.bonus, deductions: r.deductions, amountPaid: r.amountPaid }, employee.name),
        }, '🖨'),
      },
    ],
    rows,
    emptyText: 'No Approved or Paid payroll periods recorded for you yet.',
  });
}
