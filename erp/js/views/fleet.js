import { store } from '../store.js';
import { formatCurrency, formatDate, el, monthKey, statusPillClass } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { OWNERSHIP_CATEGORIES, isHaOperationType, DEFAULT_DIESEL_RATES } from '../constants.js';
import { renderInventory } from './inventory.js';
import { renderDozerEconomics } from './dozerEconomics.js';

const OWNERSHIP_LABELS = {
  Company: 'Company Owned',
  Partnership: 'Partnership (2nd-party, shared cost)',
  Rented: 'Rented (3rd-party, fully external)',
};

const FLEET_CATEGORIES = ['Heavy Equipment', 'Vehicles'];

function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
}

export function fleetItems() {
  return store.get('inventory').filter((i) => FLEET_CATEGORIES.includes(i.category));
}

function fleetOptions() {
  return fleetItems().map((i) => ({ value: i.name, label: i.name }));
}

function employeeOptions() {
  return store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }));
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

export function serviceStatusFor(item) {
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
    { name: 'dieselRateFirst8h', label: `Diesel Consumption — first 8 hrs/day (L/hr) — leave blank to use the fleet default of ${DEFAULT_DIESEL_RATES.first8h}`, type: 'number', min: 0 },
    { name: 'dieselRateAfter8h', label: `Diesel Consumption — after 8 hrs/day (L/hr) — leave blank to use the fleet default of ${DEFAULT_DIESEL_RATES.after8h}`, type: 'number', min: 0 },
    { name: 'dieselRateTrekking', label: `Diesel Consumption — Trekking (L/hr, flat) — leave blank to use the fleet default of ${DEFAULT_DIESEL_RATES.trekking}`, type: 'number', min: 0 },
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

export function renderFleet(container) {
  container.innerHTML = '';

  let tab = 'roster';

  const tabBar = el('div', { class: 'tab-bar' });
  const rosterTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('roster') }, 'Fleet Roster');
  const maintenanceTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('maintenance') }, 'Maintenance Log');
  const inventoryTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('inventory') }, 'Inventory & Equipment');
  const rateHistoryTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('rateHistory') }, 'Rate History');
  const dozerEconomicsTabBtn = el('button', { class: 'tab-btn', type: 'button', onClick: () => setTab('dozerEconomics') }, 'Dozer Economics');
  tabBar.appendChild(rosterTabBtn);
  tabBar.appendChild(maintenanceTabBtn);
  tabBar.appendChild(inventoryTabBtn);
  tabBar.appendChild(rateHistoryTabBtn);
  tabBar.appendChild(dozerEconomicsTabBtn);

  const actionSlot = el('div');
  container.appendChild(sectionHeader('Fleet Management', 'Dozer status, ownership, maintenance, and inventory — diesel now lives under Resource Management', actionSlot));
  container.appendChild(tabBar);

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const body = el('div');
  container.appendChild(body);

  function setTab(next) {
    tab = next;
    rosterTabBtn.classList.toggle('active', tab === 'roster');
    maintenanceTabBtn.classList.toggle('active', tab === 'maintenance');
    inventoryTabBtn.classList.toggle('active', tab === 'inventory');
    rateHistoryTabBtn.classList.toggle('active', tab === 'rateHistory');
    dozerEconomicsTabBtn.classList.toggle('active', tab === 'dozerEconomics');
    summarySlot.innerHTML = '';
    if (tab === 'roster') renderRosterTab();
    else if (tab === 'maintenance') renderMaintenanceTab();
    else if (tab === 'rateHistory') renderRateHistoryTab();
    else if (tab === 'dozerEconomics') renderDozerEconomicsTab();
    else renderInventoryTab();
  }

  function renderInventoryTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderInventory(body);
  }

  function renderDozerEconomicsTab() {
    actionSlot.innerHTML = '';
    body.innerHTML = '';
    renderDozerEconomics(body);
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

  setTab('roster');
}
