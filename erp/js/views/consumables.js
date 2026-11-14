import { selectableEmployees } from '../selectionOptions.js';
import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, actionButtons, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { getCurrentTier } from '../session.js';
import { uniqueFinancialRecords } from '../requestDuplicates.js';

const CONSUMABLE_CATEGORY = 'Consumables';
const LUBRICANT = /\b(?:engine oil|hydraulic (?:oil|fluid)|gear oil|grease|lubricants?|lube)\b/i;

function lubricantPurchases() {
  const requests = uniqueFinancialRecords(store.get('fundRequests'), 'fundRequests', store.get('recordSupersessions'))
    .filter((r) => r.status === 'Paid')
    .flatMap((r) => (r.items || []).filter((item) => LUBRICANT.test(item.description || ''))
      .map((item) => ({ id: r.id, date: r.date, description: item.description,
        amount: Number(item.amount) || 0, source: 'Paid request', link: '#/fundRequests' })));
  const expenses = store.get('expenses')
    .filter((e) => LUBRICANT.test(`${e.category || ''} ${e.description || ''}`))
    .filter((e) => !requests.some((r) => r.date === e.date && r.amount === Number(e.amount)
      && (LUBRICANT.exec(r.description || '')?.[0] || '').toLowerCase()
        === (LUBRICANT.exec(e.description || '')?.[0] || '').toLowerCase()))
    .map((e) => ({ id: e.id, date: e.date, description: e.description || e.category,
      amount: Number(e.amount) || 0, source: 'Expense', link: '#/accounting' }));
  return [...requests, ...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function consumablesCatalog() {
  return store.get('inventory').filter((i) => i.category === CONSUMABLE_CATEGORY);
}

function employeeOptions() {
  return [{ value: '', label: '— Not specified —' }, ...selectableEmployees(store.get('employees')).map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }))];
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

  let purchaseContainer;
  if (['Admin', 'Accounts'].includes(getCurrentTier())) {
    container.appendChild(el('h3', { class: 'subsection-title' }, 'Purchase & Payment History'));
    container.appendChild(el('p', { class: 'section-subtitle' },
      'Paid records show what was bought or requested. Stock on hand needs a separate quantity count.'));
    purchaseContainer = el('div');
    container.appendChild(purchaseContainer);
  }
  const maintenanceCoverage = el('div');
  container.appendChild(el('h3', { class: 'subsection-title' }, 'Maintenance Cost Coverage'));
  container.appendChild(el('p', { class: 'section-subtitle' }, 'Costed maintenance work is shown here until its parts, lubricant and labour lines are linked to stock withdrawals.'));
  container.appendChild(maintenanceCoverage);

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

    if (purchaseContainer) renderTable(purchaseContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'description', label: 'Purchase / Payment' },
        { key: 'amount', label: 'Recorded Amount', render: (r) => formatCurrency(r.amount) },
        { key: 'source', label: 'Source', render: (r) => el('a', { href: r.link }, `${r.source} ${r.id}`) },
      ],
      rows: lubricantPurchases(),
      emptyText: 'No paid lubricant records found.',
    });

    const maintenance = store.get('maintenanceLogs').filter((m) => Number(m.cost || m.partsCost || m.labourCost) > 0)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 50);
    renderTable(maintenanceCoverage, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'equipment', label: 'Equipment', render: (r) => r.equipment || '—' },
        { key: 'description', label: 'Maintenance', render: (r) => r.description || r.issue || 'Maintenance record' },
        { key: 'cost', label: 'Recorded Cost', render: (r) => formatCurrency(Number(r.cost || r.partsCost || r.labourCost) || 0) },
        { key: 'source', label: 'Source', render: () => el('a', { href: '#/fleet' }, 'Fleet maintenance') },
      ], rows: maintenance,
      emptyText: 'No costed maintenance records need item linkage yet.',
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
      initial: record || { date: todayISOString() },
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

