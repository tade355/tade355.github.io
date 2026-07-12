import { store } from '../store.js';
import { formatCurrency, formatDate, invoiceTotal, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete } from '../ui.js';

const CUSTOMER_FIELDS = [
  { name: 'name', label: 'Company / Customer Name', required: true },
  { name: 'contact', label: 'Contact Person', required: true },
  { name: 'phone', label: 'Phone', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'address', label: 'Address' },
];

function customerOptions() {
  return store.get('customers').map((c) => ({ value: c.id, label: c.name }));
}

function invoiceFields() {
  return [
    { name: 'customerId', label: 'Customer', type: 'select', required: true, options: customerOptions() },
    { name: 'date', label: 'Invoice Date', type: 'date', required: true },
    { name: 'dueDate', label: 'Due Date', type: 'date', required: true },
    { name: 'description', label: 'Description of Work', required: true },
    { name: 'qty', label: 'Quantity (e.g. hectares)', type: 'number', required: true, min: 0, step: '0.1' },
    { name: 'price', label: 'Price per Unit (₦)', type: 'number', required: true, min: 0 },
    { name: 'status', label: 'Status', type: 'select', required: true, options: [
      { value: 'Unpaid', label: 'Unpaid' },
      { value: 'Paid', label: 'Paid' },
    ] },
  ];
}

export function renderSales(container) {
  container.innerHTML = '';

  let tab = 'invoices';

  const tabBar = el('div', { class: 'tab-bar' });
  const invoicesTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('invoices') }, 'Invoices');
  const customersTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('customers') }, 'Customers');
  tabBar.appendChild(invoicesTabBtn);
  tabBar.appendChild(customersTabBtn);

  const actionSlot = el('div');
  container.appendChild(sectionHeader('Sales & Invoicing', 'Customers, invoices, and revenue', actionSlot));
  container.appendChild(tabBar);

  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    invoicesTabBtn.classList.toggle('active', tab === 'invoices');
    customersTabBtn.classList.toggle('active', tab === 'customers');
    if (tab === 'invoices') renderInvoicesTab();
    else renderCustomersTab();
  }

  function renderInvoicesTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openInvoiceForm() }, '+ New Invoice'));

    function refresh() {
      const customers = store.get('customers');
      const rows = store.get('invoices').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      renderTable(body, {
        columns: [
          { key: 'id', label: 'Invoice #' },
          { key: 'customer', label: 'Customer', render: (r) => customers.find((c) => c.id === r.customerId)?.name || 'Unknown' },
          { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
          { key: 'dueDate', label: 'Due', render: (r) => formatDate(r.dueDate) },
          { key: 'total', label: 'Total', render: (r) => formatCurrency(invoiceTotal(r)) },
          { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => openInvoiceForm(r),
              onDelete: () => {
                if (confirmDelete(r.id)) {
                  store.remove('invoices', r.id);
                  refresh();
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No invoices yet.',
        rowClass: (r) => (r.status === 'Unpaid' && r.dueDate < new Date().toISOString().slice(0, 10) ? 'row-critical' : undefined),
      });
    }

    function openInvoiceForm(record) {
      if (!customerOptions().length) {
        window.alert('Add a customer first before creating an invoice.');
        return;
      }
      const initial = record
        ? { ...record, description: record.items[0]?.description, qty: record.items[0]?.qty, price: record.items[0]?.price }
        : { date: new Date().toISOString().slice(0, 10), status: 'Unpaid' };
      openModal({
        title: record ? 'Edit Invoice' : 'New Invoice',
        fields: invoiceFields(),
        initial,
        submitLabel: record ? 'Save Changes' : 'Create Invoice',
        onSubmit: (data) => {
          const payload = {
            customerId: data.customerId,
            date: data.date,
            dueDate: data.dueDate,
            status: data.status,
            items: [{ description: data.description, qty: data.qty, price: data.price }],
          };
          if (record) store.update('invoices', record.id, payload);
          else store.add('invoices', payload);
          refresh();
        },
      });
    }

    refresh();
  }

  function renderCustomersTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openCustomerForm() }, '+ Add Customer'));

    function refresh() {
      const rows = store.get('customers');
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
              onEdit: () => openCustomerForm(r),
              onDelete: () => {
                if (confirmDelete(r.name)) {
                  store.remove('customers', r.id);
                  refresh();
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No customers yet.',
      });
    }

    function openCustomerForm(record) {
      openModal({
        title: record ? 'Edit Customer' : 'Add Customer',
        fields: CUSTOMER_FIELDS,
        initial: record || {},
        submitLabel: record ? 'Save Changes' : 'Add Customer',
        onSubmit: (data) => {
          if (record) store.update('customers', record.id, data);
          else store.add('customers', data);
          refresh();
        },
      });
    }

    refresh();
  }

  setTab('invoices');
}
