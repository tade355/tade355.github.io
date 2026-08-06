import { store } from '../store.js';
import { formatCurrency, formatDate, el, statusPillClass, dateInRange } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { FUEL_STATIONS } from '../constants.js';
import { printDieselReplenishmentRequest, printDieselStationReport } from '../print.js';
import { fleetItems } from './fleet.js';

function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
}

function employeeOptions() {
  return store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }));
}

function supplierOptions() {
  return [{ value: '', label: '— Not specified —' }, ...store.get('suppliers').map((s) => ({ value: s.name, label: s.name }))];
}

// Litres burned per hour worked, over a trailing window of days the asset
// ACTUALLY worked (not calendar days) — this is what varies asset to asset
// (two dozers doing an 8h day rarely burn the same litres), so it's the
// right rate to project a target-hours figure from, rather than a flat
// per-day average regardless of how long tomorrow's shift is.
function avgFuelPerHourFor(name, windowDays = 14) {
  const today = new Date();
  const from = new Date(today.getTime() - (windowDays * 3 - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  const byDate = {};
  store.get('operations')
    .filter((o) => o.equipment === name && o.date >= from && o.date <= to)
    .forEach((o) => {
      const bucket = byDate[o.date] || { fuel: 0, hours: 0 };
      bucket.fuel += o.fuelUsed || 0;
      bucket.hours += o.hoursWorked || 0;
      byDate[o.date] = bucket;
    });
  // The date range searched above is wider (3x) than `windowDays` so that a
  // sparse asset working only a few days a month still gets a real trailing
  // average instead of one diluted by a mostly-idle 14 calendar days.
  const recentWorkedDates = Object.keys(byDate).sort().slice(-windowDays);
  if (!recentWorkedDates.length) return 0;
  const totals = recentWorkedDates.reduce((acc, d) => ({ fuel: acc.fuel + byDate[d].fuel, hours: acc.hours + byDate[d].hours }), { fuel: 0, hours: 0 });
  return totals.hours > 0 ? totals.fuel / totals.hours : 0;
}

// The most recent tank reading actually logged for this asset (see the
// Opening/Supplied/Closing Diesel fields on Daily Operations) — this is
// "what's really left in the tank right now" for the Replenishment
// Request below, as opposed to a company-wide computed running balance.
function latestClosingDieselFor(name) {
  const rows = store.get('operations')
    .filter((o) => o.equipment === name && o.closingDiesel !== null && o.closingDiesel !== undefined)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return rows.length ? rows[0].closingDiesel : null;
}

function dieselBalanceAsOf(date) {
  const received = store.get('dieselReceipts').filter((r) => r.date <= date).reduce((sum, r) => sum + r.litres, 0);
  const issued = store.get('operations').filter((o) => o.date <= date).reduce((sum, o) => sum + o.fuelUsed, 0);
  return received - issued;
}

function receiptFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'litres', label: 'Litres Received', type: 'number', required: true, min: 0 },
    { name: 'unitCost', label: 'Unit Cost (₦/litre)', type: 'number', required: true, min: 0 },
    { name: 'supplier', label: 'Supplier', type: 'select', options: supplierOptions() },
    { name: 'station', label: 'Filling Station (optional — draws down a prepayment balance, see the Station Ledger tab)', type: 'select', options: [
      { value: '', label: '— Not against a station prepayment —' },
      ...FUEL_STATIONS.map((s) => ({ value: s, label: s })),
    ] },
    { name: 'project', label: "Site / Project (optional — replenishes that site's dump tank, see the Site Distribution tab)", type: 'select', options: [
      { value: '', label: '— Company-wide pool —' },
      ...projectOptions(),
    ] },
    { name: 'reference', label: 'Reference (PO #, waybill, etc.)' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
}

function countFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'countedLitres', label: 'Counted Litres (physical tank reading)', type: 'number', required: true, min: 0 },
    { name: 'countedBy', label: 'Counted By', type: 'select', required: true, options: employeeOptions() },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
}

export function renderDieselTracking(container) {
  container.innerHTML = '';

  const actionSlot = el('div');
  container.appendChild(sectionHeader(
    'Diesel Tracking',
    'Company-wide diesel deliveries and stock reconciliation — tag a receipt with a station or site to feed the Station Ledger and Site Distribution tabs',
    actionSlot,
  ));
  actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openReceiptForm() }, '+ Log Diesel Receipt'));
  actionSlot.appendChild(el('button', { class: 'btn btn-ghost', onClick: () => openCountForm() }, '+ Log Stock Count'));

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const body = el('div');
  container.appendChild(body);

  function refresh() {
    const receipts = store.get('dieselReceipts');
    const counts = store.get('dieselStockCounts').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const totalReceived = receipts.reduce((sum, r) => sum + r.litres, 0);
    const totalIssued = store.get('operations').reduce((sum, o) => sum + o.fuelUsed, 0);
    const expectedBalance = totalReceived - totalIssued;
    const latestCount = counts[0];
    const latestExpected = latestCount ? dieselBalanceAsOf(latestCount.date) : null;
    const variance = latestCount ? latestCount.countedLitres - latestExpected : null;

    summarySlot.innerHTML = '';
    const grid = el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Total Received (All-Time)', value: `${totalReceived.toLocaleString()} L` }),
      statCard({ label: 'Total Issued (from Daily Logs)', value: `${totalIssued.toLocaleString()} L` }),
      statCard({ label: 'Expected Balance', value: `${expectedBalance.toLocaleString()} L` }),
      latestCount
        ? statCard({
          label: `Last Count (${formatDate(latestCount.date)}) Variance`,
          value: `${variance > 0 ? '+' : ''}${variance.toLocaleString()} L`,
          hint: Math.abs(variance) < 1 ? 'Fully accounted for' : (variance < 0 ? 'Litres unaccounted for' : 'More than expected'),
          tone: Math.abs(variance) < 1 ? 'good' : (Math.abs(variance) > (latestExpected * 0.02) ? 'critical' : 'warning'),
        })
        : statCard({ label: 'Last Physical Count', value: 'None logged', hint: 'Log a stock count to reconcile' }),
    ]);
    summarySlot.appendChild(grid);

    body.innerHTML = '';
    body.appendChild(el('h3', { class: 'subsection-title' }, 'Diesel Receipts'));

    const receiptsFilterBar = el('div', { class: 'filter-bar' });
    const receiptsStationSelect = el('select', {}, [
      el('option', { value: '' }, 'All Stations'),
      ...FUEL_STATIONS.map((s) => el('option', { value: s }, s)),
    ]);
    const receiptsFrom = el('input', { type: 'date' });
    const receiptsTo = el('input', { type: 'date' });
    receiptsFilterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Station'), receiptsStationSelect]));
    receiptsFilterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), receiptsFrom]));
    receiptsFilterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), receiptsTo]));
    const printReceiptsBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '🖨 Print Report');
    receiptsFilterBar.appendChild(printReceiptsBtn);
    body.appendChild(receiptsFilterBar);

    const receiptsContainer = el('div');
    body.appendChild(receiptsContainer);

    function filteredReceipts() {
      return receipts
        .filter((r) => (!receiptsStationSelect.value || r.station === receiptsStationSelect.value) && dateInRange(r.date, receiptsFrom.value, receiptsTo.value))
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1));
    }

    printReceiptsBtn.addEventListener('click', () => {
      printDieselStationReport(receiptsStationSelect.value, receiptsFrom.value, receiptsTo.value, filteredReceipts());
    });
    [receiptsStationSelect, receiptsFrom, receiptsTo].forEach((input) => input.addEventListener('change', refreshReceiptsTable));

    function refreshReceiptsTable() {
      renderTable(receiptsContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'litres', label: 'Litres', render: (r) => `${r.litres.toLocaleString()} L` },
        { key: 'unitCost', label: 'Unit Cost', render: (r) => formatCurrency(r.unitCost) },
        { key: 'total', label: 'Total Cost', render: (r) => formatCurrency(r.litres * r.unitCost) },
        { key: 'supplier', label: 'Supplier', render: (r) => r.supplier || '—' },
        { key: 'station', label: 'Station', render: (r) => r.station || '—' },
        { key: 'project', label: 'Site / Project', render: (r) => r.project || '—' },
        { key: 'reference', label: 'Reference', render: (r) => r.reference || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openReceiptForm(r),
            onDelete: async () => {
              if (!confirmDelete(`Receipt on ${formatDate(r.date)}`)) return;
              try {
                await store.remove('dieselReceipts', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this receipt.');
              }
            },
          }),
        },
      ],
        rows: filteredReceipts(),
        emptyText: 'No diesel receipts match this filter.',
      });
    }
    refreshReceiptsTable();

    body.appendChild(el('h3', { class: 'subsection-title' }, 'Stock Counts & Reconciliation'));
    const countsContainer = el('div');
    body.appendChild(countsContainer);
    renderTable(countsContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'countedLitres', label: 'Counted', render: (r) => `${r.countedLitres.toLocaleString()} L` },
        { key: 'expected', label: 'Expected (as of date)', render: (r) => `${dieselBalanceAsOf(r.date).toLocaleString()} L` },
        {
          key: 'variance',
          label: 'Variance',
          render: (r) => {
            const v = r.countedLitres - dieselBalanceAsOf(r.date);
            const label = `${v > 0 ? '+' : ''}${v.toLocaleString()} L`;
            const pillStatus = Math.abs(v) < 1 ? 'Completed' : (v < 0 ? 'Down' : 'Under Maintenance');
            return el('span', { class: `pill ${statusPillClass(pillStatus)}` }, label);
          },
        },
        { key: 'countedBy', label: 'Counted By', render: (r) => store.get('employees').find((e) => e.id === r.countedBy)?.name || r.countedBy || 'Unknown' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openCountForm(r),
            onDelete: async () => {
              if (!confirmDelete(`Stock count on ${formatDate(r.date)}`)) return;
              try {
                await store.remove('dieselStockCounts', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this stock count.');
              }
            },
          }),
        },
      ],
      rows: counts,
      emptyText: 'No stock counts logged yet. Log a physical tank reading to check for variance.',
    });

    body.appendChild(el('h3', { class: 'subsection-title' }, 'Diesel Ledger by Asset'));
    body.appendChild(el('p', { class: 'section-subtitle' }, "Per-dozer running balance — New comes from Fulfilled fueling vouchers issued to that asset, Used comes from its daily operation reports. Opening is derived from everything before the selected start date, so nothing here is entered by hand."));
    const ledgerFilterBar = el('div', { class: 'filter-bar' });
    const ledgerFrom = el('input', { type: 'date' });
    const ledgerTo = el('input', { type: 'date' });
    ledgerFilterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), ledgerFrom]));
    ledgerFilterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), ledgerTo]));
    body.appendChild(ledgerFilterBar);
    const ledgerContainer = el('div');
    body.appendChild(ledgerContainer);

    function refreshLedger() {
      const from = ledgerFrom.value;
      const to = ledgerTo.value;
      const fulfilledVouchers = store.get('fuelingVouchers').filter((v) => v.status === 'Fulfilled');
      const allOperations = store.get('operations');
      const ledgerRows = fleetItems().map((d) => {
        const newBefore = from ? fulfilledVouchers.filter((v) => v.equipment === d.name && v.date < from).reduce((sum, v) => sum + v.litresRequested, 0) : 0;
        const usedBefore = from ? allOperations.filter((o) => o.equipment === d.name && o.date < from).reduce((sum, o) => sum + (o.fuelUsed || 0), 0) : 0;
        const opening = newBefore - usedBefore;
        const newInRange = fulfilledVouchers.filter((v) => v.equipment === d.name && dateInRange(v.date, from, to)).reduce((sum, v) => sum + v.litresRequested, 0);
        const usedInRange = allOperations.filter((o) => o.equipment === d.name && dateInRange(o.date, from, to)).reduce((sum, o) => sum + (o.fuelUsed || 0), 0);
        return { name: d.name, opening, newInRange, usedInRange, closing: opening + newInRange - usedInRange };
      });
      renderTable(ledgerContainer, {
        columns: [
          { key: 'name', label: 'Asset' },
          { key: 'opening', label: 'Opening', render: (r) => `${r.opening.toLocaleString()} L` },
          { key: 'newInRange', label: 'New', render: (r) => `${r.newInRange.toLocaleString()} L` },
          { key: 'usedInRange', label: 'Used', render: (r) => `${r.usedInRange.toLocaleString()} L` },
          { key: 'closing', label: 'Closing', render: (r) => el('strong', {}, `${r.closing.toLocaleString()} L`) },
        ],
        rows: ledgerRows,
        emptyText: 'No fleet assets yet.',
      });
    }
    [ledgerFrom, ledgerTo].forEach((input) => input.addEventListener('change', refreshLedger));
    refreshLedger();

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dayAfter = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    body.appendChild(el('h3', { class: 'subsection-title' }, `Diesel Replenishment Request — ${formatDate(tomorrow)}`));
    body.appendChild(el('p', { class: 'section-subtitle' }, "For each asset: Closing Diesel is its most recent tank reading from Daily Operations; Tomorrow is the top-up still needed on top of that (target hours × the asset's own recent litres/hour, minus what's already in the tank); Next Day assumes the tank will be empty by then, so it's the full amount for that day's target. This is a planning estimate, not a confirmed work schedule."));

    const replenishmentFilterBar = el('div', { class: 'filter-bar' });
    const tomorrowHoursInput = el('input', { type: 'number', min: 0, step: 0.5, value: '8' });
    const nextDayHoursInput = el('input', { type: 'number', min: 0, step: 0.5, value: '8' });
    const requestStationSelect = el('select', {}, FUEL_STATIONS.map((s) => el('option', { value: s }, s)));
    const requestByOptions = employeeOptions();
    const requestBySelect = el('select', {}, [
      el('option', { value: '' }, '— Not specified —'),
      ...requestByOptions.map((o) => el('option', { value: o.value }, o.label)),
    ]);
    replenishmentFilterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Target Hrs — Tomorrow'), tomorrowHoursInput]));
    replenishmentFilterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Target Hrs — Next Day'), nextDayHoursInput]));
    replenishmentFilterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Station'), requestStationSelect]));
    replenishmentFilterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Staff (requested by)'), requestBySelect]));
    body.appendChild(replenishmentFilterBar);

    const replenishmentContainer = el('div');
    body.appendChild(replenishmentContainer);
    const replenishmentTotalNote = el('p', { class: 'section-subtitle' });
    body.appendChild(replenishmentTotalNote);
    const printBtnWrap = el('div');
    body.appendChild(printBtnWrap);

    function refreshReplenishment() {
      const tomorrowHours = Number(tomorrowHoursInput.value) || 0;
      const nextDayHours = Number(nextDayHoursInput.value) || 0;

      const replenishmentRows = fleetItems().map((d) => {
        const isActive = (d.fleetStatus || 'Active') === 'Active';
        const closingDiesel = latestClosingDieselFor(d.name);
        const ratePerHour = isActive ? avgFuelPerHourFor(d.name) : 0;
        const tomorrowNeed = isActive ? Math.max(0, Math.round(tomorrowHours * ratePerHour - (closingDiesel || 0))) : 0;
        const nextDayNeed = isActive ? Math.round(nextDayHours * ratePerHour) : 0;
        return {
          name: d.name,
          closingDiesel,
          tomorrowNeed,
          nextDayNeed,
          total: tomorrowNeed + nextDayNeed,
          status: d.fleetStatus || 'Active',
        };
      });
      const totals = replenishmentRows.reduce((acc, r) => ({
        tomorrow: acc.tomorrow + r.tomorrowNeed,
        nextDay: acc.nextDay + r.nextDayNeed,
        total: acc.total + r.total,
      }), { tomorrow: 0, nextDay: 0, total: 0 });

      renderTable(replenishmentContainer, {
        columns: [
          { key: 'name', label: 'Asset' },
          { key: 'closingDiesel', label: 'C. Diesel', render: (r) => (r.closingDiesel === null ? '—' : `${r.closingDiesel.toLocaleString()} L`) },
          { key: 'tomorrowNeed', label: `Tomorrow (${formatDate(tomorrow)})`, render: (r) => `${r.tomorrowNeed.toLocaleString()} L` },
          { key: 'nextDayNeed', label: `Next Day (${formatDate(dayAfter)})`, render: (r) => `${r.nextDayNeed.toLocaleString()} L` },
          { key: 'total', label: 'Total', render: (r) => el('strong', {}, `${r.total.toLocaleString()} L`) },
          { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
        ],
        rows: replenishmentRows,
        emptyText: 'No fleet assets yet.',
      });
      replenishmentTotalNote.textContent = `Total — Tomorrow: ${totals.tomorrow.toLocaleString()} L · Next Day: ${totals.nextDay.toLocaleString()} L · Combined: ${totals.total.toLocaleString()} L`;

      printBtnWrap.innerHTML = '';
      printBtnWrap.appendChild(el('button', {
        type: 'button',
        class: 'btn btn-ghost',
        onClick: () => {
          const printRows = replenishmentRows.filter((r) => r.tomorrowNeed > 0).map((r) => ({ name: r.name, litres: r.tomorrowNeed }));
          if (!printRows.length) { window.alert('No assets need diesel for tomorrow yet.'); return; }
          printDieselReplenishmentRequest(tomorrow, printRows, {
            station: requestStationSelect.value,
            requestedByName: store.get('employees').find((e) => e.id === requestBySelect.value)?.name || '',
          });
        },
      }, '🖨 Print Request'));
    }

    [tomorrowHoursInput, nextDayHoursInput, requestStationSelect, requestBySelect].forEach((input) => {
      input.addEventListener('input', refreshReplenishment);
      input.addEventListener('change', refreshReplenishment);
    });
    refreshReplenishment();
  }

  function openReceiptForm(record) {
    openModal({
      title: record ? 'Edit Diesel Receipt' : 'Log Diesel Receipt',
      fields: receiptFields(),
      initial: record || { date: new Date().toISOString().slice(0, 10) },
      submitLabel: record ? 'Save Changes' : 'Log Receipt',
      onSubmit: async (data) => {
        if (record) await store.update('dieselReceipts', record.id, data);
        else await store.add('dieselReceipts', data);
        refresh();
      },
    });
  }

  function openCountForm(record) {
    openModal({
      title: record ? 'Edit Stock Count' : 'Log Stock Count',
      fields: countFields(),
      initial: record || { date: new Date().toISOString().slice(0, 10) },
      submitLabel: record ? 'Save Changes' : 'Log Count',
      onSubmit: async (data) => {
        if (record) await store.update('dieselStockCounts', record.id, data);
        else await store.add('dieselStockCounts', data);
        refresh();
      },
    });
  }

  refresh();
}
