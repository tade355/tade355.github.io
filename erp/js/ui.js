import { el, statusPillClass } from './utils.js';
import { createAttachmentPicker } from './attachments.js';
import { renderSparkline } from './charts.js';
import { todayISOString, addDays, mondayOf } from './dateUtils.js';
import { downloadCSV } from './csv.js';

let modalRoot = null;

export function initModalRoot() {
  modalRoot = document.getElementById('modalRoot');
}

export function closeModal() {
  if (modalRoot) modalRoot.innerHTML = '';
}

let toastRoot = null;

export function initToastRoot() {
  toastRoot = document.getElementById('toastRoot');
}

// Corner-anchored, auto-dismissing confirmation — e.g. "Loan saved." after
// a successful add/edit. tone: 'good' | 'warning' | 'critical'.
export function showToast(message, tone = 'good', duration = 3200) {
  if (!toastRoot) return;
  const toast = el('div', { class: `toast toast-${tone}` }, message);
  toastRoot.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-leaving');
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

export function openCustomModal({ title, build, wide }) {
  if (!modalRoot) return;
  modalRoot.innerHTML = '';

  const bodyContainer = el('div', { class: 'modal-form' });
  build(bodyContainer, closeModal);

  const dialog = el('div', { class: wide ? 'modal-dialog modal-dialog-wide' : 'modal-dialog' }, [
    el('div', { class: 'modal-header' }, [
      el('h3', {}, title),
      el('button', { type: 'button', class: 'modal-close', 'aria-label': 'Close', onClick: closeModal }, '×'),
    ]),
    bodyContainer,
  ]);

  const backdrop = el('div', { class: 'modal-backdrop', onClick: (evt) => { if (evt.target === backdrop) closeModal(); } }, [dialog]);
  modalRoot.appendChild(backdrop);

  const firstInput = bodyContainer.querySelector('input, select, textarea');
  if (firstInput) firstInput.focus();
}

export function openModal({ title, fields, initial = {}, onSubmit, submitLabel = 'Save' }) {
  if (!modalRoot) return;
  modalRoot.innerHTML = '';

  const form = el('form', { class: 'modal-form' });
  const attachmentPickers = {};

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
    } else if (f.type === 'attachments') {
      const picker = createAttachmentPicker(initial[f.name] || []);
      attachmentPickers[f.name] = picker;
      fieldWrap.appendChild(picker.element);
      form.appendChild(fieldWrap);
      return;
    } else if (f.type === 'readonly') {
      // Displays the current value as plain text instead of an editable
      // control, while still submitting it unchanged via a hidden input —
      // for a field only some tiers are allowed to set (e.g. Status on a
      // request only an approver can decide).
      fieldWrap.appendChild(el('p', {}, f.displayValue ?? (initial[f.name] || '—')));
      fieldWrap.appendChild(el('input', { type: 'hidden', name: f.name, value: initial[f.name] ?? '' }));
      form.appendChild(fieldWrap);
      return;
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

  const submitBtn = actions.lastChild;

  form.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    const data = new FormData(form);
    const record = {};
    fields.forEach((f) => {
      if (f.type === 'attachments') {
        record[f.name] = attachmentPickers[f.name].getAttachments();
        return;
      }
      let val = data.get(f.name);
      if (f.type === 'number') val = Number(val);
      record[f.name] = val;
    });
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
      await onSubmit(record);
      closeModal();
    } catch (err) {
      window.alert(err.message || 'Something went wrong while saving. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
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

// `exportFilename` is optional — every table gets an Export CSV button
// regardless, so this doesn't need to be threaded through the ~60 call
// sites across the app individually; it just gets a nicer filename than
// the generic timestamped default where the caller has one to give.
export function renderTable(container, { columns, rows, emptyText = 'No records yet.', rowClass, exportFilename }) {
  container.innerHTML = '';
  if (!rows.length) {
    container.appendChild(el('p', { class: 'table-empty' }, emptyText));
    return;
  }
  const exportBtn = el('button', {
    type: 'button',
    class: 'btn btn-ghost btn-sm table-export-btn',
    title: 'Download this table as a CSV file (opens in Excel)',
    onClick: () => downloadCSV(exportFilename || `emagrims-export-${todayISOString()}`, columns, rows),
  }, '⬇ Export CSV');
  container.appendChild(el('div', { class: 'table-toolbar' }, [exportBtn]));

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

export function actionButtons({ onEdit, onDelete, onPrint, onPayment }) {
  return el('div', { class: 'row-actions' }, [
    onPrint ? el('button', { class: 'icon-btn', type: 'button', title: 'Print', onClick: onPrint }, '🖨') : null,
    onPayment ? el('button', { class: 'icon-btn', type: 'button', title: 'Log Payment', onClick: onPayment }, '💰') : null,
    el('button', { class: 'icon-btn', type: 'button', title: 'Edit', onClick: onEdit }, '✎'),
    el('button', { class: 'icon-btn icon-btn-danger', type: 'button', title: 'Delete', onClick: onDelete }, '🗑'),
  ]);
}

// `href` makes the card a clickable link to another module (e.g. from a
// dashboard KPI to the screen that owns that data). `trend` is optional:
// { direction: 'up'|'down'|'flat', label, tone }, tone chosen by the caller
// since "up" isn't always good (e.g. Expenses This Month rising is bad).
// `sparkline` is an optional recent-history number array (oldest first) —
// a compact trend glyph, not a full chart. `target` is an optional plain
// string shown under the value (e.g. "Target: 85%").
export function statCard({ label, value, hint, tone, href, trend, icon, sparkline, target }) {
  const sparklineSvg = sparkline ? renderSparkline({ values: sparkline, colorVar: tone ? `var(--${tone})` : undefined }) : null;
  const content = [
    icon ? el('span', { class: 'stat-icon' }, icon) : null,
    el('span', { class: 'stat-label' }, label),
    el('span', { class: 'stat-value' }, value),
    trend ? el('span', { class: `stat-trend stat-trend-${trend.tone || 'neutral'}` }, `${trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '▬'} ${trend.label}`) : null,
    target ? el('span', { class: 'stat-target' }, target) : null,
    hint ? el('span', { class: 'stat-hint' }, hint) : null,
    sparklineSvg ? el('span', { class: 'stat-sparkline' }, [sparklineSvg]) : null,
  ];
  const classes = `stat-card${tone ? ' stat-' + tone : ''}${href ? ' stat-card-link' : ''}`;
  return href
    ? el('a', { class: classes, href }, content)
    : el('div', { class: classes }, content);
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

// A From/To date-range pair for a filter bar — the same two inputs were
// being hand-built, identically, in roughly a dozen views (diesel tracking
// & management, dozer economics, operations gallery & map, income &
// expenditure, profitability, revenue reconciliation, fuel credit
// statements...). Callers drop `fromField`/`toField` into their own
// filter-bar alongside whatever other selects they already have (project,
// station, site...); `fromInput`/`toInput` are the raw <input> elements for
// reading `.value`. `onChange` fires on either input changing AND on every
// preset click, so callers only need to wire refresh logic once.
//
// `presets`, on by default, adds a row of quick-pick buttons: before this,
// every one of these started blank, requiring the user to manually pick
// both dates just to see anything. `todayISOString`/`mondayOf`/`addDays`
// come from dateUtils.js, the same shared date logic used everywhere else,
// so a preset's idea of "today" can never drift from any other page's.
export function dateRangeFields({ from = '', to = '', onChange, presets = true, fromLabel = 'From', toLabel = 'To' } = {}) {
  const fromInput = el('input', { type: 'date', value: from || undefined });
  const toInput = el('input', { type: 'date', value: to || undefined });
  if (onChange) {
    fromInput.addEventListener('change', onChange);
    toInput.addEventListener('change', onChange);
  }
  const fromField = el('label', { class: 'filter-field' }, [el('span', {}, fromLabel), fromInput]);
  const toField = el('label', { class: 'filter-field' }, [el('span', {}, toLabel), toInput]);

  const elements = [fromField, toField];
  let presetBar = null;
  if (presets) {
    const setRange = (f, t) => {
      fromInput.value = f;
      toInput.value = t;
      if (onChange) onChange();
    };
    const today = todayISOString();
    presetBar = el('div', { class: 'filter-presets' }, [
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => setRange(mondayOf(today), today) }, 'This Week'),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => setRange(`${today.slice(0, 7)}-01`, today) }, 'This Month'),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => setRange(addDays(today, -29), today) }, 'Last 30 Days'),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => setRange('', '') }, 'All Time'),
    ]);
    elements.push(presetBar);
  }

  return { fromInput, toInput, fromField, toField, presetBar, elements };
}
