import { store } from '../store.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete } from '../ui.js';

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
  { name: 'phone', label: 'Phone', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'salary', label: 'Monthly Salary (₦)', type: 'number', required: true, min: 0 },
  { name: 'dateHired', label: 'Date Hired', type: 'date', required: true },
  { name: 'status', label: 'Status', type: 'select', required: true, options: [
    { value: 'Active', label: 'Active' },
    { value: 'On Leave', label: 'On Leave' },
    { value: 'Terminated', label: 'Terminated' },
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
        { key: 'phone', label: 'Phone' },
        { key: 'salary', label: 'Salary', render: (r) => formatCurrency(r.salary) },
        { key: 'dateHired', label: 'Hired', render: (r) => formatDate(r.dateHired) },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openForm(r),
            onDelete: () => {
              if (confirmDelete(r.name)) {
                store.remove('employees', r.id);
                refresh();
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
      initial: record || { status: 'Active' },
      submitLabel: record ? 'Save Changes' : 'Add Employee',
      onSubmit: (data) => {
        if (record) store.update('employees', record.id, data);
        else store.add('employees', data);
        refresh();
      },
    });
  }

  refresh();
}
