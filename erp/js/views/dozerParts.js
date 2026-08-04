import { store } from '../store.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, actionButtons, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { fleetItems } from './fleet.js';

const PART_CATEGORY = 'Dozer Parts';

function partsCatalog() {
  return store.get('inventory').filter((i) => i.category === PART_CATEGORY);
}

function fleetOptions() {
  return fleetItems().map((i) => ({ value: i.name, label: i.name }));
}

function employeeOptions() {
  return [{ value: '', label: '— Not specified —' }, ...store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }))];
}

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || '—';
}

function partFields() {
  return [
    { name: 'name', label: 'Part Name', required: true },
    { name: 'sku', label: 'Part Number / SKU', required: true },
    { name: 'quantity', label: 'Current Stock', type: 'number', required: true, min: 0 },
    { name: 'unit', label: 'Unit (e.g. unit, set, litres)', required: true },
    { name: 'unitCost', label: 'Unit Cost (₦)', type: 'number', required: true, min: 0 },
    { name: 'reorderLevel', label: 'Reorder Level', type: 'number', required: true, min: 0 },
    { name: 'location', label: 'Storage Location' },
  ];
}

function withdrawalFields(parts) {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'partName', label: 'Part', type: 'select', required: true, options: parts.length
      ? parts.map((p) => ({ value: p.name, label: `${p.name} (${p.quantity} ${p.unit || 'unit'} in stock)` }))
      : [{ value: '', label: '— Add a part to the catalog first —' }] },
    { name: 'quantity', label: 'Quantity Withdrawn', type: 'number', required: true, min: 0 },
    { name: 'equipment', label: 'Dozer / Equipment', type: 'select', required: true, options: fleetOptions() },
    { name: 'withdrawnBy', label: 'Withdrawn By', type: 'select', options: employeeOptions() },
    { name: 'notes', label: 'Notes (job / reason)', type: 'textarea' },
  ];
}

export function renderDozerParts(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('Bulldozer Parts & Supplies', 'Parts catalog, stock levels, ordering, and per-dozer withdrawal / utilization tracking'));

  const summarySlot = el('div');
  container.appendChild(summarySlot);

  const catalogHeader = el('div', { class: 'section-header' }, [
    el('h3', { class: 'subsection-title' }, 'Parts Catalog'),
    el('button', { class: 'btn btn-primary', onClick: () => openPartForm() }, '+ Add Part'),
  ]);
  container.appendChild(catalogHeader);
  const catalogContainer = el('div');
  container.appendChild(catalogContainer);

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Withdrawal / Utilization Log'));
  container.appendChild(el('p', { class: 'section-subtitle' }, 'Logging a withdrawal deducts the quantity from the part\'s stock automatically — it is not a manual stock edit.'));
  const withdrawLogHeader = el('div', { class: 'section-header' }, [
    el('span', {}),
    el('button', { class: 'btn btn-primary', onClick: () => openWithdrawalForm() }, '+ Log Withdrawal'),
  ]);
  container.appendChild(withdrawLogHeader);
  const withdrawalContainer = el('div');
  container.appendChild(withdrawalContainer);

  function refresh() {
    const parts = partsCatalog();
    const lowStock = parts.filter((p) => p.quantity <= (p.reorderLevel || 0));
    const withdrawals = store.get('dozerPartWithdrawals').slice().sort((a, b) => (a.date < b.date ? 1 : -1));

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Parts Tracked', value: String(parts.length) }),
      statCard({ label: 'Low Stock', value: String(lowStock.length), tone: lowStock.length ? 'warning' : 'good' }),
      statCard({ label: 'Withdrawals Logged', value: String(withdrawals.length) }),
    ]));

    renderTable(catalogContainer, {
      columns: [
        { key: 'name', label: 'Part' },
        { key: 'sku', label: 'Part Number' },
        { key: 'quantity', label: 'In Stock', render: (r) => `${r.quantity} ${r.unit || ''}`.trim() },
        { key: 'reorderLevel', label: 'Reorder Level', render: (r) => r.reorderLevel ?? '—' },
        { key: 'unitCost', label: 'Unit Cost', render: (r) => (r.unitCost ? formatCurrency(r.unitCost) : '—') },
        { key: 'location', label: 'Location', render: (r) => r.location || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openPartForm(r),
            onDelete: async () => {
              if (!confirmDelete(r.name)) return;
              try {
                await store.remove('inventory', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this part.');
              }
            },
          }),
        },
      ],
      rows: parts,
      emptyText: 'No dozer parts in the catalog yet.',
      rowClass: (r) => (r.quantity <= (r.reorderLevel || 0) ? 'row-warning' : undefined),
    });

    renderTable(withdrawalContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'partName', label: 'Part' },
        { key: 'quantity', label: 'Qty', render: (r) => r.quantity },
        { key: 'equipment', label: 'Dozer / Equipment' },
        { key: 'withdrawnBy', label: 'Withdrawn By', render: (r) => employeeName(r.withdrawnBy) },
        { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openWithdrawalForm(r),
            onDelete: async () => {
              if (!confirmDelete(`${r.partName} withdrawal on ${formatDate(r.date)}`)) return;
              try {
                await store.remove('dozerPartWithdrawals', r.id);
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

  function openPartForm(record) {
    openModal({
      title: record ? 'Edit Part' : 'Add Part',
      fields: partFields(),
      initial: record || { quantity: 0, reorderLevel: 0 },
      submitLabel: record ? 'Save Changes' : 'Add Part',
      onSubmit: async (data) => {
        const payload = { ...data, category: PART_CATEGORY };
        if (record) await store.update('inventory', record.id, payload);
        else await store.add('inventory', payload);
        refresh();
      },
    });
  }

  function openWithdrawalForm(record) {
    const parts = partsCatalog();
    if (!parts.length && !record) {
      window.alert('Add a part to the catalog first.');
      return;
    }
    openModal({
      title: record ? 'Edit Withdrawal' : 'Log Withdrawal',
      fields: withdrawalFields(parts),
      initial: record || { date: new Date().toISOString().slice(0, 10) },
      submitLabel: record ? 'Save Changes' : 'Log Withdrawal',
      onSubmit: async (data) => {
        const qty = Number(data.quantity) || 0;
        const previousQty = record ? Number(record.quantity) || 0 : 0;
        const previousPart = record?.partName;

        if (record) {
          await store.update('dozerPartWithdrawals', record.id, data);
        } else {
          await store.add('dozerPartWithdrawals', data);
        }

        // Restore stock to the old part (if editing and the part or qty
        // changed), then deduct the new quantity from the current part —
        // keeps the catalog's "in stock" figure accurate through edits too.
        if (previousPart) {
          const oldPart = store.get('inventory').find((i) => i.name === previousPart && i.category === PART_CATEGORY);
          if (oldPart) await store.update('inventory', oldPart.id, { quantity: (oldPart.quantity || 0) + previousQty });
        }
        const part = store.get('inventory').find((i) => i.name === data.partName && i.category === PART_CATEGORY);
        if (part) await store.update('inventory', part.id, { quantity: (part.quantity || 0) - qty });

        refresh();
      },
    });
  }

  refresh();
}
