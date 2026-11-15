import { store } from '../store.js';
import { el, formatCurrency, formatDate } from '../utils.js';
import { renderTable, sectionHeader, openModal } from '../ui.js';
import { getCurrentTier, getCurrentUserId } from '../session.js';
import { todayISOString } from '../dateUtils.js';
import { supabase } from '../supabaseClient.js';
import { imprestStatement, IMPREST_COLUMNS, managerIsImprestEligible } from '../imprestWorkbook.js';
import { renderManagerImprestImport } from './imprestImport.js';

const liveCategory = value => ({
  'Diesel transport': 'Diesel Transport', 'Worker transport': 'Staff Site Logistics',
  Maintenance: 'Dozer Maintenance', Other: 'MSc',
})[value] || 'MSc';
const lower = value => String(value || '').trim().toLocaleLowerCase();

function liveEntries(records, employees) {
  const byName = new Map(employees.map(person => [lower(person.name), person]));
  const entries = [];
  for (const record of records) {
    if (record.kind !== 'Cost' || record.status === 'Rejected' || record.data?.linkedFundRequestId) continue;
    const data = record.data || {};
    const manager = employees.find(person => person.id === data.imprestManagerId) || byName.get(lower(data.payee));
    const managerId = manager?.id || `legacy:${lower(data.payee)}`;
    const managerName = manager?.name || data.payee || 'Unmatched manager';
    const category = data.imprestCategory || liveCategory(data.category);
    const debit = Number(data.amount || 0);
    entries.push({ id: `${record.id}:cost`, managerId, managerName, date: data.incurredDate || record.createdAt?.slice(0, 10) || '',
      project: record.project, site: data.site || '', allocation: [data.costTargetType, data.costTargetName].filter(Boolean).join(' · '), purpose: data.description || '', category,
      sourceOfCredit: '', debit, credit: 0, categoryAmounts: { [category]: debit },
      reference: record.id, status: record.status, source: 'Earlier cost', order: 1 });
    for (const [index, event] of (record.events || []).entries()) {
      if (event.type === 'payment') entries.push({ id: `${record.id}:payment:${index}`, managerId, managerName,
        date: event.date || event.at?.slice(0, 10) || '', project: record.project, site: '',
        purpose: `Payment to manager for ${record.id}`, category: '', sourceOfCredit: event.note || '',
        debit: 0, credit: Number(event.amount || 0), categoryAmounts: {}, reference: event.reference || record.id,
        status: 'Paid', source: 'ERP payment', order: 2 });
      if (event.type === 'distribution') entries.push({ id: `${record.id}:distribution:${index}`, managerId, managerName,
        date: event.date || event.at?.slice(0, 10) || '', project: record.project, site: '',
        purpose: `Paid onward to ${event.provider || 'provider'} for ${record.id}`, category: '', sourceOfCredit: '',
        debit: 0, credit: 0, providerPayment: Number(event.amount || 0), categoryAmounts: {},
        reference: event.reference || record.id, status: 'Provider paid', source: 'Provider payout', order: 3 });
    }
  }
  return entries;
}

function historicEntry(row, employees) {
  const manager = employees.find(person => person.id === row.manager_id);
  return { id: row.id, managerId: row.manager_id, managerName: manager?.name || row.manager_id,
    date: row.entry_date, project: row.project || '', site: row.site || '', purpose: row.purpose || '',
    category: row.category || '', sourceOfCredit: row.source_of_credit || '', debit: Number(row.debit || 0),
    credit: Number(row.credit || 0), categoryAmounts: row.category_amounts || {}, reference: `${row.source_sheet} · row ${row.source_row}`,
    status: 'Imported history', source: row.source_file || '', order: 0 };
}

export function renderManagerImprests(container) {
  container.replaceChildren();
  const tier = getCurrentTier();
  const privileged = ['Admin', 'Accounts'].includes(tier);
  const employees = store.get('employees');
  const managers = employees.filter(managerIsImprestEligible).sort((a, b) => a.name.localeCompare(b.name));
  const managerFilter = el('select');
  managerFilter.append(el('option', { value: '' }, 'All managers'));
  managers.forEach(person => managerFilter.append(el('option', { value: person.id }, `${person.name} · ${person.role}`)));
  if (!privileged) { managerFilter.value = getCurrentUserId(); managerFilter.disabled = true; }
  const reload = el('button', { type: 'button', class: 'btn btn-ghost' }, 'Refresh ledger');
  const status = el('p', { class: 'section-subtitle' }, 'Earlier costs enter the Debit column on the incurred date. Actual payments to managers enter Credit; provider payouts are shown separately. A negative balance means the manager is owed.');
  const summary = el('div', { class: 'imp-row' });
  const table = el('div');
  const controls = el('div', { class: 'imp-row' }, [managerFilter, reload]);
  container.append(sectionHeader('Manager Imprests', 'Cost, payment and running-balance statement by manager', controls), status, summary, table);
  const importSlot = el('div');
  container.append(importSlot);
  renderManagerImprestImport(importSlot, load);

  let historic = [];
  function render() {
    const records = store.get('fuelWorkflows');
    const visible = privileged ? records : records.filter(record =>
      record.data?.imprestManagerId === getCurrentUserId());
    const all = [...liveEntries(visible, employees), ...historic.map(row => historicEntry(row, employees))];
    const selected = managerFilter.value ? all.filter(row => row.managerId === managerFilter.value) : all;
    const groups = new Map();
    selected.forEach(row => { if (!groups.has(row.managerId)) groups.set(row.managerId, []); groups.get(row.managerId).push(row); });
    const statements = [...groups].map(([managerId, rows]) => ({ managerId, managerName: rows[0].managerName, ...imprestStatement(rows) }));
    const totals = statements.reduce((a, value) => ({ debits: a.debits + value.debits, credits: a.credits + value.credits,
      outstanding: a.outstanding + value.outstanding, held: a.held + value.held }), { debits: 0, credits: 0, outstanding: 0, held: 0 });
    summary.replaceChildren(
      el('strong', {}, `Costs / debits ${formatCurrency(totals.debits)}`),
      el('strong', {}, `Payments / credits ${formatCurrency(totals.credits)}`),
      el('strong', {}, `Owed to managers ${formatCurrency(totals.outstanding)}`),
      el('strong', {}, `Manager cash balance ${formatCurrency(totals.held)}`));
    const categoryNames = [...new Set([...IMPREST_COLUMNS, ...selected.flatMap(row => Object.keys(row.categoryAmounts || {}))])];
    const rows = statements.flatMap(statement => statement.rows.map(row => ({ ...row, managerName: statement.managerName })));
    const columns = [
      { key: 'date', label: 'Date', render: row => formatDate(row.date) },
      { key: 'managerName', label: 'Manager' }, { key: 'project', label: 'Project' }, { key: 'allocation', label: 'Cost relates to' }, { key: 'site', label: 'Site / location' },
      { key: 'purpose', label: 'Purpose' }, { key: 'debit', label: 'Debit · cost', render: row => row.debit ? formatCurrency(row.debit) : '—' },
      { key: 'credit', label: 'Credit · payment', render: row => row.credit ? formatCurrency(row.credit) : '—' },
      ...categoryNames.map(name => ({ key: `cat:${name}`, label: name, render: row => row.categoryAmounts?.[name] ? formatCurrency(row.categoryAmounts[name]) : '—' })),
      { key: 'category', label: 'Category' }, { key: 'sourceOfCredit', label: 'Source of credit' },
      { key: 'providerPayment', label: 'Paid to provider', render: row => row.providerPayment ? formatCurrency(row.providerPayment) : '—' },
      { key: 'runningBalance', label: 'Running balance', render: row => formatCurrency(row.runningBalance) },
      { key: 'outstanding', label: 'Outstanding owed', render: row => formatCurrency(row.outstanding) },
      { key: 'reference', label: 'Reference' }, { key: 'status', label: 'Status' }, { key: 'source', label: 'Source' },
    ];
    renderTable(table, { columns, rows, emptyText: 'No imprest transactions for this manager.' });
  }

  async function load() {
    status.textContent = 'Refreshing manager imprests…';
    const { data, error } = await supabase.from('manager_imprest_entries').select('*').order('entry_date', { ascending: true }).limit(10000);
    if (error) {
      status.textContent = error.code === '42P01' ? 'Imprest history setup has not been applied yet. Current earlier-cost requests are shown below.' : `Could not load imported history: ${error.message}`;
    } else {
      historic = data || [];
      status.textContent = 'Earlier costs are debits; payments to managers are credits. Negative running balances are amounts owed. Imported history is kept separate from project expenses.';
    }
    render();
  }
  managerFilter.addEventListener('change', render);
  reload.addEventListener('click', async () => { await store.refreshCollection('fuelWorkflows'); await load(); });
  load();
}

