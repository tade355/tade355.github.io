import { selectableProjects, selectableEmployees, selectableMachines, machineProjectAsOf } from '../selectionOptions.js';
import { validateDieselBatch } from '../dieselBatch.js';
import { renderFuelWorkflow } from './fuelWorkflow.js';
import { stationAdvanceBalances, siteFuelIssues } from '../fuelLedger.js';
import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatCurrency, formatDate, el, dateInRange } from '../utils.js';
import { sectionHeader, statCard, statusPill, renderTable, actionButtons, openModal, confirmDelete, dateRangeFields } from '../ui.js';
import { FUEL_STATIONS } from '../constants.js';
import { fleetItems } from './fleet.js';
import { renderDieselTracking } from './dieselTracking.js';
import { renderFuelingVouchers } from './fuelingVouchers.js';
import { renderAgoPlanner } from './agoPlanner.js';
import { allDieselReceipts } from '../dieselSupplyStore.js';
import { stationBalances as creditBalances } from './fuelCredit.js';
import { getCurrentTier, filterByProject } from '../session.js';
import { reconcileSiteDay, reconcileDozerDay } from '../dieselReconciliation.js';

function projectOptions() {
  return filterByProject(selectableProjects(store.get('projects')), 'name').map((p) => ({ value: p.name, label: p.name }));
}

function fleetOptions() {
  return selectableMachines(fleetItems()).map((i) => ({ value: i.name, label: i.name }));
}

function employeeOptions() {
  return [{ value: '', label: '— Not specified —' }, ...selectableEmployees(store.get('employees')).map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }))];
}

function employeeName(id) {
  return store.get('employees').find((e) => e.id === id)?.name || '—';
}

// ---------------------------------------------------------------------
// Level 1 — Station Ledger: prepay a station, it owes back litres/funds
// as it supplies diesel. The supply side is the SAME diesel_receipts
// records used by Fleet Management -> Diesel Tracking (tagged with a
// station here) — not a separate ledger — so a receipt logged there
// automatically draws down the right station's balance here.
// ---------------------------------------------------------------------

function prepaymentFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'station', label: 'Filling Station', type: 'select', required: true, options: FUEL_STATIONS.map((s) => ({ value: s, label: s })) },
    { name: 'amount', label: 'Amount Paid (₦)', type: 'number', required: true, min: 0 },
    { name: 'unitPriceAgreed', label: 'Agreed Unit Price (₦/litre)', type: 'number', required: true, min: 0 },
    { name: 'reference', label: 'Reference (receipt #, transfer ref, etc.)' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
}

// Balance is derived live from every prepayment and every diesel receipt
// tagged to that station — never stored — the same "derive, don't
// persist" approach used by Fuel Credit Tracking's stationBalances(),
// just pointed the other way: balance > 0 here means the STATION still
// owes diesel/funds, not the company.
export function stationPrepayBalances() {
  return stationAdvanceBalances(store.get('dieselStationPrepayments'), allDieselReceipts(), creditBalances());
}

function renderStationLedgerTab(container) {
  container.innerHTML = '';
  const actionSlot = el('div');
  container.appendChild(sectionHeader(
    'Station Ledger — Level 1',
    'Diesel prepaid to a filling station, drawn down as diesel arrives from it — plus what the company owes a station that supplies on credit (Midejab), from Fuel Credit',
    actionSlot,
  ));
  actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openPrepaymentForm() }, '+ Log Prepayment'));

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const balancesContainer = el('div');
  container.appendChild(balancesContainer);
  container.appendChild(el('p', { class: 'backup-warning' }, "Unallocated deliveries need review. Credit debt is separate; negative balances indicate over-delivery."));
  container.appendChild(el('h3', { class: 'subsection-title' }, 'Prepayments'));
  const prepaymentsContainer = el('div');
  container.appendChild(prepaymentsContainer);

  function refresh() {
    const balances = stationPrepayBalances();
    const totalDieselOwed = balances.reduce((sum, b) => sum + Math.max(0, b.balanceDiesel), 0);
    const totalFundsOwed = balances.reduce((sum, b) => sum + Math.max(0, b.balanceFunds), 0);
    const totalCreditOwed = balances.reduce((sum, b) => sum + b.creditOwed, 0);
    const outstandingCount = balances.filter((b) => b.status !== 'Fully Settled').length;

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Diesel Owed by Stations', value: `${totalDieselOwed.toLocaleString()} L`, tone: totalDieselOwed ? 'warning' : 'good' }),
      statCard({ label: 'Funds Value Still Owed', value: formatCurrency(totalFundsOwed), tone: totalFundsOwed ? 'warning' : 'good' }),
      statCard({ label: 'We Owe Stations (on credit)', value: formatCurrency(totalCreditOwed), tone: totalCreditOwed ? 'critical' : 'good', hint: 'From Fuel Credit (Purchasing)' }),
      statCard({ label: 'Stations With a Balance', value: String(outstandingCount), tone: outstandingCount ? 'warning' : 'good' }),
    ]));

    renderTable(balancesContainer, {
      columns: [
        { key: 'station', label: 'Station' },
        { key: 'totalPrepaid', label: 'Total Prepaid', render: (r) => formatCurrency(r.totalPrepaid) },
        { key: 'litresPurchased', label: 'Litres Purchased', render: (r) => `${r.litresPurchased.toLocaleString()} L` },
        { key: 'litresSupplied', label: 'Litres Supplied', render: (r) => `${r.litresSupplied.toLocaleString()} L` },
        { key: 'balanceDiesel', label: 'Station Owes Us (Diesel)', render: (r) => el('strong', { class: r.balanceDiesel > 0 ? 'text-critical' : 'text-good' }, `${r.balanceDiesel.toLocaleString()} L`) },
        { key: 'balanceFunds', label: 'Station Owes Us (Funds)', render: (r) => el('strong', { class: r.balanceFunds > 0 ? 'text-critical' : 'text-good' }, formatCurrency(r.balanceFunds)) },
        { key: 'creditOwed', label: 'We Owe Station (Credit)', render: (r) => el('strong', { class: r.creditOwed > 0 ? 'text-critical' : 'text-good' }, formatCurrency(r.creditOwed)) },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
      ],
      rows: balances,
      emptyText: 'No prepayments logged yet.',
      rowClass: (r) => (r.status === 'Outstanding' ? 'row-critical' : r.status === 'Partially Settled' ? 'row-warning' : undefined),
    });

    const rows = store.get('dieselStationPrepayments').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    renderTable(prepaymentsContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'station', label: 'Station' },
        { key: 'amount', label: 'Amount Paid', render: (r) => formatCurrency(r.amount) },
        { key: 'unitPriceAgreed', label: 'Agreed Unit Price', render: (r) => formatCurrency(r.unitPriceAgreed) },
        { key: 'reference', label: 'Reference', render: (r) => r.reference || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openPrepaymentForm(r),
            onDelete: async () => {
              if (!confirmDelete(`${r.station} prepayment on ${formatDate(r.date)}`)) return;
              try {
                await store.remove('dieselStationPrepayments', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this prepayment.');
              }
            },
          }),
        },
      ],
      rows,
      emptyText: 'No prepayments logged yet.',
    });
  }

  function openPrepaymentForm(record) {
    openModal({
      title: record ? 'Edit Prepayment' : 'Log Prepayment',
      fields: prepaymentFields(),
      initial: record || { date: todayISOString() },
      submitLabel: record ? 'Save Changes' : 'Log Prepayment',
      onSubmit: async (data) => {
        if (record) await store.update('dieselStationPrepayments', record.id, data);
        else await store.add('dieselStationPrepayments', data);
        refresh();
      },
    });
  }

  refresh();
}

// ---------------------------------------------------------------------
// Level 2 — Site Distribution: a project's dump-tank stock. New Supply
// reuses diesel_receipts (tagged with a project), Distributed is a new
// per-dozer handout log.
// ---------------------------------------------------------------------

function otherUseFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'project', label: 'Site / Project', type: 'select', required: true, options: projectOptions() },
    { name: 'purpose', label: 'Use', type: 'select', required: true, options: [
      { value: 'Maintenance', label: 'Repair / maintenance' },
      { value: 'Vehicle', label: 'Vehicle / transport' },
      { value: 'Debris Burning', label: 'Burning debris' },
      { value: 'Generator', label: 'Generator / site power' },
      { value: 'Other', label: 'Other site use' },
    ] },
    { name: 'recipient', label: 'Issued to / used for', required: true },
    { name: 'litres', label: 'Litres Issued', type: 'number', required: true, min: 0 },
    { name: 'distributedBy', label: 'Distributed By', type: 'select', options: employeeOptions() },
    { name: 'notes', label: 'Details / authorization', type: 'textarea' },
  ];
}

function distributionFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'project', label: 'Site / Project', type: 'select', required: true, options: projectOptions() },
    { name: 'equipment', label: 'Dozer / Equipment', type: 'select', required: true, options: fleetOptions() },
    { name: 'litres', label: 'Litres Distributed', type: 'number', required: true, min: 0 },
    { name: 'distributedBy', label: 'Distributed By', type: 'select', options: employeeOptions() },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
}

// "Distributed" is read straight from Daily Operations reports'
// dieselSupplied field (siteName = project), not from the
// diesel_site_distributions log below — a supervisor filing a report with
// Diesel Supplied filled in IS the distribution event, whether or not
// anyone pre-logged it here first. This also avoids double-counting: when
// a distribution record here seeds a report's Diesel Supplied field (see
// operations.js recomputeDieselSupplied), the litres already live in the
// report; summing diesel_site_distributions on top of that would count it
// twice.
function siteDieselLedger(from, to) {
  const receipts = allDieselReceipts().filter((r) => r.project);
  const issues = siteFuelIssues(store.get('dieselSiteDistributions'), store.get('operations'));
  return filterByProject(store.get('projects'), 'name').map((p) => {
    const openingReceipts = from ? receipts.filter((r) => r.project === p.name && r.date < from).reduce((sum, r) => sum + r.litres, 0) : 0;
    const openingDistributed = from ? issues.filter((o) => o.project === p.name && o.date < from).reduce((sum, o) => sum + (o.litres || 0), 0) : 0;
    const opening = openingReceipts - openingDistributed;
    const newInRange = receipts.filter((r) => r.project === p.name && dateInRange(r.date, from, to)).reduce((sum, r) => sum + r.litres, 0);
    const distributedInRange = issues.filter((o) => o.project === p.name && dateInRange(o.date, from, to)).reduce((sum, o) => sum + (o.litres || 0), 0);
    return { name: p.name, opening, newInRange, distributedInRange, closing: opening + newInRange - distributedInRange };
  });
}

function renderSiteDistributionTab(container) {
  container.innerHTML = '';
  const actionSlot = el('div');
  container.appendChild(sectionHeader(
    'Site Distribution — Level 2',
    "Calculated site stock: opening balance + deliveries − distribution = closing balance. Confirm it in Daily Reconciliation with a physical count.",
    actionSlot,
  ));
  actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openBatchForm() }, '+ Distribute to Dozers'));
  actionSlot.appendChild(el('button', { class: 'btn btn-ghost', onClick: () => openSupplyForm() }, '+ New Supply from Station'));
  actionSlot.appendChild(el('button', { class: 'btn btn-ghost', onClick: () => openOtherUseForm() }, '+ Other Diesel Use'));

  const entrySlot = el('div');
  container.appendChild(entrySlot);
  const filterBar = el('div', { class: 'filter-bar' });
  const { fromInput, toInput, elements } = dateRangeFields({ onChange: () => refresh() });
  elements.forEach((e) => filterBar.appendChild(e));
  container.appendChild(filterBar);

  const ledgerContainer = el('div');
  container.appendChild(ledgerContainer);
  container.appendChild(el('h3', { class: 'subsection-title' }, 'Distributions'));
  container.appendChild(el('p', { class: 'section-subtitle' }, 'Record dozer fueling and other site uses separately. Both reduce diesel on ground; only dozer fueling updates tank balances.'));
  const suppliesContainer = el('div');
  container.appendChild(el('h3', { class: 'subsection-title' }, 'New Supply / Station Collections'));
  container.appendChild(el('p', { class: 'section-subtitle' }, 'Diesel collections logged in Fuel Credit appear here automatically. Assign the site on older unassigned collections to include them in site stock; do not log a second receipt.'));
  container.appendChild(suppliesContainer);
  const distributionsContainer = el('div');
  container.appendChild(distributionsContainer);

  function refresh() {
    const ledgerRows = siteDieselLedger(fromInput.value, toInput.value);
    renderTable(ledgerContainer, {
      columns: [
        { key: 'name', label: 'Site / Project' },
        { key: 'opening', label: 'Opening', render: (r) => `${r.opening.toLocaleString()} L` },
        { key: 'newInRange', label: 'New Supply', render: (r) => `${r.newInRange.toLocaleString()} L` },
        { key: 'distributedInRange', label: 'Distributed', render: (r) => `${r.distributedInRange.toLocaleString()} L` },
        { key: 'closing', label: 'Closing', render: (r) => el('strong', {}, `${r.closing.toLocaleString()} L`) },
      ],
      rows: ledgerRows,
      emptyText: 'No projects yet.',
    });

    const supplies = filterByProject(allDieselReceipts(), 'project').filter(r => dateInRange(r.date, fromInput.value, toInput.value)).sort((a, b) => b.date.localeCompare(a.date));
    renderTable(suppliesContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'station', label: 'Station' },
        { key: 'litres', label: 'New Supply', render: (r) => `${Number(r.litres || 0).toLocaleString()} L` },
        { key: 'project', label: 'Site / Project', render: (r) => r.project || 'Unassigned' },
        { key: 'reference', label: 'Source', render: r => r.fromFuelCredit ? 'Station collection' : 'Diesel receipt' },
        { key: 'action', label: '', render: (r) => r.project ? 'Included in site stock' : r.fromFuelCredit ? el('button', { class: 'btn btn-ghost', type: 'button', onClick: () => assignCreditSupply(r) }, 'Assign site') : 'Assign site in Diesel Tracking' },
      ],
      rows: supplies,
      emptyText: 'No Fuel Credit diesel collections in this period.',
    });

    const rows = filterByProject(store.get('dieselSiteDistributions'), 'project').filter(r => dateInRange(r.date, fromInput.value, toInput.value)).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    renderTable(distributionsContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'project', label: 'Site / Project' },
        { key: 'purpose', label: 'Use', render: (r) => r.purpose || 'Dozer' },
        { key: 'equipment', label: 'Dozer / Equipment', render: (r) => r.equipment || '—' },
        { key: 'recipient', label: 'Issued to / for', render: (r) => r.recipient || '—' },
        { key: 'litres', label: 'Litres', render: (r) => `${r.litres.toLocaleString()} L` },
        { key: 'distributedBy', label: 'Distributed By', render: (r) => employeeName(r.distributedBy) },
        { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => r.purpose && r.purpose !== 'Dozer' ? openOtherUseForm(r) : openDistributionForm(r),
            onDelete: async () => {
              if (!confirmDelete(`Diesel issued for ${r.equipment || r.recipient || r.purpose} on ${formatDate(r.date)}`)) return;
              try {
                await store.remove('dieselSiteDistributions', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this distribution.');
              }
            },
          }),
        },
      ],
      rows,
      emptyText: 'No distributions logged yet.',
    });
  }

  function openSupplyForm() {
    openModal({ title: 'New Supply from Station', fields: [
      { name: 'date', label: 'Collection date', type: 'date', required: true },
      { name: 'project', label: 'Receiving project', type: 'select', required: true, options: projectOptions() },
      { name: 'station', label: 'Station', type: 'select', required: true, options: FUEL_STATIONS.map(s => ({ value: s, label: s })) },
      { name: 'litres', label: 'Physical litres collected', type: 'number', required: true, min: 0.01, step: 0.01 },
      { name: 'unitPrice', label: 'Price per litre (₦)', type: 'number', required: true, min: 0.01, step: 0.01 },
      { name: 'reference', label: 'Collection reference / waybill' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ], initial: { date: todayISOString(), unitPrice: 1900 }, submitLabel: 'Record New Supply', onSubmit: async data => {
      if (!(Number(data.litres) > 0 && Number(data.unitPrice) > 0)) throw new Error('Enter positive litres and price.');
      const existing = store.get('fuelCreditCollections').find(r => r.fuelType === 'Diesel' && r.project === data.project && r.station === data.station && r.date === data.date && Number(r.litres) === Number(data.litres) && (r.reference || '') === (data.reference || ''));
      if (existing) throw new Error('This collection is already recorded. Check New Supply before adding it again.');
      await store.add('fuelCreditCollections', { ...data, fuelType: 'Diesel' });
      refresh();
    } });
  }

  function openBatchForm() {
    entrySlot.innerHTML = '';
    const form = el('form', { class: 'card', style: 'padding:16px;margin:16px 0;max-width:760px' });
    const field = (label, input) => el('label', { class: 'field', style: 'display:block;margin-bottom:12px' }, [el('span', { class: 'field-label' }, label), input]);
    const date = el('input', { type: 'date', required: true, value: todayISOString() });
    const project = el('select', { required: true }, [el('option', { value: '' }, 'Select project'), ...projectOptions().map(p => el('option', { value: p.value }, p.label))]);
    const physical = el('input', { type: 'number', min: 0.01, step: 0.01, required: true, inputmode: 'decimal', placeholder: 'Measured litres being issued' });
    const by = el('select', {}, employeeOptions().map(p => el('option', { value: p.value }, p.label)));
    const notes = el('textarea', { rows: 2 });
    const list = el('div');
    const total = el('p', { role: 'status', 'aria-live': 'polite' });
    const error = el('p', { role: 'alert' });
    const submit = el('button', { type: 'submit', class: 'btn btn-primary', disabled: true }, 'Submit Distribution');
    let controls = [], saving = false, uncertain = false;
    const read = () => controls.map(c => ({ equipment: c.name, selected: c.check.checked, litres: c.qty.value }));
    function update() {
      const sum = read().filter(r => r.selected).reduce((s,r) => s + (Number(r.litres) || 0), 0);
      total.textContent = `Distributed: ${sum.toLocaleString()} L · Physical: ${Number(physical.value || 0).toLocaleString()} L · Difference: ${(Number(physical.value || 0) - sum).toFixed(2)} L`;
      try { validateDieselBatch(read(), physical.value); submit.disabled = saving || uncertain; } catch { submit.disabled = true; }
    }
    function drawMachines() {
      list.innerHTML = ''; controls = [];
      const machines = selectableMachines(fleetItems()).filter(m => machineProjectAsOf(m, date.value, store.get('operations'), store.get('machineStatusReports'), todayISOString()) === project.value);
      for (const machine of machines) {
        const check = el('input', { type: 'checkbox', 'aria-label': `Select ${machine.name}` });
        const qty = el('input', { type: 'number', min: 0.01, step: 0.01, inputmode: 'decimal', placeholder: 'Litres', 'aria-label': `Litres for ${machine.name}`, disabled: true });
        check.addEventListener('change', () => { qty.disabled = !check.checked; update(); }); qty.addEventListener('input', update);
        list.appendChild(el('div', { style: 'display:grid;grid-template-columns:minmax(0,1fr) minmax(90px,140px);gap:12px;align-items:center;margin:10px 0' }, [el('label', {}, [check, ` ${machine.name}`]), qty]));
        controls.push({ name: machine.name, check, qty });
      }
      if (!machines.length) list.appendChild(el('p', {}, 'Select a project with assigned dozers. Check fleet assignments if a dozer is missing.'));
      update();
    }
    form.append(el('h3', {}, 'Distribute diesel — one submission'), el('p', {}, 'Enter the physical quantity being distributed, then allocate it to the dozers. This is not the site tank closing count. No new supply is created by this form.'), field('Date', date), field('Project', project), field('Physical litres to distribute', physical), list, total, field('Distributed by', by), field('Notes (optional)', notes), error, submit, el('button', { type: 'button', class: 'btn btn-ghost', onClick: () => { entrySlot.innerHTML = ''; } }, 'Cancel'));
    project.addEventListener('change', drawMachines); date.addEventListener('change', drawMachines); physical.addEventListener('input', update);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (saving || uncertain) return;
      try {
        const lines = validateDieselBatch(read(), physical.value);
        if (!projectOptions().some(p => p.value === project.value)) throw new Error('Select a valid project.');
        saving = true; submit.disabled = true; error.textContent = '';
        await store.addDieselDistributionBatch(lines.map(line => ({ ...line, date: date.value, project: project.value, distributedBy: by.value || null, purpose: 'Dozer', recipient: null, notes: notes.value })));
        entrySlot.innerHTML = ''; refresh();
      } catch (err) {
        error.textContent = err.message || 'Could not save. Refresh and check distributions before retrying.';
        // A lost response can hide a committed batch. Require checking the ledger before retry.
        if (/fetch|network|timeout/i.test(err.message || '')) { uncertain = true; error.textContent += ' Refresh and check the ledger before trying again.'; }
      } finally { saving = false; update(); }
    });
    entrySlot.appendChild(form); drawMachines();
  }

  function assignCreditSupply(receipt) {
    const collection = store.get('fuelCreditCollections').find((c) => c.id === receipt.id);
    if (!collection) { window.alert('Source collection not found. Refresh the data and try again.'); return; }
    openModal({
      title: 'Assign Fuel Credit supply to site',
      fields: [{ name: 'project', label: 'Site / Project', type: 'select', required: true, options: [
        { value: '', label: '— Select project —' },
        ...store.get('projects').map((p) => ({ value: p.name, label: p.name })),
      ] }],
      initial: { project: collection.project || '' },
      submitLabel: 'Assign Site',
      onSubmit: async ({ project }) => {
        if (!project || !store.get('projects').some((p) => p.name === project)) throw new Error('Select a valid project.');
        await store.update('fuelCreditCollections', collection.id, { ...collection, project });
        refresh();
      },
    });
  }

  function openDistributionForm(record) {
    if (!projectOptions().length) { window.alert('Add a project first.'); return; }
    if (!fleetOptions().length) { window.alert('Add a fleet asset first.'); return; }
    openModal({
      title: record ? 'Edit Distribution' : 'Log Distribution',
      fields: distributionFields(),
      initial: record || { date: todayISOString() },
      submitLabel: record ? 'Save Changes' : 'Log Distribution',
      onSubmit: async (data) => {
        const payload = { ...data, purpose: 'Dozer', recipient: null };
        if (record) await store.update('dieselSiteDistributions', record.id, payload);
        else await store.add('dieselSiteDistributions', payload);
        refresh();
      },
    });
  }

  function openOtherUseForm(record) {
    if (!projectOptions().length) { window.alert('Add a project first.'); return; }
    openModal({
      title: record ? 'Edit Other Diesel Use' : 'Log Other Diesel Use',
      fields: otherUseFields(),
      initial: record || { date: todayISOString(), purpose: 'Maintenance' },
      submitLabel: record ? 'Save Changes' : 'Log Diesel Use',
      onSubmit: async (data) => {
        const payload = { ...data, equipment: null };
        if (record) await store.update('dieselSiteDistributions', record.id, payload);
        else await store.add('dieselSiteDistributions', payload);
        refresh();
      },
    });
  }

  refresh();
}

function renderDailyReconciliationTab(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader('Daily Diesel Reconciliation',
    'Check project deliveries against dozer fueling, other site uses, and the physical site-tank count. Dozer closing figures come from daily reports.'));
  const controls = el('div', { class: 'filter-bar' });
  const dateInput = el('input', { type: 'date', value: todayISOString() });
  const projectSelect = el('select', {}, projectOptions().map((p) => el('option', { value: p.value }, p.label)));
  controls.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Date'), dateInput]));
  controls.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Project'), projectSelect]));
  if (['Admin', 'Supervisor'].includes(getCurrentTier())) controls.appendChild(el('button', { class: 'btn btn-primary', type: 'button', onClick: () => openCountForm() }, '+ Record Physical Site Count'));
  container.appendChild(controls);
  const result = el('div');
  container.appendChild(result);

  function refresh() {
    result.innerHTML = '';
    const project = projectSelect.value;
    const date = dateInput.value;
    if (!project || !date) return;
    const distributions = store.get('dieselSiteDistributions');
    const operations = store.get('operations');
    const counts = store.get('dieselStockCounts');
    const site = reconcileSiteDay({ project, date, receipts: allDieselReceipts(), distributions, operations, counts });
    result.appendChild(el('p', { class: 'section-subtitle' }, site.verified
      ? `Opening is based on the last physical site count (${formatDate(site.lastCountDate)}), plus later movements.`
      : 'No earlier project stock count is available. Opening is provisional from recorded movements.'));
    const cards = el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Opening on site', value: `${site.opening.toLocaleString()} L` }),
      statCard({ label: 'Supplied today', value: `${site.supplied.toLocaleString()} L` }),
      statCard({ label: 'To dozers', value: `${site.dozerIssued.toLocaleString()} L` }),
      statCard({ label: 'Other site uses', value: `${site.otherIssued.toLocaleString()} L` }),
      statCard({ label: 'Expected on ground', value: `${site.expected.toLocaleString()} L`, tone: site.expected < 0 ? 'critical' : undefined }),
      statCard({ label: 'Physical count', value: site.measured === null ? 'Not recorded' : `${site.measured.toLocaleString()} L` }),
      statCard({ label: 'Site variance', value: site.variance === null ? 'Not verified' : `${site.variance.toLocaleString()} L`, hint: site.status, tone: site.status.includes('investigate') || site.status.includes('Over-allocated') ? 'critical' : undefined }),
    ]);
    result.appendChild(cards);
    const unassigned = allDieselReceipts().filter((r) => r.date === date && !r.project);
    if (unassigned.length) result.appendChild(el('p', { class: 'section-subtitle text-warning' },
      `${unassigned.length} delivery record(s) (${unassigned.reduce((n, r) => n + Number(r.litres || 0), 0).toLocaleString()} L) have no project. Assign them in Purchase & Supply before reconciliation.`));
    result.appendChild(el('h3', { class: 'subsection-title' }, 'Dozer accountability'));
    result.appendChild(el('p', { class: 'section-subtitle' }, 'Reported closing can be auto-calculated in Daily Operations. Verify unusual figures with an actual tank reading and the work report. Site-count tolerance: 5 L or 2%, whichever is higher. Mark non-tank repair issues with “maintenance diesel” in the distribution notes and keep a supporting maintenance record.'));
    const table = el('div'); result.appendChild(table);
    renderTable(table, { columns: [
      { key: 'equipment', label: 'Dozer' },
      { key: 'opening', label: 'Opening in tank', render: (r) => r.opening === null ? '—' : `${r.opening.toLocaleString()} L` },
      { key: 'issued', label: 'Distribution log', render: (r) => `${r.issued.toLocaleString()} L` },
      { key: 'otherUse', label: 'Non-tank issue', render: (r) => `${r.otherUse.toLocaleString()} L` },
      { key: 'reportIssued', label: 'Daily report supply', render: (r) => `${r.reportIssued.toLocaleString()} L` },
      { key: 'used', label: 'Used', render: (r) => `${r.used.toLocaleString()} L` },
      { key: 'expected', label: 'Expected closing', render: (r) => r.expected === null ? '—' : `${r.expected.toLocaleString()} L` },
      { key: 'reported', label: 'Reported closing', render: (r) => r.reported === null ? '—' : `${r.reported.toLocaleString()} L` },
      { key: 'status', label: 'Review', render: (r) => r.status },
    ], rows: reconcileDozerDay({ project, date, distributions, operations, fleet: fleetItems() }), emptyText: 'No dozer distribution or daily report for this project and date.' });
  }
  function openCountForm() {
    openModal({ title: 'Record Physical Site Count', fields: [
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'project', label: 'Project', type: 'select', required: true, options: projectOptions() },
      { name: 'countedLitres', label: 'Litres physically on ground', type: 'number', required: true, min: 0 },
      { name: 'countedBy', label: 'Counted by', type: 'select', required: true, options: employeeOptions().filter((e) => e.value) },
      { name: 'notes', label: 'Method / notes', type: 'textarea' },
    ], initial: { date: dateInput.value, project: projectSelect.value }, submitLabel: 'Save Count',
    onSubmit: async (data) => { await store.add('dieselStockCounts', data); refresh(); } });
  }
  dateInput.addEventListener('change', refresh);
  projectSelect.addEventListener('change', refresh);
  refresh();
}

// ---------------------------------------------------------------------
// Level 3 — Dozer Discrepancy Report: read-only, derived entirely from
// Daily Operations rows already on record. openingDiesel already equals
// prior closing + today's supplied (operations.js recomputeOpeningDiesel),
// so "expected closing" is always re-derivable as opening − used, and any
// gap against what was actually saved as closingDiesel (which may be a
// real tank dip overriding the computed estimate) is the discrepancy.
// ---------------------------------------------------------------------

function dozerDiscrepancies(from, to, equipmentFilter) {
  const dozers = equipmentFilter ? fleetItems().filter((d) => d.name === equipmentFilter) : fleetItems();
  return dozers.map((d) => {
    const rows = store.get('operations')
      .filter((o) => o.equipment === d.name && dateInRange(o.date, from, to))
      .slice()
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    const distributed = rows.reduce((sum, r) => sum + (r.dieselSupplied || 0), 0);
    const used = rows.reduce((sum, r) => sum + (r.fuelUsed || 0), 0);
    const last = rows[rows.length - 1];
    const closingReported = last && last.closingDiesel !== null && last.closingDiesel !== undefined ? last.closingDiesel : null;
    const closingExpected = last ? (Number(last.openingDiesel || 0) - Number(last.fuelUsed || 0)) : null;
    const discrepancy = (closingReported !== null && closingExpected !== null) ? closingReported - closingExpected : null;
    let status = 'OK';
    if (discrepancy !== null) {
      const threshold = Math.max(5, Math.abs(closingExpected) * 0.02);
      if (Math.abs(discrepancy) > threshold) status = 'Variance';
      else if (Math.abs(discrepancy) > 0.01) status = 'Minor Variance';
    }
    return { name: d.name, reportsLogged: rows.length, distributed, used, closingReported, closingExpected, discrepancy, status, lastDate: last?.date };
  });
}

function renderDiscrepancyReportTab(container) {
  container.innerHTML = '';
  container.appendChild(sectionHeader(
    'Dozer Discrepancy Report — Level 3',
    "Compare expected closing stock with the reported tank count to identify variances.",
  ));

  const filterBar = el('div', { class: 'filter-bar' });
  const { fromInput, toInput, elements } = dateRangeFields({ onChange: () => refresh() });
  const equipmentSelect = el('select', {}, [
    el('option', { value: '' }, 'All Dozers'),
    ...fleetItems().map((d) => el('option', { value: d.name }, d.name)),
  ]);
  elements.forEach((e) => filterBar.appendChild(e));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Dozer'), equipmentSelect]));
  container.appendChild(filterBar);

  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const rows = dozerDiscrepancies(fromInput.value, toInput.value, equipmentSelect.value);
    renderTable(tableContainer, {
      columns: [
        { key: 'name', label: 'Dozer' },
        { key: 'reportsLogged', label: 'Reports Logged' },
        { key: 'distributed', label: 'Distributed', render: (r) => `${r.distributed.toLocaleString()} L` },
        { key: 'used', label: 'Used', render: (r) => `${r.used.toLocaleString()} L` },
        { key: 'closingExpected', label: 'Closing Expected', render: (r) => (r.closingExpected === null ? '—' : `${r.closingExpected.toLocaleString()} L`) },
        { key: 'closingReported', label: 'Closing Reported', render: (r) => (r.closingReported === null ? '—' : `${r.closingReported.toLocaleString()} L`) },
        {
          key: 'discrepancy',
          label: 'Discrepancy',
          render: (r) => {
            if (r.discrepancy === null) return '—';
            const label = `${r.discrepancy > 0 ? '+' : ''}${r.discrepancy.toLocaleString()} L`;
            return el('strong', { class: r.status === 'Variance' ? 'text-critical' : (r.status === 'Minor Variance' ? 'text-warning' : 'text-good') }, label);
          },
        },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
      ],
      rows,
      emptyText: 'No fleet assets yet.',
      rowClass: (r) => (r.status === 'Variance' ? 'row-critical' : r.status === 'Minor Variance' ? 'row-warning' : undefined),
    });
  }

  equipmentSelect.addEventListener('change', refresh);
  refresh();
}

export function renderDieselManagement(container) {
  container.innerHTML = '';

  const canViewFinance = ['Admin','Accounts'].includes(getCurrentTier());
  let tab = canViewFinance ? 'station' : 'site';
  const tabBar = el('div', { class: 'tab-bar' });
  const stationTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('station') }, 'Station Ledger');
  const siteTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('site') }, 'Site Distribution');
  const reportTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('report') }, 'Variances');
  const reconcileTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('reconcile') }, 'Daily Reconciliation');
  const trackingTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('tracking') }, 'Tracking');
  const vouchersTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('vouchers') }, 'Vouchers');
  const workflowTabBtn=el('button',{class:'tab-btn',type:'button',onClick:()=>setTab('workflow')},'Fuel Workflow');
  tabBar.appendChild(workflowTabBtn);
  const plannerTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('planner') }, 'Planner');
  tabBar.appendChild(plannerTabBtn);
  tabBar.appendChild(vouchersTabBtn);
  if (canViewFinance) tabBar.appendChild(stationTabBtn);
  tabBar.appendChild(siteTabBtn);
  tabBar.appendChild(reconcileTabBtn);
  tabBar.appendChild(trackingTabBtn);
  tabBar.appendChild(reportTabBtn);
  container.appendChild(tabBar);

  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    workflowTabBtn.classList.toggle('active',tab==='workflow');
    stationTabBtn.classList.toggle('active', tab === 'station');
    siteTabBtn.classList.toggle('active', tab === 'site');
    reportTabBtn.classList.toggle('active', tab === 'report');
    reconcileTabBtn.classList.toggle('active', tab === 'reconcile');
    trackingTabBtn.classList.toggle('active', tab === 'tracking');
    vouchersTabBtn.classList.toggle('active', tab === 'vouchers');
    plannerTabBtn.classList.toggle('active', tab === 'planner');
    if (tab==='workflow') renderFuelWorkflow(body);
    else if (tab === 'station') renderStationLedgerTab(body);
    else if (tab === 'site') renderSiteDistributionTab(body);
    else if (tab === 'reconcile') renderDailyReconciliationTab(body);
    else if (tab === 'report') renderDiscrepancyReportTab(body);
    else if (tab === 'tracking') renderDieselTracking(body);
    else if (tab === 'planner') renderAgoPlanner(body);
    else renderFuelingVouchers(body);
  }

  setTab(tab);
}




