import { store } from '../store.js';
import { formatCurrency, formatDate, poTotal, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete } from '../ui.js';

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

function poFields() {
  return [
    { name: 'supplierId', label: 'Supplier', type: 'select', required: true, options: supplierOptions() },
    { name: 'date', label: 'Order Date', type: 'date', required: true },
    { name: 'description', label: 'Item Description', required: true },
    { name: 'qty', label: 'Quantity', type: 'number', required: true, min: 0 },
    { name: 'price', label: 'Unit Price (₦)', type: 'number', required: true, min: 0 },
    { name: 'status', label: 'Status', type: 'select', required: true, options: [
      { value: 'Pending', label: 'Pending' },
      { value: 'Received', label: 'Received' },
    ] },
  ];
}

export function renderPurchasing(container) {
  container.innerHTML = '';

  let tab = 'orders';

  const tabBar = el('div', { class: 'tab-bar' });
  const ordersTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('orders') }, 'Purchase Orders');
  const suppliersTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('suppliers') }, 'Suppliers');
  tabBar.appendChild(ordersTabBtn);
  tabBar.appendChild(suppliersTabBtn);

  const actionSlot = el('div');
  container.appendChild(sectionHeader('Purchasing & Suppliers', 'Purchase orders and supplier records', actionSlot));
  container.appendChild(tabBar);

  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    ordersTabBtn.classList.toggle('active', tab === 'orders');
    suppliersTabBtn.classList.toggle('active', tab === 'suppliers');
    if (tab === 'orders') renderOrdersTab();
    else renderSuppliersTab();
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
        : { date: new Date().toISOString().slice(0, 10), status: 'Pending' };
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
            items: [{ description: data.description, qty: data.qty, price: data.price }],
          };
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
