import { requestSubmissionDate } from '../dateUtils.js';
import { store } from '../store.js';
import { formatCurrency, formatDate, el, ico } from '../utils.js';
import { renderTable, sectionHeader, statCard, statusPill } from '../ui.js';
import { getCurrentTier, getCurrentUserId, filterFundRequests, filterByProject, filterLeaveRequests } from '../session.js';
import { printFundRequest, printFuelingVoucher } from '../print.js';
import { notifyFundRequestDecision, notifyLeaveRequestDecision } from '../notifications.js';
import { findDuplicateRequests } from '../requestDuplicates.js';
import { canDecideFundRequests, canDecideLeave } from '../access.js';

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
export function paymentCard(request) {
  const canCopy = ['Approved', 'Partially Approved'].includes(request.status) && ['Admin', 'Accounts'].includes(getCurrentTier());
  const recipients = [...new Map((request.items || []).map(item => {
    const payee = {
      accountName: String(item.accountName || '').trim(),
      accountNumber: String(item.accountNumber || '').trim(),
      bankName: String(item.bankName || '').trim(),
    };
    return [JSON.stringify(payee), payee];
  })).values()];
  if (!recipients.length) recipients.push({ accountName: '', accountNumber: '', bankName: '' });
  const amount = Number(request.approvedAmount ?? (request.items || []).reduce((sum, row) => sum + Number(row.amount || 0), 0));
  return el('section', { class: 'payment-card', 'aria-label': 'Beneficiary account details' }, [
    el('strong', {}, 'Pay to — beneficiary details'),
    ...recipients.map(item => {
      const missing = !item.accountName || !item.accountNumber || !item.bankName;
      const all = 'Amount: ₦' + amount.toLocaleString() + '\nAccount Number: ' + item.accountNumber + '\nAccount Name: ' + item.accountName + '\nBank: ' + item.bankName + '\nNarration: ' + (request.description || request.id) + '\nReference: ' + request.id;
      const value = (label, text) => el('p', { style: 'margin:0.4rem 0;overflow-wrap:anywhere;user-select:text;' }, [
        el('strong', {}, label + ': '), el('span', {}, text || 'Not provided'),
      ]);
      return el('div', {}, [
        value('Account name', item.accountName),
        value('Account number', item.accountNumber),
        value('Bank', item.bankName),
        missing ? el('p', { class: 'text-critical' }, 'Account details are incomplete — ask the requester to clarify before approval or payment.') : null,
        canCopy ? el('div', { class: 'payment-card-actions' }, [
          item.accountNumber ? copyPaymentButton('Copy account no.', item.accountNumber) : null,
          item.accountName ? copyPaymentButton('Copy account name', item.accountName) : null,
          item.bankName ? copyPaymentButton('Copy bank', item.bankName) : null,
          copyPaymentButton('Copy amount', amount),
          copyPaymentButton('Copy all', all),
        ]) : null,
      ]);
    }),
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
    if (row.collection === 'fundRequests' && !canDecideFundRequests()) { window.alert('Only the CEO and COO can decide fund requests.'); return; }
    try {
      const decidedByName = employeeName(getCurrentUserId());
      let patch = { status: newStatus, approvedBy: getCurrentUserId() };
      if (row.collection === 'fundRequests' && newStatus === 'Rejected') {
        const reason = window.prompt('Reason for rejecting this request:');
        if (!reason?.trim()) return;
        patch.approvalNote = reason.trim();
      }
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
          const note = window.prompt('Reason for reducing the approved amount:');
          if (!note?.trim()) return;
          patch = { ...patch, approvalNote: note.trim(), status: 'Partially Approved', approvedAmount, remainderDecision: remainderDecision.trim().toUpperCase() === 'REJECTED' ? 'Rejected' : remainderDecision.trim().toUpperCase() === 'REJECT' ? 'Rejected' : 'Pending' };
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

    if (canDecideFundRequests()) {
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

    tableContainer.replaceChildren();
    const search = el('input', { type: 'search', placeholder: 'Search project, requester or request…', 'aria-label': 'Search approvals' });
    tableContainer.appendChild(search);
    const cards = el('div', { class: 'approval-card-list' });
    tableContainer.appendChild(cards);
    const draw = () => {
      const query = search.value.trim().toLowerCase();
      const visible = rows.filter(r => [r.summary,r.by,r.record.project,r.record.id].join(' ').toLowerCase().includes(query));
      cards.replaceChildren(...visible.map(r => {
        const breakdown = el('details', {}, [el('summary', {}, 'View full request and items'),
          el('p', {}, r.summary),
          ...(r.record.items || []).map(item => el('p', {}, (item.description || 'Item') + ' — ' + (item.quantity ?? 1) + ' × ' + formatCurrency(item.rate ?? item.amount) + ' = ' + formatCurrency(item.amount))),
        ]);
        return el('article', { class: 'approval-request-card' }, [
          el('strong', {}, r.type + ' · ' + r.record.id),
          el('h3', {}, r.amount === null ? r.summary : formatCurrency(r.amount)),
          el('p', {}, r.by + ' · ' + (r.record.project || 'No project') + ' · Submitted ' + formatDate(requestSubmissionDate(r.record))),
          r.collection === 'fundRequests' ? el('p', {}, 'Category: ' + (r.record.costHead || 'Not categorized') + (r.record.equipment ? ' · Dozer: ' + r.record.equipment : '')) : null,
          shortSummary(r.summary),
          r.collection === 'fundRequests' && findDuplicateRequests(r.record, store.get('fundRequests').filter(other=>other.id!==r.record.id)).length ? el('p',{},'Possible duplicate — review related requests before deciding.') : null,
          r.record.approvalNote ? el('p',{},'Latest feedback: '+r.record.approvalNote) : null,
          r.collection === 'fundRequests' ? paymentCard(r.record) : null,
          breakdown,
          r.collection === 'fundRequests' ? el('button',{type:'button',class:'btn btn-ghost',onClick:async()=>{
            const message=window.prompt('What should the requester clarify?'); if(!message?.trim())return;
            try { const updated=await store.update('fundRequests',r.record.id,{approvalNote:'Clarification requested: '+message.trim()});
              await notifyFundRequestDecision(updated,employeeName(getCurrentUserId()));refresh();
            } catch(error){window.alert(error.message||'Could not send clarification.');}
          }},'Ask for clarification') : null,
          decisionButtons({ onApprove: () => decide(r, 'Approved'), onReject: () => decide(r, 'Rejected') }),
        ]);
      }));
      if (!visible.length) cards.appendChild(el('p', {}, 'No requests awaiting your decision.'));
    };
    search.addEventListener('input', draw); draw();

  }

  refresh();
}

