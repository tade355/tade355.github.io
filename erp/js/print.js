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

// Plain equirectangular projection with a longitude correction for the
// entry set's mid-latitude — accurate enough for a single site's extent
// (a few hundred meters to a few km) and needs no basemap tiles, so it
// prints cleanly with no external image fetches or CORS concerns.
function buildMapSvg(entries) {
  const allCoords = entries.flatMap((e) => e.geometries.flatMap((g) => g.coords));
  if (!allCoords.length) return '';

  const lats = allCoords.map((c) => c[0]);
  const lngs = allCoords.map((c) => c[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const cos = Math.max(Math.cos(((minLat + maxLat) / 2) * Math.PI / 180), 0.01);

  const width = 720;
  const height = 460;
  const pad = 24;
  const spanX = Math.max((maxLng - minLng) * cos, 0.0005);
  const spanY = Math.max(maxLat - minLat, 0.0005);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;

  function project([lat, lng]) {
    const x = offX + (lng - minLng) * cos * scale;
    const y = offY + (maxLat - lat) * scale;
    return [x.toFixed(1), y.toFixed(1)];
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
    <svg viewBox="0 0 ${width} ${height}" class="print-map-svg" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#eef3ee" stroke="#14261c" stroke-width="1" />
      ${shapes}
    </svg>
  `;
}

// Draws every KML boundary in the filtered date range as a plain SVG map
// (no basemap — see buildMapSvg) with each entry colored distinctly, and a
// key table beneath it: Date, Operator, Equipment, Operation, Size. Total
// Size is only shown when every entry shares one unit (Ha vs KM vs hrs
// can't be meaningfully summed together).
export function printOperationsMap(entries, { from, to, site } = {}) {
  const periodLabel = (from || to) ? `${from ? formatDate(from) : 'Start'} – ${to ? formatDate(to) : 'Present'}` : 'All Dates';
  const withGeo = entries.filter((e) => e.geometries.length);
  const colored = withGeo
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((e, i) => ({ ...e, color: colorForIndex(i) }));
  const svg = buildMapSvg(colored);
  const units = new Set(colored.map((e) => e.unit).filter(Boolean));
  const totalLabel = units.size === 1
    ? `${colored.reduce((sum, e) => sum + (Number(e.quantity) || 0), 0).toFixed(2)} ${[...units][0]}`
    : '—';

  const html = `
    ${letterhead('OPERATIONS MAP', periodLabel)}
    <div class="print-meta-grid">
      <div><strong>Period:</strong> ${periodLabel}</div>
      <div><strong>Site:</strong> ${site || 'All Sites'}</div>
      <div><strong>Boundaries Mapped:</strong> ${colored.length}</div>
    </div>
    ${svg ? `<div class="print-map-frame">${svg}</div>` : '<div class="print-block"><p>No KML boundaries found for these filters.</p></div>'}
    <table class="print-table">
      <thead><tr><th></th><th>Date</th><th>Operator</th><th>Equipment</th><th>Operation</th><th>Size</th></tr></thead>
      <tbody>
        ${colored.length ? colored.map((e) => `
          <tr>
            <td><span class="print-map-swatch" style="background:${e.color}"></span></td>
            <td>${formatDate(e.date)}</td>
            <td>${e.operatorName || 'Unknown'}</td>
            <td>${e.equipment || '—'}</td>
            <td>${e.operationType || '—'}</td>
            <td>${e.quantity ?? '—'} ${e.unit || ''}</td>
          </tr>
        `).join('') : '<tr><td colspan="6">No boundaries in this range.</td></tr>'}
      </tbody>
      <tfoot><tr><td colspan="5">Total</td><td>${totalLabel}</td></tr></tfoot>
    </table>
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
