import { store } from '../store.js';
import { formatCurrency, formatDate, invoiceTotal, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, openCustomModal, closeModal, confirmDelete } from '../ui.js';
import { printInvoice } from '../print.js';
import { OPERATION_TYPES } from '../constants.js';
import { paymentsForInvoice, amountReceived, computeInvoiceStatus } from '../invoicePayments.js';
import { projectRateAsOf } from '../rateHistory.js';

const CUSTOMER_FIELDS = [
  { name: 'name', label: 'Company / Customer Name', required: true },
  { name: 'contact', label: 'Contact Person', required: true },
  { name: 'phone', label: 'Phone', required: true },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'address', label: 'Address' },
];

const PAYMENT_METHODS = ['Cash', 'Transfer', 'Cheque', 'Other'];

function customerOptions() {
  return store.get('customers').map((c) => ({ value: c.id, label: c.name }));
}

function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
}

function selectField(name, label, options, value) {
  const select = el('select', { name }, options.map((o) => {
    const opt = el('option', { value: o.value }, o.label);
    if (String(o.value) === String(value ?? '')) opt.setAttribute('selected', 'selected');
    return opt;
  }));
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label), select]);
}

function textField(name, label, type, value, required) {
  const input = el('input', { type: type || 'text', name, required: required ? 'required' : undefined });
  input.value = value ?? '';
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label + (required ? ' *' : '')), input]);
}

// Operation Type only matters when the parent invoice is linked to a
// Project — it's what lets the Revenue Reconciliation report match this
// line against Daily Operations reports for the same operation type and
// period. Visibility is toggled by the caller via row.setOperationTypeVisible().
//
// getRateContext() supplies the project + a reference date so picking an
// Operation Type can seed Price/Unit from the contract rate in effect
// then (Projects → Rate History) — most contracts price each operation
// type separately. Only fills a blank price, same "computed but still a
// plain editable input" treatment used elsewhere in this app; it never
// overwrites a price someone already typed.
function buildInvoiceItemRow(item, onChange, getRateContext) {
  const description = el('input', { type: 'text', class: 'li-description', placeholder: 'Description of work' });
  description.value = item.description || '';
  const qty = el('input', { type: 'number', class: 'li-qty', min: 0, step: '0.1', placeholder: 'Qty' });
  qty.value = item.qty ?? '';
  const price = el('input', { type: 'number', class: 'li-price', min: 0, placeholder: 'Price/Unit (₦)' });
  price.value = item.price ?? '';
  const operationType = el('select', { class: 'li-operationType' }, [
    el('option', { value: '' }, '— Operation Type —'),
    ...OPERATION_TYPES.map((t) => el('option', { value: t.value }, t.value)),
  ]);
  operationType.value = item.operationType || '';
  const removeBtn = el('button', { type: 'button', class: 'icon-btn icon-btn-danger', title: 'Remove line' }, '✕');

  const row = el('div', { class: 'line-item-row' }, [description, qty, price, operationType, removeBtn]);
  [qty, price].forEach((inp) => inp.addEventListener('input', onChange));
  operationType.addEventListener('change', () => {
    if (!price.value && operationType.value && getRateContext) {
      const { project, date } = getRateContext();
      if (project && date) {
        const rate = projectRateAsOf(project, operationType.value, date).rate;
        if (rate) price.value = rate;
      }
    }
    onChange();
  });
  removeBtn.addEventListener('click', () => { row.remove(); onChange(); });
  row.setOperationTypeVisible = (visible) => {
    operationType.style.display = visible ? '' : 'none';
    operationType.required = visible;
    if (!visible) operationType.value = '';
  };
  return row;
}

function openInvoiceForm(record, onSaved) {
  if (!customerOptions().length) {
    window.alert('Add a customer first before creating an invoice.');
    return;
  }

  openCustomModal({
    title: record ? 'Edit Invoice' : 'New Invoice',
    wide: true,
    build: (container) => {
      const today = new Date().toISOString().slice(0, 10);
      const customerField = selectField('customerId', 'Customer', customerOptions(), record?.customerId);
      const projectField = selectField('project', 'Project', [
        { value: '', label: '— Not linked to a project —' },
        ...projectOptions(),
      ], record?.project);
      const dateField = textField('date', 'Invoice Date', 'date', record?.date || today, true);
      const dueDateField = textField('dueDate', 'Due Date', 'date', record?.dueDate, true);
      const topGrid = el('div', { class: 'form-grid-2' }, [customerField, projectField, dateField, dueDateField]);

      // Only meaningful when this invoice is linked to a project — the
      // measurement period this invoice verifies, matched against Daily
      // Operations report dates on the Revenue Reconciliation report.
      const periodStartField = textField('periodStart', 'Period Start', 'date', record?.periodStart, true);
      const periodEndField = textField('periodEnd', 'Period End', 'date', record?.periodEnd, true);
      const periodGrid = el('div', { class: 'form-grid-2' }, [periodStartField, periodEndField]);

      const statusPreview = el('p', { class: 'section-subtitle' });

      const itemsHeader = el('div', { class: 'line-items-header' }, [
        el('span', {}, 'Description'), el('span', {}, 'Qty'), el('span', {}, 'Price/Unit (₦)'), el('span', { class: 'li-header-operationType' }, 'Operation Type'), el('span', {}, ''),
      ]);
      const itemsContainer = el('div', { class: 'line-items-container' });
      const itemsWrap = el('div', { class: 'invoice-line-items' }, [itemsHeader, itemsContainer]);
      const totalDisplay = el('strong', {}, formatCurrency(0));

      function currentItems() {
        return [...itemsContainer.children].map((row) => ({
          description: row.querySelector('.li-description').value,
          qty: Number(row.querySelector('.li-qty').value) || 0,
          price: Number(row.querySelector('.li-price').value) || 0,
          operationType: row.querySelector('.li-operationType').value || undefined,
        })).filter((it) => it.description || it.qty || it.price);
      }

      function recompute() {
        const items = currentItems();
        totalDisplay.textContent = formatCurrency(items.reduce((sum, it) => sum + it.qty * it.price, 0));
        const preview = computeInvoiceStatus({ id: record?.id, items });
        statusPreview.textContent = `Status: ${preview} — computed automatically from payments logged against this invoice (use the 💰 button on the invoice list to log one).`;
      }

      function projectIsSet() {
        return !!projectField.querySelector('select').value;
      }

      function updateProjectDependentVisibility() {
        const show = projectIsSet();
        periodGrid.style.display = show ? '' : 'none';
        itemsHeader.querySelector('.li-header-operationType').style.display = show ? '' : 'none';
        [...itemsContainer.children].forEach((row) => row.setOperationTypeVisible(show));
      }

      function getRateContext() {
        return {
          project: projectField.querySelector('select').value,
          date: periodStartField.querySelector('input').value || dateField.querySelector('input').value,
        };
      }

      const initialItems = record?.items?.length ? record.items : [{}];
      initialItems.forEach((item) => itemsContainer.appendChild(buildInvoiceItemRow(item, recompute, getRateContext)));

      const addLineBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '+ Add Line');
      addLineBtn.addEventListener('click', () => {
        const row = buildInvoiceItemRow({}, recompute, getRateContext);
        row.setOperationTypeVisible(projectIsSet());
        itemsContainer.appendChild(row);
        recompute();
      });

      projectField.querySelector('select').addEventListener('change', updateProjectDependentVisibility);
      updateProjectDependentVisibility();
      recompute();

      const totalRow = el('div', { class: 'line-items-total' }, [el('span', {}, 'Total Amount:'), totalDisplay]);

      const actions = el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Cancel'),
        el('button', { type: 'button', class: 'btn btn-primary' }, record ? 'Save Changes' : 'Create Invoice'),
      ]);
      const submitBtn = actions.lastChild;

      submitBtn.addEventListener('click', async () => {
        const items = currentItems();
        const date = dateField.querySelector('input').value;
        const dueDate = dueDateField.querySelector('input').value;
        const project = projectField.querySelector('select').value;
        const periodStart = periodStartField.querySelector('input').value;
        const periodEnd = periodEndField.querySelector('input').value;
        if (!date || !dueDate) { window.alert('Invoice Date and Due Date are required.'); return; }
        if (!items.length) { window.alert('Add at least one line item.'); return; }
        if (project && items.some((it) => !it.operationType)) { window.alert('Every line needs an Operation Type when the invoice is linked to a Project.'); return; }
        if (project && (!periodStart || !periodEnd)) { window.alert('Period Start and Period End are required when the invoice is linked to a Project.'); return; }

        const payload = {
          customerId: customerField.querySelector('select').value,
          project,
          date,
          dueDate,
          periodStart: project ? periodStart : undefined,
          periodEnd: project ? periodEnd : undefined,
          items,
        };
        payload.status = computeInvoiceStatus({ id: record?.id, items });

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving…';
          if (record) await store.update('invoices', record.id, payload);
          else await store.add('invoices', payload);
          closeModal();
          onSaved();
        } catch (err) {
          window.alert(err.message || 'Could not save the invoice. Please try again.');
          submitBtn.disabled = false;
          submitBtn.textContent = record ? 'Save Changes' : 'Create Invoice';
        }
      });

      container.appendChild(topGrid);
      container.appendChild(periodGrid);
      container.appendChild(el('h3', { class: 'subsection-title' }, 'Line Items'));
      container.appendChild(itemsWrap);
      container.appendChild(addLineBtn);
      container.appendChild(totalRow);
      container.appendChild(statusPreview);
      container.appendChild(actions);
    },
  });
}

function openPaymentsModal(invoice, onSaved) {
  openCustomModal({
    title: `Payments — Invoice ${invoice.id}`,
    wide: true,
    build: (container) => {
      const summary = el('p', { class: 'section-subtitle' });
      const tableContainer = el('div');

      const dateField = textField('date', 'Date', 'date', new Date().toISOString().slice(0, 10), true);
      const amountField = textField('amount', 'Amount (₦)', 'number', '', true);
      const methodField = selectField('method', 'Method', [
        { value: '', label: '— Select —' },
        ...PAYMENT_METHODS.map((m) => ({ value: m, label: m })),
      ], '');
      const referenceField = textField('reference', 'Reference', 'text', '');
      const notesField = textField('notes', 'Notes', 'text', '');
      const formGrid = el('div', { class: 'form-grid-2' }, [dateField, amountField, methodField, referenceField]);

      const addBtn = el('button', { type: 'button', class: 'btn btn-primary' }, '+ Log Payment');
      let editingId = null;

      function currentInvoice() {
        return store.get('invoices').find((i) => i.id === invoice.id) || invoice;
      }

      async function recomputeStatus() {
        await store.update('invoices', invoice.id, { status: computeInvoiceStatus(currentInvoice()) });
      }

      function resetForm() {
        editingId = null;
        dateField.querySelector('input').value = new Date().toISOString().slice(0, 10);
        amountField.querySelector('input').value = '';
        methodField.querySelector('select').value = '';
        referenceField.querySelector('input').value = '';
        notesField.querySelector('input').value = '';
        addBtn.textContent = '+ Log Payment';
      }

      function loadForEdit(payment) {
        editingId = payment.id;
        dateField.querySelector('input').value = payment.date;
        amountField.querySelector('input').value = payment.amount;
        methodField.querySelector('select').value = payment.method || '';
        referenceField.querySelector('input').value = payment.reference || '';
        notesField.querySelector('input').value = payment.notes || '';
        addBtn.textContent = 'Save Payment';
      }

      function refresh() {
        const inv = currentInvoice();
        const total = invoiceTotal(inv);
        const received = amountReceived(inv);
        summary.textContent = `Invoiced ${formatCurrency(total)} · Received ${formatCurrency(received)} · Outstanding ${formatCurrency(total - received)} · Status: ${computeInvoiceStatus(inv)}`;

        renderTable(tableContainer, {
          columns: [
            { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
            { key: 'amount', label: 'Amount', render: (r) => formatCurrency(r.amount) },
            { key: 'method', label: 'Method', render: (r) => r.method || '—' },
            { key: 'reference', label: 'Reference', render: (r) => r.reference || '—' },
            { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
            {
              key: 'actions',
              label: '',
              render: (r) => actionButtons({
                onEdit: () => loadForEdit(r),
                onDelete: async () => {
                  if (!confirmDelete(`this payment of ${formatCurrency(r.amount)}`)) return;
                  await store.remove('invoicePayments', r.id);
                  await recomputeStatus();
                  refresh();
                  onSaved();
                },
              }),
            },
          ],
          rows: paymentsForInvoice(invoice.id).slice().sort((a, b) => (a.date < b.date ? 1 : -1)),
          emptyText: 'No payments logged yet.',
        });
      }

      addBtn.addEventListener('click', async () => {
        const data = {
          date: dateField.querySelector('input').value,
          amount: Number(amountField.querySelector('input').value) || 0,
          method: methodField.querySelector('select').value,
          reference: referenceField.querySelector('input').value,
          notes: notesField.querySelector('input').value,
        };
        if (!data.date || !data.amount) { window.alert('Date and Amount are required.'); return; }
        try {
          if (editingId) await store.update('invoicePayments', editingId, data);
          else await store.add('invoicePayments', { invoiceId: invoice.id, ...data });
          await recomputeStatus();
          resetForm();
          refresh();
          onSaved();
        } catch (err) {
          window.alert(err.message || 'Could not save this payment. Please try again.');
        }
      });

      const closeBtn = el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Close');

      container.appendChild(summary);
      container.appendChild(tableContainer);
      container.appendChild(el('h3', { class: 'subsection-title' }, 'Log a Payment'));
      container.appendChild(formGrid);
      container.appendChild(notesField);
      container.appendChild(el('div', { class: 'modal-actions' }, [closeBtn, addBtn]));

      refresh();
    },
  });
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
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openInvoiceForm(undefined, refresh) }, '+ New Invoice'));

    function refresh() {
      const customers = store.get('customers');
      const rows = store.get('invoices').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      renderTable(body, {
        columns: [
          { key: 'id', label: 'Invoice #' },
          { key: 'customer', label: 'Customer', render: (r) => customers.find((c) => c.id === r.customerId)?.name || 'Unknown' },
          { key: 'project', label: 'Project', render: (r) => r.project || '—' },
          { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
          { key: 'dueDate', label: 'Due', render: (r) => formatDate(r.dueDate) },
          { key: 'total', label: 'Total', render: (r) => formatCurrency(invoiceTotal(r)) },
          { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onPrint: () => printInvoice(r, customers.find((c) => c.id === r.customerId)),
              onPayment: () => openPaymentsModal(r, refresh),
              onEdit: () => openInvoiceForm(r, refresh),
              onDelete: async () => {
                if (!confirmDelete(r.id)) return;
                try {
                  await store.remove('invoices', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this invoice.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No invoices yet.',
        rowClass: (r) => (r.status !== 'Paid' && r.dueDate < new Date().toISOString().slice(0, 10) ? 'row-critical' : undefined),
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
              onDelete: async () => {
                if (!confirmDelete(r.name)) return;
                try {
                  await store.remove('customers', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this customer.');
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
        onSubmit: async (data) => {
          if (record) await store.update('customers', record.id, data);
          else await store.add('customers', data);
          refresh();
        },
      });
    }

    refresh();
  }

  setTab('invoices');
}
