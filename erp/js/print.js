import { formatCurrency, formatDate, formatMonthLong } from './utils.js';

function render(html) {
  const area = document.getElementById('printArea');
  area.innerHTML = html;
  window.print();
}

function letterhead(docTitle, docNumber) {
  return `
    <div class="print-header">
      <img src="assets/logo.png" alt="Emagrims Ltd" class="print-logo">
      <div class="print-company">
        <h1>Emagrims Ltd</h1>
        <p>Land Clearing &amp; Earthmoving</p>
      </div>
      <div class="print-doc-meta">
        <div class="print-doc-title">${docTitle}</div>
        ${docNumber ? `<div class="print-doc-number">${docNumber}</div>` : ''}
      </div>
    </div>
  `;
}

function signatureBlock(lines) {
  return `
    <div class="print-signatures">
      ${lines.map((label) => `
        <div class="print-signature">
          <div class="print-signature-line"></div>
          <span>${label}</span>
        </div>
      `).join('')}
    </div>
  `;
}

export function printInvoice(invoice, customer) {
  const isReceipt = invoice.status === 'Paid';
  const total = invoice.items.reduce((sum, it) => sum + it.qty * it.price, 0);
  const html = `
    ${letterhead(isReceipt ? 'RECEIPT' : 'INVOICE', invoice.id)}
    <div class="print-meta-grid">
      <div><strong>Date:</strong> ${formatDate(invoice.date)}</div>
      <div><strong>Due Date:</strong> ${formatDate(invoice.dueDate)}</div>
      <div><strong>Status:</strong> ${invoice.status}</div>
      ${invoice.project ? `<div><strong>Project:</strong> ${invoice.project}</div>` : ''}
    </div>
    <div class="print-block">
      <strong>Bill To:</strong>
      <p>${customer?.name || 'Unknown Customer'}<br>
      ${customer?.contact ? `${customer.contact}<br>` : ''}
      ${customer?.phone ? `${customer.phone}<br>` : ''}
      ${customer?.email ? `${customer.email}<br>` : ''}
      ${customer?.address || ''}</p>
    </div>
    <table class="print-table">
      <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
      <tbody>
        ${invoice.items.map((it) => `
          <tr>
            <td>${it.description}</td>
            <td>${it.qty}</td>
            <td>${formatCurrency(it.price)}</td>
            <td>${formatCurrency(it.qty * it.price)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot><tr><td colspan="3">Total</td><td>${formatCurrency(total)}</td></tr></tfoot>
    </table>
    ${isReceipt ? '<p class="print-stamp">PAID</p>' : ''}
    <p class="print-thanks">Thank you for your business.</p>
    ${signatureBlock(['Authorized Signature', 'Customer Signature'])}
  `;
  render(html);
}

export function printFuelingVoucher(voucher, { requestedByName, approvedByName }) {
  const html = `
    ${letterhead('FUELING VOUCHER', voucher.id)}
    <div class="print-meta-grid">
      <div><strong>Date:</strong> ${formatDate(voucher.date)}</div>
      <div><strong>Station:</strong> ${voucher.station}</div>
      <div><strong>Project:</strong> ${voucher.project || '—'}</div>
      <div><strong>Equipment:</strong> ${voucher.equipment}</div>
      <div><strong>Litres Requested:</strong> ${voucher.litresRequested.toLocaleString()} L</div>
      <div><strong>Estimated Cost:</strong> ${formatCurrency(voucher.estimatedCost)}</div>
      <div><strong>Status:</strong> ${voucher.status}</div>
    </div>
    ${voucher.notes ? `<div class="print-block"><strong>Notes:</strong><p>${voucher.notes}</p></div>` : ''}
    <div class="print-block">
      <strong>Requested By:</strong> ${requestedByName || 'Unknown'}<br>
      <strong>Approved By:</strong> ${approvedByName || 'Pending approval'}
    </div>
    <p class="print-thanks">Present this voucher at the station to authorize fueling.</p>
    ${signatureBlock(['Requested By', 'Approved By', 'Station Attendant'])}
  `;
  render(html);
}

export function printFundRequest(request, { projectLabel, submittedByName, approvedByName }) {
  const total = request.items.reduce((sum, it) => sum + it.amount, 0);
  const html = `
    ${letterhead('FUND REQUEST', request.id)}
    <div class="print-meta-grid">
      <div><strong>Date:</strong> ${formatDate(request.date)}</div>
      <div><strong>Project:</strong> ${projectLabel || request.project || '—'}</div>
      <div><strong>Submitted By:</strong> ${submittedByName || 'Unknown'}</div>
      <div><strong>Status:</strong> ${request.status}</div>
    </div>
    ${request.description ? `<div class="print-block"><strong>Description:</strong><p>${request.description}</p></div>` : ''}
    <table class="print-table">
      <thead><tr><th>Description</th><th>Amount</th><th>Account Name</th><th>Account Number</th><th>Bank</th></tr></thead>
      <tbody>
        ${request.items.map((it) => `
          <tr>
            <td>${it.description}</td>
            <td>${formatCurrency(it.amount)}</td>
            <td>${it.accountName || '—'}</td>
            <td>${it.accountNumber || '—'}</td>
            <td>${it.bankName || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot><tr><td colspan="4">Total Amount</td><td>${formatCurrency(total)}</td></tr></tfoot>
    </table>
    <div class="print-block">
      <strong>Approved By:</strong> ${approvedByName || 'Pending approval'}
    </div>
    ${signatureBlock(['Submitted By', 'Approved By'])}
  `;
  render(html);
}

export function printPayslip(run, line, employeeName) {
  const netPay = (line.baseSalary || 0) + (line.bonus || 0) - (line.deductions || 0);
  const html = `
    ${letterhead('PAYSLIP', run.id)}
    <div class="print-meta-grid">
      <div><strong>Employee:</strong> ${employeeName}</div>
      <div><strong>Pay Period:</strong> ${formatMonthLong(run.month)}</div>
      <div><strong>Status:</strong> ${run.status}</div>
    </div>
    <table class="print-table">
      <thead><tr><th>Item</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>Base Salary</td><td>${formatCurrency(line.baseSalary)}</td></tr>
        <tr><td>Bonus</td><td>${formatCurrency(line.bonus)}</td></tr>
        <tr><td>Deductions</td><td>-${formatCurrency(line.deductions)}</td></tr>
      </tbody>
      <tfoot><tr><td>Net Pay</td><td>${formatCurrency(netPay)}</td></tr></tfoot>
    </table>
    ${signatureBlock(['Employee Signature', 'Authorized Signature'])}
  `;
  render(html);
}

export function printPayrollRegister(run, lines) {
  const totalNet = lines.reduce((sum, l) => sum + (l.baseSalary || 0) + (l.bonus || 0) - (l.deductions || 0), 0);
  const html = `
    ${letterhead('PAYROLL REGISTER', run.id)}
    <div class="print-meta-grid">
      <div><strong>Pay Period:</strong> ${formatMonthLong(run.month)}</div>
      <div><strong>Status:</strong> ${run.status}</div>
      <div><strong>Employees:</strong> ${lines.length}</div>
    </div>
    <table class="print-table">
      <thead><tr><th>Employee</th><th>Base Salary</th><th>Bonus</th><th>Deductions</th><th>Net Pay</th></tr></thead>
      <tbody>
        ${lines.map((l) => `
          <tr>
            <td>${l.employeeName}</td>
            <td>${formatCurrency(l.baseSalary)}</td>
            <td>${formatCurrency(l.bonus)}</td>
            <td>-${formatCurrency(l.deductions)}</td>
            <td>${formatCurrency((l.baseSalary || 0) + (l.bonus || 0) - (l.deductions || 0))}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot><tr><td colspan="4">Total</td><td>${formatCurrency(totalNet)}</td></tr></tfoot>
    </table>
    ${signatureBlock(['Prepared By', 'Approved By'])}
  `;
  render(html);
}
