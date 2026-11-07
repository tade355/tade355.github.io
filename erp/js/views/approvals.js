import { requestSubmissionDate } from '../dateUtils.js';
import { store } from '../store.js';
import { formatCurrency, formatDate, el, ico } from '../utils.js';
import { renderTable, sectionHeader, statCard, statusPill } from '../ui.js';
import { getCurrentTier, getCurrentUserId, filterFundRequests, filterByProject, filterLeaveRequests } from '../session.js';
import { printFundRequest, printFuelingVoucher } from '../print.js';
import { notifyFundRequestDecision, notifyLeaveRequestDecision } from '../notifications.js';
import { canDecideLeave } from '../access.js';

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || 'Unknown';
}

function shortSummary(value, limit = 90) {
  const full = String(value || '').trim();
  const text = full.length > limit ? `${full.slice(0, limit - 1).trim()}…` : full;
  return el('span', { class: 'request-summary', title: full }, text);
}

function copyPaymentButton(label, value) {
  const button = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', title: 'Copy ' + label }, label);
  button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(String(value || '')); button.textContent = 'Copied'; setTimeout(() => { button.textContent = label; }, 1200); }
    catch { window.alert('Copy failed. ' + label + ': ' + (value || 'not provided')); }
  });
  return button;
}
function paymentCard(request) {
  const item = (request.items || []).find(row => row.accountNumber || row.accountName || row.bankName) || request.items?.[0] || {};
  const amount = Number(request.approvedAmount || (request.items || []).reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const all = 'Amount: ₦' + amount.toLocaleString() + '\nAccount Number: ' + (item.accountNumber || '') + '\nAccount Name: ' + (item.accountName || '') + '\nBank: ' + (item.bankName || '') + '\nNarration: ' + (request.description || item.description || request.id) + '\nReference: ' + request.id;
  return el('div', { class: 'payment-card' }, [
    el('strong', {}, 'Payment details'),
    el('div', { class: 'payment-card-actions' }, [
      copyPaymentButton('Copy account no.', item.accountNumber),
      copyPaymentButton('Copy account name', item.accountName),
      copyPaymentButton('Copy bank', item.bankName),
      copyPaymentButton('Copy amount', amount),
      copyPaymentButton('Copy all', all),
    ]),
  ]);
}

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const ms = new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00');
  return Math.max(0, Math.round(ms / 86400000) + 1);
}

function decisionButtons({ onPrint, onApprove, onReject }) {
  return el('div', { class: 'row-actions' }, [
    onPrint ? el('button', { class: 'icon-btn', type: 'button', title: 'Print', onClick: onPrint }, [ico('printer')]) : null,
    el('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: onApprove }, 'Approve'),
    el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: onReject }, 'Reject'),
  ]);
}

export function renderApprovals(container, onRefresh = () => {}) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('Approvals', 'Everything waiting on your decision — fund requests, leave, and fueling vouchers'));

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const tableContainer = el('div');
  container.appendChild(tableContainer);

  async function decide(row, newStatus) {
    if (newStatus === 'Rejected' && !window.confirm(`Reject this ${row.type.toLowerCase()}?`)) return;
    try {
      const decidedByName = employeeName(getCurrentUserId());
      let patch = { status: newStatus, approvedBy: getCurrentUserId() };
      if (row.collection === 'fundRequests' && newStatus === 'Approved') {
        const requested = (row.record.items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
        const typed = window.prompt(`Requested: ${formatCurrency(requested)}\nEnter the amount approved:`, String(requested));
        if (typed === null) return;
        const approvedAmount = Number(typed);
        if (!Number.isFinite(approvedAmount) || approvedAmount <= 0 || approvedAmount > requested) {
          window.alert('Approved amount must be greater than zero and cannot exceed the requested amount.');
          return;
        }
        if (approvedAmount < requested) {
          const remainderDecision = window.prompt(`The remaining ${formatCurrency(requested - approvedAmount)} is not approved. Type REJECT to reject it, or PENDING to leave it for further review:`, 'PENDING');
          if (!remainderDecision || !['REJECT', 'PENDING'].includes(remainderDecision.trim().toUpperCase())) return;
          patch = { ...patch, status: 'Partially Approved', approvedAmount, remainderDecision: remainderDecision.trim().toUpperCase() === 'REJECTED' ? 'Rejected' : remainderDecision.trim().toUpperCase() === 'REJECT' ? 'Rejected' : 'Pending' };
        } else patch = { ...patch, approvedAmount, remainderDecision: 'None' };
      }
      const updated = await store.update(row.collection, row.record.id, patch);
      if (row.collection === 'fundRequests') {
        notifyFundRequestDecision(updated, decidedByName).catch((err) => console.warn('Fund request decision notification failed:', err));
      } else if (row.collection === 'leaveRequests') {
        notifyLeaveRequestDecision(updated, decidedByName).catch((err) => console.warn('Leave request decision notification failed:', err));
      }
      refresh();
    } catch (err) {
      window.alert(err.message || 'Could not save that decision. Please try again.');
    }
  }

  function refresh() {
    onRefresh();
    const tier = getCurrentTier();

    let fundRequests = [];
    let leaveRequests = [];
    let vouchers = [];

    if (tier === 'Admin') {
      fundRequests = filterFundRequests(store.get('fundRequests')).filter((r) => r.status === 'Pending');
    }
    if (canDecideLeave()) {
      leaveRequests = filterLeaveRequests(store.get('leaveRequests')).filter((r) => r.status === 'Pending');
    }
    if (tier === 'Admin' || tier === 'Supervisor') {
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
    ].sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.record.id.localeCompare(b.record.id, undefined, { numeric: true }));

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Total Pending', value: String(rows.length), tone: rows.length ? 'warning' : 'good' }),
      statCard({ label: 'Fund Requests', value: String(fundRequests.length) }),
      statCard({ label: 'Leave Requests', value: String(leaveRequests.length) }),
      statCard({ label: 'Vouchers', value: String(vouchers.length) }),
    ]));

    renderTable(tableContainer, {
      columns: [
        { key: 'submittedDate', label: 'Date', render: (r) => formatDate(requestSubmissionDate(r.record)), sortValue: (r) => requestSubmissionDate(r.record) },
        { key: 'type', label: 'Request Type' },
        { key: 'status', label: 'Status', render: () => statusPill('Pending') },
        { key: 'amount', label: 'Amount', render: (r) => (r.amount === null ? '—' : formatCurrency(r.amount)) },
        { key: 'by', label: 'Submitted By' },
        { key: 'payment', label: 'Payment-ready details', render: (r) => r.collection === 'fundRequests' ? paymentCard(r.record) : '—' },
        {
          key: 'actions',
          label: 'Actions',
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
        { key: 'summary', label: 'Description', wrap: true, render: (r) => shortSummary(r.summary) },
        { key: 'date', label: 'Request Date', render: (r) => formatDate(r.date) },
      ],
      rows,
      emptyText: "Nothing pending — you're all caught up.",
    });
  }

  refresh();
}

