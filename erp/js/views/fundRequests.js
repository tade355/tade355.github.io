import { requestSubmissionDate } from '../dateUtils.js';
import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatCurrency, formatDate, el, ico } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openCustomModal, closeModal, confirmDelete, statCard } from '../ui.js';
import { printFundRequest } from '../print.js';
import { filterLeaveRequests, filterByProject, filterFundRequests, getCurrentUserId, getCurrentTier } from '../session.js';
import { createAttachmentPicker } from '../attachments.js';
import { notifyNewFundRequest, notifyFundRequestDecision } from '../notifications.js';
import { EXPENSE_CATEGORIES } from '../constants.js';
import { renderApprovals } from './approvals.js';
import { openEarlierCostForm, renderFuelWorkflow } from './fuelWorkflow.js';
import { findDuplicateRequests, requestTotal } from '../requestDuplicates.js';
import { canDecideFundRequests, canDecideLeave } from '../access.js';

function costHeadOptions() {
  return [{ value: '', label: '— Select request category —' }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c === 'Administration' ? 'Admin / office' : c === 'Maintenance' ? 'Bulldozer maintenance' : c }))];
}

function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
}

function employeeOptions() {
  return store.get('employees').filter((e) => e.status !== 'Disengaged' && !e.archivedAt).map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }));
}

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || 'Unknown';
}

function requestSummary(request, limit = 90) {
  const full = String(request.description || `${request.items?.length || 0} item(s)`).trim();
  const text = full.length > limit ? `${full.slice(0, limit - 1).trim()}…` : full;
  return el('span', { class: 'request-summary', title: full }, text);
}

function selectField(name, label, options, value) {
  const select = el('select', { name }, options.map((o) => {
    const opt = el('option', { value: o.value }, o.label);
    if (String(o.value) === String(value ?? '')) opt.setAttribute('selected', 'selected');
    return opt;
  }));
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label), select]);
}

function textField(name, label, type, value, required) {
  const input = el('input', { type: type || 'text', name, required: required ? 'required' : undefined });
  input.value = value || '';
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label + (required ? ' *' : '')), input]);
}

function buildItemRow(item, onChange) {
  const description = el('input', { type: 'text', class: 'li-description', placeholder: 'What is this for?' });
  description.value = item.description || '';
  const quantity = el('input', { type: 'number', class: 'li-quantity', min: 0, step: '0.01', placeholder: 'Qty' });
  quantity.value = item.quantity ?? 1;
  const unit = el('input', { type: 'text', class: 'li-unit', placeholder: 'Unit (keg, item, day)' });
  unit.value = item.unit || '';
  const rate = el('input', { type: 'number', class: 'li-rate', min: 0, step: '0.01', placeholder: 'Rate' });
  rate.value = item.rate ?? item.amount ?? '';
  const amount = el('input', { type: 'number', class: 'li-amount', min: 0, placeholder: 'Amount', readOnly: true });
  amount.value = (Number(quantity.value) || 0) * (Number(rate.value) || 0);
  const removeBtn = el('button', { type: 'button', class: 'btn btn-ghost', title: 'Remove item' }, 'Remove item');
  const field = (label, input) => el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label), input]);
  const itemName = field('Item / description', description);
  itemName.classList.add('request-item-name');
  const row = el('div', { class: 'request-item-card' }, [
    itemName, field('Quantity', quantity), field('Unit (optional)', unit),
    field('Unit price (₦)', rate), field('Amount (₦)', amount), removeBtn,
  ]);
  const recalculate = () => { amount.value = ((Number(quantity.value) || 0) * (Number(rate.value) || 0)).toFixed(2); onChange(); };
  quantity.addEventListener('input', recalculate);
  rate.addEventListener('input', recalculate);
  recalculate();
  removeBtn.addEventListener('click', () => { row.remove(); onChange(); });
  return row;
}

function openRequestForm(record, onSaved) {
  if (!employeeOptions().length) {
    window.alert('Add employees first before submitting a fund request.');
    return;
  }

  openCustomModal({
    title: record ? 'Edit Fund Request' : 'Submit Fund Request',
    wide: true,
    build: (container) => {
      const today = todayISOString();
      const dateField = textField('date', 'Date', 'date', record?.date || today, true);
      const projectField = selectField('project', 'Project', [
        { value: '', label: '— Not specified —' },
        ...projectOptions(),
      ], record?.project);
      const submittedByField = selectField('submittedBy', 'Submitted By', employeeOptions(), record?.submittedBy || getCurrentUserId());
      if (!['Admin', 'Accounts'].includes(getCurrentTier())) submittedByField.querySelector('select').disabled = true;
      const selectedStaff = new Set(record?.concernedStaff || []);
      const staffSearch = el('input', { type: 'search', placeholder: 'Type a staff name…', 'aria-label': 'Search staff to tag', autocomplete: 'off' });
      const staffTags = el('div', { class: 'staff-tag-chips' });
      const staffSuggestions = el('div', { class: 'staff-tag-suggestions' });
      const people = employeeOptions();
      function renderStaffTags() {
        staffTags.replaceChildren(...[...selectedStaff].map((id) => {
          const person = people.find((p) => String(p.value) === String(id));
          return el('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': 'Remove tag ' + (person?.label || id), onClick: () => {
            selectedStaff.delete(id); renderStaffTags(); renderStaffSuggestions();
          } }, (person?.label || id) + ' ×');
        }));
      }
      function renderStaffSuggestions() {
        const query = staffSearch.value.trim().replace(/^@/, '').toLowerCase();
        staffSuggestions.replaceChildren();
        if (!query) return;
        const matches = people.filter((p) => !selectedStaff.has(p.value) && p.label.toLowerCase().includes(query)).slice(0, 6);
        if (!matches.length) { staffSuggestions.appendChild(el('span', {}, 'No matching staff')); return; }
        matches.forEach((person) => staffSuggestions.appendChild(el('button', {
          type: 'button', class: 'btn btn-ghost', onClick: () => {
            selectedStaff.add(person.value); staffSearch.value = ''; renderStaffTags(); renderStaffSuggestions(); staffSearch.focus();
          },
        }, person.label)));
      }
      staffSearch.addEventListener('input', renderStaffSuggestions);
      staffSearch.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { staffSearch.value = ''; renderStaffSuggestions(); }
      });
      renderStaffTags();
      const concernedField = el('div', { class: 'field' }, [
        el('span', { class: 'field-label' }, 'Tag staff (optional)'),
        staffTags, staffSearch, staffSuggestions,
      ]);
      const costHeadField = selectField('costHead', 'Request category *', costHeadOptions(), record?.costHead);
      const dozers = store.get('inventory').filter(item => item.category === 'Heavy Equipment');
      const equipmentField = selectField('equipment', 'Dozer code *', [
        { value: '', label: '— Select the dozer —' },
        ...dozers.map(item => ({ value: item.name, label: [item.assetCode || item.sku, item.name].filter((v, i, a) => v && a.indexOf(v) === i).join(' — ') })),
      ], record?.equipment);
      const updateEquipmentVisibility = () => {
        const maintenance = costHeadField.querySelector('select').value === 'Maintenance';
        equipmentField.hidden = !maintenance;
        equipmentField.querySelector('select').required = maintenance;
      };
      costHeadField.querySelector('select').addEventListener('change', updateEquipmentVisibility);
      updateEquipmentVisibility();
      const descriptionInput = el('textarea', { name: 'description', rows: 2 });
      descriptionInput.value = record?.description || '';
      const descriptionField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Description'), descriptionInput]);

      container.classList.add('request-form-mobile');
      const topGrid = el('div', { class: 'form-grid-2' }, [dateField, projectField]);

      const itemsContainer = el('div', { class: 'line-items-container' });
      const totalDisplay = el('strong', {}, formatCurrency(0));

      function recomputeTotal() {
        const amounts = [...itemsContainer.querySelectorAll('.li-amount')].map((inp) => Number(inp.value) || 0);
        totalDisplay.textContent = formatCurrency(amounts.reduce((a, b) => a + b, 0));
      }

      const initialItems = record?.items?.length ? record.items : [{}];
      initialItems.forEach((item) => itemsContainer.appendChild(buildItemRow(item, recomputeTotal)));
      recomputeTotal();

      const addLineBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '+ Add another item');
      addLineBtn.addEventListener('click', () => {
        itemsContainer.appendChild(buildItemRow({}, recomputeTotal));
        recomputeTotal();
      });

      const totalRow = el('div', { class: 'line-items-total' }, [el('span', {}, 'Total Amount:'), totalDisplay]);

      const recipient = record?.items?.[0] || {};
      const accountNameField = textField('recipientName', 'Account name', 'text', recipient.accountName || '', true);
      const accountNumberField = textField('recipientNumber', 'Account number', 'text', recipient.accountNumber || '', true);
      accountNumberField.querySelector('input').inputMode = 'numeric';
      const bankField = textField('recipientBank', 'Bank', 'text', recipient.bankName || '', true);
      const recipientGrid = el('div', { class: 'form-grid-2' }, [accountNameField, accountNumberField, bankField]);
      const moreDetails = el('details', { class: 'request-more-details' }, [
        el('summary', {}, 'More details (optional)'), submittedByField, concernedField,
      ]);

      const isAdmin = getCurrentTier() === 'Admin';
      let statusField;
      let approvedByField;
      if (isAdmin) {
        statusField = selectField('status', 'Status', [
          { value: 'Pending', label: 'Pending' },
          { value: 'Approved', label: 'Approved' },
          { value: 'Partially Approved', label: 'Partially Approved' },
          { value: 'Rejected', label: 'Rejected' },

        ], record?.status || 'Pending');
        // Not a dropdown: Approved By is always whoever actually makes the
        // decision (set automatically on save), the same rule the Approvals
        // inbox uses — not something this form lets you hand-pick.
        approvedByField = el('div', { class: 'field' }, [
          el('span', { class: 'field-label' }, 'Approved By'),
          el('p', {}, record?.approvedBy ? employeeName(record.approvedBy) : 'Set automatically to you when you approve or reject'),
        ]);
      } else {
        statusField = el('div', { class: 'field' }, [
          el('span', { class: 'field-label' }, 'Status'),
          el('p', {}, `${record?.status || 'Pending'} — only an Admin can approve or reject a fund request.`),
        ]);
        approvedByField = el('div', { class: 'field' }, [
          el('span', { class: 'field-label' }, 'Approved By'),
          el('p', {}, record?.approvedBy ? employeeName(record.approvedBy) : '— Not yet approved —'),
        ]);
      }
      const bottomGrid = el('div', { class: 'form-grid-2' }, [statusField, approvedByField]);

      const attachmentPicker = createAttachmentPicker(record?.attachments || []);
      const attachmentField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Receipts / Photos'), attachmentPicker.element]);

      const actions = el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Cancel'),
        el('button', { type: 'button', class: 'btn btn-primary' }, record ? 'Save Changes' : 'Submit Request'),
      ]);
      const submitBtn = actions.lastChild;

      submitBtn.addEventListener('click', async () => {
        const items = [...itemsContainer.children].map((row) => ({
          description: row.querySelector('.li-description').value,
          quantity: Number(row.querySelector('.li-quantity').value) || 0,
          unit: row.querySelector('.li-unit').value,
          rate: Number(row.querySelector('.li-rate').value) || 0,
          amount: Number(row.querySelector('.li-amount').value) || 0,
          accountName: accountNameField.querySelector('input').value.trim(),
          accountNumber: accountNumberField.querySelector('input').value.trim(),
          bankName: bankField.querySelector('input').value.trim(),
        })).filter((it) => it.description || it.amount);

        if (!costHeadField.querySelector('select').value) { window.alert('Select a request category.'); return; }
        if (costHeadField.querySelector('select').value === 'Maintenance' && !equipmentField.querySelector('select').value) { window.alert('Select the dozer code for this maintenance request.'); return; }
        if (!dateField.querySelector('input').value) { window.alert('Date is required.'); return; }
        if (!items.length) { window.alert('Add at least one item.'); return; }
        if (!accountNameField.querySelector('input').value.trim() || !accountNumberField.querySelector('input').value.trim() || !bankField.querySelector('input').value.trim()) { window.alert('Enter the recipient account name, number and bank.'); return; }
        if (items.some((item) => !item.description.trim())) { window.alert('Give each item a name or description.'); return; }
        if (items.some((item) => item.quantity <= 0 || item.rate < 0)) { window.alert('Each line needs a quantity and a valid rate.'); return; }
        const accountNumbers = [...new Set(items.map((item) => String(item.accountNumber || '').trim()).filter(Boolean))];
        if (accountNumbers.length > 1) { window.alert('A single request can only use one account number. Submit separate requests for different recipients.'); return; }
        const calculatedTotal = items.reduce((sum, item) => sum + item.amount, 0);
        if (!Number.isFinite(calculatedTotal) || calculatedTotal <= 0) { window.alert('The calculated total must be greater than zero.'); return; }

        if (!record) {
          // The site manager resends requests: ask before adding one that matches an existing request.
          const candidate = { date: dateField.querySelector('input').value, description: descriptionInput.value || items[0].description, items };
          const dups = findDuplicateRequests(candidate, store.get('fundRequests'));
          if (dups.length) {
            const lines = dups.slice(0, 3).map((r) => `${r.id}: ${r.description || r.items?.[0]?.description || ''}, ${formatDate(r.date)}, ${r.status}, ${formatCurrency(requestTotal(r))}`).join('\n');
            if (!window.confirm(`An existing request looks the same:\n\n${lines}\n\nSubmit this one anyway?`)) return;
          }
        }

        const newStatus = record?.status || 'Pending';
        // A "decision" is Admin actually moving it to Approved/Rejected just
        // now — not re-saving an already-decided request (e.g. later marking
        // it Paid), which keeps whoever originally decided it as-is.
        const isNewDecision = isAdmin && (newStatus === 'Approved' || newStatus === 'Rejected') && newStatus !== (record?.status || 'Pending');

        const payload = {
          date: dateField.querySelector('input').value,
          paidAt: record?.paidAt || null,
          paidAmount: record?.paidAmount ?? null,
          paymentReference: record?.paymentReference || null,
          project: projectField.querySelector('select').value,
          submittedBy: submittedByField.querySelector('select').value,
          concernedStaff: [...selectedStaff],
          costHead: costHeadField.querySelector('select').value,
          equipment: costHeadField.querySelector('select').value === 'Maintenance' ? equipmentField.querySelector('select').value : null,
          description: descriptionInput.value,
          items,
          status: newStatus,
          approvedBy: isNewDecision ? getCurrentUserId() : (record?.approvedBy || ''),
          attachments: attachmentPicker.getAttachments(),
        };

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving…';
          if (record) {
            const saved = await store.update('fundRequests', record.id, payload);
            if (newStatus === 'Paid' && record.status !== 'Paid') {
              await store.add('fundRequestPayments', { requestId: record.id, date: saved.paidAt, amount: saved.paidAmount, reference: saved.paymentReference || '', notes: 'Payment recorded from Fund Requests' });
            }
            if (isNewDecision) {
              notifyFundRequestDecision({ ...record, ...payload }, employeeName(getCurrentUserId()))
                .catch((err) => console.warn('Fund request decision notification failed:', err));
            }
          } else {
            const saved = await store.add('fundRequests', payload);
            if (newStatus === 'Paid') {
              await store.add('fundRequestPayments', { requestId: saved.id, date: payload.paidAt, amount: payload.paidAmount, reference: payload.paymentReference || '', notes: 'Payment recorded from Fund Requests' });
            }
            notifyNewFundRequest(saved).catch((err) => console.warn('Fund request notification failed:', err));
          }
          closeModal();
          onSaved();
        } catch (err) {
          window.alert(err.message || 'Could not save the fund request. Please try again.');
          submitBtn.disabled = false;
          submitBtn.textContent = record ? 'Save Changes' : 'Submit Request';
        }
      });

      container.appendChild(topGrid);
      container.appendChild(el('div', { class: 'form-grid-2' }, [costHeadField, equipmentField]));
      container.appendChild(descriptionField);
      container.appendChild(el('h3', { class: 'subsection-title' }, 'Line Items'));
      container.appendChild(itemsContainer);
      container.appendChild(addLineBtn);
      container.appendChild(totalRow);
      container.appendChild(el('h3', { class: 'subsection-title' }, 'Pay to'));
      container.appendChild(recipientGrid);
      moreDetails.appendChild(attachmentField);
      container.appendChild(moreDetails);
      container.appendChild(actions);
    },
  });
}

export function renderFundRequests(container) {
  container.innerHTML = '';

  const canApprove = canDecideFundRequests() || canDecideLeave() || getCurrentTier() === 'Supervisor';

  let tab = canApprove ? 'approvals' : 'requests';
  const tabBar = el('div', { class: 'tab-bar' });
  const requestsTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('requests') }, ['Staff','Supervisor'].includes(getCurrentTier()) ? 'My Requests' : 'Requests');
  requestsTabBtn.dataset.tabLabel = 'Requests';
  tabBar.appendChild(requestsTabBtn);
  let approvalsTabBtn;
  if (canApprove) {
    approvalsTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('approvals') }, 'Approvals');
    approvalsTabBtn.dataset.tabLabel = 'Approvals';
    approvalsTabBtn.appendChild(el('span', { class: 'tab-count' }));
    tabBar.appendChild(approvalsTabBtn);
  }

  container.appendChild(sectionHeader('Fund Requests and Approvals', 'Staff requests for funds, plus everything waiting on your decision'));
  container.appendChild(tabBar);

  const body = el('div');
  container.appendChild(body);
  function updatePendingCount() {
    const badge = approvalsTabBtn?.querySelector('.tab-count');
    if (!badge) return;
    const pending = (canDecideFundRequests() ? filterFundRequests(store.get('fundRequests')).filter(r=>r.status==='Pending').length : 0) + (canDecideLeave() ? filterLeaveRequests(store.get('leaveRequests')).filter(r=>r.status==='Pending').length : 0) + filterByProject(store.get('fuelingVouchers'), 'project').filter(r=>r.status==='Pending Approval').length;
    badge.textContent = String(pending);
    badge.setAttribute('aria-label', `${pending} pending`);
  }

  function setTab(next) {
    tab = next;
    requestsTabBtn.classList.toggle('active', tab === 'requests');
    if (approvalsTabBtn) approvalsTabBtn.classList.toggle('active', tab === 'approvals');
    body.innerHTML = '';
    if (tab === 'requests') renderRequestsTab(body, updatePendingCount);
    else renderApprovals(body, updatePendingCount);
  }

  setTab(tab);
}

function renderRequestsTab(container, onRefresh = () => {}) {
  const requestActions = el('div', { class: 'row-actions' }, [
    el('button', { class: 'btn btn-primary', onClick: () => openRequestForm(null, refresh) }, '+ Submit Fund Request'),
    el('button', { class: 'btn btn-secondary', onClick: () => openEarlierCostForm(refresh) }, '+ Earlier Cost / Reimbursement Request'),
  ]);
  container.appendChild(sectionHeader('Fund Requests', 'Staff requests for funds, with approval and payee details', requestActions));

  const summarySlot = el('div');
  container.appendChild(summarySlot);

  let requestView = 'active';
  let searchQuery = '';
  let statusFilter = '';
  const searchInput = el('input', { type: 'search', placeholder: 'Search by description, project, or submitter…' });
  const statusSelect = el('select', {}, [
    el('option', { value: '' }, 'All Statuses'),
    ...['Pending', 'Approved', 'Partially Approved', 'Rejected', 'Paid'].map((s) => el('option', { value: s }, s)),
  ]);
  const activeBtn = el('button', { type: 'button', class: 'tab-btn active' }, 'Awaiting Action');
  const historyBtn = el('button', { type: 'button', class: 'tab-btn' }, 'History');
  const setRequestView = (next) => {
    requestView = next;
    activeBtn.classList.toggle('active', next === 'active');
    historyBtn.classList.toggle('active', next === 'history');
    statusSelect.style.display = next === 'history' ? '' : 'none';
    refresh();
  };
  activeBtn.addEventListener('click', () => setRequestView('active'));
  historyBtn.addEventListener('click', () => setRequestView('history'));
  container.appendChild(el('div', { class: 'tab-bar request-view-tabs', role: 'tablist', 'aria-label': 'Request view' }, [activeBtn, historyBtn]));
  container.appendChild(el('div', { class: 'search-bar' }, [searchInput, statusSelect]));
  statusSelect.style.display = 'none';
  searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim().toLowerCase(); refresh(); });
  statusSelect.addEventListener('change', () => { statusFilter = statusSelect.value; refresh(); });

  const tableContainer = el('div');
  container.appendChild(tableContainer);

  const earlierCosts = el('div');
  container.appendChild(earlierCosts);
  renderFuelWorkflow(earlierCosts, { costsOnly: true, allowCreate: false });

  function totalOf(request) {
    return request.items.reduce((sum, it) => sum + it.amount, 0);
  }

  function refresh() {
    onRefresh();
    const allRows = filterFundRequests(store.get('fundRequests')).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id.localeCompare(a.id, undefined, { numeric: true }));
    let rows = allRows.filter((r) => requestView === 'active' ? r.status === 'Pending' : r.status !== 'Pending');
    const pending = allRows.filter((r) => r.status === 'Pending').length;
    const totalPending = allRows.filter((r) => r.status === 'Pending').reduce((sum, r) => sum + totalOf(r), 0);

    if (statusFilter) rows = rows.filter((r) => r.status === statusFilter);
    if (searchQuery) {
      rows = rows.filter((r) => [r.description, r.project, r.costHead, r.equipment, employeeName(r.submittedBy)].join(' ').toLowerCase().includes(searchQuery));
    }

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: requestView === 'active' ? 'Awaiting Action' : 'History Records', value: String(rows.length) }),
      statCard({ label: 'Pending Approval', value: String(pending), tone: pending ? 'warning' : 'good' }),
      statCard({ label: 'Pending Amount', value: formatCurrency(totalPending) }),
    ]));

    renderTable(tableContainer, {
      columns: [
        { key: 'submittedDate', label: 'Date', render: (r) => formatDate(requestSubmissionDate(r)), sortValue: requestSubmissionDate },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        { key: 'total', label: 'Amount', render: (r) => formatCurrency(totalOf(r)) },
        { key: 'submittedBy', label: 'Submitted By', render: (r) => employeeName(r.submittedBy) },
        {
          key: 'actions',
          label: 'Actions',
          render: (r) => actionButtons({
            onPrint: () => printFundRequest(r, {
              submittedByName: employeeName(r.submittedBy),
              approvedByName: r.approvedBy ? employeeName(r.approvedBy) : '',
            }),
            onEdit: () => openRequestForm(r, refresh),
            onDelete: async () => {
              if (!confirmDelete(`Fund request from ${employeeName(r.submittedBy)}`)) return;
              try {
                await store.remove('fundRequests', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete the fund request.');
              }
            },
          }),
        },
        { key: 'approvalNote', label: 'Feedback', render: (r) => r.approvalNote || '—' },
        { key: 'description', label: 'Description', wrap: true, render: requestSummary },
        { key: 'project', label: 'Project', render: (r) => r.project || '—' },
        { key: 'approvedAmount', label: 'Approved', render: (r) => r.approvedAmount != null ? formatCurrency(r.approvedAmount) : '—' },
        { key: 'paidAmount', label: 'Paid', render: (r) => r.paidAmount != null ? formatCurrency(r.paidAmount) : '—' },
        { key: 'costHead', label: 'Category', render: (r) => r.costHead === 'Administration' ? 'Admin / office' : r.costHead === 'Maintenance' ? 'Bulldozer maintenance' : r.costHead || '—' },
        { key: 'equipment', label: 'Dozer code', render: (r) => r.equipment || '—' },
        { key: 'paidAt', label: 'Payment Date', render: (r) => r.paidAt ? formatDate(r.paidAt) : '—' },
        { key: 'attachments', label: 'Files', render: (r) => (r.attachments?.length ? el('span', { class: 'attach-count' }, [ico('paperclip'), String(r.attachments.length)]) : '—') },
      ],
      rows,
      emptyText: requestView === 'active' ? 'Nothing is awaiting action.' : 'No request history yet.',
      rowClass: (r) => (r.status === 'Pending' ? 'row-warning' : undefined),
    });
  }

  refresh();
}

