import { store } from '../store.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete } from '../ui.js';
import { ACCESS_TIERS, ACCESS_TIER_LABELS } from '../constants.js';
import { printStaffMemo } from '../print.js';
import { getCurrentUserId } from '../session.js';
import { renderPayroll } from './payroll.js';
import { renderDozerPayroll } from './dozerPayroll.js';

const MEMO_TYPES = ['Memo', 'Notice', 'Warning Letter', 'Query Letter', 'Commendation Letter', 'Confirmation Letter', 'Other'];

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

function queryCommendFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'type', label: 'Type', type: 'select', required: true, options: [
      { value: 'Query Letter', label: 'Query' },
      { value: 'Commendation Letter', label: 'Commendation' },
    ] },
    { name: 'employeeId', label: 'Staff Member', type: 'select', required: true, options: employeeOptions() },
    { name: 'subject', label: 'Subject', required: true },
    { name: 'body', label: 'Reason / Details', type: 'textarea', required: true },
    { name: 'issuedBy', label: 'Issued By', type: 'select', options: [
      { value: '', label: '— Not specified —' },
      ...employeeOptions(),
    ] },
  ];
}

function assetFields() {
  return [
    { name: 'name', label: 'Asset Name', required: true },
    { name: 'category', label: 'Category (e.g. Furniture, Electronics, Generator)' },
    { name: 'serialNumber', label: 'Serial / Tag Number' },
    { name: 'assignedType', label: 'Assigned To', type: 'select', required: true, options: [
      { value: 'Project', label: 'A Project' },
      { value: 'Staff', label: 'A Staff Member' },
      { value: 'Unassigned', label: 'Unassigned / General Use' },
    ] },
    { name: 'project', label: 'Project (if assigned to a Project)', type: 'select', options: [
      { value: '', label: '— Not applicable —' },
      ...projectOptions(),
    ] },
    { name: 'employeeId', label: 'Staff Member (if assigned to a Staff member)', type: 'select', options: [
      { value: '', label: '— Not applicable —' },
      ...employeeOptions(),
    ] },
    { name: 'dateAssigned', label: 'Date Assigned', type: 'date' },
    { name: 'status', label: 'Status', type: 'select', required: true, options: [
      { value: 'Deployed', label: 'Deployed' },
      { value: 'Returned', label: 'Returned' },
      { value: 'Damaged', label: 'Damaged' },
      { value: 'Lost', label: 'Lost' },
    ] },
    { name: 'notes', label: 'Notes' },
  ];
}

export function renderHR(container) {
  container.innerHTML = '';

  let tab = 'employees';
  const tabBar = el('div', { class: 'tab-bar' });
  const employeesTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('employees') }, 'Employees');
  const memosTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('memos') }, 'Memos & Notices');
  const queryCommendTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('queryCommend') }, 'Query / Commendation');
  const assetsTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('assets') }, 'Assets Tracker');
  const payrollTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('payroll') }, 'Payroll');
  const operatorAllowanceTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('operatorAllowance') }, 'Operator Allowance');
  tabBar.appendChild(employeesTabBtn);
  tabBar.appendChild(memosTabBtn);
  tabBar.appendChild(queryCommendTabBtn);
  tabBar.appendChild(assetsTabBtn);
  tabBar.appendChild(payrollTabBtn);
  tabBar.appendChild(operatorAllowanceTabBtn);

  const actionSlot = el('div');
  container.appendChild(sectionHeader('HR & Employees', 'Staff records, roles, memos/notices, payroll, and operator allowance', actionSlot));
  container.appendChild(tabBar);

  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    employeesTabBtn.classList.toggle('active', tab === 'employees');
    memosTabBtn.classList.toggle('active', tab === 'memos');
    queryCommendTabBtn.classList.toggle('active', tab === 'queryCommend');
    assetsTabBtn.classList.toggle('active', tab === 'assets');
    payrollTabBtn.classList.toggle('active', tab === 'payroll');
    operatorAllowanceTabBtn.classList.toggle('active', tab === 'operatorAllowance');
    if (tab === 'employees') renderEmployeesTab();
    else if (tab === 'memos') renderMemosTab();
    else if (tab === 'queryCommend') renderQueryCommendTab();
    else if (tab === 'assets') renderAssetsTab();
    else if (tab === 'payroll') renderPayrollTab();
    else renderOperatorAllowanceTab();
  }

  function renderPayrollTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderPayroll(body);
  }

  function renderOperatorAllowanceTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderDozerPayroll(body);
  }

  function renderEmployeesTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openForm() }, '+ Add Employee'));

    body.innerHTML = '';
    const tableContainer = el('div');
    body.appendChild(tableContainer);

    const STATUS_ORDER = ['Active', 'Suspended', 'Disengaged'];
    function refresh() {
      const rows = store.get('employees')
        .slice()
        .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
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

  function renderQueryCommendTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openQueryCommendForm() }, '+ Issue Query / Commendation'));

    body.innerHTML = '';
    body.appendChild(el('p', { class: 'section-subtitle' }, 'A shortcut for issuing a Query or Commendation letter to a staff member — stored alongside Memos & Notices, filtered to just these two types here.'));
    const tableContainer = el('div');
    body.appendChild(tableContainer);

    function refresh() {
      const rows = store.get('staffMemos')
        .filter((m) => m.type === 'Query Letter' || m.type === 'Commendation Letter')
        .slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      renderTable(tableContainer, {
        columns: [
          { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
          { key: 'type', label: 'Type', render: (r) => statusPill(r.type === 'Query Letter' ? 'Query' : 'Commendation') },
          { key: 'employeeId', label: 'Staff Member', render: (r) => (r.employeeId ? employeeName(r.employeeId) : '—') },
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
              onEdit: () => openQueryCommendForm(r),
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
        emptyText: 'No queries or commendations issued yet.',
      });
    }

    function openQueryCommendForm(record) {
      openModal({
        title: record ? 'Edit Query / Commendation' : 'Issue Query / Commendation',
        fields: queryCommendFields(),
        initial: record || { date: new Date().toISOString().slice(0, 10), type: 'Query Letter', issuedBy: getCurrentUserId() || '' },
        submitLabel: record ? 'Save Changes' : 'Issue',
        onSubmit: async (data) => {
          if (record) await store.update('staffMemos', record.id, data);
          else await store.add('staffMemos', data);
          refresh();
        },
      });
    }

    refresh();
  }

  function renderAssetsTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openAssetForm() }, '+ Add Asset'));

    body.innerHTML = '';
    body.appendChild(el('p', { class: 'section-subtitle' }, 'Movable assets and items — deployed to a project, assigned to a staff member, or kept as general-use/unassigned.'));
    const tableContainer = el('div');
    body.appendChild(tableContainer);

    function assignedToLabel(r) {
      if (r.assignedType === 'Project') return r.project ? `Project: ${r.project}` : 'Project (not set)';
      if (r.assignedType === 'Staff') return r.employeeId ? employeeName(r.employeeId) : 'Staff (not set)';
      return 'General Use';
    }

    function refresh() {
      const rows = store.get('assets').slice().sort((a, b) => (a.name < b.name ? -1 : 1));
      renderTable(tableContainer, {
        columns: [
          { key: 'name', label: 'Asset' },
          { key: 'category', label: 'Category', render: (r) => r.category || '—' },
          { key: 'assignedTo', label: 'Assigned To', render: (r) => assignedToLabel(r) },
          { key: 'dateAssigned', label: 'Date Assigned', render: (r) => (r.dateAssigned ? formatDate(r.dateAssigned) : '—') },
          { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => openAssetForm(r),
              onDelete: async () => {
                if (!confirmDelete(r.name)) return;
                try {
                  await store.remove('assets', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this asset.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No assets tracked yet.',
      });
    }

    function openAssetForm(record) {
      openModal({
        title: record ? 'Edit Asset' : 'Add Asset',
        fields: assetFields(),
        initial: record || { assignedType: 'Unassigned', status: 'Deployed', dateAssigned: new Date().toISOString().slice(0, 10) },
        submitLabel: record ? 'Save Changes' : 'Add Asset',
        onSubmit: async (data) => {
          if (record) await store.update('assets', record.id, data);
          else await store.add('assets', data);
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
