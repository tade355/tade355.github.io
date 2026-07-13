import { store } from '../store.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete } from '../ui.js';
import { PROJECTS, ACCESS_TIERS, ACCESS_TIER_LABELS } from '../constants.js';

const FIELDS = [
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
    ...PROJECTS.map((p) => ({ value: p, label: p })),
  ] },
];

export function renderHR(container) {
  container.innerHTML = '';

  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openForm() }, '+ Add Employee');
  container.appendChild(sectionHeader('HR & Employees', 'Staff records and roles', addBtn));

  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const rows = store.get('employees');
    renderTable(tableContainer, {
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'role', label: 'Role' },
        { key: 'department', label: 'Department' },
        { key: 'phone', label: 'Phone', render: (r) => r.phone || '—' },
        { key: 'salary', label: 'Salary', render: (r) => (r.salary ? formatCurrency(r.salary) : '—') },
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
      fields: FIELDS,
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
