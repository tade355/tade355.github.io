import { el, statusPillClass } from './utils.js';

let modalRoot = null;

export function initModalRoot() {
  modalRoot = document.getElementById('modalRoot');
}

export function closeModal() {
  if (modalRoot) modalRoot.innerHTML = '';
}

export function openModal({ title, fields, initial = {}, onSubmit, submitLabel = 'Save' }) {
  if (!modalRoot) return;
  modalRoot.innerHTML = '';

  const form = el('form', { class: 'modal-form' });

  fields.forEach((f) => {
    const fieldWrap = el('label', { class: 'field' }, [
      el('span', { class: 'field-label' }, f.label + (f.required ? ' *' : '')),
    ]);

    let input;
    if (f.type === 'select') {
      input = el('select', { name: f.name, required: f.required ? 'required' : undefined });
      (f.options || []).forEach((opt) => {
        const optionEl = el('option', { value: opt.value }, opt.label);
        if (String(initial[f.name]) === String(opt.value)) optionEl.setAttribute('selected', 'selected');
        input.appendChild(optionEl);
      });
    } else if (f.type === 'textarea') {
      input = el('textarea', { name: f.name, rows: f.rows || 3 });
      input.value = initial[f.name] ?? '';
    } else {
      input = el('input', {
        type: f.type || 'text',
        name: f.name,
        required: f.required ? 'required' : undefined,
        step: f.step,
        min: f.min,
      });
      input.value = initial[f.name] ?? (f.type === 'number' ? 0 : '');
    }
    fieldWrap.appendChild(input);
    form.appendChild(fieldWrap);
  });

  const actions = el('div', { class: 'modal-actions' }, [
    el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Cancel'),
    el('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel),
  ]);
  form.appendChild(actions);

  form.addEventListener('submit', (evt) => {
    evt.preventDefault();
    const data = new FormData(form);
    const record = {};
    fields.forEach((f) => {
      let val = data.get(f.name);
      if (f.type === 'number') val = Number(val);
      record[f.name] = val;
    });
    onSubmit(record);
    closeModal();
  });

  const dialog = el('div', { class: 'modal-dialog' }, [
    el('div', { class: 'modal-header' }, [
      el('h3', {}, title),
      el('button', { type: 'button', class: 'modal-close', 'aria-label': 'Close', onClick: closeModal }, '×'),
    ]),
    form,
  ]);

  const backdrop = el('div', { class: 'modal-backdrop', onClick: (evt) => { if (evt.target === backdrop) closeModal(); } }, [dialog]);
  modalRoot.appendChild(backdrop);

  const firstInput = form.querySelector('input, select, textarea');
  if (firstInput) firstInput.focus();
}

export function statusPill(status) {
  return el('span', { class: `pill ${statusPillClass(status)}` }, status);
}

export function renderTable(container, { columns, rows, emptyText = 'No records yet.', rowClass }) {
  container.innerHTML = '';
  if (!rows.length) {
    container.appendChild(el('p', { class: 'table-empty' }, emptyText));
    return;
  }
  const table = el('table', { class: 'data-table' });
  const thead = el('thead', {}, [
    el('tr', {}, columns.map((c) => el('th', {}, c.label))),
  ]);
  const tbody = el('tbody', {}, rows.map((row) => el('tr', { class: rowClass ? rowClass(row) : undefined }, columns.map((c) => {
    const cell = el('td', {});
    const content = c.render ? c.render(row) : row[c.key];
    if (content instanceof Node) cell.appendChild(content);
    else cell.textContent = content ?? '—';
    return cell;
  }))));
  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);
}

export function actionButtons({ onEdit, onDelete }) {
  return el('div', { class: 'row-actions' }, [
    el('button', { class: 'icon-btn', type: 'button', title: 'Edit', onClick: onEdit }, '✎'),
    el('button', { class: 'icon-btn icon-btn-danger', type: 'button', title: 'Delete', onClick: onDelete }, '🗑'),
  ]);
}

export function statCard({ label, value, hint, tone }) {
  return el('div', { class: `stat-card${tone ? ' stat-' + tone : ''}` }, [
    el('span', { class: 'stat-label' }, label),
    el('span', { class: 'stat-value' }, value),
    hint ? el('span', { class: 'stat-hint' }, hint) : null,
  ]);
}

export function sectionHeader(title, subtitle, actionButton) {
  return el('div', { class: 'section-header' }, [
    el('div', {}, [
      el('h2', {}, title),
      subtitle ? el('p', { class: 'section-subtitle' }, subtitle) : null,
    ]),
    actionButton || null,
  ]);
}

export function confirmDelete(label) {
  return window.confirm(`Delete "${label}"? This cannot be undone.`);
}
