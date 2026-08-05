import { store } from '../store.js';
import { formatCurrency, formatDate, el, invoiceTotal } from '../utils.js';
import { sectionHeader, statCard, renderTable, statusPill } from '../ui.js';
import { OPERATION_TYPES, unitForOperationType } from '../constants.js';
import { reportedForSlice, invoicedForSlice, unclassifiedInvoicedForSlice, varianceStatus } from '../revenueReconciliation.js';
import { amountReceived, amountOutstanding, agingDays } from '../invoicePayments.js';

export function renderRevenueReconciliation(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader(
    'Revenue Reconciliation',
    'Provisional revenue (from Daily Operations reports, same-day) vs Verified revenue (from client-approved invoices) — and separately, how much of what was invoiced has actually been paid.',
  ));

  const filterBar = el('div', { class: 'filter-bar' });
  const projectSelect = el('select', {}, [
    el('option', { value: 'all' }, 'All Projects'),
    ...store.get('projects').map((p) => el('option', { value: p.name }, p.name)),
  ]);
  const fromInput = el('input', { type: 'date' });
  const toInput = el('input', { type: 'date' });
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Project'), projectSelect]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), fromInput]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), toInput]));
  container.appendChild(filterBar);

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Revenue Reconciliation'));
  const matrixContainer = el('div');
  container.appendChild(matrixContainer);
  const unclassifiedSlot = el('div');
  container.appendChild(unclassifiedSlot);

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Payment Tracking'));
  const paymentStatsGrid = el('div', { class: 'stats-grid' });
  container.appendChild(paymentStatsGrid);
  const paymentsContainer = el('div');
  container.appendChild(paymentsContainer);

  function projectsInScope() {
    return projectSelect.value === 'all' ? store.get('projects').map((p) => p.name) : [projectSelect.value];
  }

  function refreshMatrix() {
    const from = fromInput.value;
    const to = toInput.value;
    const rows = [];
    projectsInScope().forEach((project) => {
      OPERATION_TYPES.forEach(({ value: operationType }) => {
        const reported = reportedForSlice({ project, operationType, from, to });
        const invoiced = invoicedForSlice({ project, operationType, from, to });
        if (!reported.reportCount && !invoiced.invoiceCount) return;
        const qtyVariance = varianceStatus(reported.qty, invoiced.qty, 1);
        const revenueVariance = varianceStatus(reported.revenue, invoiced.revenue, 10000);
        rows.push({ project, operationType, reported, invoiced, qtyVariance, revenueVariance });
      });
    });

    renderTable(matrixContainer, {
      columns: [
        { key: 'project', label: 'Project' },
        { key: 'operationType', label: 'Operation Type' },
        { key: 'reportedQty', label: 'Reported Qty', render: (r) => `${r.reported.qty.toLocaleString()} ${unitForOperationType(r.operationType)}` },
        { key: 'reportedRevenue', label: 'Reported Revenue', render: (r) => formatCurrency(r.reported.revenue) },
        { key: 'invoicedQty', label: 'Invoiced Qty', render: (r) => `${r.invoiced.qty.toLocaleString()} ${unitForOperationType(r.operationType)}` },
        { key: 'invoicedRevenue', label: 'Invoiced Revenue', render: (r) => formatCurrency(r.invoiced.revenue) },
        {
          key: 'qtyVariance',
          label: 'Qty Variance',
          render: (r) => (r.qtyVariance.variance === null ? statusPill(r.qtyVariance.status) : el('span', {}, [
            `${r.qtyVariance.variance > 0 ? '+' : ''}${r.qtyVariance.variance.toLocaleString()} `,
            statusPill(r.qtyVariance.status),
          ])),
        },
        {
          key: 'revenueVariance',
          label: 'Revenue Variance',
          render: (r) => (r.revenueVariance.variance === null ? statusPill(r.revenueVariance.status) : el('span', {}, [
            `${r.revenueVariance.variance > 0 ? '+' : ''}${formatCurrency(r.revenueVariance.variance)} `,
            statusPill(r.revenueVariance.status),
          ])),
        },
      ],
      rows,
      emptyText: 'No Daily Operations reports or invoices with an Operation Type in this range yet.',
      rowClass: (r) => {
        const worst = [r.qtyVariance.status, r.revenueVariance.status];
        if (worst.includes('Variance')) return 'row-critical';
        if (worst.includes('Minor Variance')) return 'row-warning';
        return undefined;
      },
    });

    unclassifiedSlot.innerHTML = '';
    projectsInScope().forEach((project) => {
      const { revenue, invoiceCount } = unclassifiedInvoicedForSlice({ project, from, to });
      if (!invoiceCount) return;
      unclassifiedSlot.appendChild(el('p', { class: 'section-subtitle' },
        `${project}: ${invoiceCount} unclassified/legacy invoice line(s) totalling ${formatCurrency(revenue)} — these predate Operation Type tracking (or aren't project-linked) and are excluded from the matrix above, but are already counted in this project's total invoiced revenue on Profitability and Income & Expenditure.`));
    });
  }

  function refreshPayments() {
    let invoices = store.get('invoices').slice();
    if (projectSelect.value !== 'all') invoices = invoices.filter((i) => i.project === projectSelect.value);
    invoices = invoices.sort((a, b) => (a.date < b.date ? 1 : -1));

    const outstanding = invoices.reduce((sum, i) => sum + Math.max(0, amountOutstanding(i)), 0);
    const partial = invoices.filter((i) => i.status === 'Partially Paid').length;
    const overdue = invoices.filter((i) => agingDays(i) !== null).length;

    paymentStatsGrid.innerHTML = '';
    paymentStatsGrid.appendChild(statCard({ label: 'Total Outstanding', value: formatCurrency(outstanding), tone: outstanding ? 'critical' : 'good' }));
    paymentStatsGrid.appendChild(statCard({ label: 'Partially Paid Invoices', value: String(partial), tone: partial ? 'warning' : 'good' }));
    paymentStatsGrid.appendChild(statCard({ label: 'Overdue Invoices', value: String(overdue), tone: overdue ? 'critical' : 'good' }));

    renderTable(paymentsContainer, {
      columns: [
        { key: 'id', label: 'Invoice #' },
        { key: 'customerId', label: 'Customer', render: (r) => store.get('customers').find((c) => c.id === r.customerId)?.name || '—' },
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'total', label: 'Invoiced', render: (r) => formatCurrency(invoiceTotal(r)) },
        { key: 'received', label: 'Received', render: (r) => formatCurrency(amountReceived(r)) },
        { key: 'outstanding', label: 'Outstanding', render: (r) => formatCurrency(amountOutstanding(r)) },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        { key: 'aging', label: 'Aging', render: (r) => (agingDays(r) === null ? '—' : el('strong', { class: 'text-critical' }, `${agingDays(r)} days overdue`)) },
      ],
      rows: invoices,
      emptyText: 'No invoices yet.',
      rowClass: (r) => (agingDays(r) !== null ? 'row-critical' : undefined),
    });
  }

  function refresh() {
    refreshMatrix();
    refreshPayments();
  }

  [projectSelect, fromInput, toInput].forEach((input) => input.addEventListener('change', refresh));
  refresh();
}
