import { store } from '../store.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, actionButtons, sectionHeader, openModal, confirmDelete } from '../ui.js';

// Categories a withdrawal actually makes sense for: they get used up.
// Heavy Equipment/Vehicles are fixed assets, not consumed. Dozer Parts and
// Consumables each have their own dedicated withdrawal tracker under
// Resource Management.
const WITHDRAWAL_CATEGORIES = ['Tools', 'Safety Gear'];

function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
}

function employeeOptions() {
  return [{ value: '', label: '— Not specified —' }, ...store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }))];
}

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || '—';
}

function withdrawableItems() {
  return store.get('inventory').filter((i) => WITHDRAWAL_CATEGORIES.includes(i.category));
}

function withdrawalFields(items) {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'itemName', label: 'Item', type: 'select', required: true, options: items.length
      ? items.map((i) => ({ value: i.name, label: `${i.name} (${i.quantity} ${i.unit || 'unit'} in stock)` }))
      : [{ value: '', label: '— No Tools/Consumables/Safety Gear items yet —' }] },
    { name: 'quantity', label: 'Quantity Withdrawn', type: 'number', required: true, min: 0 },
    { name: 'issuedTo', label: 'Issued To (Staff)', type: 'select', options: employeeOptions() },
    { name: 'equipment', label: 'Equipment (optional — if used on a specific machine)' },
    { name: 'notes', label: 'Notes (job / reason)', type: 'textarea' },
  ];
}

function fields() {
  return [
    { name: 'name', label: 'Item Name', required: true },
    { name: 'category', label: 'Category', type: 'select', required: true, options: [
      { value: 'Heavy Equipment', label: 'Heavy Equipment' },
      { value: 'Vehicles', label: 'Vehicles' },
      { value: 'Tools', label: 'Tools' },
      { value: 'Consumables', label: 'Consumables (managed under Resource Management)' },
      { value: 'Safety Gear', label: 'Safety Gear' },
      { value: 'Dozer Parts', label: 'Dozer Parts (managed under Resource Management)' },
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

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Withdrawal Log — Tools, Safety Gear'));
  container.appendChild(el('p', { class: 'section-subtitle' }, "Logging a withdrawal deducts the quantity from the item's stock automatically — it is not a manual stock edit. Doesn't apply to Heavy Equipment/Vehicles (fixed assets), or Dozer Parts/Consumables (tracked separately under Resource Management)."));
  const withdrawalHeader = el('div', { class: 'section-header' }, [
    el('span', {}),
    el('button', { class: 'btn btn-ghost', onClick: () => openWithdrawalForm() }, '+ Log Withdrawal'),
  ]);
  container.appendChild(withdrawalHeader);
  const withdrawalContainer = el('div');
  container.appendChild(withdrawalContainer);

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

    const withdrawals = store.get('inventoryWithdrawals').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    renderTable(withdrawalContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'itemName', label: 'Item' },
        { key: 'quantity', label: 'Qty', render: (r) => r.quantity },
        { key: 'issuedTo', label: 'Issued To', render: (r) => employeeName(r.issuedTo) },
        { key: 'equipment', label: 'Equipment', render: (r) => r.equipment || '—' },
        { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openWithdrawalForm(r),
            onDelete: async () => {
              if (!confirmDelete(`${r.itemName} withdrawal on ${formatDate(r.date)}`)) return;
              try {
                await store.remove('inventoryWithdrawals', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this record.');
              }
            },
          }),
        },
      ],
      rows: withdrawals,
      emptyText: 'No withdrawals logged yet.',
    });
  }

  function openForm(record) {
    openModal({
      title: record ? 'Edit Item' : 'Add Item',
      fields: fields(),
      initial: record || {},
      submitLabel: record ? 'Save Changes' : 'Add Item',
      onSubmit: async (data) => {
        if (record) await store.update('inventory', record.id, data);
        else await store.add('inventory', data);
        refresh();
      },
    });
  }

  function openWithdrawalForm(record) {
    const items = withdrawableItems();
    if (!items.length && !record) {
      window.alert('Add a Tools, Consumables, or Safety Gear item first.');
      return;
    }
    openModal({
      title: record ? 'Edit Withdrawal' : 'Log Withdrawal',
      fields: withdrawalFields(items),
      initial: record || { date: new Date().toISOString().slice(0, 10) },
      submitLabel: record ? 'Save Changes' : 'Log Withdrawal',
      onSubmit: async (data) => {
        const qty = Number(data.quantity) || 0;
        const previousQty = record ? Number(record.quantity) || 0 : 0;
        const previousItem = record?.itemName;

        if (record) await store.update('inventoryWithdrawals', record.id, data);
        else await store.add('inventoryWithdrawals', data);

        if (previousItem) {
          const oldItem = store.get('inventory').find((i) => i.name === previousItem);
          if (oldItem) await store.update('inventory', oldItem.id, { quantity: (oldItem.quantity || 0) + previousQty });
        }
        const item = store.get('inventory').find((i) => i.name === data.itemName);
        if (item) await store.update('inventory', item.id, { quantity: (item.quantity || 0) - qty });

        refresh();
      },
    });
  }

  refresh();
}
