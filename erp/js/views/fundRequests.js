import { store } from '../store.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openCustomModal, closeModal, confirmDelete, statCard } from '../ui.js';
import { PROJECTS } from '../constants.js';
import { printFundRequest } from '../print.js';
import { filterFundRequests, getCurrentUserId, getCurrentTier } from '../session.js';
import { createAttachmentPicker } from '../attachments.js';

function employeeOptions() {
  return store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }));
}

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || 'Unknown';
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
  const amount = el('input', { type: 'number', class: 'li-amount', min: 0, placeholder: '0' });
  amount.value = item.amount ?? '';
  const accountName = el('input', { type: 'text', class: 'li-accountName', placeholder: 'Account name' });
  accountName.value = item.accountName || '';
  const accountNumber = el('input', { type: 'text', class: 'li-accountNumber', placeholder: 'Account number' });
  accountNumber.value = item.accountNumber || '';
  const bankName = el('input', { type: 'text', class: 'li-bankName', placeholder: 'Bank' });
  bankName.value = item.bankName || '';
  const removeBtn = el('button', { type: 'button', class: 'icon-btn icon-btn-danger', title: 'Remove line' }, '✕');

  const row = el('div', { class: 'line-item-row' }, [description, amount, accountName, accountNumber, bankName, removeBtn]);
  amount.addEventListener('input', onChange);
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
      const today = new Date().toISOString().slice(0, 10);
      const dateField = textField('date', 'Date', 'date', record?.date || today, true);
      const projectField = selectField('project', 'Project', [
        { value: '', label: '— Not specified —' },
        ...PROJECTS.map((p) => ({ value: p, label: p })),
      ], record?.project);
      const submittedByField = selectField('submittedBy', 'Submitted By', employeeOptions(), record?.submittedBy || getCurrentUserId());
      const descriptionInput = el('textarea', { name: 'description', rows: 2 });
      descriptionInput.value = record?.description || '';
      const descriptionField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Description'), descriptionInput]);

      const topGrid = el('div', { class: 'form-grid-2' }, [dateField, projectField, submittedByField]);

      const itemsHeader = el('div', { class: 'line-items-header' }, [
        el('span', {}, 'Description'), el('span', {}, 'Amount (₦)'), el('span', {}, 'Account Name'), el('span', {}, 'Account Number'), el('span', {}, 'Bank'), el('span', {}, ''),
      ]);
      const itemsContainer = el('div', { class: 'line-items-container' });
      const totalDisplay = el('strong', {}, formatCurrency(0));

      function recomputeTotal() {
        const amounts = [...itemsContainer.querySelectorAll('.li-amount')].map((inp) => Number(inp.value) || 0);
        totalDisplay.textContent = formatCurrency(amounts.reduce((a, b) => a + b, 0));
      }

      const initialItems = record?.items?.length ? record.items : [{}];
      initialItems.forEach((item) => itemsContainer.appendChild(buildItemRow(item, recomputeTotal)));
      recomputeTotal();

      const addLineBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '+ Add Line');
      addLineBtn.addEventListener('click', () => {
        itemsContainer.appendChild(buildItemRow({}, recomputeTotal));
        recomputeTotal();
      });

      const totalRow = el('div', { class: 'line-items-total' }, [el('span', {}, 'Total Amount:'), totalDisplay]);

      const isAdmin = getCurrentTier() === 'Admin';
      let statusField;
      let approvedByField;
      if (isAdmin) {
        statusField = selectField('status', 'Status', [
          { value: 'Pending', label: 'Pending' },
          { value: 'Approved', label: 'Approved' },
          { value: 'Rejected', label: 'Rejected' },
          { value: 'Paid', label: 'Paid' },
        ], record?.status || 'Pending');
        approvedByField = selectField('approvedBy', 'Approved By', [
          { value: '', label: '— Not yet approved —' },
          ...employeeOptions(),
        ], record?.approvedBy);
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
          amount: Number(row.querySelector('.li-amount').value) || 0,
          accountName: row.querySelector('.li-accountName').value,
          accountNumber: row.querySelector('.li-accountNumber').value,
          bankName: row.querySelector('.li-bankName').value,
        })).filter((it) => it.description || it.amount);

        if (!dateField.querySelector('input').value) { window.alert('Date is required.'); return; }
        if (!items.length) { window.alert('Add at least one line item.'); return; }

        const payload = {
          date: dateField.querySelector('input').value,
          project: projectField.querySelector('select').value,
          submittedBy: submittedByField.querySelector('select').value,
          description: descriptionInput.value,
          items,
          status: isAdmin ? statusField.querySelector('select').value : (record?.status || 'Pending'),
          approvedBy: isAdmin ? approvedByField.querySelector('select').value : (record?.approvedBy || ''),
          attachments: attachmentPicker.getAttachments(),
        };

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving…';
          if (record) await store.update('fundRequests', record.id, payload);
          else await store.add('fundRequests', payload);
          closeModal();
          onSaved();
        } catch (err) {
          window.alert(err.message || 'Could not save the fund request. Please try again.');
          submitBtn.disabled = false;
          submitBtn.textContent = record ? 'Save Changes' : 'Submit Request';
        }
      });

      container.appendChild(topGrid);
      container.appendChild(descriptionField);
      container.appendChild(el('h3', { class: 'subsection-title' }, 'Line Items'));
      container.appendChild(itemsHeader);
      container.appendChild(itemsContainer);
      container.appendChild(addLineBtn);
      container.appendChild(totalRow);
      container.appendChild(bottomGrid);
      container.appendChild(attachmentField);
      container.appendChild(actions);
    },
  });
}

export function renderFundRequests(container) {
  container.innerHTML = '';

  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openRequestForm(null, refresh) }, '+ Submit Fund Request');
  container.appendChild(sectionHeader('Fund Requests', 'Staff requests for funds, with approval and payee details', addBtn));

  const summarySlot = el('div');
  container.appendChild(summarySlot);

  let searchQuery = '';
  let statusFilter = '';
  const searchInput = el('input', { type: 'search', placeholder: 'Search by description, project, or submitter…' });
  const statusSelect = el('select', {}, [
    el('option', { value: '' }, 'All Statuses'),
    ...['Pending', 'Approved', 'Rejected', 'Paid'].map((s) => el('option', { value: s }, s)),
  ]);
  container.appendChild(el('div', { class: 'search-bar' }, [searchInput, statusSelect]));
  searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim().toLowerCase(); refresh(); });
  statusSelect.addEventListener('change', () => { statusFilter = statusSelect.value; refresh(); });

  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function totalOf(request) {
    return request.items.reduce((sum, it) => sum + it.amount, 0);
  }

  function refresh() {
    let rows = filterFundRequests(store.get('fundRequests')).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const pending = rows.filter((r) => r.status === 'Pending').length;
    const totalPending = rows.filter((r) => r.status === 'Pending').reduce((sum, r) => sum + totalOf(r), 0);

    if (statusFilter) rows = rows.filter((r) => r.status === statusFilter);
    if (searchQuery) {
      rows = rows.filter((r) => [r.description, r.project, employeeName(r.submittedBy)].join(' ').toLowerCase().includes(searchQuery));
    }

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Total Requests', value: String(rows.length) }),
      statCard({ label: 'Pending Approval', value: String(pending), tone: pending ? 'warning' : 'good' }),
      statCard({ label: 'Pending Amount', value: formatCurrency(totalPending) }),
    ]));

    renderTable(tableContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'project', label: 'Project', render: (r) => r.project || '—' },
        { key: 'submittedBy', label: 'Submitted By', render: (r) => employeeName(r.submittedBy) },
        { key: 'description', label: 'Description', render: (r) => r.description || `${r.items.length} item(s)` },
        { key: 'total', label: 'Total', render: (r) => formatCurrency(totalOf(r)) },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        { key: 'attachments', label: 'Files', render: (r) => (r.attachments?.length ? `📎 ${r.attachments.length}` : '—') },
        {
          key: 'actions',
          label: '',
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
      ],
      rows,
      emptyText: 'No fund requests yet.',
      rowClass: (r) => (r.status === 'Pending' ? 'row-warning' : undefined),
    });
  }

  refresh();
}
