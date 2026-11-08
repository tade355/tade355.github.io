import { formatCurrency, formatDate, formatMonthLong } from './utils.js';
const escape = (v) => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function payStatementHtml(employee,s,payslip=false) {
  const money=v=>escape(formatCurrency(v));
  const rows=payslip?s.recorded:s.rows;
  return `<div class="print-header"><img src="assets/logo.png" alt="Emagrims Ltd" class="print-logo"><div><h1>Emagrims Ltd</h1><h2>${payslip?'MONTHLY PAYSLIP':'PAY & ALLOWANCES STATEMENT'}</h2></div></div>
    <p><strong>Employee:</strong> ${escape(employee.name)} (${escape(employee.id)})<br><strong>Period:</strong> ${escape(s.month?formatMonthLong(s.month):'All recorded periods')}</p>
    <p><strong>Opening balance:</strong> ${money(payslip?s.openingRecorded:s.opening)}</p>
    <table class="print-table"><thead><tr><th>Date</th><th>Reference / period</th><th>Type</th><th>Base</th><th>Bonus / extra</th><th>Deductions</th><th>Earned</th><th>Paid / credited</th></tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${escape(formatDate(r.date))}</td><td>${escape(r.id)}<br>${escape(r.period)}</td><td>${escape(r.type)}${r.estimated?' (not yet approved)':''}</td><td>${money(r.base || 0)}</td><td>${money(r.extra || 0)}</td><td>${money(r.deductions || 0)}</td><td>${money(r.earned)}</td><td>${money(r.paid)}</td></tr>`).join('')||'<tr><td colspan="8">No records in this period.</td></tr>'}</tbody></table>
    <p>Approved earnings: <strong>${money(s.earned)}</strong><br>Payments / credits: <strong>${money(s.paid)}</strong><br>Outstanding from approved records: <strong>${money(s.closingRecorded)}</strong></p>
    ${!payslip&&s.estimated?`<p>Additional estimated allowance: ${money(s.estimated)}<br>Balance including estimates: <strong>${money(s.closing)}</strong></p>`:''}
    <p>Negative balances represent a credit or advance. Salary appears in its payroll month; allowance runs appear in their period-ending month. Payroll payments are credits allocated to that period, not proof of the transfer date. Estimates are excluded from payslips.</p>`;
}
export function printPersonalPay(employee,statement,payslip=false) {
  document.getElementById('printArea').innerHTML=payStatementHtml(employee,statement,payslip);
  window.print();
}
