import { formatCurrency, formatDate, formatMonthLong, poTotal } from './utils.js';

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

export function printPurchaseOrder(po, supplier) {
  const total = poTotal(po);
  const html = `
    ${letterhead('PURCHASE ORDER', po.id)}
    <div class="print-meta-grid">
      <div><strong>Order Date:</strong> ${formatDate(po.date)}</div>
      <div><strong>Status:</strong> ${po.status}</div>
    </div>
    <div class="print-block">
      <strong>Supplier:</strong>
      <p>${supplier?.name || 'Unknown Supplier'}<br>
      ${supplier?.contact ? `${supplier.contact}<br>` : ''}
      ${supplier?.phone ? `${supplier.phone}<br>` : ''}
      ${supplier?.email ? `${supplier.email}<br>` : ''}
      ${supplier?.address || ''}</p>
    </div>
    <table class="print-table">
      <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
      <tbody>
        ${po.items.map((it) => `
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
    ${signatureBlock(['Authorized Signature', 'Supplier Signature'])}
  `;
  render(html);
}

export function printDozerPayslip(run, line, employeeName) {
  const netPay = (line.daysWorked || 0) * (line.dayRate || 0)
    + (line.overtimeHours || 0) * (line.overtimeRate || 0)
    + (line.businessEarnings || 0)
    - (line.deductions || 0);
  const html = `
    ${letterhead('DOZER OPERATOR PAYSLIP', run.id)}
    <div class="print-meta-grid">
      <div><strong>Operator:</strong> ${employeeName}</div>
      <div><strong>Period:</strong> ${formatDate(run.periodStart)} to ${formatDate(run.periodEnd)}</div>
      <div><strong>Status:</strong> ${run.status}</div>
      ${line.equipment ? `<div><strong>Equipment:</strong> ${line.equipment}</div>` : ''}
    </div>
    <table class="print-table">
      <thead><tr><th>Item</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>Days Worked (${line.daysWorked || 0} × ${formatCurrency(line.dayRate)})</td><td>${formatCurrency((line.daysWorked || 0) * (line.dayRate || 0))}</td></tr>
        <tr><td>Overtime (${line.overtimeHours || 0} h × ${formatCurrency(line.overtimeRate)})</td><td>${formatCurrency((line.overtimeHours || 0) * (line.overtimeRate || 0))}</td></tr>
        <tr><td>Business Earnings</td><td>${formatCurrency(line.businessEarnings)}</td></tr>
        <tr><td>Deductions</td><td>-${formatCurrency(line.deductions)}</td></tr>
      </tbody>
      <tfoot><tr><td>Net Pay</td><td>${formatCurrency(netPay)}</td></tr></tfoot>
    </table>
    <div class="print-block">
      <strong>Amount Paid:</strong> ${formatCurrency(line.amountPaid)}
    </div>
    ${signatureBlock(['Operator Signature', 'Authorized Signature'])}
  `;
  render(html);
}

export function printDozerPayrollRegister(run, lines) {
  const netPayOf = (l) => (l.daysWorked || 0) * (l.dayRate || 0)
    + (l.overtimeHours || 0) * (l.overtimeRate || 0)
    + (l.businessEarnings || 0)
    - (l.deductions || 0);
  const totalNet = lines.reduce((sum, l) => sum + netPayOf(l), 0);
  const html = `
    ${letterhead('DOZER PAYROLL REGISTER', run.id)}
    <div class="print-meta-grid">
      <div><strong>Period:</strong> ${formatDate(run.periodStart)} to ${formatDate(run.periodEnd)}</div>
      <div><strong>Status:</strong> ${run.status}</div>
      <div><strong>Operators:</strong> ${lines.length}</div>
    </div>
    <table class="print-table">
      <thead><tr><th>Operator</th><th>Days</th><th>Day Rate</th><th>OT Hours</th><th>Business</th><th>Deductions</th><th>Net Pay</th></tr></thead>
      <tbody>
        ${lines.map((l) => `
          <tr>
            <td>${l.employeeName}</td>
            <td>${l.daysWorked || 0}</td>
            <td>${formatCurrency(l.dayRate)}</td>
            <td>${l.overtimeHours || 0}</td>
            <td>${formatCurrency(l.businessEarnings)}</td>
            <td>-${formatCurrency(l.deductions)}</td>
            <td>${formatCurrency(netPayOf(l))}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot><tr><td colspan="6">Total</td><td>${formatCurrency(totalNet)}</td></tr></tfoot>
    </table>
    ${signatureBlock(['Prepared By', 'Approved By'])}
  `;
  render(html);
}

export function printDozerSettlement(settlement, ownerName) {
  const grossRental = settlement.daysWorked * settlement.rentalRatePerDay;
  const managementRetained = settlement.daysWorked * settlement.managementFeePerDay;
  const balance = grossRental - managementRetained - settlement.repairsCost - settlement.amountPaidToOwner;
  const html = `
    ${letterhead('DOZER OWNER SETTLEMENT STATEMENT', settlement.id)}
    <div class="print-meta-grid">
      <div><strong>Dozer:</strong> ${settlement.equipment}</div>
      <div><strong>Owner:</strong> ${ownerName || '—'}</div>
      <div><strong>Period:</strong> ${formatDate(settlement.periodStart)} to ${formatDate(settlement.periodEnd)}</div>
    </div>
    <table class="print-table">
      <thead><tr><th>Item</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>Days Worked</td><td>${settlement.daysWorked}</td></tr>
        <tr><td>Rental Rate / Day</td><td>${formatCurrency(settlement.rentalRatePerDay)}</td></tr>
        <tr><td>Gross Rental (${settlement.daysWorked} days)</td><td>${formatCurrency(grossRental)}</td></tr>
        <tr><td>Management Fee Retained</td><td>-${formatCurrency(managementRetained)}</td></tr>
        <tr><td>Repairs Cost</td><td>-${formatCurrency(settlement.repairsCost)}</td></tr>
        <tr><td>Amount Already Paid</td><td>-${formatCurrency(settlement.amountPaidToOwner)}</td></tr>
      </tbody>
      <tfoot><tr><td>Balance Payable to Owner</td><td>${formatCurrency(balance)}</td></tr></tfoot>
    </table>
    ${settlement.notes ? `<div class="print-block"><strong>Notes:</strong><p>${settlement.notes}</p></div>` : ''}
    ${signatureBlock(['Prepared By', 'Owner Acknowledgement'])}
  `;
  render(html);
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function printWeeklyPerformanceReport(project, data) {
  const cumulativeTotal = data.cumulative.reduce((a, b) => a + b, 0);
  const html = `
    ${letterhead('WEEKLY PERFORMANCE REPORT', `${formatDate(data.weekStart)} – ${formatDate(data.weekEnd)}`)}
    <div class="print-meta-grid">
      <div><strong>Project:</strong> ${project}</div>
      <div><strong>Week:</strong> ${formatDate(data.weekStart)} – ${formatDate(data.weekEnd)}</div>
    </div>
    <table class="print-table">
      <thead>
        <tr>
          <th>Dozer</th><th>Type</th><th>Start</th><th>Close</th>
          ${DAY_LABELS.map((d) => `<th>${d}</th>`).join('')}
          <th>Total</th><th>Speed Ha/Day</th><th>Planned</th><th>Actual</th>
        </tr>
      </thead>
      <tbody>
        ${data.rows.map((r) => `
          <tr>
            <td>${r.name}</td>
            <td>${r.types}</td>
            <td>${r.start || '—'}</td>
            <td>${r.close || '—'}</td>
            ${r.byDay.map((v) => `<td>${v ? v.toFixed(1) : '—'}</td>`).join('')}
            <td>${r.total.toFixed(1)}</td>
            <td>${r.speedPerDay.toFixed(1)}</td>
            <td>${r.plannedDays}</td>
            <td>${r.actualDays}</td>
          </tr>
        `).join('')}
        <tr>
          <td colspan="4"><strong>Cumulative</strong></td>
          ${data.cumulative.map((v) => `<td><strong>${v.toFixed(1)}</strong></td>`).join('')}
          <td><strong>${cumulativeTotal.toFixed(1)}</strong></td><td></td><td></td><td></td>
        </tr>
      </tbody>
    </table>
    <div class="print-block">
      ${data.typeTotals.map((t) => `<p><strong>Total ${t.unit} Achieved for ${t.type}:</strong> ${t.total.toFixed(2)} ${t.unit}</p>`).join('') || '<p>No operations logged for this project this week.</p>'}
    </div>
  `;
  render(html);
}

export function printMilestoneTracker(data) {
  const html = `
    ${letterhead('MILESTONE REPORT TRACKING SYSTEM', data.project?.name)}
    <div class="print-meta-grid">
      <div><strong>Project Start Date:</strong> ${data.project?.startDate ? formatDate(data.project.startDate) : '—'}</div>
      <div><strong>Current Date:</strong> ${formatDate(data.today)}</div>
      <div><strong>Days on Project:</strong> ${data.daysOnProject === null ? '—' : data.daysOnProject}</div>
      <div><strong>Project Speed (Ha/Day):</strong> ${data.speedPerDay === null ? '—' : data.speedPerDay.toFixed(2)}</div>
      <div><strong>Grand Cumulative Achieved:</strong> ${data.grandCumulative.toFixed(2)} Ha</div>
      <div><strong>Total Contract Area:</strong> ${data.project?.totalAreaHa ? `${data.project.totalAreaHa.toFixed(2)} Ha` : '—'}</div>
      <div><strong>Remaining to Complete:</strong> ${data.remaining === null ? '—' : `${data.remaining.toFixed(2)} Ha`}</div>
    </div>
    <table class="print-table">
      <thead>
        <tr>
          <th>Machinery</th><th>Vendor</th><th>Combined Days</th><th>Office Days</th><th>Business Days</th>
          ${data.activeTypes.map((t) => `<th>${t.value} (${t.unit})</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${data.machineRows.map((r) => `
          <tr>
            <td>${r.name}</td>
            <td>${r.owner}</td>
            <td>${r.combinedDays}</td>
            <td>${r.officeDays}</td>
            <td>${r.businessDays}</td>
            ${data.activeTypes.map((t) => `<td>${(r.byType[t.value] || 0).toFixed(2)}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  render(html);
}

export function printDieselReplenishmentRequest(forDate, rows) {
  const totalLitres = rows.reduce((sum, r) => sum + r.projectedLitres, 0);
  const html = `
    ${letterhead('DIESEL REPLENISHMENT REQUEST', formatDate(forDate))}
    <div class="print-meta-grid">
      <div><strong>For:</strong> ${formatDate(forDate)}</div>
      <div><strong>Assets:</strong> ${rows.length}</div>
      <div><strong>Total Projected:</strong> ${totalLitres.toLocaleString()} L</div>
    </div>
    <table class="print-table">
      <thead><tr><th>Asset</th><th>Avg Daily Use (14d)</th><th>Projected Need</th></tr></thead>
      <tbody>
        ${rows.map((r) => `
          <tr>
            <td>${r.name}</td>
            <td>${r.projectedLitres.toLocaleString()} L</td>
            <td>${r.projectedLitres.toLocaleString()} L</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot><tr><td colspan="2">Total</td><td>${totalLitres.toLocaleString()} L</td></tr></tfoot>
    </table>
    <div class="print-block">
      <p>Projected from each asset's average daily diesel use over its last 14 working days — an estimate, not a guarantee of actual need.</p>
    </div>
    ${signatureBlock(['Requested By', 'Approved By'])}
  `;
  render(html);
}

export function printStaffMemo(memo, { employeeName, issuedByName }) {
  const html = `
    ${letterhead(memo.type.toUpperCase(), memo.id)}
    <div class="print-meta-grid">
      <div><strong>Date:</strong> ${formatDate(memo.date)}</div>
      <div><strong>To:</strong> ${employeeName || 'All Staff'}</div>
      <div><strong>From:</strong> ${issuedByName || 'Management'}</div>
    </div>
    <div class="print-block">
      <strong>Subject:</strong> ${memo.subject}
    </div>
    <div class="print-block">
      <p>${memo.body.replace(/\n/g, '<br>')}</p>
    </div>
    ${signatureBlock(['Issued By', 'Received By'])}
  `;
  render(html);
}
