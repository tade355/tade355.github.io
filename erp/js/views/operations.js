import { store } from '../store.js';
import { formatDate, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { PROJECTS, OPERATION_TYPES, unitForOperationType } from '../constants.js';
import { filterByProject, getAssignedProject } from '../session.js';

const HA_OPERATION_TYPES = OPERATION_TYPES.filter((t) => t.unit === 'Ha').map((t) => t.value);

function employeeOptions() {
  return store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }));
}

function customerOptions() {
  return [{ value: '', label: '— None —' }, ...store.get('customers').map((c) => ({ value: c.id, label: c.name }))];
}

function equipmentOptions() {
  const items = store.get('inventory').filter((i) => ['Heavy Equipment', 'Tools', 'Vehicles'].includes(i.category));
  return items.length
    ? items.map((i) => ({ value: i.name, label: i.name }))
    : [{ value: '', label: 'No equipment in inventory' }];
}

function fields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'siteName', label: 'Site / Project Name', type: 'select', required: true, options: PROJECTS.map((p) => ({ value: p, label: p })) },
    { name: 'customerId', label: 'Client', type: 'select', options: customerOptions() },
    { name: 'equipment', label: 'Equipment Used', type: 'select', required: true, options: equipmentOptions() },
    { name: 'operatorId', label: 'Operator', type: 'select', required: true, options: employeeOptions() },
    { name: 'supervisorId', label: 'Supervisor', type: 'select', required: true, options: employeeOptions() },
    { name: 'hoursWorked', label: 'Hours Worked', type: 'number', required: true, min: 0, step: '0.5' },
    { name: 'operationType', label: 'Operation Type', type: 'select', required: true, options: OPERATION_TYPES.map((t) => ({ value: t.value, label: `${t.value} (${t.unit})` })) },
    { name: 'quantity', label: 'Quantity (Ha for Tree Felling/Stacking/Direct Clearing/Zero Bonding, KM for Road, hrs for Trekking)', type: 'number', required: true, min: 0, step: '0.1' },
    { name: 'fuelUsed', label: 'Fuel Used (litres)', type: 'number', required: true, min: 0 },
    { name: 'status', label: 'Status', type: 'select', required: true, options: [
      { value: 'Completed', label: 'Completed' },
      { value: 'Ongoing', label: 'Ongoing' },
      { value: 'Halted', label: 'Halted' },
    ] },
    { name: 'notes', label: 'Notes', type: 'textarea' },
    { name: 'attachments', label: 'KML File / Photos', type: 'attachments' },
  ];
}

export function renderOperations(container) {
  container.innerHTML = '';

  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openForm() }, '+ Log Daily Report');
  const assignedProject = getAssignedProject();
  container.appendChild(sectionHeader(
    'Daily Land Clearing Operations',
    assignedProject ? `Showing ${assignedProject} only — site activity, equipment usage, and progress logs` : 'Site activity, equipment usage, and progress logs',
    addBtn,
  ));

  const summaryGrid = el('div', { class: 'stats-grid' });
  container.appendChild(summaryGrid);

  let searchQuery = '';
  const searchInput = el('input', { type: 'search', placeholder: 'Search by site, equipment, operator, or notes…' });
  const searchBar = el('div', { class: 'search-bar' }, [searchInput]);
  container.appendChild(searchBar);
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    refresh();
  });

  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const employees = store.get('employees');
    const customers = store.get('customers');
    let rows = filterByProject(store.get('operations'), 'siteName').slice().sort((a, b) => (a.date < b.date ? 1 : -1));

    if (searchQuery) {
      rows = rows.filter((r) => {
        const operatorName = employees.find((e) => e.id === r.operatorId)?.name || '';
        const haystack = [r.siteName, r.equipment, r.operationType, operatorName, r.notes].join(' ').toLowerCase();
        return haystack.includes(searchQuery);
      });
    }

    const haRows = rows.filter((r) => HA_OPERATION_TYPES.includes(r.operationType));
    const roadRows = rows.filter((r) => r.operationType === 'Road');
    const trekkingRows = rows.filter((r) => r.operationType === 'Trekking');
    const totalArea = haRows.reduce((sum, r) => sum + r.quantity, 0);
    const totalRoad = roadRows.reduce((sum, r) => sum + r.quantity, 0);
    const totalTrekking = trekkingRows.reduce((sum, r) => sum + r.quantity, 0);
    const totalFuel = rows.reduce((sum, r) => sum + r.fuelUsed, 0);
    const ongoing = rows.filter((r) => r.status === 'Ongoing').length;

    summaryGrid.innerHTML = '';
    summaryGrid.appendChild(statCard({ label: 'Total Area Cleared', value: `${totalArea.toFixed(1)} Ha` }));
    summaryGrid.appendChild(statCard({ label: 'Total Road', value: `${totalRoad.toFixed(1)} KM` }));
    summaryGrid.appendChild(statCard({ label: 'Total Trekking', value: `${totalTrekking.toFixed(1)} hrs` }));
    summaryGrid.appendChild(statCard({ label: 'Total Fuel Used', value: `${totalFuel.toLocaleString()} L` }));
    summaryGrid.appendChild(statCard({ label: 'Ongoing Sites', value: String(ongoing) }));
    summaryGrid.appendChild(statCard({ label: 'Reports Logged', value: String(rows.length) }));

    renderTable(tableContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'siteName', label: 'Site' },
        { key: 'customer', label: 'Client', render: (r) => customers.find((c) => c.id === r.customerId)?.name || '—' },
        { key: 'equipment', label: 'Equipment' },
        { key: 'operator', label: 'Operator', render: (r) => employees.find((e) => e.id === r.operatorId)?.name || 'Unknown' },
        { key: 'hoursWorked', label: 'Hours', render: (r) => `${r.hoursWorked} h` },
        { key: 'operationType', label: 'Operation Type' },
        { key: 'quantity', label: 'Quantity', render: (r) => `${r.quantity} ${unitForOperationType(r.operationType)}` },
        { key: 'fuelUsed', label: 'Fuel', render: (r) => `${r.fuelUsed} L` },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        { key: 'attachments', label: 'Files', render: (r) => (r.attachments?.length ? `📎 ${r.attachments.length}` : '—') },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openForm(r),
            onDelete: async () => {
              if (!confirmDelete(`${r.siteName} — ${formatDate(r.date)}`)) return;
              try {
                await store.remove('operations', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this report.');
              }
            },
          }),
        },
      ],
      rows,
      emptyText: 'No operations logged yet.',
    });
  }

  function openForm(record) {
    if (!employeeOptions().length) {
      window.alert('Add employees first before logging an operations report.');
      return;
    }
    openModal({
      title: record ? 'Edit Daily Report' : 'Log Daily Report',
      fields: fields(),
      initial: record || { date: new Date().toISOString().slice(0, 10), status: 'Completed', siteName: getAssignedProject() },
      submitLabel: record ? 'Save Changes' : 'Log Report',
      onSubmit: async (data) => {
        if (record) await store.update('operations', record.id, data);
        else await store.add('operations', data);
        refresh();
      },
    });
  }

  refresh();
}
