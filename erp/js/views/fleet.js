import { store } from '../store.js';
import { formatCurrency, formatDate, el, monthKey, statusPillClass, dateInRange } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { FUEL_STATIONS, OWNERSHIP_CATEGORIES, isHaOperationType } from '../constants.js';
import { printFuelingVoucher, printDieselReplenishmentRequest } from '../print.js';
import { renderInventory } from './inventory.js';

const OWNERSHIP_LABELS = {
  Company: 'Company Owned',
  Partnership: 'Partnership (2nd-party, shared cost)',
  Rented: 'Rented (3rd-party, fully external)',
};

const FLEET_CATEGORIES = ['Heavy Equipment', 'Vehicles'];

function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
}

function fleetItems() {
  return store.get('inventory').filter((i) => FLEET_CATEGORIES.includes(i.category));
}

function fleetOptions() {
  return fleetItems().map((i) => ({ value: i.name, label: i.name }));
}

function employeeOptions() {
  return store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }));
}

function supplierOptions() {
  return [{ value: '', label: '— Not specified —' }, ...store.get('suppliers').map((s) => ({ value: s.name, label: s.name }))];
}

function totalHoursFor(name) {
  return store.get('operations').filter((o) => o.equipment === name).reduce((sum, o) => sum + o.hoursWorked, 0);
}

function totalFuelFor(name) {
  return store.get('operations').filter((o) => o.equipment === name).reduce((sum, o) => sum + o.fuelUsed, 0);
}

// Lightweight utilization proxy for Company-owned dozers: distinct days
// worked in the last 30 days ÷ 30. Partnership/Rented availability is
// tracked as part of their owner settlement instead (see Dozer Economics).
function utilization30dFor(name) {
  const today = new Date();
  const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  const days = new Set(
    store.get('operations')
      .filter((o) => o.equipment === name && o.date >= from && o.date <= to)
      .map((o) => o.date),
  );
  return (days.size / 30) * 100;
}

// "How much does it get done on a day it works" (a pace figure), as
// opposed to Utilization above ("how often does it work at all") — averaged
// over days actually worked in the last 30 days, not calendar days, so an
// idle weekend doesn't drag down the rate. Applies to every fleet asset
// regardless of ownership (unlike Utilization, which is Company-only).
function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function avgWorkRateFor(name) {
  const today = new Date();
  const from = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  const rows = store.get('operations').filter((o) => o.equipment === name && o.date >= from && o.date <= to);

  const hoursByDate = {};
  const haByDate = {};
  const resumptionMinutes = [];
  const closeMinutes = [];
  rows.forEach((o) => {
    hoursByDate[o.date] = (hoursByDate[o.date] || 0) + (o.hoursWorked || 0);
    if (isHaOperationType(o.operationType)) haByDate[o.date] = (haByDate[o.date] || 0) + (o.quantity || 0);
    if (o.timeResumed) resumptionMinutes.push(timeToMinutes(o.timeResumed));
    if (o.timeClosed) closeMinutes.push(timeToMinutes(o.timeClosed));
  });

  const workDays = Object.keys(hoursByDate).length;
  const haDays = Object.keys(haByDate).length;
  const avgMinutes = (list) => (list.length ? minutesToTime(list.reduce((a, b) => a + b, 0) / list.length) : null);
  return {
    avgHoursPerDay: workDays ? Object.values(hoursByDate).reduce((a, b) => a + b, 0) / workDays : null,
    avgHaPerDay: haDays ? Object.values(haByDate).reduce((a, b) => a + b, 0) / haDays : null,
    avgResumptionTime: avgMinutes(resumptionMinutes),
    avgCloseTime: avgMinutes(closeMinutes),
  };
}

// Projects tomorrow's diesel need from an asset's average daily use over
// its last 14 WORKED days (not calendar days) — a trailing-average
// estimate, not a plan of who's actually scheduled to work tomorrow, since
// the app has no next-day work schedule to project from instead.
function avgDailyFuelUsageFor(name, windowDays = 14) {
  const today = new Date();
  const from = new Date(today.getTime() - (windowDays * 3 - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  const fuelByDate = {};
  store.get('operations')
    .filter((o) => o.equipment === name && o.date >= from && o.date <= to)
    .forEach((o) => { fuelByDate[o.date] = (fuelByDate[o.date] || 0) + (o.fuelUsed || 0); });

  // Only the most recent `windowDays` worked dates count, even though the
  // date range searched above is wider (3x) — a sparse fleet asset that
  // only works a few days a month still gets a real trailing average
  // instead of one diluted by a mostly-idle 14 calendar days.
  const recentWorkedDates = Object.keys(fuelByDate).sort().slice(-windowDays);
  if (!recentWorkedDates.length) return 0;
  const total = recentWorkedDates.reduce((sum, d) => sum + fuelByDate[d], 0);
  return total / recentWorkedDates.length;
}

function lastMaintenanceFor(name) {
  const logs = store.get('maintenanceLogs')
    .filter((m) => m.equipment === name && m.status === 'Completed')
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return logs[0]?.date || '';
}

function hoursSinceLastServiceFor(name) {
  const lastDate = lastMaintenanceFor(name);
  return store.get('operations')
    .filter((o) => o.equipment === name && (!lastDate || o.date > lastDate))
    .reduce((sum, o) => sum + o.hoursWorked, 0);
}

function serviceStatusFor(item) {
  const interval = item.serviceIntervalHours || 250;
  const hours = hoursSinceLastServiceFor(item.name);
  const ratio = hours / interval;
  let status = 'OK';
  if (ratio >= 1) status = 'Overdue';
  else if (ratio >= 0.8) status = 'Due Soon';
  return { hours, interval, ratio, status };
}

function fleetFields() {
  return [
    { name: 'name', label: 'Asset Name', required: true },
    { name: 'category', label: 'Type', type: 'select', required: true, options: [
      { value: 'Heavy Equipment', label: 'Heavy Equipment (Bulldozer, Excavator, etc.)' },
      { value: 'Vehicles', label: 'Vehicle' },
    ] },
    { name: 'sku', label: 'Asset Tag / SKU / Dozer Code', required: true },
    { name: 'ownership', label: 'Ownership', type: 'select', required: true, options: OWNERSHIP_CATEGORIES.map((o) => ({ value: o, label: OWNERSHIP_LABELS[o] })) },
    { name: 'ownerName', label: 'Owner / Contractor Name (Partnership/Rented)' },
    { name: 'fleetStatus', label: 'Status', type: 'select', required: true, options: [
      { value: 'Active', label: 'Active' },
      { value: 'Under Maintenance', label: 'Under Maintenance' },
      { value: 'Idle', label: 'Idle' },
      { value: 'Down', label: 'Down' },
    ] },
    { name: 'hourlyRate', label: 'Hourly Rate (₦) — internal operating cost/value used for project profitability', type: 'number', required: true, min: 0 },
    { name: 'rentalRatePerDay', label: 'Rental Rate/Day (₦) — Partnership or Rented dozers', type: 'number', min: 0 },
    { name: 'managementFeePerDay', label: 'Management Fee/Day (₦) — Partnership dozers only, retained from the rental rate', type: 'number', min: 0 },
    { name: 'currentProject', label: 'Current Project', type: 'select', options: [
      { value: '', label: '— Unassigned —' },
      ...projectOptions(),
    ] },
    { name: 'location', label: 'Location', required: true },
    { name: 'unitCost', label: 'Acquisition Value (₦)', type: 'number', min: 0 },
    { name: 'serviceIntervalHours', label: 'Service Interval (engine hours)', type: 'number', min: 0 },
  ];
}

function maintenanceFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'equipment', label: 'Dozer / Equipment', type: 'select', required: true, options: fleetOptions() },
    { name: 'type', label: 'Type', type: 'select', required: true, options: [
      { value: 'Service', label: 'Service' },
      { value: 'Repair', label: 'Repair' },
      { value: 'Inspection', label: 'Inspection' },
      { value: 'Breakdown', label: 'Breakdown' },
    ] },
    { name: 'description', label: 'Description', required: true },
    { name: 'partsCost', label: 'Parts Cost (₦)', type: 'number', min: 0 },
    { name: 'laborCost', label: 'Labor Cost (₦)', type: 'number', min: 0 },
    { name: 'performedBy', label: 'Performed By (Staff)', type: 'select', options: [{ value: '', label: '— External contractor (enter below) —' }, ...employeeOptions()] },
    { name: 'contractorName', label: 'External Contractor / Vendor (if not staff)' },
    { name: 'status', label: 'Status', type: 'select', required: true, options: [
      { value: 'Completed', label: 'Completed' },
      { value: 'Scheduled', label: 'Scheduled' },
      { value: 'In Progress', label: 'In Progress' },
    ] },
  ];
}

function receiptFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'litres', label: 'Litres Received', type: 'number', required: true, min: 0 },
    { name: 'unitCost', label: 'Unit Cost (₦/litre)', type: 'number', required: true, min: 0 },
    { name: 'supplier', label: 'Supplier', type: 'select', options: supplierOptions() },
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

function voucherFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'station', label: 'Fuel Station', type: 'select', required: true, options: FUEL_STATIONS.map((s) => ({ value: s, label: s })) },
    { name: 'project', label: 'Project', type: 'select', options: [
      { value: '', label: '— Not specified —' },
      ...projectOptions(),
    ] },
    { name: 'equipment', label: 'Dozer / Equipment', type: 'select', required: true, options: fleetOptions() },
    { name: 'litresRequested', label: 'Litres Requested', type: 'number', required: true, min: 0 },
    { name: 'estimatedCost', label: 'Estimated Cost (₦)', type: 'number', required: true, min: 0 },
    { name: 'requestedBy', label: 'Requested By', type: 'select', required: true, options: employeeOptions() },
    { name: 'status', label: 'Status', type: 'select', required: true, options: [
      { value: 'Pending Approval', label: 'Pending Approval' },
      { value: 'Approved', label: 'Approved' },
      { value: 'Rejected', label: 'Rejected' },
      { value: 'Fulfilled', label: 'Fulfilled' },
    ] },
    { name: 'approvedBy', label: 'Approved By', type: 'select', options: [
      { value: '', label: '— Not yet approved —' },
      ...employeeOptions(),
    ] },
    { name: 'notes', label: 'Notes', type: 'textarea' },
    { name: 'attachments', label: 'Receipts / Photos', type: 'attachments' },
  ];
}

function dieselBalanceAsOf(date) {
  const received = store.get('dieselReceipts').filter((r) => r.date <= date).reduce((sum, r) => sum + r.litres, 0);
  const issued = store.get('operations').filter((o) => o.date <= date).reduce((sum, o) => sum + o.fuelUsed, 0);
  return received - issued;
}

export function renderFleet(container) {
  container.innerHTML = '';

  let tab = 'roster';

  const tabBar = el('div', { class: 'tab-bar' });
  const rosterTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('roster') }, 'Fleet Roster');
  const maintenanceTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('maintenance') }, 'Maintenance Log');
  const dieselTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('diesel') }, 'Diesel Tracking');
  const voucherTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('vouchers') }, 'Fueling Vouchers');
  const inventoryTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('inventory') }, 'Inventory & Equipment');
  const rateHistoryTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('rateHistory') }, 'Rate History');
  tabBar.appendChild(rosterTabBtn);
  tabBar.appendChild(maintenanceTabBtn);
  tabBar.appendChild(dieselTabBtn);
  tabBar.appendChild(voucherTabBtn);
  tabBar.appendChild(inventoryTabBtn);
  tabBar.appendChild(rateHistoryTabBtn);

  const actionSlot = el('div');
  container.appendChild(sectionHeader('Fleet Management', 'Dozer status, ownership, maintenance, diesel accountability, and inventory', actionSlot));
  container.appendChild(tabBar);

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    rosterTabBtn.classList.toggle('active', tab === 'roster');
    maintenanceTabBtn.classList.toggle('active', tab === 'maintenance');
    dieselTabBtn.classList.toggle('active', tab === 'diesel');
    voucherTabBtn.classList.toggle('active', tab === 'vouchers');
    inventoryTabBtn.classList.toggle('active', tab === 'inventory');
    rateHistoryTabBtn.classList.toggle('active', tab === 'rateHistory');
    summarySlot.innerHTML = '';
    if (tab === 'roster') renderRosterTab();
    else if (tab === 'maintenance') renderMaintenanceTab();
    else if (tab === 'diesel') renderDieselTab();
    else if (tab === 'vouchers') renderVouchersTab();
    else if (tab === 'rateHistory') renderRateHistoryTab();
    else renderInventoryTab();
  }

  function renderInventoryTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderInventory(body);
  }

  function renderRateHistoryTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openRateHistoryForm() }, '+ Log Rate Change'));

    body.innerHTML = '';
    const filterBar = el('div', { class: 'filter-bar' });
    const equipmentSelect = el('select', {}, [
      el('option', { value: '' }, 'All Equipment'),
      ...fleetItems().map((i) => el('option', { value: i.name }, i.name)),
    ]);
    filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Equipment'), equipmentSelect]));
    body.appendChild(filterBar);

    const tableContainer = el('div');
    body.appendChild(tableContainer);

    function refresh() {
      const equipment = equipmentSelect.value;
      let rows = store.get('dozerRateHistory').slice().sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
      if (equipment) rows = rows.filter((r) => r.equipment === equipment);
      renderTable(tableContainer, {
        columns: [
          { key: 'equipment', label: 'Equipment' },
          { key: 'effectiveDate', label: 'Effective From', render: (r) => formatDate(r.effectiveDate) },
          { key: 'hourlyRate', label: 'Hourly Rate', render: (r) => formatCurrency(r.hourlyRate) },
          { key: 'rentalRatePerDay', label: 'Rental Rate/Day', render: (r) => formatCurrency(r.rentalRatePerDay) },
          { key: 'managementFeePerDay', label: 'Mgmt Fee/Day', render: (r) => formatCurrency(r.managementFeePerDay) },
          { key: 'notes', label: 'Notes', render: (r) => r.notes || '—' },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => openRateHistoryForm(r),
              onDelete: async () => {
                if (!confirmDelete(`${r.equipment} rate change on ${formatDate(r.effectiveDate)}`)) return;
                try {
                  await store.remove('dozerRateHistory', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this entry.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: "No rate changes logged yet. A rate change is logged automatically whenever you edit a fleet asset's rates in the Roster tab, or you can add one manually here (useful for backdating a correction).",
      });
    }

    function openRateHistoryForm(record) {
      if (!fleetOptions().length) {
        window.alert('Add a fleet asset first.');
        return;
      }
      openModal({
        title: record ? 'Edit Rate Change' : 'Log Rate Change',
        fields: [
          { name: 'equipment', label: 'Equipment', type: 'select', required: true, options: fleetOptions() },
          { name: 'effectiveDate', label: 'Effective From', type: 'date', required: true },
          { name: 'hourlyRate', label: 'Hourly Rate (₦)', type: 'number', min: 0 },
          { name: 'rentalRatePerDay', label: 'Rental Rate/Day (₦)', type: 'number', min: 0 },
          { name: 'managementFeePerDay', label: 'Management Fee/Day (₦)', type: 'number', min: 0 },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
        initial: record || { effectiveDate: new Date().toISOString().slice(0, 10) },
        submitLabel: record ? 'Save Changes' : 'Log Rate Change',
        onSubmit: async (data) => {
          if (record) await store.update('dozerRateHistory', record.id, data);
          else await store.add('dozerRateHistory', data);
          refresh();
        },
      });
    }

    equipmentSelect.addEventListener('change', refresh);
    refresh();
  }

  function renderRosterTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openAssetForm() }, '+ Add Fleet Asset'));

    function refresh() {
      const rows = fleetItems();
      const companyCount = rows.filter((r) => r.ownership === 'Company' || !r.ownership).length;
      const partnershipCount = rows.filter((r) => r.ownership === 'Partnership').length;
      const rentedCount = rows.filter((r) => r.ownership === 'Rented').length;
      const downCount = rows.filter((r) => r.fleetStatus === 'Down' || r.fleetStatus === 'Under Maintenance').length;
      const dueForServiceCount = rows.filter((r) => serviceStatusFor(r).status !== 'OK').length;

      summarySlot.innerHTML = '';
      const grid = el('div', { class: 'stats-grid' }, [
        statCard({ label: 'Fleet Size', value: String(rows.length) }),
        statCard({ label: 'Company Owned', value: String(companyCount) }),
        statCard({ label: 'Partnership', value: String(partnershipCount) }),
        statCard({ label: 'Rented', value: String(rentedCount) }),
        statCard({ label: 'Down / Under Maintenance', value: String(downCount), tone: downCount ? 'warning' : 'good' }),
        statCard({ label: 'Due for Service', value: String(dueForServiceCount), tone: dueForServiceCount ? 'warning' : 'good' }),
      ]);
      summarySlot.appendChild(grid);

      renderTable(body, {
        columns: [
          { key: 'name', label: 'Asset' },
          { key: 'ownership', label: 'Ownership', render: (r) => statusPill(r.ownership || 'Company') },
          { key: 'ownerName', label: 'Owner', render: (r) => (r.ownership && r.ownership !== 'Company' ? (r.ownerName || '—') : '—') },
          { key: 'fleetStatus', label: 'Status', render: (r) => statusPill(r.fleetStatus || 'Active') },
          { key: 'currentProject', label: 'Current Project', render: (r) => r.currentProject || '—' },
          { key: 'hourlyRate', label: 'Rate/hr', render: (r) => formatCurrency(r.hourlyRate) },
          { key: 'utilization', label: 'Utilization (30d)', render: (r) => ((r.ownership === 'Company' || !r.ownership) ? `${utilization30dFor(r.name).toFixed(0)}%` : '—') },
          { key: 'avgHoursPerDay', label: 'Avg Hrs/Day (30d)', render: (r) => { const v = avgWorkRateFor(r.name).avgHoursPerDay; return v === null ? '—' : `${v.toFixed(1)} h`; } },
          { key: 'avgHaPerDay', label: 'Avg Ha/Day (30d)', render: (r) => { const v = avgWorkRateFor(r.name).avgHaPerDay; return v === null ? '—' : `${v.toFixed(2)} ha`; } },
          { key: 'avgResumptionTime', label: 'Avg Resumption (30d)', render: (r) => avgWorkRateFor(r.name).avgResumptionTime || '—' },
          { key: 'avgCloseTime', label: 'Avg Close (30d)', render: (r) => avgWorkRateFor(r.name).avgCloseTime || '—' },
          { key: 'totalHours', label: 'Total Hours', render: (r) => `${totalHoursFor(r.name)} h` },
          { key: 'totalFuel', label: 'Total Fuel', render: (r) => `${totalFuelFor(r.name)} L` },
          { key: 'lastMaintenance', label: 'Last Maintenance', render: (r) => formatDate(lastMaintenanceFor(r.name)) },
          {
            key: 'nextService',
            label: 'Next Service',
            render: (r) => {
              const s = serviceStatusFor(r);
              const label = `${s.hours.toFixed(0)}h / ${s.interval}h`;
              const pillStatus = s.status === 'Overdue' ? 'Down' : s.status === 'Due Soon' ? 'Under Maintenance' : 'Active';
              return el('span', { class: `pill ${statusPillClass(pillStatus)}` }, `${label} — ${s.status}`);
            },
          },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => openAssetForm(r),
              onDelete: async () => {
                if (!confirmDelete(r.name)) return;
                try {
                  await store.remove('inventory', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this asset.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No fleet assets yet.',
        rowClass: (r) => (r.fleetStatus === 'Down' ? 'row-critical' : r.fleetStatus === 'Under Maintenance' ? 'row-warning' : undefined),
      });
    }

    function openAssetForm(record) {
      openModal({
        title: record ? 'Edit Fleet Asset' : 'Add Fleet Asset',
        fields: fleetFields(),
        initial: record || { category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Active', serviceIntervalHours: 250 },
        submitLabel: record ? 'Save Changes' : 'Add Asset',
        onSubmit: async (data) => {
          // A brand-new asset always gets an opening history entry; an edit
          // only logs one if a rate actually moved, so untouched saves don't
          // clutter Rate History with duplicate same-rate rows.
          const rateFields = ['hourlyRate', 'rentalRatePerDay', 'managementFeePerDay'];
          const ratesChanged = !record || rateFields.some((k) => Number(data[k] || 0) !== Number(record[k] || 0));
          if (record) {
            await store.update('inventory', record.id, data);
          } else {
            await store.add('inventory', { ...data, quantity: 1, unit: 'unit', reorderLevel: 1 });
          }
          if (ratesChanged) {
            await store.add('dozerRateHistory', {
              equipment: data.name,
              effectiveDate: new Date().toISOString().slice(0, 10),
              hourlyRate: data.hourlyRate || 0,
              rentalRatePerDay: data.rentalRatePerDay || 0,
              managementFeePerDay: data.managementFeePerDay || 0,
              notes: record ? 'Auto-logged from Fleet Asset edit' : 'Initial rate on asset creation',
            });
          }
          refresh();
        },
      });
    }

    refresh();
  }

  function renderMaintenanceTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openLogForm() }, '+ Log Maintenance'));

    function refresh() {
      const employees = store.get('employees');
      const logs = store.get('maintenanceLogs');
      const totalSpend = logs.reduce((sum, m) => sum + m.cost, 0);
      const thisMonthSpend = logs.filter((m) => monthKey(m.date) === monthKey(new Date().toISOString().slice(0, 10))).reduce((sum, m) => sum + m.cost, 0);
      const scheduledCount = logs.filter((m) => m.status === 'Scheduled' || m.status === 'In Progress').length;

      summarySlot.innerHTML = '';
      const grid = el('div', { class: 'stats-grid' }, [
        statCard({ label: 'Total Maintenance Spend', value: formatCurrency(totalSpend) }),
        statCard({ label: 'This Month', value: formatCurrency(thisMonthSpend) }),
        statCard({ label: 'Scheduled / In Progress', value: String(scheduledCount) }),
      ]);
      summarySlot.appendChild(grid);

      const rows = logs.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      renderTable(body, {
        columns: [
          { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
          { key: 'equipment', label: 'Dozer' },
          { key: 'type', label: 'Type' },
          { key: 'description', label: 'Description' },
          { key: 'partsCost', label: 'Parts', render: (r) => formatCurrency(r.partsCost || 0) },
          { key: 'laborCost', label: 'Labor', render: (r) => formatCurrency(r.laborCost || 0) },
          { key: 'cost', label: 'Total Cost', render: (r) => formatCurrency(r.cost) },
          { key: 'performedBy', label: 'Performed By', render: (r) => employees.find((e) => e.id === r.performedBy)?.name || (r.contractorName ? `${r.contractorName} (external)` : 'Unknown') },
          { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => openLogForm(r),
              onDelete: async () => {
                if (!confirmDelete(`${r.equipment} — ${r.type}`)) return;
                try {
                  await store.remove('maintenanceLogs', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this entry.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No maintenance logged yet.',
      });
    }

    function openLogForm(record) {
      if (!fleetOptions().length) {
        window.alert('Add a fleet asset first before logging maintenance.');
        return;
      }
      openModal({
        title: record ? 'Edit Maintenance Entry' : 'Log Maintenance',
        fields: maintenanceFields(),
        initial: record || { date: new Date().toISOString().slice(0, 10), status: 'Completed' },
        submitLabel: record ? 'Save Changes' : 'Log Maintenance',
        onSubmit: async (data) => {
          // "Cost" is kept as a derived total (rather than dropped) so every
          // existing reader of maintenanceLogs.cost — Dozer Economics'
          // maintenance-cost-per-dozer, this tab's spend summary cards —
          // keeps working unchanged now that entry happens as parts/labor.
          const payload = { ...data, cost: (Number(data.partsCost) || 0) + (Number(data.laborCost) || 0) };
          if (record) await store.update('maintenanceLogs', record.id, payload);
          else await store.add('maintenanceLogs', payload);
          refresh();
        },
      });
    }

    refresh();
  }

  function renderDieselTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openReceiptForm() }, '+ Log Diesel Receipt'));
    actionSlot.appendChild(el('button', { class: 'btn btn-ghost', onClick: () => openCountForm() }, '+ Log Stock Count'));

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
      const receiptsContainer = el('div');
      body.appendChild(receiptsContainer);
      renderTable(receiptsContainer, {
        columns: [
          { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
          { key: 'litres', label: 'Litres', render: (r) => `${r.litres.toLocaleString()} L` },
          { key: 'unitCost', label: 'Unit Cost', render: (r) => formatCurrency(r.unitCost) },
          { key: 'total', label: 'Total Cost', render: (r) => formatCurrency(r.litres * r.unitCost) },
          { key: 'supplier', label: 'Supplier', render: (r) => r.supplier || '—' },
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
        rows: receipts.slice().sort((a, b) => (a.date < b.date ? 1 : -1)),
        emptyText: 'No diesel receipts logged yet.',
      });

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
      const replenishmentRows = fleetItems()
        .filter((d) => (d.fleetStatus || 'Active') === 'Active')
        .map((d) => ({ name: d.name, projectedLitres: Math.round(avgDailyFuelUsageFor(d.name)) }))
        .filter((r) => r.projectedLitres > 0);
      const replenishmentTotal = replenishmentRows.reduce((sum, r) => sum + r.projectedLitres, 0);

      const replenishmentHeader = el('div', { class: 'section-header' }, [
        el('h3', { class: 'subsection-title' }, `Diesel Replenishment Request — ${formatDate(tomorrow)}`),
        el('button', {
          type: 'button',
          class: 'btn btn-ghost',
          onClick: () => printDieselReplenishmentRequest(tomorrow, replenishmentRows),
        }, '🖨 Print Request'),
      ]);
      body.appendChild(replenishmentHeader);
      body.appendChild(el('p', { class: 'section-subtitle' }, "Projects each Active asset's need for tomorrow from its average diesel use over its last 14 worked days — an estimate to help plan the next delivery, not a schedule of who's actually working tomorrow."));
      const replenishmentContainer = el('div');
      body.appendChild(replenishmentContainer);
      renderTable(replenishmentContainer, {
        columns: [
          { key: 'name', label: 'Asset' },
          { key: 'projectedLitres', label: 'Projected Need', render: (r) => `${r.projectedLitres.toLocaleString()} L` },
        ],
        rows: replenishmentRows,
        emptyText: 'No recent diesel usage to project from yet.',
      });
      body.appendChild(el('p', { class: 'section-subtitle' }, `Total projected: ${replenishmentTotal.toLocaleString()} L`));
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

  function renderVouchersTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openVoucherForm() }, '+ New Fueling Voucher'));

    function refresh() {
      const employees = store.get('employees');
      const rows = store.get('fuelingVouchers').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      const pending = rows.filter((r) => r.status === 'Pending Approval').length;
      const totalEstimated = rows.filter((r) => r.status !== 'Rejected').reduce((sum, r) => sum + r.estimatedCost, 0);

      summarySlot.innerHTML = '';
      summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
        statCard({ label: 'Vouchers Logged', value: String(rows.length) }),
        statCard({ label: 'Pending Approval', value: String(pending), tone: pending ? 'warning' : 'good' }),
        statCard({ label: 'Total Estimated Cost', value: formatCurrency(totalEstimated) }),
      ]));

      renderTable(body, {
        columns: [
          { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
          { key: 'station', label: 'Station' },
          { key: 'project', label: 'Project', render: (r) => r.project || '—' },
          { key: 'equipment', label: 'Equipment' },
          { key: 'litresRequested', label: 'Litres', render: (r) => `${r.litresRequested.toLocaleString()} L` },
          { key: 'estimatedCost', label: 'Est. Cost', render: (r) => formatCurrency(r.estimatedCost) },
          { key: 'requestedBy', label: 'Requested By', render: (r) => employees.find((e) => e.id === r.requestedBy)?.name || 'Unknown' },
          { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
          { key: 'attachments', label: 'Files', render: (r) => (r.attachments?.length ? `📎 ${r.attachments.length}` : '—') },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onPrint: () => printFuelingVoucher(r, {
                requestedByName: employees.find((e) => e.id === r.requestedBy)?.name,
                approvedByName: employees.find((e) => e.id === r.approvedBy)?.name,
              }),
              onEdit: () => openVoucherForm(r),
              onDelete: async () => {
                if (!confirmDelete(`Voucher for ${r.equipment} at ${r.station}`)) return;
                try {
                  await store.remove('fuelingVouchers', r.id);
                  refresh();
                } catch (err) {
                  window.alert(err.message || 'Could not delete this voucher.');
                }
              },
            }),
          },
        ],
        rows,
        emptyText: 'No fueling vouchers yet.',
        rowClass: (r) => (r.status === 'Pending Approval' ? 'row-warning' : undefined),
      });
    }

    function openVoucherForm(record) {
      if (!fleetOptions().length) {
        window.alert('Add a fleet asset first before requesting fuel.');
        return;
      }
      openModal({
        title: record ? 'Edit Fueling Voucher' : 'New Fueling Voucher',
        fields: voucherFields(),
        initial: record || { date: new Date().toISOString().slice(0, 10), status: 'Pending Approval' },
        submitLabel: record ? 'Save Changes' : 'Submit Voucher',
        onSubmit: async (data) => {
          if (record) await store.update('fuelingVouchers', record.id, data);
          else await store.add('fuelingVouchers', data);
          refresh();
        },
      });
    }

    refresh();
  }

  setTab('roster');
}
