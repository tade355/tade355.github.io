import { store } from './store.js';
import { formatCurrency, formatDate, el } from './utils.js';
import { todayISOString } from './dateUtils.js';
import { openCustomModal, closeModal, renderTable, actionButtons, confirmDelete, showToast } from './ui.js';

const PAYMENT_METHODS = ['Cash', 'Transfer', 'Cheque', 'Other'];

function textField(name, label, type, value, required) {
  const input = el('input', { type: type || 'text', name, required: required ? 'required' : undefined });
  input.value = value ?? '';
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label + (required ? ' *' : '')), input]);
}

function selectField(name, label, options, value) {
  const select = el('select', { name }, options.map((o) => {
    const opt = el('option', { value: o.value }, o.label);
    if (String(o.value) === String(value ?? '')) opt.setAttribute('selected', 'selected');
    return opt;
  }));
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label), select]);
}

// "Log a Payment/Repayment against this record, see the running history" —
// was built twice, nearly identically, as Loans' openRepaymentsModal and
// Sales' openPaymentsModal. One implementation now serves both, parameterised
// by which collection the payment rows live in, the FK field stamped onto a
// new row, and the caller's own summary line and any extra side effect
// (e.g. Sales recomputing the parent invoice's Paid/Unpaid status).
//
// `entryNoun` names the thing being logged ('Payment', 'Repayment', ...) —
// used for the button, the empty-state text, the delete confirmation, and
// the toast, so every surface stays correctly worded for its own domain.
export function openPaymentLedgerModal({
  title, entryNoun, collection, parentIdField, parentId, rowsFor, summaryText, onSaved, afterSave,
}) {
  openCustomModal({
    title,
    wide: true,
    build: (container) => {
      const summary = el('p', { class: 'section-subtitle' });
      const tableContainer = el('div');

      const dateField = textField('date', 'Date', 'date', todayISOString(), true);
      const amountField = textField('amount', 'Amount (₦)', 'number', '', true);
      const methodField = selectField('method', 'Method', [
        { value: '', label: '— Select —' },
        ...PAYMENT_METHODS.map((m) => ({ value: m, label: m })),
      ], '');
      const referenceField = textField('reference', 'Reference', 'text', '');
      const notesField = textField('notes', 'Notes', 'text', '');
      const formGrid = el('div', { class: 'form-grid-2' }, [dateField, amountField, methodField, referenceField]);

      const addBtn = el('button', { type: 'button', class: 'btn btn-primary' }, `+ Log ${entryNoun}`);
      let editingId = null;

      function resetForm() {
        editingId = null;
        dateField.querySelector('input').value = todayISOString();
        amountField.querySelector('input').value = '';
        methodField.querySelector('select').value = '';
        referenceField.querySelector('input').value = '';
        notesField.querySelector('input').value = '';
        addBtn.textContent = `+ Log ${entryNoun}`;
      }

      function loadForEdit(payment) {
        editingId = payment.id;
        dateField.querySelector('input').value = payment.date;
        amountField.querySelector('input').value = payment.amount;
        methodField.querySelector('select').value = payment.method || '';
        referenceField.querySelector('input').value = payment.reference || '';
        notesField.querySelector('input').value = payment.notes || '';
        addBtn.textContent = `Save ${entryNoun}`;
      }

      function refresh() {
        summary.textContent = summaryText();
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
                  if (!confirmDelete(`this ${entryNoun.toLowerCase()} of ${formatCurrency(r.amount)}`)) return;
                  await store.remove(collection, r.id);
                  if (afterSave) await afterSave();
                  refresh();
                  onSaved();
                },
              }),
            },
          ],
          rows: rowsFor().slice().sort((a, b) => (a.date < b.date ? 1 : -1)),
          emptyText: `No ${entryNoun.toLowerCase()}s logged yet.`,
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
          const wasEditing = Boolean(editingId);
          if (editingId) await store.update(collection, editingId, data);
          else await store.add(collection, { [parentIdField]: parentId, ...data });
          if (afterSave) await afterSave();
          resetForm();
          refresh();
          onSaved();
          showToast(wasEditing ? `${entryNoun} updated.` : `${entryNoun} logged.`);
        } catch (err) {
          window.alert(err.message || `Could not save this ${entryNoun.toLowerCase()}. Please try again.`);
        }
      });

      const closeBtn = el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Close');

      container.appendChild(summary);
      container.appendChild(tableContainer);
      container.appendChild(el('h3', { class: 'subsection-title' }, `Log a ${entryNoun}`));
      container.appendChild(formGrid);
      container.appendChild(notesField);
      container.appendChild(el('div', { class: 'modal-actions' }, [closeBtn, addBtn]));

      refresh();
    },
  });
}
