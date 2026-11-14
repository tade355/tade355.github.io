import { selectableMachines } from '../selectionOptions.js';
import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatCurrency, formatDate, poTotal, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete } from '../ui.js';
import { printPurchaseOrder } from '../print.js';
import { renderFuelCredit } from './fuelCredit.js';
import { requestSubmissionDate } from '../dateUtils.js';

const SUPPLIER_FIELDS = [
  { name: 'name', label: 'Supplier Name', required: true },
  { name: 'contact', label: 'Contact Person', required: true },
  { name: 'phone', label: 'Phone', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'address', label: 'Address' },
];

function supplierOptions() {
  return store.get('suppliers').map((s) => ({ value: s.id, label: s.name }));
}

function stockableInventoryOptions() {
  return selectableMachines(store.get('inventory')).map((i) => ({ value: i.name, label: `${i.name} (${i.quantity} ${i.unit || ''} in stock)`.trim() }));
}

function poFields() {
  return [
    { name: 'supplierId', label: 'Supplier', type: 'select', required: true, options: supplierOptions() },
    { name: 'date', label: 'Order Date', type: 'date', required: true },
    { name: 'description', label: 'Item Description', required: true },
    { name: 'qty', label: 'Quantity', type: 'number', required: true, min: 0 },
    { name: 'price', label: 'Unit Price (₦)', type: 'number', required: true, min: 0 },
    { name: 'inventoryItem', label: 'Restocks Inventory Item (optional — adds this quantity to stock once marked Received)', type: 'select', options: [
      { value: '', label: '— Not linked to inventory —' },
      ...stockableInventoryOptions(),
    ] },
    { name: 'status', label: 'Status', type: 'select', required: true, options: [
      { value: 'Pending', label: 'Pending' },
      { value: 'Received', label: 'Received' },
    ] },
  ];
}

// Adds/reverses the PO's quantity against its linked inventory item on
// every Pending<->Received transition — never on a save that leaves status
// unchanged, so re-saving a Received PO doesn't restock it twice. Reverses
// the OLD contribution first (in case the linked item or quantity also
// changed in the same edit), then applies the new one — the same
// restore-then-apply pattern used for Bulldozer Parts withdrawals.
async function applyInventoryStockChange(record, payload) {
  const wasReceived = record?.status === 'Received' && record?.inventoryItem;
  const isReceived = payload.status === 'Received' && payload.inventoryItem;
  if (wasReceived) {
    const item = store.get('inventory').find((i) => i.name === record.inventoryItem);
    if (item) await store.update('inventory', item.id, { quantity: (item.quantity || 0) - (record.items[0]?.qty || 0) });
  }
  if (isReceived) {
    const item = store.get('inventory').find((i) => i.name === payload.inventoryItem);
    if (item) await store.update('inventory', item.id, { quantity: (item.quantity || 0) + (payload.items[0]?.qty || 0) });
  }
}

export function renderPurchasing(container) {
  container.innerHTML = '';

  let tab = 'orders';

  const tabBar = el('div', { class: 'tab-bar' });
  const ordersTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('orders') }, 'Purchase Orders');
  const suppliersTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('suppliers') }, 'Suppliers');
  const fuelCreditTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('fuelCredit') }, 'Fuel Credit');
  const historyTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('history') }, 'Purchase History');
  tabBar.appendChild(ordersTabBtn);
  tabBar.appendChild(fuelCreditTabBtn);
  tabBar.appendChild(suppliersTabBtn);
  tabBar.appendChild(historyTabBtn);

  const actionSlot = el('div');
  container.appendChild(sectionHeader('Purchasing & Suppliers', 'Purchase orders, supplier records, and fuel credit', actionSlot));
  container.appendChild(tabBar);

  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    ordersTabBtn.classList.toggle('active', tab === 'orders');
    suppliersTabBtn.classList.toggle('active', tab === 'suppliers');
    fuelCreditTabBtn.classList.toggle('active', tab === 'fuelCredit');
    historyTabBtn.classList.toggle('active', tab === 'history');
    if (tab === 'orders') renderOrdersTab();
    else if (tab === 'suppliers') renderSuppliersTab();
    else if (tab === 'history') renderHistoryTab();
    else renderFuelCreditTab();
  }

  function renderFuelCreditTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderFuelCredit(body);
  }

  function renderHistoryTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    const requests = store.get('fundRequests').filter((r) => r.status === 'Paid').flatMap((r) => (r.items || []).map((item) => ({
      date: r.paidAt || r.date, description: item.description || r.description || 'Fund request', amount: Number(item.amount) || 0,
      source: `Paid request ${r.id}`, link: '#/fundRequests', submittedDate: requestSubmissionDate(r), project: r.project || '—',
    })));
    const expenses = store.get('expenses').map((e) => ({ date: e.date, description: e.description || e.category || 'Expense', amount: Number(e.amount) || 0,
      source: `Expense ${e.id}`, link: '#/accounting', submittedDate: e.date, project: e.project || '—' }));
    body.appendChild(el('p', { class: 'section-subtitle' }, 'Financial purchases are shown here even when no formal purchase order was created. Use the source link to review and convert confirmed suppliers or stock items.'));
    renderTable(body, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'submittedDate', label: 'Submission Date', render: (r) => formatDate(r.submittedDate) },
        { key: 'project', label: 'Project' },
        { key: 'description', label: 'Purchase / Expense' },
        { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
        { key: 'source', label: 'Source', render: (r) => el('a', { href: r.link }, r.source) },
      ], rows: [...requests, ...expenses].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
      emptyText: 'No financial purchases or expenses recorded yet.',
    });
  }

  function renderOrdersTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openOrderForm() }, '+ New Purchase Order'));

    function refresh() {
      const suppliers = store.get('suppliers');
      const rows = store.get('purchaseOrders').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      renderTable(body, {
        columns: [
          { key: 'id', label: 'PO #' },
          { key: 'supplier', label: 'Supplier', render: (r) => suppliers.find((s) => s.id === r.supplierId)?.name || 'Unknown' },
          { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
          { key: 'total', label: 'Total', render: (r) => formatCurrency(poTotal(r)) },
          { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onPrint: () => printPurchaseOrder(r, suppliers.find((s) => s.id === r.supplierId)),
              onEdit: () => openOrderForm(r),
              onDelete: async () => {
                if (!confirmDelete(r.id)) return;
                try {
                  await store.remove('purchaseOrders', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this order.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No purchase orders yet.',
      });
    }

    function openOrderForm(record) {
      if (!supplierOptions().length) {
        window.alert('Add a supplier first before creating a purchase order.');
        return;
      }
      const initial = record
        ? { ...record, description: record.items[0]?.description, qty: record.items[0]?.qty, price: record.items[0]?.price }
        : { date: todayISOString(), status: 'Pending' };
      openModal({
        title: record ? 'Edit Purchase Order' : 'New Purchase Order',
        fields: poFields(),
        initial,
        submitLabel: record ? 'Save Changes' : 'Create Order',
        onSubmit: async (data) => {
          const payload = {
            supplierId: data.supplierId,
            date: data.date,
            status: data.status,
            inventoryItem: data.inventoryItem || '',
            items: [{ description: data.description, qty: data.qty, price: data.price }],
          };
          await applyInventoryStockChange(record, payload);
          if (record) await store.update('purchaseOrders', record.id, payload);
          else await store.add('purchaseOrders', payload);
          refresh();
        },
      });
    }

    refresh();
  }

  function renderSuppliersTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openSupplierForm() }, '+ Add Supplier'));

    function refresh() {
      const rows = store.get('suppliers');
      renderTable(body, {
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'contact', label: 'Contact' },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'address', label: 'Address' },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => openSupplierForm(r),
              onDelete: async () => {
                if (!confirmDelete(r.name)) return;
                try {
                  await store.remove('suppliers', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this supplier.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No suppliers yet.',
      });
      const candidates = [...new Set(store.get('fundRequests').filter((r) => ['Approved', 'Paid'].includes(r.status)).flatMap((r) => (r.items || []).map((i) => i.accountName).filter(Boolean)).map((v) => v.trim()).filter(Boolean))].sort();
      body.appendChild(el('h3', { class: 'subsection-title' }, 'Unregistered Payees to Review'));
      body.appendChild(el('p', { class: 'section-subtitle' }, 'These names came from approved or paid request payees. Confirm the supplier identity and contact details before creating a supplier record.'));
      renderTable(body, {
        columns: [{ key: 'name', label: 'Payee / Candidate Supplier' }, { key: 'action', label: 'Next Step', render: () => 'Confirm identity, then Add Supplier' }],
        rows: candidates.map((name) => ({ name })),
        emptyText: 'No unregistered payees found in approved or paid requests.',
      });
    }

    function openSupplierForm(record) {
      openModal({
        title: record ? 'Edit Supplier' : 'Add Supplier',
        fields: SUPPLIER_FIELDS,
        initial: record || {},
        submitLabel: record ? 'Save Changes' : 'Add Supplier',
        onSubmit: async (data) => {
          if (record) await store.update('suppliers', record.id, data);
          else await store.add('suppliers', data);
          refresh();
        },
      });
    }

    refresh();
  }

  setTab('orders');
}

