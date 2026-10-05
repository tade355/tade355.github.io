// Bikes, cars, and other vehicles — moved out of the dozer-focused Fleet
// Roster (erp/js/views/fleet.js) because none of that roster's fields
// (hourly rate, diesel consumption tiers, service interval) apply to them.
// Tracked here instead by the project and the manager responsible for each
// one, under Resource Management.
import { store } from '../store.js';
import { el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';

const PROJECT_ITEM_CATEGORY = 'Vehicles';

function projectOptions() {
  return [{ value: '', label: '— Unassigned —' }, ...store.get('projects').map((p) => ({ value: p.name, label: p.name }))];
}

function employeeOptions() {
  return [{ value: '', label: '— Unassigned —' }, ...store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }))];
}

function managerName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || '—';
}

function projectItems() {
  return store.get('inventory').filter((i) => i.category === PROJECT_ITEM_CATEGORY);
}

function fields() {
  return [
    { name: 'name', label: 'Item Name (e.g. Bike MB-005, Tacoma)', required: true },
    { name: 'sku', label: 'SKU' },
    { name: 'location', label: 'Location' },
    { name: 'currentProject', label: 'Assigned Project', type: 'select', options: projectOptions() },
    { name: 'assignedManagerId', label: 'Assigned Manager', type: 'select', options: employeeOptions() },
    { name: 'fleetStatus', label: 'Status', type: 'select', options: [
      { value: 'Active', label: 'Active' },
      { value: 'Idle', label: 'Idle' },
      { value: 'Under Maintenance', label: 'Under Maintenance' },
      { value: 'Down', label: 'Down' },
    ] },
  ];
}

export function renderProjectItems(container) {
  container.innerHTML = '';
  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openForm() }, '+ Add Project Item');
  container.appendChild(sectionHeader('Project Items', 'Bikes, cars, and other vehicles — tracked by project and the manager responsible for them, separate from the dozer fleet', addBtn));

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const items = projectItems();
    const unassigned = items.filter((i) => !i.currentProject || !i.assignedManagerId);

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Items Tracked', value: String(items.length) }),
      statCard({ label: 'Missing Project/Manager', value: String(unassigned.length), tone: unassigned.length ? 'warning' : 'good' }),
    ]));

    renderTable(tableContainer, {
      columns: [
        { key: 'name', label: 'Item' },
        { key: 'sku', label: 'SKU', render: (r) => r.sku || '—' },
        { key: 'currentProject', label: 'Project', render: (r) => r.currentProject || '— Unassigned —' },
        { key: 'assignedManagerId', label: 'Manager', render: (r) => managerName(r.assignedManagerId) },
        { key: 'fleetStatus', label: 'Status', render: (r) => statusPill(r.fleetStatus || 'Active') },
        { key: 'location', label: 'Location', render: (r) => r.location || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openForm(r),
            onDelete: async () => {
              if (!confirmDelete(r.name)) return;
              try {
                await store.remove('inventory', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this item.');
              }
            },
          }),
        },
      ],
      rows: items,
      emptyText: 'No project items tracked yet.',
      rowClass: (r) => (!r.currentProject || !r.assignedManagerId ? 'row-warning' : undefined),
    });
  }

  function openForm(record) {
    openModal({
      title: record ? 'Edit Project Item' : 'Add Project Item',
      fields: fields(),
      initial: record || { fleetStatus: 'Active' },
      submitLabel: record ? 'Save Changes' : 'Add Item',
      onSubmit: async (data) => {
        const payload = { ...data, category: PROJECT_ITEM_CATEGORY };
        if (record) await store.update('inventory', record.id, payload);
        else await store.add('inventory', { ...payload, quantity: 1, unit: 'unit' });
        refresh();
      },
    });
  }

  refresh();
}
