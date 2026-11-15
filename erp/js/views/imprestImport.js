import { store } from '../store.js';
import { el, formatCurrency } from '../utils.js';
import { getCurrentTier } from '../session.js';
import { supabase } from '../supabaseClient.js';
import { managerIsImprestEligible, parseImprestSheet } from '../imprestWorkbook.js';

let readerPromise;
function excelReader() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!readerPromise) readerPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'vendor/xlsx.core.min.js';
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => { readerPromise = null; reject(new Error('Could not load the Excel reader.')); };
    document.head.append(script);
  });
  return readerPromise;
}

async function entryId(file, entry, managerId) {
  const input = `${file}|${entry.sourceSheet}|${entry.sourceRow}|${managerId}`;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return 'IMP-' + [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

export function renderManagerImprestImport(container, onImported) {
  if (!['Admin', 'Accounts'].includes(getCurrentTier())) return;
  const card = el('div', { class: 'dd-tool dd-static' });
  card.append(el('h3', { class: 'subsection-title' }, 'Import manager imprest workbook'),
    el('p', { class: 'section-subtitle' }, 'Choose the sheets and match each to an active site or maintenance manager. Review debits, credits and category columns before import. Copied sheets and mismatched titles need special care. Historical rows do not create another expense.'));
  const file = el('input', { type: 'file', accept: '.xlsx,.xlsm,.xls' });
  const status = el('p', { class: 'section-subtitle' }, '');
  const sheetList = el('div');
  const preview = el('div');
  card.append(file, status, sheetList, preview);
  container.append(card);

  let parsed = [];
  let fileName = '';
  const selections = new Map();
  const managers = store.get('employees').filter(managerIsImprestEligible).sort((a, b) => a.name.localeCompare(b.name));

  function alreadyInERP(row) {
    const manager = managers.find(person => person.id === row.managerId);
    return store.get('fuelWorkflows').some(record => record.kind === 'Cost' && record.status !== 'Rejected'
      && (record.data?.imprestManagerId === row.managerId || record.data?.payee?.toLowerCase() === manager?.name?.toLowerCase())
      && (row.debit > 0
        ? record.data?.incurredDate === row.date && Number(record.data?.amount) === row.debit
        : (record.events || []).some(event => event.type === 'payment' && event.date === row.date && Number(event.amount) === row.credit)));
  }

  function selectedRows() {
    return parsed.flatMap(sheet => {
      const choice = selections.get(sheet.sheetName);
      return choice?.checked && choice.manager ? sheet.entries.map(entry => ({ ...entry,
        managerId: choice.manager, project: choice.project, sourceFile: fileName })) : [];
    });
  }

  function renderPreview() {
    preview.replaceChildren();
    const chosen = parsed.filter(sheet => selections.get(sheet.sheetName)?.checked);
    const incomplete = chosen.filter(sheet => !selections.get(sheet.sheetName)?.manager);
    const mismatchedNames = chosen.filter(sheet => {
      const named = sheet.title.match(/\(([^)]+)\)/)?.[1];
      const selectedManager = managers.find(person => person.id === selections.get(sheet.sheetName)?.manager);
      return named && selectedManager && named.toLowerCase().replace(/[^a-z]/g, '') !== selectedManager.name.toLowerCase().replace(/[^a-z]/g, '');
    });
    const unresolved = chosen.filter(sheet => (sheet.variance || sheet.skippedUndated || mismatchedNames.includes(sheet)) && !selections.get(sheet.sheetName)?.reviewed);
    const selected = selectedRows();
    const rows = selected.filter(row => !alreadyInERP(row));
    const overlapCount = selected.length - rows.length;
    const debits = rows.reduce((sum, row) => sum + row.debit, 0);
    const credits = rows.reduce((sum, row) => sum + row.credit, 0);
    preview.append(el('p', {}, `${chosen.length} sheet(s), ${rows.length} transaction(s) · Debit ${formatCurrency(debits)} · Credit ${formatCurrency(credits)} · Net ${formatCurrency(credits - debits)}.`));
    if (incomplete.length) preview.append(el('p', { class: 'text-critical' }, 'Select an eligible manager for every chosen sheet.'));
    if (overlapCount) preview.append(el('p', {}, `${overlapCount} transaction(s) already appear in live earlier-cost or payment records and will be skipped.`));
    if (unresolved.length) preview.append(el('p', { class: 'text-critical' }, 'Some selected sheets have a different person named inside or do not reconcile to their printed totals. Review and acknowledge each difference.'));
    const seen = new Map();
    let repeats = 0;
    rows.forEach(row => {
      const fingerprint = [row.managerId, row.date, row.debit, row.credit, row.purpose.toLowerCase().replace(/\s+/g, ' ')].join('|');
      if (seen.has(fingerprint) && seen.get(fingerprint) !== row.sourceSheet) repeats++;
      else seen.set(fingerprint, row.sourceSheet);
    });
    if (repeats) preview.append(el('p', { class: 'text-critical' }, `${repeats} transaction(s) look repeated across selected sheets. Deselect copied or overlapping sheets before importing.`));
    if (!rows.length || incomplete.length || unresolved.length || repeats) return;
    const submit = el('button', { type: 'button', class: 'btn btn-primary' }, `Import ${rows.length} reviewed transactions`);
    submit.addEventListener('click', async () => {
      if (!window.confirm(`Import ${rows.length} imprest transactions from ${fileName}? Existing identical source rows will be skipped. Historical costs will not be added again to profitability.`)) return;
      submit.disabled = true;
      try {
        const payload = await Promise.all(rows.map(async row => ({ ...row, id: await entryId(fileName, row, row.managerId) })));
        let saved = 0, skipped = 0;
        for (let start = 0; start < payload.length; start += 100) {
          const { data, error } = await supabase.rpc('import_manager_imprest_entries', { p_entries: payload.slice(start, start + 100) });
          if (error) throw error;
          saved += Number(data.saved || 0);
          skipped += Number(data.alreadyImported || 0);
          status.textContent = `Imported ${saved}, skipped ${skipped}; processed ${Math.min(start + 100, payload.length)} of ${payload.length}.`;
        }
        status.textContent = `Import complete: ${saved} new transactions, ${skipped} already imported.`;
        onImported?.();
      } catch (error) {
        status.textContent = `Import stopped: ${error.message}. Saved batches are retained; retrying skips those rows.`;
        submit.disabled = false;
      }
    });
    preview.append(submit);
  }

  file.addEventListener('change', async () => {
    parsed = []; selections.clear(); sheetList.replaceChildren(); preview.replaceChildren();
    if (!file.files[0]) return;
    fileName = file.files[0].name;
    status.textContent = `Reading ${fileName}…`;
    try {
      const XLSX = await excelReader();
      const workbook = XLSX.read(await file.files[0].arrayBuffer(), { type: 'array' });
      parsed = workbook.SheetNames.map(name => parseImprestSheet(
        XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: '' }), name));
      for (const sheet of parsed) {
        const line = el('div', { class: 'approval-request-card' });
        const checked = el('input', { type: 'checkbox' });
        const manager = el('select');
        manager.append(el('option', { value: '' }, 'Match to manager…'));
        managers.forEach(person => manager.append(el('option', { value: person.id }, `${person.name} (${person.role})`)));
        const project = el('select');
        project.append(el('option', { value: '' }, 'Project / historic site unspecified'));
        store.get('projects').forEach(item => project.append(el('option', { value: item.name }, item.name)));
        selections.set(sheet.sheetName, { checked: false, manager: '', project: '', reviewed: false });
        checked.addEventListener('change', () => { selections.get(sheet.sheetName).checked = checked.checked; renderPreview(); });
        manager.addEventListener('change', () => { selections.get(sheet.sheetName).manager = manager.value; renderPreview(); });
        project.addEventListener('change', () => { selections.get(sheet.sheetName).project = project.value; renderPreview(); });
        const debit = sheet.entries.reduce((sum, row) => sum + row.debit, 0);
        const credit = sheet.entries.reduce((sum, row) => sum + row.credit, 0);
        line.append(el('div', { class: 'imp-row' }, [checked, el('strong', {}, sheet.sheetName), manager, project]),
          el('p', {}, sheet.title || 'Untitled sheet'),
          el('p', {}, sheet.error || `${sheet.entries.length} dated rows · debit ${formatCurrency(debit)} · credit ${formatCurrency(credit)} · ${sheet.categories.join(', ') || 'row categories'}`));
        if (sheet.variance) {
          line.append(el('p', { class: 'text-critical' }, `Workbook printed totals: debit ${formatCurrency(sheet.reportedOutflow)}, credit ${formatCurrency(sheet.reportedInflow)}. Dated rows differ by ${formatCurrency(sheet.variance)}. Check source formulas before importing.`));
        }
        if (sheet.skippedUndated) line.append(el('p', { class: 'text-critical' }, `${sheet.skippedUndated} amount row(s) have no valid date and will not be imported.`));
        if (sheet.variance || sheet.skippedUndated || sheet.title.match(/\(([^)]+)\)/)) {
          const reviewed = el('input', { type: 'checkbox' });
          reviewed.addEventListener('change', () => { selections.get(sheet.sheetName).reviewed = reviewed.checked; renderPreview(); });
          line.append(el('label', { class: 'imp-row' }, [reviewed, 'I verified the manager named inside this sheet and any difference from its printed totals.']));
        }
        if (sheet.error || !sheet.entries.length) { checked.disabled = true; manager.disabled = true; }
        sheetList.append(line);
      }
      status.textContent = 'Select only the sheets you intend to import. Match the manager shown inside each sheet; copied and historic sheets may overlap.';
      renderPreview();
    } catch (error) { status.textContent = `Could not read workbook: ${error.message}`; }
  });
}

