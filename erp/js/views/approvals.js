import { store } from '../store.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, sectionHeader, statCard } from '../ui.js';
import { getCurrentTier, getCurrentUserId, filterFundRequests, filterByProject, filterLeaveRequests } from '../session.js';
import { printFundRequest, printFuelingVoucher } from '../print.js';

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || 'Unknown';
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const ms = new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00');
  return Math.max(0, Math.round(ms / 86400000) + 1);
}

function decisionButtons({ onPrint, onApprove, onReject }) {
  return el('div', { class: 'row-actions' }, [
    onPrint ? el('button', { class: 'icon-btn', type: 'button', title: 'Print', onClick: onPrint }, '🖨') : null,
    el('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: onApprove }, 'Approve'),
    el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: onReject }, 'Reject'),
  ]);
}

export function renderApprovals(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('Approvals', 'Everything waiting on your decision — fund requests, leave, and fueling vouchers'));

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function decide(row, newStatus) {
    if (newStatus === 'Rejected' && !window.confirm(`Reject this ${row.type.toLowerCase()}?`)) return;
    store.update(row.collection, row.record.id, { status: newStatus, approvedBy: getCurrentUserId() });
    refresh();
  }

  function refresh() {
    const tier = getCurrentTier();

    let fundRequests = [];
    let leaveRequests = [];
    let vouchers = [];

    if (tier === 'Admin') {
      fundRequests = filterFundRequests(store.get('fundRequests')).filter((r) => r.status === 'Pending');
    }
    if (tier === 'Admin' || tier === 'Supervisor') {
      leaveRequests = filterLeaveRequests(store.get('leaveRequests')).filter((r) => r.status === 'Pending');
      vouchers = filterByProject(store.get('fuelingVouchers'), 'project').filter((r) => r.status === 'Pending Approval');
    }

    const rows = [
      ...fundRequests.map((r) => ({
        type: 'Fund Request', date: r.date,
        summary: r.description || `${r.items.length} item(s)`,
        by: employeeName(r.submittedBy),
        amount: r.items.reduce((sum, it) => sum + it.amount, 0),
        record: r, collection: 'fundRequests',
      })),
      ...leaveRequests.map((r) => ({
        type: 'Leave Request', date: r.startDate,
        summary: `${r.leaveType} leave, ${daysBetween(r.startDate, r.endDate)} day(s)`,
        by: employeeName(r.employeeId),
        amount: null,
        record: r, collection: 'leaveRequests',
      })),
      ...vouchers.map((r) => ({
        type: 'Fueling Voucher', date: r.date,
        summary: `${r.litresRequested.toLocaleString()} L at ${r.station} for ${r.equipment}`,
        by: employeeName(r.requestedBy),
        amount: r.estimatedCost,
        record: r, collection: 'fuelingVouchers',
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1));

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Total Pending', value: String(rows.length), tone: rows.length ? 'warning' : 'good' }),
      statCard({ label: 'Fund Requests', value: String(fundRequests.length) }),
      statCard({ label: 'Leave Requests', value: String(leaveRequests.length) }),
      statCard({ label: 'Fueling Vouchers', value: String(vouchers.length) }),
    ]));

    renderTable(tableContainer, {
      columns: [
        { key: 'type', label: 'Type' },
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'summary', label: 'Summary' },
        { key: 'by', label: 'Submitted By' },
        { key: 'amount', label: 'Amount', render: (r) => (r.amount === null ? '—' : formatCurrency(r.amount)) },
        {
          key: 'actions',
          label: '',
          render: (r) => decisionButtons({
            onPrint: r.collection === 'fundRequests'
              ? () => printFundRequest(r.record, { submittedByName: employeeName(r.record.submittedBy) })
              : r.collection === 'fuelingVouchers'
                ? () => printFuelingVoucher(r.record, { requestedByName: employeeName(r.record.requestedBy) })
                : null,
            onApprove: () => decide(r, 'Approved'),
            onReject: () => decide(r, 'Rejected'),
          }),
        },
      ],
      rows,
      emptyText: "Nothing pending — you're all caught up.",
    });
  }

  refresh();
}
