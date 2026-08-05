import { store } from '../store.js';
import { formatCurrency, formatDate, el, dateInRange } from '../utils.js';
import { sectionHeader, statCard, statusPill, renderTable, actionButtons, openModal, confirmDelete } from '../ui.js';
import { FUEL_STATIONS } from '../constants.js';
import { fleetItems } from './fleet.js';
import { renderDieselTracking } from './dieselTracking.js';
import { renderFuelingVouchers } from './fuelingVouchers.js';

function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
}

function fleetOptions() {
  return fleetItems().map((i) => ({ value: i.name, label: i.name }));
}

function employeeOptions() {
  return [{ value: '', label: '— Not specified —' }, ...store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }))];
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
  const prepayments = store.get('dieselStationPrepayments');
  const receipts = store.get('dieselReceipts').filter((r) => r.station);
  const stations = [...new Set([...prepayments.map((p) => p.station), ...receipts.map((r) => r.station)])];

  return stations.map((station) => {
    const ownPrepayments = prepayments.filter((p) => p.station === station);
    const totalPrepaid = ownPrepayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const litresPurchased = ownPrepayments.reduce((sum, p) => sum + (p.unitPriceAgreed ? (p.amount || 0) / p.unitPriceAgreed : 0), 0);
    const ownReceipts = receipts.filter((r) => r.station === station);
    const litresSupplied = ownReceipts.reduce((sum, r) => sum + (r.litres || 0), 0);
    const fundsValueSupplied = ownReceipts.reduce((sum, r) => sum + (r.litres || 0) * (r.unitCost || 0), 0);
    const balanceDiesel = litresPurchased - litresSupplied;
    const balanceFunds = totalPrepaid - fundsValueSupplied;
    let status = 'Outstanding';
    if (balanceDiesel <= 0) status = 'Fully Settled';
    else if (litresSupplied > 0) status = 'Partially Settled';
    return { station, totalPrepaid, litresPurchased, litresSupplied, fundsValueSupplied, balanceDiesel, balanceFunds, status };
  }).sort((a, b) => b.balanceDiesel - a.balanceDiesel);
}

function renderStationLedgerTab(container) {
  container.innerHTML = '';
  const actionSlot = el('div');
  container.appendChild(sectionHeader(
    'Station Ledger — Level 1',
    'Diesel prepaid to a filling station, drawn down as diesel receipts arrive tagged to that station (Fleet Management → Diesel Tracking)',
    actionSlot,
  ));
  actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openPrepaymentForm() }, '+ Log Prepayment'));

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const balancesContainer = el('div');
  container.appendChild(balancesContainer);
  container.appendChild(el('h3', { class: 'subsection-title' }, 'Prepayments'));
  const prepaymentsContainer = el('div');
  container.appendChild(prepaymentsContainer);

  function refresh() {
    const balances = stationPrepayBalances();
    const totalDieselOwed = balances.reduce((sum, b) => sum + Math.max(0, b.balanceDiesel), 0);
    const totalFundsOwed = balances.reduce((sum, b) => sum + Math.max(0, b.balanceFunds), 0);
    const outstandingCount = balances.filter((b) => b.status !== 'Fully Settled').length;

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Diesel Owed by Stations', value: `${totalDieselOwed.toLocaleString()} L`, tone: totalDieselOwed ? 'warning' : 'good' }),
      statCard({ label: 'Funds Value Still Owed', value: formatCurrency(totalFundsOwed), tone: totalFundsOwed ? 'warning' : 'good' }),
      statCard({ label: 'Stations With a Balance', value: String(outstandingCount), tone: outstandingCount ? 'warning' : 'good' }),
    ]));

    renderTable(balancesContainer, {
      columns: [
        { key: 'station', label: 'Station' },
        { key: 'totalPrepaid', label: 'Total Prepaid', render: (r) => formatCurrency(r.totalPrepaid) },
        { key: 'litresPurchased', label: 'Litres Purchased', render: (r) => `${r.litresPurchased.toLocaleString()} L` },
        { key: 'litresSupplied', label: 'Litres Supplied', render: (r) => `${r.litresSupplied.toLocaleString()} L` },
        { key: 'balanceDiesel', label: 'Balance (Diesel)', render: (r) => el('strong', { class: r.balanceDiesel > 0 ? 'text-critical' : 'text-good' }, `${r.balanceDiesel.toLocaleString()} L`) },
        { key: 'balanceFunds', label: 'Balance (Funds)', render: (r) => el('strong', { class: r.balanceFunds > 0 ? 'text-critical' : 'text-good' }, formatCurrency(r.balanceFunds)) },
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
      initial: record || { date: new Date().toISOString().slice(0, 10) },
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
  const receipts = store.get('dieselReceipts').filter((r) => r.project);
  const operations = store.get('operations').filter((o) => o.siteName);
  return store.get('projects').map((p) => {
    const openingReceipts = from ? receipts.filter((r) => r.project === p.name && r.date < from).reduce((sum, r) => sum + r.litres, 0) : 0;
    const openingDistributed = from ? operations.filter((o) => o.siteName === p.name && o.date < from).reduce((sum, o) => sum + (o.dieselSupplied || 0), 0) : 0;
    const opening = openingReceipts - openingDistributed;
    const newInRange = receipts.filter((r) => r.project === p.name && dateInRange(r.date, from, to)).reduce((sum, r) => sum + r.litres, 0);
    const distributedInRange = operations.filter((o) => o.siteName === p.name && dateInRange(o.date, from, to)).reduce((sum, o) => sum + (o.dieselSupplied || 0), 0);
    return { name: p.name, opening, newInRange, distributedInRange, closing: opening + newInRange - distributedInRange };
  });
}

function renderSiteDistributionTab(container) {
  container.innerHTML = '';
  const actionSlot = el('div');
  container.appendChild(sectionHeader(
    'Site Distribution — Level 2',
    "Each project's dump-tank stock: Opening + New Supply (diesel receipts tagged to the site) − Distributed (Daily Operations reports' Diesel Supplied, for that site) = Closing. Distributed updates itself as reports come in from the field — nothing to log here for it to count.",
    actionSlot,
  ));
  actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openDistributionForm() }, '+ Log Distribution'));

  const filterBar = el('div', { class: 'filter-bar' });
  const fromInput = el('input', { type: 'date' });
  const toInput = el('input', { type: 'date' });
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), fromInput]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), toInput]));
  container.appendChild(filterBar);

  const ledgerContainer = el('div');
  container.appendChild(ledgerContainer);
  container.appendChild(el('h3', { class: 'subsection-title' }, 'Distributions'));
  container.appendChild(el('p', { class: 'section-subtitle' }, "Optional accountability log (who handed diesel to which dozer) — logging one here also pre-fills that dozer's Daily Operations report for the same date/site with these litres, but the Distributed figures above always come from the report itself, not from this log."));
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

    const rows = store.get('dieselSiteDistributions').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    renderTable(distributionsContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'project', label: 'Site / Project' },
        { key: 'equipment', label: 'Dozer / Equipment' },
        { key: 'litres', label: 'Litres', render: (r) => `${r.litres.toLocaleString()} L` },
        { key: 'distributedBy', label: 'Distributed By', render: (r) => employeeName(r.distributedBy) },
        { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openDistributionForm(r),
            onDelete: async () => {
              if (!confirmDelete(`Distribution to ${r.equipment} on ${formatDate(r.date)}`)) return;
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

  function openDistributionForm(record) {
    if (!projectOptions().length) { window.alert('Add a project first.'); return; }
    if (!fleetOptions().length) { window.alert('Add a fleet asset first.'); return; }
    openModal({
      title: record ? 'Edit Distribution' : 'Log Distribution',
      fields: distributionFields(),
      initial: record || { date: new Date().toISOString().slice(0, 10) },
      submitLabel: record ? 'Save Changes' : 'Log Distribution',
      onSubmit: async (data) => {
        if (record) await store.update('dieselSiteDistributions', record.id, data);
        else await store.add('dieselSiteDistributions', data);
        refresh();
      },
    });
  }

  [fromInput, toInput].forEach((input) => input.addEventListener('change', refresh));
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
    'Distributed and Used come from Daily Operations reports; Closing Expected is opening + supplied − used, recomputed the same way the report auto-fills it; Closing Reported is whatever was actually saved (a real tank dip if one overrode the estimate). A gap between the two is the theft/leak signal.',
  ));

  const filterBar = el('div', { class: 'filter-bar' });
  const fromInput = el('input', { type: 'date' });
  const toInput = el('input', { type: 'date' });
  const equipmentSelect = el('select', {}, [
    el('option', { value: '' }, 'All Dozers'),
    ...fleetItems().map((d) => el('option', { value: d.name }, d.name)),
  ]);
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), fromInput]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), toInput]));
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

  [fromInput, toInput, equipmentSelect].forEach((input) => input.addEventListener('change', refresh));
  refresh();
}

export function renderDieselManagement(container) {
  container.innerHTML = '';

  let tab = 'station';
  const tabBar = el('div', { class: 'tab-bar' });
  const stationTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('station') }, 'Station Ledger');
  const siteTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('site') }, 'Site Distribution');
  const reportTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('report') }, 'Dozer Discrepancy Report');
  const trackingTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('tracking') }, 'Diesel Tracking');
  const vouchersTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('vouchers') }, 'Fueling Vouchers');
  tabBar.appendChild(stationTabBtn);
  tabBar.appendChild(siteTabBtn);
  tabBar.appendChild(reportTabBtn);
  tabBar.appendChild(trackingTabBtn);
  tabBar.appendChild(vouchersTabBtn);
  container.appendChild(tabBar);

  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    stationTabBtn.classList.toggle('active', tab === 'station');
    siteTabBtn.classList.toggle('active', tab === 'site');
    reportTabBtn.classList.toggle('active', tab === 'report');
    trackingTabBtn.classList.toggle('active', tab === 'tracking');
    vouchersTabBtn.classList.toggle('active', tab === 'vouchers');
    if (tab === 'station') renderStationLedgerTab(body);
    else if (tab === 'site') renderSiteDistributionTab(body);
    else if (tab === 'report') renderDiscrepancyReportTab(body);
    else if (tab === 'tracking') renderDieselTracking(body);
    else renderFuelingVouchers(body);
  }

  setTab('station');
}
