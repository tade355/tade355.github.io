import { store } from '../store.js';
import { formatCurrency, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';

const FIELDS = [
  { name: 'name', label: 'Project Name', required: true },
  { name: 'status', label: 'Status', type: 'select', required: true, options: [
    { value: 'Active', label: 'Active' },
    { value: 'On Hold', label: 'On Hold' },
    { value: 'Completed', label: 'Completed' },
  ] },
  { name: 'contractStatus', label: 'Contract / T&C Status', type: 'select', options: [
    { value: '', label: '— Not set —' },
    { value: 'Draft', label: 'Draft' },
    { value: 'Pending Signature', label: 'Pending Signature' },
    { value: 'Signed', label: 'Signed' },
    { value: 'Expired', label: 'Expired' },
  ] },
  { name: 'percentComplete', label: 'Percent Complete (%)', type: 'number', min: 0, step: '1' },
  { name: 'rate', label: 'Rate (₦)', type: 'number', min: 0 },
  { name: 'rateUnit', label: 'Rate Unit (e.g. per Ha, per KM)', },
  { name: 'scope', label: 'Scope of Work', type: 'textarea' },
  { name: 'notes', label: 'Notes', type: 'textarea' },
];

export function renderProjects(container) {
  container.innerHTML = '';

  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openForm() }, '+ Add Project');
  container.appendChild(sectionHeader('Projects', 'Every project the company is running — status, contract state, progress, and rate', addBtn));

  const summaryGrid = el('div', { class: 'stats-grid' });
  container.appendChild(summaryGrid);

  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const rows = store.get('projects').slice().sort((a, b) => a.name.localeCompare(b.name));
    const active = rows.filter((r) => r.status === 'Active').length;
    const unsigned = rows.filter((r) => r.contractStatus && r.contractStatus !== 'Signed').length;

    summaryGrid.innerHTML = '';
    summaryGrid.appendChild(statCard({ label: 'Total Projects', value: String(rows.length) }));
    summaryGrid.appendChild(statCard({ label: 'Active', value: String(active), tone: 'good' }));
    summaryGrid.appendChild(statCard({ label: 'Contract Not Signed', value: String(unsigned), tone: unsigned ? 'warning' : 'good' }));

    renderTable(tableContainer, {
      columns: [
        { key: 'name', label: 'Project' },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        { key: 'contractStatus', label: 'Contract Status', render: (r) => (r.contractStatus ? statusPill(r.contractStatus) : '—') },
        { key: 'percentComplete', label: 'Complete', render: (r) => (r.percentComplete === null || r.percentComplete === undefined ? '—' : `${r.percentComplete}%`) },
        { key: 'rate', label: 'Rate', render: (r) => (r.rate ? `${formatCurrency(r.rate)} ${r.rateUnit || ''}`.trim() : '—') },
        { key: 'scope', label: 'Scope', render: (r) => r.scope || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openForm(r),
            onDelete: async () => {
              if (!confirmDelete(r.name)) return;
              try {
                await store.remove('projects', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this project.');
              }
            },
          }),
        },
      ],
      rows,
      emptyText: 'No projects yet. Add your first one.',
    });
  }

  function openForm(record) {
    openModal({
      title: record ? 'Edit Project' : 'Add Project',
      fields: FIELDS,
      initial: record || { status: 'Active' },
      submitLabel: record ? 'Save Changes' : 'Add Project',
      onSubmit: async (data) => {
        if (record) await store.update('projects', record.id, data);
        else await store.add('projects', data);
        refresh();
      },
    });
  }

  refresh();
}
