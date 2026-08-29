import { formatCurrency, formatDate, formatMonthLong, poTotal } from './utils.js';

function render(html) {
  const area = document.getElementById('printArea');
  area.innerHTML = html;
  window.print();
}

// Same as render(), but for documents with embedded map tile images — waits
// for every <image>/<img> to finish loading (or a 6s cap, so one slow/dead
// tile can't hang the print forever) before opening the print dialog,
// otherwise unloaded tiles would print as blank squares.
function renderAndWaitForImages(html) {
  const area = document.getElementById('printArea');
  area.innerHTML = html;
  const images = [...area.querySelectorAll('image, img')];
  const loaded = Promise.all(images.map((img) => new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
  })));
  const timeout = new Promise((resolve) => setTimeout(resolve, 6000));
  return Promise.race([loaded, timeout]).then(() => window.print());
}

function letterhead(docTitle, docNumber) {
  return `
    <div class="print-header">
      <img src="assets/logo.png" alt="Emagrims Ltd" class="print-logo">
      <div class="print-company">
        <h1>Emagrims Ltd</h1>
        <p>Your Dependable Agricultural Partner</p>
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
  const balance = netPay - (line.amountPaid || 0);
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
        <tr><td>Net Pay (Due)</td><td>${formatCurrency(netPay)}</td></tr>
        <tr><td>Amount Paid</td><td>${formatCurrency(line.amountPaid)}</td></tr>
      </tbody>
      <tfoot><tr><td>Balance</td><td>${formatCurrency(balance)}</td></tr></tfoot>
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

export function printWeeklyPerformanceReport(project, data) {
  const cumulativeTotal = data.cumulative.reduce((a, b) => a + b, 0);
  const html = `
    ${letterhead('WEEKLY PERFORMANCE REPORT', `${formatDate(data.periodStart)} – ${formatDate(data.periodEnd)}`)}
    <div class="print-meta-grid">
      <div><strong>Project:</strong> ${project}</div>
      <div><strong>Period:</strong> ${formatDate(data.periodStart)} – ${formatDate(data.periodEnd)}</div>
    </div>
    <table class="print-table">
      <thead>
        <tr>
          <th>Dozer</th><th>Type (Speed/Day)</th><th>Start</th><th>Close</th>
          ${data.dayLabels.map((d) => `<th>${d}</th>`).join('')}
          <th>Total</th><th>% Optimization</th><th>Planned</th><th>Actual</th>
        </tr>
      </thead>
      <tbody>
        ${data.rows.map((r) => `
          <tr>
            <td>${r.name}</td>
            <td>${r.speedByType.map((s) => `${s.type}: ${s.speed.toFixed(1)} ${s.unit}/day`).join('<br>') || '—'}</td>
            <td>${r.start || '—'}</td>
            <td>${r.close || '—'}</td>
            ${r.byDay.map((v) => `<td>${v ? v.toFixed(1) : '—'}</td>`).join('')}
            <td>${r.total.toFixed(1)}</td>
            <td>${r.optimizationPct.toFixed(0)}%</td>
            <td>${r.plannedDays}</td>
            <td>${r.actualDays}</td>
          </tr>
        `).join('')}
        <tr>
          <td><strong>Cumulative</strong></td>
          <td></td>
          <td><strong>${data.avgStart || '—'}</strong></td>
          <td><strong>${data.avgClose || '—'}</strong></td>
          ${data.cumulative.map((v) => `<td><strong>${v.toFixed(1)}</strong></td>`).join('')}
          <td><strong>${cumulativeTotal.toFixed(1)}</strong></td><td></td><td></td><td></td>
        </tr>
      </tbody>
    </table>
    <h3>Revenue</h3>
    <div class="print-block">
      <p>Quantity achieved this period × the contract rate in effect that day (Projects → Rate History) — provisional/expected revenue, not verified or invoiced revenue.</p>
    </div>
    <div class="print-meta-grid"><div><strong>Revenue:</strong> ${formatCurrency(data.revenueData.total)}</div></div>
    <table class="print-table">
      <thead><tr><th>Operation Type</th><th>Quantity</th><th>Revenue</th></tr></thead>
      <tbody>
        ${data.revenueData.byType.length ? data.revenueData.byType.map((t) => `
          <tr><td>${t.type}</td><td>${t.qty.toFixed(2)} ${t.unit}</td><td>${formatCurrency(t.revenue)}</td></tr>
        `).join('') : '<tr><td colspan="3">No operations logged for this project in this period yet.</td></tr>'}
      </tbody>
    </table>

    <h3>Cost &amp; Profit — Tentative (Field Estimate)</h3>
    <div class="print-block">
      <p>A quick field estimate using standard flat rates, not a full ledger reconciliation — see Profitability, Fuel Credit Tracking, and Dozer Rent Payments for the authoritative figures.</p>
    </div>
    <div class="print-meta-grid">
      <div><strong>Tentative Cost:</strong> ${formatCurrency(data.costData.total)}</div>
      <div><strong>Tentative Profit:</strong> ${formatCurrency(data.revenueData.total - data.costData.total)}</div>
    </div>
    <table class="print-table">
      <thead><tr><th>Cost Item</th><th>Basis</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>Rental Cost</td><td>Partnership/Rented: days × Rental Rate/Day. Company: hours × Hourly Rate.</td><td>${formatCurrency(data.costData.rentalCost)}</td></tr>
        <tr><td>Diesel Cost</td><td>Fuel Used × the diesel rate in effect that day</td><td>${formatCurrency(data.costData.dieselCost)}</td></tr>
        <tr><td>Site Logistics</td><td>₦12,800 × ${data.costData.workingDays} working day(s)</td><td>${formatCurrency(data.costData.siteLogistics)}</td></tr>
        <tr><td>Diesel Logistics</td><td>₦1,500 per 30L × ${data.costData.totalDieselLitres.toLocaleString()}L</td><td>${formatCurrency(data.costData.dieselLogistics)}</td></tr>
        <tr><td>Operator Cost</td><td>₦30,000 per 8 hrs worked (Company &amp; Partnership only)</td><td>${formatCurrency(data.costData.operatorCost)}</td></tr>
        <tr><td><strong>Tentative Cost</strong></td><td></td><td><strong>${formatCurrency(data.costData.total)}</strong></td></tr>
      </tbody>
    </table>
    <h4>Rental Cost — by Dozer</h4>
    <table class="print-table">
      <thead><tr><th>Dozer</th><th>Ownership</th><th>Basis</th><th>Cost</th></tr></thead>
      <tbody>
        ${data.costData.rentalBreakdown.length ? data.costData.rentalBreakdown.map((r) => `
          <tr><td>${r.name}</td><td>${r.ownership}</td><td>${r.basis}</td><td>${formatCurrency(r.cost)}</td></tr>
        `).join('') : '<tr><td colspan="4">No dozer on this roster has a rate set, or none worked this period.</td></tr>'}
      </tbody>
    </table>
    <h4>Diesel Cost — by Day</h4>
    <table class="print-table">
      <thead><tr><th>Date</th><th>Litres Used</th><th>Rate/L</th><th>Cost</th></tr></thead>
      <tbody>
        ${data.costData.dieselBreakdown.length ? data.costData.dieselBreakdown.map((d) => `
          <tr><td>${formatDate(d.date)}</td><td>${d.litres.toLocaleString()} L</td><td>${formatCurrency(d.rate)}</td><td>${formatCurrency(d.cost)}</td></tr>
        `).join('') : '<tr><td colspan="4">No fuel logged for this project in this period.</td></tr>'}
      </tbody>
    </table>

    <h3>Cost &amp; Profit — Actual (Ledger-Based)</h3>
    <div class="print-block">
      <p>Dozer Cost uses hours worked × hourly rate for every dozer on the roster (Profitability's standard formula) — a different figure from Tentative Cost's Rental Cost above. Not a full ledger reconciliation either — see Profitability for the company-wide authoritative figures.</p>
    </div>
    <div class="print-meta-grid">
      <div><strong>Total Cost:</strong> ${formatCurrency(data.actualData.totalCost)}</div>
      <div><strong>Actual Profit:</strong> ${formatCurrency(data.actualData.actualProfit)} (${data.actualData.actualProfitPct.toFixed(0)}%)</div>
      <div><strong>Total Margin:</strong> ${formatCurrency(data.actualData.totalMargin)}</div>
    </div>
    <table class="print-table">
      <thead><tr><th>Cost Item</th><th>Basis</th><th>Amount</th><th>% of Total</th></tr></thead>
      <tbody>
        <tr><td>Diesel Cost</td><td>Fuel Used × the diesel rate in effect that day</td><td>${formatCurrency(data.actualData.dieselCost)}</td><td>${data.actualData.totalCost ? `${((data.actualData.dieselCost / data.actualData.totalCost) * 100).toFixed(1)}%` : '—'}</td></tr>
        <tr><td>Dozer Cost</td><td>Hours Worked × the hourly rate on file for each dozer</td><td>${formatCurrency(data.actualData.dozerCost)}</td><td>${data.actualData.totalCost ? `${((data.actualData.dozerCost / data.actualData.totalCost) * 100).toFixed(1)}%` : '—'}</td></tr>
        <tr><td>Logistics &amp; Others</td><td>This project's Logistics/other expenses this period</td><td>${formatCurrency(data.actualData.logisticsOthersCost)}</td><td>${data.actualData.totalCost ? `${((data.actualData.logisticsOthersCost / data.actualData.totalCost) * 100).toFixed(1)}%` : '—'}</td></tr>
        <tr><td><strong>Total Cost</strong></td><td></td><td><strong>${formatCurrency(data.actualData.totalCost)}</strong></td><td>100%</td></tr>
      </tbody>
    </table>
    <p>Total Litres of Diesel Used: ${data.actualData.totalDieselLitres.toLocaleString()} L</p>

    <h4>Machine Recovery</h4>
    <div class="print-block">
      <p>The Management Fee retained on Partnership/Rented dozers, plus money saved by using Company-owned dozers instead of renting equivalent capacity (hours worked × Hourly Rate) — net of the roster's Maintenance Log cost this period. Maintenance Incurred here is informational, not part of Total Cost above (it's already excluded there to avoid double-counting).</p>
    </div>
    <table class="print-table">
      <tbody>
        <tr><td>M/c Recovered</td><td>${formatCurrency(data.actualData.mcRecovered)}</td></tr>
        <tr><td>Maintenance Incurred</td><td>-${formatCurrency(data.actualData.maintenanceIncurred)}</td></tr>
        <tr><td><strong>Net M/c Recovered</strong></td><td><strong>${formatCurrency(data.actualData.netMcRecovered)}</strong></td></tr>
        <tr><td><strong>Total Margin (Actual Profit + Net M/c Recovered)</strong></td><td><strong>${formatCurrency(data.actualData.totalMargin)}</strong></td></tr>
      </tbody>
    </table>

    <h4>Daily Summary</h4>
    <table class="print-table">
      <thead><tr><th>Date</th><th>No of Dozers</th><th>Revenue</th><th>Cost</th><th>Profit</th></tr></thead>
      <tbody>
        ${data.actualData.dailyRows.map((d) => `
          <tr>
            <td>${d.label}</td>
            <td>${d.dozers}</td>
            <td>${d.revenue ? formatCurrency(d.revenue) : '—'}</td>
            <td>${d.cost ? formatCurrency(d.cost) : '—'}</td>
            <td>${(d.revenue || d.cost) ? formatCurrency(d.profit) : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
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

export function printDieselReplenishmentRequest(forDate, rows, { station, requestedByName } = {}) {
  const totalLitres = rows.reduce((sum, r) => sum + r.litres, 0);
  const html = `
    ${letterhead('DIESEL REQUEST', formatDate(forDate))}
    <div class="print-block"><p><strong>FOR TOMORROW'S OPERATION — ${formatDate(forDate)}</strong></p></div>
    <div class="print-block">
      ${rows.map((r) => `<p>${r.name} — ${r.litres.toLocaleString()} Litre's</p>`).join('')}
      <p><strong>▪️ TOTAL — ${totalLitres.toLocaleString()} Litre's</strong></p>
    </div>
    <div class="print-meta-grid">
      <div><strong>Station:</strong> ${station || '—'}</div>
      <div><strong>Staff:</strong> ${requestedByName || '—'}</div>
    </div>
    <div class="print-block">
      <p>Please kindly approve for tomorrow's operation.</p>
      <p>Thank you.</p>
    </div>
    ${signatureBlock(['Requested By', 'Approved By'])}
  `;
  render(html);
}

export function printLoanStatement(loan, repayments) {
  const interest = loan.total - loan.principal;
  const html = `
    ${letterhead('LOAN STATEMENT', loan.id)}
    <div class="print-meta-grid">
      <div><strong>Lender / Source:</strong> ${loan.lender}</div>
      <div><strong>Category:</strong> ${loan.category}</div>
      <div><strong>Date Taken:</strong> ${formatDate(loan.dateTaken)}</div>
      <div><strong>Interest Type:</strong> ${loan.interestType}</div>
      <div><strong>Due Date:</strong> ${loan.dueDate ? formatDate(loan.dueDate) : '—'}</div>
      <div><strong>Status:</strong> ${loan.status}</div>
      ${loan.linkedProject ? `<div><strong>Linked Project:</strong> ${loan.linkedProject}</div>` : ''}
    </div>
    <table class="print-table">
      <thead><tr><th>Item</th><th>Amount</th></tr></thead>
      <tbody>
        <tr><td>Principal</td><td>${formatCurrency(loan.principal)}</td></tr>
        <tr><td>Interest</td><td>${formatCurrency(interest)}</td></tr>
      </tbody>
      <tfoot><tr><td>Total Owed</td><td>${formatCurrency(loan.total)}</td></tr></tfoot>
    </table>
    <table class="print-table">
      <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
      <tbody>
        ${repayments.length ? repayments.map((r) => `
          <tr>
            <td>${formatDate(r.date)}</td>
            <td>${formatCurrency(r.amount)}</td>
            <td>${r.method || '—'}</td>
            <td>${r.reference || '—'}</td>
          </tr>
        `).join('') : '<tr><td colspan="4">No repayments logged yet.</td></tr>'}
      </tbody>
      <tfoot><tr><td colspan="3">Total Repaid</td><td>${formatCurrency(loan.repaid)}</td></tr></tfoot>
    </table>
    <div class="print-block">
      <strong>Outstanding Balance:</strong> ${formatCurrency(loan.outstanding)}
    </div>
    ${loan.notes ? `<div class="print-block"><strong>Notes:</strong><p>${loan.notes}</p></div>` : ''}
    ${signatureBlock(['Prepared By', 'Authorized Signature'])}
  `;
  render(html);
}

// A running statement across every Approved/Paid payroll period for one
// employee — what's been earned vs. what's actually been paid, period by
// period, with a cumulative running balance. Rows are pre-sorted oldest
// first (like a bank statement) and each already carries its own balance
// (Net Pay minus Amount Paid, summed with every prior period's balance) —
// computed once in mySalary.js/payroll.js rather than re-derived here, so
// the screen and the printout can never disagree on the running total.
export function printSalaryStatement(employeeName, rows) {
  const totalDue = rows.reduce((sum, r) => sum + r.netPay, 0);
  const totalPaid = rows.reduce((sum, r) => sum + r.amountPaid, 0);
  const outstanding = totalDue - totalPaid;
  const html = `
    ${letterhead('SALARY STATEMENT', employeeName)}
    <div class="print-meta-grid">
      <div><strong>Employee:</strong> ${employeeName}</div>
      <div><strong>Periods Covered:</strong> ${rows.length}</div>
    </div>
    <table class="print-table">
      <thead><tr><th>Pay Period</th><th>Base Salary</th><th>Bonus</th><th>Deductions</th><th>Net Pay (Due)</th><th>Paid</th><th>Running Balance</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((r) => `
          <tr>
            <td>${formatMonthLong(r.month)}</td>
            <td>${formatCurrency(r.baseSalary)}</td>
            <td>${formatCurrency(r.bonus)}</td>
            <td>-${formatCurrency(r.deductions)}</td>
            <td>${formatCurrency(r.netPay)}</td>
            <td>${formatCurrency(r.amountPaid)}</td>
            <td>${formatCurrency(r.runningBalance)}</td>
          </tr>
        `).join('') : '<tr><td colspan="7">No Approved/Paid payroll periods yet.</td></tr>'}
      </tbody>
      <tfoot><tr><td colspan="4">Total</td><td>${formatCurrency(totalDue)}</td><td>${formatCurrency(totalPaid)}</td><td>${formatCurrency(outstanding)}</td></tr></tfoot>
    </table>
    <div class="print-block">
      <strong>Outstanding Balance:</strong> ${formatCurrency(outstanding)}
    </div>
    ${signatureBlock(['Employee Signature', 'Authorized Signature'])}
  `;
  render(html);
}

export function printDieselStationReport(station, from, to, rows) {
  const totalLitres = rows.reduce((sum, r) => sum + (r.litres || 0), 0);
  const totalCost = rows.reduce((sum, r) => sum + (r.litres || 0) * (r.unitCost || 0), 0);
  const periodLabel = (from || to) ? `${from ? formatDate(from) : 'Start'} – ${to ? formatDate(to) : 'Present'}` : 'All Time';
  const html = `
    ${letterhead('DIESEL RECEIPTS REPORT', station || 'All Stations')}
    <div class="print-meta-grid">
      <div><strong>Station:</strong> ${station || 'All Stations'}</div>
      <div><strong>Period:</strong> ${periodLabel}</div>
      <div><strong>Receipts:</strong> ${rows.length}</div>
    </div>
    <table class="print-table">
      <thead><tr><th>Date</th><th>Litres</th><th>Unit Cost</th><th>Total Cost</th><th>Supplier</th><th>Reference</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((r) => `
          <tr>
            <td>${formatDate(r.date)}</td>
            <td>${(r.litres || 0).toLocaleString()} L</td>
            <td>${formatCurrency(r.unitCost)}</td>
            <td>${formatCurrency((r.litres || 0) * (r.unitCost || 0))}</td>
            <td>${r.supplier || '—'}</td>
            <td>${r.reference || '—'}</td>
          </tr>
        `).join('') : '<tr><td colspan="6">No receipts in this range.</td></tr>'}
      </tbody>
      <tfoot><tr><td>Total</td><td>${totalLitres.toLocaleString()} L</td><td></td><td>${formatCurrency(totalCost)}</td><td colspan="2"></td></tr></tfoot>
    </table>
  `;
  render(html);
}

// Fixed distinguishable colors first (same hues used elsewhere on the map),
// then a hue rotation for any entry count beyond that so a long date range
// never runs out of distinct colors.
const MAP_KEY_COLORS = ['#2a78d6', '#1baf7a', '#eda100', '#e34948', '#6c5ce7', '#b5842a', '#e87ba4', '#12a4a4', '#4a3aa7', '#eb6834'];
function colorForIndex(i) {
  if (i < MAP_KEY_COLORS.length) return MAP_KEY_COLORS[i];
  return `hsl(${(i * 47) % 360}, 65%, 45%)`;
}

// Standard Web Mercator slippy-map tile math (same projection Leaflet/OSM
// use), so the printed map lines up tile-for-tile with the on-screen one
// instead of a synthetic projection of our own.
const TILE_SIZE = 256;
function lonToTileX(lon, z) { return ((lon + 180) / 360) * (1 << z); }
function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * (1 << z);
}
// Highest zoom (most detail) whose bounding box still fits inside the
// target pixel box — mirrors what Leaflet's fitBounds picks.
function chooseZoom(minLat, maxLat, minLng, maxLng, targetW, targetH) {
  for (let z = 18; z >= 2; z -= 1) {
    const spanXpx = (lonToTileX(maxLng, z) - lonToTileX(minLng, z)) * TILE_SIZE;
    const spanYpx = (latToTileY(minLat, z) - latToTileY(maxLat, z)) * TILE_SIZE;
    if (spanXpx <= targetW && spanYpx <= targetH) return z;
  }
  return 2;
}

// Real OpenStreetMap imagery (vegetation cover, roads, administrative
// borders) as the background, with the KML boundaries drawn on top in the
// same Web Mercator pixel space — same source and projection as the
// on-screen map, so the printout matches what's shown live. Loading tiles
// is a plain cross-origin image fetch (no canvas rasterization involved),
// so it needs no CORS support from the tile server.
function buildMapSvg(entries) {
  const allCoords = entries.flatMap((e) => e.geometries.flatMap((g) => g.coords));
  if (!allCoords.length) return '';

  const lats = allCoords.map((c) => c[0]);
  const lngs = allCoords.map((c) => c[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const width = 720;
  const height = 460;
  const z = chooseZoom(minLat, maxLat, minLng, maxLng, width * 0.8, height * 0.8);

  const pxMinX = lonToTileX(minLng, z) * TILE_SIZE;
  const pxMaxX = lonToTileX(maxLng, z) * TILE_SIZE;
  const pxMinY = latToTileY(maxLat, z) * TILE_SIZE;
  const pxMaxY = latToTileY(minLat, z) * TILE_SIZE;
  const spanPxX = Math.max(pxMaxX - pxMinX, 1);
  const spanPxY = Math.max(pxMaxY - pxMinY, 1);
  const offX = (width - spanPxX) / 2 - pxMinX;
  const offY = (height - spanPxY) / 2 - pxMinY;

  function project([lat, lng]) {
    const x = lonToTileX(lng, z) * TILE_SIZE + offX;
    const y = latToTileY(lat, z) * TILE_SIZE + offY;
    return [x.toFixed(1), y.toFixed(1)];
  }

  const maxTileIndex = (1 << z) - 1;
  const tileXStart = Math.max(Math.floor(-offX / TILE_SIZE), 0);
  const tileXEnd = Math.min(Math.floor((width - offX) / TILE_SIZE), maxTileIndex);
  const tileYStart = Math.max(Math.floor(-offY / TILE_SIZE), 0);
  const tileYEnd = Math.min(Math.floor((height - offY) / TILE_SIZE), maxTileIndex);

  const tiles = [];
  for (let tx = tileXStart; tx <= tileXEnd; tx += 1) {
    for (let ty = tileYStart; ty <= tileYEnd; ty += 1) {
      const px = tx * TILE_SIZE + offX;
      const py = ty * TILE_SIZE + offY;
      tiles.push(`<image href="https://tile.openstreetmap.org/${z}/${tx}/${ty}.png" x="${px}" y="${py}" width="${TILE_SIZE}" height="${TILE_SIZE}" />`);
    }
  }

  const shapes = entries.map((e) => e.geometries.map((g) => {
    const pts = g.coords.map(project);
    if (g.type === 'Polygon') {
      return `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${e.color}" fill-opacity="0.35" stroke="${e.color}" stroke-width="2" />`;
    }
    if (g.type === 'LineString') {
      return `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${e.color}" stroke-width="3" />`;
    }
    const [x, y] = pts[0];
    return `<circle cx="${x}" cy="${y}" r="5" fill="${e.color}" stroke="#fff" stroke-width="1" />`;
  }).join('')).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" class="print-map-svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#dce6dc" stroke="#14261c" stroke-width="1" />
      ${tiles.join('')}
      ${shapes}
    </svg>
  `;
}

// Shoelace polygon area over a simple equirectangular projection (accurate
// enough for a single site's extent) — treats every LineString/Polygon
// geometry as a closed loop, since that's how these field-survey files are
// actually used here (walk the perimeter, GPS logs a near-closed path).
// Points contribute nothing (no enclosed area). Sums across every geometry
// in the entry rather than one combined shoelace pass, so a file with more
// than one placemark doesn't corrupt the result by treating disjoint loops
// as a single polygon.
function measuredAreaHa(geometries) {
  const lats = geometries.flatMap((g) => g.coords.map((c) => c[0]));
  if (!lats.length) return 0;
  const lat0 = lats.reduce((a, b) => a + b, 0) / lats.length;
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const toXY = ([lat, lng]) => [lng * 111320 * cos, lat * 111320];
  let totalSqM = 0;
  geometries.forEach((g) => {
    if (g.type === 'Point' || g.coords.length < 3) return;
    const xy = g.coords.map(toXY);
    let area = 0;
    for (let i = 0; i < xy.length; i += 1) {
      const [x1, y1] = xy[i];
      const [x2, y2] = xy[(i + 1) % xy.length];
      area += x1 * y2 - x2 * y1;
    }
    totalSqM += Math.abs(area) / 2;
  });
  return totalSqM / 10000;
}

// Two entries carry the exact same measured boundary whenever a field crew
// attaches one shared file to more than one dozer's record (e.g. a boundary
// walked once for two dozers working the same block) — this fingerprints
// an entry's geometries so those duplicates can be detected instead of
// having their area double-counted once per record that references them.
function geometryFingerprint(geometries) {
  return JSON.stringify(geometries.map((g) => [g.type, g.coords.map(([lat, lng]) => [Math.round(lat * 1e6), Math.round(lng * 1e6)])]));
}

// Draws every KML boundary in the filtered date range over real OpenStreetMap
// imagery (vegetation cover, roads, administrative borders — see
// buildMapSvg). Color is assigned per DAY, not per record, so every
// boundary worked on the same date — however many dozers contributed to it —
// shares one color both on the map and in the key. A small Date Key sits
// above the detail table (Date, Operator, Equipment, Operation, Reported,
// Measured, Variance) — Measured is the shoelace-enclosed area of the
// boundary itself (measuredAreaHa), shown only for Ha-unit operation types
// since a KM/hrs figure isn't an enclosed area to measure; Reported is the
// quantity actually logged on the Daily Operations record. When two or more
// records share the identical attached file (same fingerprint), Measured is
// only counted once toward the Total (not once per record), and each of
// those rows' Variance compares against the group's combined Reported total
// rather than that one record's Reported alone — otherwise a shared file
// would look like a huge mismatch on every row that references it, when
// it's actually one boundary correctly covering several dozers' combined
// work. Total Reported/Measured are only shown when every entry shares one
// unit (Ha vs KM vs hrs can't be meaningfully summed together). Async
// because it waits for the map tiles to finish loading before opening the
// print dialog — otherwise they'd print blank.
export async function printOperationsMap(entries, { from, to, site } = {}) {
  const periodLabel = (from || to) ? `${from ? formatDate(from) : 'Start'} – ${to ? formatDate(to) : 'Present'}` : 'All Dates';
  const withGeo = entries.filter((e) => e.geometries.length);
  const dates = [...new Set(withGeo.map((e) => e.date))].sort();
  const colorForDate = Object.fromEntries(dates.map((d, i) => [d, colorForIndex(i)]));
  const colored = withGeo
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((e) => ({ ...e, color: colorForDate[e.date], measuredHa: e.unit === 'Ha' ? measuredAreaHa(e.geometries) : null }));

  // Group by shared geometry so duplicate-file records are only counted once.
  const groupByFingerprint = new Map();
  colored.filter((e) => e.measuredHa !== null).forEach((e) => {
    const fp = geometryFingerprint(e.geometries);
    if (!groupByFingerprint.has(fp)) groupByFingerprint.set(fp, { measuredHa: e.measuredHa, reportedSum: 0 });
    groupByFingerprint.get(fp).reportedSum += Number(e.quantity) || 0;
  });
  colored.forEach((e) => {
    if (e.measuredHa === null) return;
    const group = groupByFingerprint.get(geometryFingerprint(e.geometries));
    e.groupVariance = e.measuredHa - group.reportedSum;
  });

  const svg = buildMapSvg(colored);
  const units = new Set(colored.map((e) => e.unit).filter(Boolean));
  const totalReportedLabel = units.size === 1
    ? `${colored.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0).toFixed(2)} ${[...units][0]}`
    : '—';
  const distinctGroups = [...groupByFingerprint.values()];
  const totalMeasuredLabel = distinctGroups.length && units.size === 1
    ? `${distinctGroups.reduce((sum, g) => sum + g.measuredHa, 0).toFixed(2)} Ha`
    : '—';

  const html = `
    ${letterhead('OPERATIONS MAP', periodLabel)}
    <div class="print-meta-grid">
      <div><strong>Period:</strong> ${periodLabel}</div>
      <div><strong>Site:</strong> ${site || 'All Sites'}</div>
      <div><strong>Boundaries Mapped:</strong> ${colored.length}</div>
    </div>
    ${svg ? `<div class="print-map-frame">${svg}<p class="print-map-attribution">Map data © OpenStreetMap contributors</p></div>` : '<div class="print-block"><p>No KML boundaries found for these filters.</p></div>'}
    ${dates.length ? `
      <div class="print-block">
        <strong>Date Key:</strong>
        ${dates.map((d) => `<span class="print-map-key-item"><span class="print-map-swatch" style="background:${colorForDate[d]}"></span> ${formatDate(d)}</span>`).join(' ')}
      </div>
    ` : ''}
    <table class="print-table">
      <thead><tr><th></th><th>Date</th><th>Operator</th><th>Equipment</th><th>Operation</th><th>Reported</th><th>Measured (KML)</th><th>Variance</th></tr></thead>
      <tbody>
        ${colored.length ? colored.map((e) => `
          <tr>
            <td><span class="print-map-swatch" style="background:${e.color}"></span></td>
            <td>${formatDate(e.date)}</td>
            <td>${e.operatorName || 'Unknown'}</td>
            <td>${e.equipment || '—'}</td>
            <td>${e.operationType || '—'}</td>
            <td>${e.quantity ?? '—'} ${e.unit || ''}</td>
            <td>${e.measuredHa === null ? '—' : `${e.measuredHa.toFixed(2)} Ha`}</td>
            <td>${e.measuredHa === null ? '—' : `${(e.groupVariance >= 0 ? '+' : '')}${e.groupVariance.toFixed(2)} Ha`}</td>
          </tr>
        `).join('') : '<tr><td colspan="8">No boundaries in this range.</td></tr>'}
      </tbody>
      <tfoot><tr><td colspan="5">Total</td><td>${totalReportedLabel}</td><td>${totalMeasuredLabel}</td><td></td></tr></tfoot>
    </table>
    ${distinctGroups.length ? '<div class="print-block"><p>Measured (KML) is the enclosed area of the boundary walked/driven with GPS, computed directly from the attached KML/GPX file — an independent check against the Reported figure from the Daily Operations record, not a replacement for it. When two or more records share the same attached file (one boundary covering several dozers\' combined work), Measured is only counted once in the Total, and Variance compares against that group\'s combined Reported total rather than any single record\'s Reported alone.</p></div>' : ''}
  `;
  await renderAndWaitForImages(html);
}

// One row per project (or a single row when one project is selected) —
// same figures as the Profitability screen: Provisional Revenue (quantity x
// the contract rate in effect that day, straight from Daily Operations,
// whether invoiced yet or not) alongside Verified Revenue (actual invoices
// tagged to the project) and the cost/profit breakdown. Profit/Margin stay
// based on Verified Revenue only, matching the on-screen rule.
export function printProfitabilityReport(stats, { from, to, projectLabel } = {}) {
  const periodLabel = (from || to) ? `${from ? formatDate(from) : 'Start'} – ${to ? formatDate(to) : 'Present'}` : 'All Time';
  const totals = stats.reduce((acc, s) => ({
    areaCleared: acc.areaCleared + s.areaCleared,
    provisionalRevenue: acc.provisionalRevenue + s.provisionalRevenue,
    revenue: acc.revenue + s.revenue,
    dozerCost: acc.dozerCost + s.dozerCost,
    dieselCost: acc.dieselCost + s.dieselCost,
    logisticsCost: acc.logisticsCost + s.logisticsCost,
    otherCost: acc.otherCost + s.otherCost,
    totalCost: acc.totalCost + s.totalCost,
    profit: acc.profit + s.profit,
  }), { areaCleared: 0, provisionalRevenue: 0, revenue: 0, dozerCost: 0, dieselCost: 0, logisticsCost: 0, otherCost: 0, totalCost: 0, profit: 0 });
  const totalMargin = totals.revenue ? (totals.profit / totals.revenue) * 100 : null;

  const html = `
    ${letterhead('PROFITABILITY REPORT', periodLabel)}
    <div class="print-meta-grid">
      <div><strong>Project:</strong> ${projectLabel || 'All Projects'}</div>
      <div><strong>Period:</strong> ${periodLabel}</div>
    </div>
    <table class="print-table">
      <thead>
        <tr>
          <th>Project</th><th>Area Cleared</th><th>Provisional Revenue</th><th>Verified Revenue</th>
          <th>Dozer Cost</th><th>Diesel Cost</th><th>Logistics Cost</th><th>Other Cost</th>
          <th>Total Cost</th><th>Profit</th><th>Margin</th>
        </tr>
      </thead>
      <tbody>
        ${stats.length ? stats.map((s) => `
          <tr>
            <td>${s.project}</td>
            <td>${s.areaCleared.toFixed(1)} ha</td>
            <td>${formatCurrency(s.provisionalRevenue)}</td>
            <td>${formatCurrency(s.revenue)}</td>
            <td>${formatCurrency(s.dozerCost)}</td>
            <td>${formatCurrency(s.dieselCost)}</td>
            <td>${formatCurrency(s.logisticsCost)}</td>
            <td>${formatCurrency(s.otherCost)}</td>
            <td>${formatCurrency(s.totalCost)}</td>
            <td>${formatCurrency(s.profit)}</td>
            <td>${s.margin === null ? '—' : `${s.margin.toFixed(0)}%`}</td>
          </tr>
        `).join('') : '<tr><td colspan="11">No projects to show.</td></tr>'}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>${totals.areaCleared.toFixed(1)} ha</td>
          <td>${formatCurrency(totals.provisionalRevenue)}</td>
          <td>${formatCurrency(totals.revenue)}</td>
          <td>${formatCurrency(totals.dozerCost)}</td>
          <td>${formatCurrency(totals.dieselCost)}</td>
          <td>${formatCurrency(totals.logisticsCost)}</td>
          <td>${formatCurrency(totals.otherCost)}</td>
          <td>${formatCurrency(totals.totalCost)}</td>
          <td>${formatCurrency(totals.profit)}</td>
          <td>${totalMargin === null ? '—' : `${totalMargin.toFixed(0)}%`}</td>
        </tr>
      </tfoot>
    </table>
    <div class="print-block">
      <p>Provisional Revenue is quantity x the contract rate in effect that day, straight from Daily Operations reports — a same-day figure, whether or not it has been invoiced yet. Verified Revenue and Logistics/Other costs only include invoices and expenses explicitly tagged to a project. Profit and Margin are based on Verified Revenue only.</p>
    </div>
  `;
  render(html);
}

// Day-by-day fuel credit statement for one station: a single Brought
// Forward line (every collection/payment before the period, netted to one
// opening balance), then one row per day with activity in the period —
// Diesel/PMS litres collected, amount collected, amount paid, and the
// running balance after that day — ending in the Outstanding Balance.
// A day whose only "collection" is a ledger adjustment (opening-balance or
// gap-fill entry, not a real fuel pickup) shows as "Balance Adjustment"
// rather than a nonsensical "1 L".
export function printFuelCreditStatement(station, { broughtForward, rows, closingBalance }, { from, to }) {
  const periodLabel = `${formatDate(from)} – ${formatDate(to)}`;
  const html = `
    ${letterhead('FUEL CREDIT STATEMENT', station)}
    <div class="print-meta-grid">
      <div><strong>Station:</strong> ${station}</div>
      <div><strong>Period:</strong> ${periodLabel}</div>
    </div>
    <table class="print-table">
      <thead><tr><th>Date</th><th>Diesel</th><th>PMS</th><th>Collected</th><th>Paid</th><th>Balance</th></tr></thead>
      <tbody>
        <tr><td><strong>Brought Forward</strong></td><td>—</td><td>—</td><td>—</td><td>—</td><td><strong>${formatCurrency(broughtForward)}</strong></td></tr>
        ${rows.length ? rows.map((r) => `
          <tr>
            <td>${formatDate(r.date)}</td>
            <td>${r.isAdjustment ? '—' : (r.dieselLitres ? `${r.dieselLitres.toLocaleString()} L` : '—')}</td>
            <td>${r.isAdjustment ? '—' : (r.pmsLitres ? `${r.pmsLitres.toLocaleString()} L` : '—')}</td>
            <td>${r.isAdjustment ? `${formatCurrency(r.collectedAmount)} (Balance Adjustment)` : (r.collectedAmount ? formatCurrency(r.collectedAmount) : '—')}</td>
            <td>${r.paidAmount ? formatCurrency(r.paidAmount) : '—'}</td>
            <td>${formatCurrency(r.runningBalance)}</td>
          </tr>
        `).join('') : '<tr><td colspan="6">No collections or payments in this period.</td></tr>'}
      </tbody>
      <tfoot><tr><td colspan="5">Outstanding Balance</td><td>${formatCurrency(closingBalance)}</td></tr></tfoot>
    </table>
    <div class="print-block">
      <p>Brought Forward is every collection and payment on record for this station dated before the period, netted to one opening balance. Balance is a running total (collected minus paid), carried forward day by day.</p>
    </div>
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
