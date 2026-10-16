// Data Import: upload the formatted Excel template and update the ERP from it —
// daily reports, diesel supply, station collections and payments, fund requests,
// payments made and stock counts. Nothing is written until the preview has been
// reviewed and confirmed. Only Olumide's account can open this page.
import { store } from '../store.js';
import { el, ico } from '../utils.js';
import { sectionHeader, statCard } from '../ui.js';
import { todayISOString } from '../dateUtils.js';
import { canImportData } from '../access.js';
import { liveContext } from '../reportContext.js';
import { planImport, sheetFromAoa } from '../importPlan.js';

const TEMPLATE_URL = 'templates/Emagrims_ERP_Upload_Template.xlsx';
const XLSX_URL = 'vendor/xlsx.core.min.js';
const ORDER = ['operations', 'distributions', 'collections', 'stationPayments', 'fundRequests', 'requestPayments', 'stockCounts'];

let xlsxPromise = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = XLSX_URL;
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => { xlsxPromise = null; reject(new Error('Could not load the Excel reader. Check the connection and try again.')); };
      document.head.appendChild(s);
    });
  }
  return xlsxPromise;
}

async function readWorkbook(file) {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const book = {};
  wb.SheetNames.forEach((name) => {
    const ws = wb.Sheets[name];
    if (!ws['!ref']) { book[name] = { rows: [] }; return; }
    const range = XLSX.utils.decode_range(ws['!ref']);
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    book[name] = sheetFromAoa(aoa, range.s.r);
  });
  return book;
}

const PILL = { add: ['pill pill-good', 'Add'], update: ['pill pill-warning', 'Update'], skip: ['pill pill-neutral', 'Skip'], error: ['pill pill-critical', 'Error'] };

function sheetBlock(sheet) {
  const c = { add: 0, update: 0, skip: 0, error: 0 };
  sheet.rows.forEach((r) => { c[r.action] += 1; });
  const head = `${sheet.name} — ${sheet.rows.length} row${sheet.rows.length === 1 ? '' : 's'}: ${c.add} to add${c.update ? `, ${c.update} to update` : ''}${c.skip ? `, ${c.skip} skipped` : ''}${c.error ? `, ${c.error} with errors` : ''}`;
  const body = el('tbody', {}, sheet.rows.map((r) => el('tr', { class: r.action === 'error' ? 'row-critical' : undefined }, [
    el('td', {}, r.rowNumbers && r.rowNumbers.length > 1 ? `${r.rowNumbers[0]}–${r.rowNumbers[r.rowNumbers.length - 1]}` : String(r.rowNumber)),
    el('td', {}, [el('span', { class: PILL[r.action][0] }, PILL[r.action][1])]),
    el('td', {}, r.summary || '—'),
    el('td', {}, [...r.messages, ...r.warnings.map((w) => `Check: ${w}`)].join(' ') || '—'),
  ])));
  return el('details', { class: 'dd-tool', open: c.error || c.update ? '' : undefined }, [
    el('summary', {}, head),
    el('div', { class: 'table-wrap' }, [el('table', { class: 'data-table' }, [el('thead', {}, [el('tr', {}, ['Row', 'Result', 'Record', 'Notes'].map((h) => el('th', {}, h)))]), body])]),
  ]);
}

export function renderDataImport(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('Data Import', 'Update the ERP from the formatted Excel template — daily reports, diesel supply, payments and more'));
  if (!canImportData()) {
    container.appendChild(el('p', { class: 'table-empty' }, 'Data Import is only available to Olumide Davidson\'s account.'));
    return;
  }

  // ------------------------------------------------------------ 1. template
  container.appendChild(el('div', { class: 'dd-tool dd-static' }, [
    el('h3', { class: 'dd-static-title' }, '1. Get the template'),
    el('p', { class: 'section-subtitle' }, 'Fill the sheets you need (Daily Reports, Diesel Supply, Station Collections, Station Payments, Fund Requests, Payments Made, Stock Count). The first sheet explains each column. Drop-down lists are built in, and short names such as "Kangidi", "007" or "Tope" are matched for you.'),
    el('div', { class: 'dd-actions' }, [el('a', { class: 'btn btn-primary', href: TEMPLATE_URL, download: 'Emagrims_ERP_Upload_Template.xlsx' }, [ico('download'), 'Download template (.xlsx)'])]),
  ]));

  // -------------------------------------------------------------- 2. upload
  const fileInput = el('input', { type: 'file', accept: '.xlsx,.xlsm,.xls', class: 'imp-file' });
  const replaceBox = el('input', { type: 'checkbox' });
  const status = el('p', { class: 'section-subtitle' }, '');
  const preview = el('div', {});
  let plan = null;

  container.appendChild(el('div', { class: 'dd-tool dd-static' }, [
    el('h3', { class: 'dd-static-title' }, '2. Upload and review'),
    el('p', { class: 'section-subtitle' }, 'Choose the filled file. The ERP reads it and shows exactly what would be added or changed. Nothing is saved until you confirm.'),
    el('div', { class: 'imp-row' }, [fileInput]),
    el('label', { class: 'dd-check' }, [replaceBox, ' Replace: let a corrected daily report, diesel supply or stock count overwrite the one already saved for that day (otherwise existing days are skipped)']),
    status,
  ]));
  container.appendChild(preview);

  async function analyse() {
    const file = fileInput.files[0];
    preview.innerHTML = ''; plan = null;
    if (!file) { status.textContent = ''; return; }
    status.textContent = `Reading ${file.name}…`;
    try {
      const book = await readWorkbook(file);
      const ctx = { ...liveContext(null), today: todayISOString() };
      plan = planImport(book, ctx, { replace: replaceBox.checked });
    } catch (e) {
      status.textContent = `Could not read that file: ${e.message}`;
      return;
    }
    status.textContent = '';
    drawPreview(file.name);
  }
  fileInput.addEventListener('change', analyse);
  replaceBox.addEventListener('change', () => { if (fileInput.files[0]) analyse(); });

  function drawPreview(fileName) {
    preview.innerHTML = '';
    const { counts, sheets, unknownSheets } = plan;
    const total = counts.add + counts.update + counts.skip + counts.error;
    if (!total) {
      preview.appendChild(el('p', { class: 'table-empty' }, `No data rows found in ${fileName}. Type your rows under the grey example row, on the template's sheets.`));
      return;
    }
    preview.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ icon: 'check', label: 'To add', value: String(counts.add), tone: counts.add ? 'good' : undefined }),
      statCard({ icon: 'refresh', label: 'To update', value: String(counts.update), tone: counts.update ? 'warning' : undefined }),
      statCard({ icon: 'file', label: 'Skipped (already in the ERP)', value: String(counts.skip) }),
      statCard({ icon: 'alert', label: 'Rows with errors', value: String(counts.error), tone: counts.error ? 'critical' : 'good' }),
    ]));
    if (unknownSheets.length) preview.appendChild(el('p', { class: 'section-subtitle' }, `Ignored sheets (not part of the template): ${unknownSheets.join(', ')}.`));
    [...sheets].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)).forEach((s) => { if (s.rows.length) preview.appendChild(sheetBlock(s)); });

    const writes = counts.add + counts.update;
    const accept = el('input', { type: 'checkbox' });
    const importBtn = el('button', { type: 'button', class: 'btn btn-primary', disabled: '' }, [ico('upload'), `Import ${writes} record${writes === 1 ? '' : 's'}`]);
    const sync = () => { importBtn.disabled = !(writes > 0 && (!counts.error || accept.checked)); };
    accept.addEventListener('change', sync);
    const result = el('div', {});
    importBtn.addEventListener('click', () => runImport(importBtn, result));
    preview.appendChild(el('div', { class: 'dd-tool dd-static' }, [
      el('h3', { class: 'dd-static-title' }, '3. Confirm'),
      counts.error ? el('label', { class: 'dd-check' }, [accept, ` Import the ${writes} valid record${writes === 1 ? '' : 's'} and skip the ${counts.error} row${counts.error === 1 ? '' : 's'} with errors (fix them in the file and upload again)`]) : null,
      writes ? null : el('p', { class: 'section-subtitle' }, 'There is nothing new to import from this file.'),
      el('div', { class: 'dd-actions' }, [importBtn]),
      result,
    ]));
    sync();
  }

  async function runImport(btn, result) {
    // Checked again at the moment of import, not only when the page is drawn.
    if (!canImportData()) { result.textContent = 'Only Olumide can import data.'; return; }
    btn.disabled = true; fileInput.disabled = true;
    const done = { add: 0, update: 0, failed: [] };
    const rows = ORDER.flatMap((k) => (plan.sheets.find((s) => s.key === k)?.rows || []).map((r) => ({ ...r, sheet: k })));
    const todo = rows.filter((r) => r.action === 'add' || r.action === 'update');
    for (let i = 0; i < todo.length; i += 1) {
      const r = todo[i];
      result.textContent = `Importing ${i + 1} of ${todo.length}…`;
      try {
        if (r.action === 'add') await store.add(r.collection, r.record);
        else await store.update(r.collection, r.id, r.record);
        done[r.action] += 1;
      } catch (e) {
        done.failed.push(`${r.summary || `row ${r.rowNumber}`}: ${e.message}`);
      }
    }
    result.innerHTML = '';
    result.appendChild(el('p', { class: 'dd-import-done' }, `Done. ${done.add} added, ${done.update} updated${done.failed.length ? `, ${done.failed.length} failed` : ''}.`));
    if (done.failed.length) result.appendChild(el('ul', {}, done.failed.map((f) => el('li', {}, f))));
    result.appendChild(el('div', { class: 'dd-actions' }, [
      el('a', { class: 'btn btn-ghost', href: '#/dailyDashboard' }, 'Open the Daily Operations Dashboard'),
      el('a', { class: 'btn btn-ghost', href: '#/operations' }, 'Open Daily Operations'),
    ]));
    fileInput.value = ''; fileInput.disabled = false; plan = null;
  }
}
