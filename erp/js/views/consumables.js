import { store } from '../store.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, actionButtons, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';

const CONSUMABLE_CATEGORY = 'Consumables';

function consumablesCatalog() {
  return store.get('inventory').filter((i) => i.category === CONSUMABLE_CATEGORY);
}

function employeeOptions() {
  return [{ value: '', label: '— Not specified —' }, ...store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }))];
}

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || '—';
}

function itemFields() {
  return [
    { name: 'name', label: 'Item Name (e.g. Engine Oil 15W40, Grease, Hydraulic Fluid)', required: true },
    { name: 'sku', label: 'SKU', required: true },
    { name: 'quantity', label: 'Current Stock', type: 'number', required: true, min: 0 },
    { name: 'unit', label: 'Unit (e.g. litres, drums, kg)', required: true },
    { name: 'unitCost', label: 'Unit Cost (₦)', type: 'number', required: true, min: 0 },
    { name: 'reorderLevel', label: 'Reorder Level', type: 'number', required: true, min: 0 },
    { name: 'location', label: 'Storage Location' },
  ];
}

function withdrawalFields(items) {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'itemName', label: 'Item', type: 'select', required: true, options: items.length
      ? items.map((i) => ({ value: i.name, label: `${i.name} (${i.quantity} ${i.unit || 'unit'} in stock)` }))
      : [{ value: '', label: '— Add an item to the catalog first —' }] },
    { name: 'quantity', label: 'Quantity Withdrawn', type: 'number', required: true, min: 0 },
    { name: 'issuedTo', label: 'Issued To (Staff)', type: 'select', options: employeeOptions() },
    { name: 'equipment', label: 'Equipment (optional — if used on a specific dozer)' },
    { name: 'notes', label: 'Notes (job / reason)', type: 'textarea' },
  ];
}

export function renderConsumables(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('Lubricants & Consumables', 'Engine oil, grease, hydraulic fluid, and other consumables — stock levels and per-dozer withdrawal / utilization tracking'));

  const summarySlot = el('div');
  container.appendChild(summarySlot);

  const catalogHeader = el('div', { class: 'section-header' }, [
    el('h3', { class: 'subsection-title' }, 'Catalog'),
    el('button', { class: 'btn btn-primary', onClick: () => openItemForm() }, '+ Add Item'),
  ]);
  container.appendChild(catalogHeader);
  const catalogContainer = el('div');
  container.appendChild(catalogContainer);

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Withdrawal / Utilization Log'));
  container.appendChild(el('p', { class: 'section-subtitle' }, 'Logging a withdrawal deducts the quantity from the item\'s stock automatically — it is not a manual stock edit.'));
  const withdrawLogHeader = el('div', { class: 'section-header' }, [
    el('span', {}),
    el('button', { class: 'btn btn-primary', onClick: () => openWithdrawalForm() }, '+ Log Withdrawal'),
  ]);
  container.appendChild(withdrawLogHeader);
  const withdrawalContainer = el('div');
  container.appendChild(withdrawalContainer);

  function refresh() {
    const items = consumablesCatalog();
    const lowStock = items.filter((i) => i.quantity <= (i.reorderLevel || 0));
    const withdrawals = store.get('inventoryWithdrawals')
      .filter((w) => items.some((i) => i.name === w.itemName))
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Items Tracked', value: String(items.length) }),
      statCard({ label: 'Low Stock', value: String(lowStock.length), tone: lowStock.length ? 'warning' : 'good' }),
      statCard({ label: 'Withdrawals Logged', value: String(withdrawals.length) }),
    ]));

    renderTable(catalogContainer, {
      columns: [
        { key: 'name', label: 'Item' },
        { key: 'sku', label: 'SKU' },
        { key: 'quantity', label: 'In Stock', render: (r) => `${r.quantity} ${r.unit || ''}`.trim() },
        { key: 'reorderLevel', label: 'Reorder Level', render: (r) => r.reorderLevel ?? '—' },
        { key: 'unitCost', label: 'Unit Cost', render: (r) => (r.unitCost ? formatCurrency(r.unitCost) : '—') },
        { key: 'location', label: 'Location', render: (r) => r.location || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openItemForm(r),
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
      emptyText: 'No lubricants or consumables in the catalog yet.',
      rowClass: (r) => (r.quantity <= (r.reorderLevel || 0) ? 'row-warning' : undefined),
    });

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

  function openItemForm(record) {
    openModal({
      title: record ? 'Edit Item' : 'Add Item',
      fields: itemFields(),
      initial: record || { quantity: 0, reorderLevel: 0 },
      submitLabel: record ? 'Save Changes' : 'Add Item',
      onSubmit: async (data) => {
        const payload = { ...data, category: CONSUMABLE_CATEGORY };
        if (record) await store.update('inventory', record.id, payload);
        else await store.add('inventory', payload);
        refresh();
      },
    });
  }

  function openWithdrawalForm(record) {
    const items = consumablesCatalog();
    if (!items.length && !record) {
      window.alert('Add an item to the catalog first.');
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

        // Restore stock to the old item (if editing and the item or qty
        // changed), then deduct the new quantity from the current item —
        // keeps the catalog's "in stock" figure accurate through edits too.
        if (previousItem) {
          const oldItem = store.get('inventory').find((i) => i.name === previousItem && i.category === CONSUMABLE_CATEGORY);
          if (oldItem) await store.update('inventory', oldItem.id, { quantity: (oldItem.quantity || 0) + previousQty });
        }
        const item = store.get('inventory').find((i) => i.name === data.itemName && i.category === CONSUMABLE_CATEGORY);
        if (item) await store.update('inventory', item.id, { quantity: (item.quantity || 0) - qty });

        refresh();
      },
    });
  }

  refresh();
}
