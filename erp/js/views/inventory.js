import { store } from '../store.js';
import { formatCurrency, el } from '../utils.js';
import { renderTable, actionButtons, sectionHeader, openModal, confirmDelete } from '../ui.js';
function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
}

function fields() {
  return [
    { name: 'name', label: 'Item Name', required: true },
    { name: 'category', label: 'Category', type: 'select', required: true, options: [
      { value: 'Heavy Equipment', label: 'Heavy Equipment' },
      { value: 'Vehicles', label: 'Vehicles' },
      { value: 'Tools', label: 'Tools' },
      { value: 'Consumables', label: 'Consumables' },
      { value: 'Safety Gear', label: 'Safety Gear' },
    ] },
    { name: 'sku', label: 'SKU', required: true },
    { name: 'quantity', label: 'Quantity', type: 'number', required: true, min: 0 },
    { name: 'unit', label: 'Unit (e.g. unit, litres, drums)', required: true },
    { name: 'unitCost', label: 'Unit Cost (₦)', type: 'number', required: true, min: 0 },
    { name: 'reorderLevel', label: 'Reorder Level', type: 'number', required: true, min: 0 },
    { name: 'location', label: 'Location', required: true },
    { name: 'currentProject', label: 'Current Project (for deployed equipment)', type: 'select', options: [
      { value: '', label: '— Unassigned —' },
      ...projectOptions(),
    ] },
  ];
}

export function renderInventory(container) {
  container.innerHTML = '';

  const addBtn = el('button', { class: 'btn btn-primary', onClick: () => openForm() }, '+ Add Item');
  container.appendChild(sectionHeader('Inventory & Equipment', 'Machinery, tools, and consumables stock', addBtn));

  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const rows = store.get('inventory');
    renderTable(tableContainer, {
      columns: [
        { key: 'name', label: 'Item' },
        { key: 'category', label: 'Category' },
        { key: 'sku', label: 'SKU' },
        { key: 'quantity', label: 'Qty', render: (r) => `${r.quantity} ${r.unit}` },
        { key: 'unitCost', label: 'Unit Cost', render: (r) => formatCurrency(r.unitCost) },
        { key: 'location', label: 'Location' },
        { key: 'currentProject', label: 'Current Project', render: (r) => r.currentProject || '—' },
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
      rows,
      emptyText: 'No inventory items yet. Add your first item.',
      rowClass: (r) => (r.quantity <= r.reorderLevel ? 'row-warning' : undefined),
    });
  }

  function openForm(record) {
    openModal({
      title: record ? 'Edit Item' : 'Add Item',
      fields: FIELDS,
      initial: record || {},
      submitLabel: record ? 'Save Changes' : 'Add Item',
      onSubmit: async (data) => {
        if (record) await store.update('inventory', record.id, data);
        else await store.add('inventory', data);
        refresh();
      },
    });
  }

  refresh();
}
