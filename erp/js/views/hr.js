import { store } from '../store.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete } from '../ui.js';
import { ACCESS_TIERS, ACCESS_TIER_LABELS } from '../constants.js';
import { printStaffMemo } from '../print.js';
import { getCurrentUserId } from '../session.js';

const MEMO_TYPES = ['Memo', 'Notice', 'Warning Letter', 'Query Letter', 'Confirmation Letter', 'Other'];

function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
}

function employeeOptions() {
  return store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }));
}

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || 'Unknown';
}

function fields() {
  return [
    { name: 'name', label: 'Full Name', required: true },
    { name: 'role', label: 'Job Role', required: true },
    { name: 'department', label: 'Department', type: 'select', required: true, options: [
      { value: 'Operations', label: 'Operations' },
      { value: 'Finance', label: 'Finance' },
      { value: 'Human Resources', label: 'Human Resources' },
      { value: 'Maintenance', label: 'Maintenance' },
      { value: 'Administration', label: 'Administration' },
    ] },
    { name: 'phone', label: 'Phone' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'salary', label: 'Monthly Salary (₦)', type: 'number', min: 0 },
    { name: 'dayRate', label: 'Day Rate (₦) — for dozer operators paid per day worked instead of monthly salary', type: 'number', min: 0 },
    { name: 'dateHired', label: 'Date Hired', type: 'date' },
    { name: 'leaveEntitlement', label: 'Annual Leave Entitlement (days/year)', type: 'number', min: 0 },
    { name: 'status', label: 'Status', type: 'select', required: true, options: [
      { value: 'Active', label: 'Active' },
      { value: 'Suspended', label: 'Suspended' },
      { value: 'Disengaged', label: 'Disengaged' },
    ] },
    { name: 'accessTier', label: 'ERP Access Level', type: 'select', required: true, options: ACCESS_TIERS.map((t) => ({ value: t, label: ACCESS_TIER_LABELS[t] })) },
    { name: 'assignedProject', label: 'Assigned Project (Supervisors only — restricts what they see)', type: 'select', options: [
      { value: '', label: '— All projects —' },
      ...projectOptions(),
    ] },
  ];
}

function memoFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'type', label: 'Document Type', type: 'select', required: true, options: MEMO_TYPES.map((t) => ({ value: t, label: t })) },
    { name: 'employeeId', label: 'Addressed To', type: 'select', options: [
      { value: '', label: '— All Staff —' },
      ...employeeOptions(),
    ] },
    { name: 'subject', label: 'Subject', required: true },
    { name: 'body', label: 'Body', type: 'textarea', required: true },
    { name: 'issuedBy', label: 'Issued By', type: 'select', options: [
      { value: '', label: '— Not specified —' },
      ...employeeOptions(),
    ] },
  ];
}

export function renderHR(container) {
  container.innerHTML = '';

  let tab = 'employees';
  const tabBar = el('div', { class: 'tab-bar' });
  const employeesTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('employees') }, 'Employees');
  const memosTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('memos') }, 'Memos & Notices');
  tabBar.appendChild(employeesTabBtn);
  tabBar.appendChild(memosTabBtn);

  const actionSlot = el('div');
  container.appendChild(sectionHeader('HR & Employees', 'Staff records, roles, and printable memos/notices', actionSlot));
  container.appendChild(tabBar);

  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    employeesTabBtn.classList.toggle('active', tab === 'employees');
    memosTabBtn.classList.toggle('active', tab === 'memos');
    if (tab === 'employees') renderEmployeesTab();
    else renderMemosTab();
  }

  function renderEmployeesTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openForm() }, '+ Add Employee'));

    body.innerHTML = '';
    const tableContainer = el('div');
    body.appendChild(tableContainer);

    function refresh() {
      const rows = store.get('employees');
      renderTable(tableContainer, {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'role', label: 'Role' },
          { key: 'department', label: 'Department' },
          { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
          { key: 'salary', label: 'Salary', render: (r) => (r.salary ? formatCurrency(r.salary) : '—') },
          { key: 'dayRate', label: 'Day Rate', render: (r) => (r.dayRate ? formatCurrency(r.dayRate) : '—') },
          { key: 'dateHired', label: 'Hired', render: (r) => formatDate(r.dateHired) },
          { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
          { key: 'accessTier', label: 'ERP Access', render: (r) => r.accessTier || 'Staff' },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => openForm(r),
              onDelete: async () => {
                if (!confirmDelete(r.name)) return;
                try {
                  await store.remove('employees', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this employee.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No employees yet. Add your first team member.',
      });
    }

    function openForm(record) {
      openModal({
        title: record ? 'Edit Employee' : 'Add Employee',
        fields: fields(),
        initial: record || { status: 'Active', accessTier: 'Staff', leaveEntitlement: 21 },
        submitLabel: record ? 'Save Changes' : 'Add Employee',
        onSubmit: async (data) => {
          if (record) await store.update('employees', record.id, data);
          else await store.add('employees', data);
          refresh();
        },
      });
    }

    refresh();
  }

  function renderMemosTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openMemoForm() }, '+ New Memo / Notice'));

    body.innerHTML = '';
    const tableContainer = el('div');
    body.appendChild(tableContainer);

    function refresh() {
      const rows = store.get('staffMemos').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      renderTable(tableContainer, {
        columns: [
          { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
          { key: 'type', label: 'Type', render: (r) => statusPill(r.type) },
          { key: 'employeeId', label: 'Addressed To', render: (r) => (r.employeeId ? employeeName(r.employeeId) : 'All Staff') },
          { key: 'subject', label: 'Subject' },
          { key: 'issuedBy', label: 'Issued By', render: (r) => (r.issuedBy ? employeeName(r.issuedBy) : '—') },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onPrint: () => printStaffMemo(r, {
                employeeName: r.employeeId ? employeeName(r.employeeId) : '',
                issuedByName: r.issuedBy ? employeeName(r.issuedBy) : '',
              }),
              onEdit: () => openMemoForm(r),
              onDelete: async () => {
                if (!confirmDelete(r.subject)) return;
                try {
                  await store.remove('staffMemos', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this record.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No memos or notices issued yet.',
      });
    }

    function openMemoForm(record) {
      openModal({
        title: record ? 'Edit Memo / Notice' : 'New Memo / Notice',
        fields: memoFields(),
        initial: record || { date: new Date().toISOString().slice(0, 10), type: 'Memo', issuedBy: getCurrentUserId() || '' },
        submitLabel: record ? 'Save Changes' : 'Save',
        onSubmit: async (data) => {
          if (record) await store.update('staffMemos', record.id, data);
          else await store.add('staffMemos', data);
          refresh();
        },
      });
    }

    refresh();
  }

  setTab('employees');
}
