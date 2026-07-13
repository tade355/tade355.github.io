import { store } from '../store.js';
import { formatCurrency, formatDate, el, monthKey, statusPillClass } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { PROJECTS, FUEL_STATIONS } from '../constants.js';
import { printFuelingVoucher } from '../print.js';

const FLEET_CATEGORIES = ['Heavy Equipment', 'Vehicles'];

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

function lastMaintenanceFor(name) {
  const logs = store.get('maintenanceLogs').filter((m) => m.equipment === name).sort((a, b) => (a.date < b.date ? 1 : -1));
  return logs[0]?.date || '';
}

const FLEET_FIELDS = [
  { name: 'name', label: 'Asset Name', required: true },
  { name: 'category', label: 'Type', type: 'select', required: true, options: [
    { value: 'Heavy Equipment', label: 'Heavy Equipment (Bulldozer, Excavator, etc.)' },
    { value: 'Vehicles', label: 'Vehicle' },
  ] },
  { name: 'sku', label: 'Asset Tag / SKU', required: true },
  { name: 'ownership', label: 'Ownership', type: 'select', required: true, options: [
    { value: 'Company', label: 'Company Owned' },
    { value: '3rd Party', label: '3rd Party Managed' },
  ] },
  { name: 'ownerName', label: 'Owner / Contractor Name (if 3rd party)' },
  { name: 'fleetStatus', label: 'Status', type: 'select', required: true, options: [
    { value: 'Active', label: 'Active' },
    { value: 'Under Maintenance', label: 'Under Maintenance' },
    { value: 'Idle', label: 'Idle' },
    { value: 'Down', label: 'Down' },
  ] },
  { name: 'hourlyRate', label: 'Hourly Rate (₦) — operating cost or rental rate', type: 'number', required: true, min: 0 },
  { name: 'currentProject', label: 'Current Project', type: 'select', options: [
    { value: '', label: '— Unassigned —' },
    ...PROJECTS.map((p) => ({ value: p, label: p })),
  ] },
  { name: 'location', label: 'Location', required: true },
  { name: 'unitCost', label: 'Acquisition Value (₦)', type: 'number', min: 0 },
];

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
    { name: 'cost', label: 'Cost (₦)', type: 'number', required: true, min: 0 },
    { name: 'performedBy', label: 'Performed By', type: 'select', required: true, options: employeeOptions() },
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
      ...PROJECTS.map((p) => ({ value: p, label: p })),
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
  tabBar.appendChild(rosterTabBtn);
  tabBar.appendChild(maintenanceTabBtn);
  tabBar.appendChild(dieselTabBtn);
  tabBar.appendChild(voucherTabBtn);

  const actionSlot = el('div');
  container.appendChild(sectionHeader('Fleet Management', 'Dozer status, ownership, maintenance, and diesel accountability', actionSlot));
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
    summarySlot.innerHTML = '';
    if (tab === 'roster') renderRosterTab();
    else if (tab === 'maintenance') renderMaintenanceTab();
    else if (tab === 'diesel') renderDieselTab();
    else renderVouchersTab();
  }

  function renderRosterTab() {
    actionSlot.innerHTML = '';
    actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openAssetForm() }, '+ Add Fleet Asset'));

    function refresh() {
      const rows = fleetItems();
      const companyCount = rows.filter((r) => r.ownership !== '3rd Party').length;
      const thirdPartyCount = rows.filter((r) => r.ownership === '3rd Party').length;
      const downCount = rows.filter((r) => r.fleetStatus === 'Down' || r.fleetStatus === 'Under Maintenance').length;

      summarySlot.innerHTML = '';
      const grid = el('div', { class: 'stats-grid' }, [
        statCard({ label: 'Fleet Size', value: String(rows.length) }),
        statCard({ label: 'Company Owned', value: String(companyCount) }),
        statCard({ label: '3rd Party Managed', value: String(thirdPartyCount) }),
        statCard({ label: 'Down / Under Maintenance', value: String(downCount), tone: downCount ? 'warning' : 'good' }),
      ]);
      summarySlot.appendChild(grid);

      renderTable(body, {
        columns: [
          { key: 'name', label: 'Asset' },
          { key: 'ownership', label: 'Ownership', render: (r) => statusPill(r.ownership || 'Company') },
          { key: 'ownerName', label: 'Owner', render: (r) => (r.ownership === '3rd Party' ? (r.ownerName || '—') : '—') },
          { key: 'fleetStatus', label: 'Status', render: (r) => statusPill(r.fleetStatus || 'Active') },
          { key: 'currentProject', label: 'Current Project', render: (r) => r.currentProject || '—' },
          { key: 'hourlyRate', label: 'Rate/hr', render: (r) => formatCurrency(r.hourlyRate) },
          { key: 'totalHours', label: 'Total Hours', render: (r) => `${totalHoursFor(r.name)} h` },
          { key: 'totalFuel', label: 'Total Fuel', render: (r) => `${totalFuelFor(r.name)} L` },
          { key: 'lastMaintenance', label: 'Last Maintenance', render: (r) => formatDate(lastMaintenanceFor(r.name)) },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => openAssetForm(r),
              onDelete: () => {
                if (confirmDelete(r.name)) {
                  store.remove('inventory', r.id);
                  refresh();
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
        fields: FLEET_FIELDS,
        initial: record || { category: 'Heavy Equipment', ownership: 'Company', fleetStatus: 'Active' },
        submitLabel: record ? 'Save Changes' : 'Add Asset',
        onSubmit: (data) => {
          if (record) {
            store.update('inventory', record.id, data);
          } else {
            store.add('inventory', { ...data, quantity: 1, unit: 'unit', reorderLevel: 1 });
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
          { key: 'cost', label: 'Cost', render: (r) => formatCurrency(r.cost) },
          { key: 'performedBy', label: 'Performed By', render: (r) => employees.find((e) => e.id === r.performedBy)?.name || r.performedBy || 'Unknown' },
          { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onEdit: () => openLogForm(r),
              onDelete: () => {
                if (confirmDelete(`${r.equipment} — ${r.type}`)) {
                  store.remove('maintenanceLogs', r.id);
                  refresh();
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
        onSubmit: (data) => {
          if (record) store.update('maintenanceLogs', record.id, data);
          else store.add('maintenanceLogs', data);
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
              onDelete: () => {
                if (confirmDelete(`Receipt on ${formatDate(r.date)}`)) {
                  store.remove('dieselReceipts', r.id);
                  refresh();
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
              onDelete: () => {
                if (confirmDelete(`Stock count on ${formatDate(r.date)}`)) {
                  store.remove('dieselStockCounts', r.id);
                  refresh();
                }
              },
            }),
          },
        ],
        rows: counts,
        emptyText: 'No stock counts logged yet. Log a physical tank reading to check for variance.',
      });
    }

    function openReceiptForm(record) {
      openModal({
        title: record ? 'Edit Diesel Receipt' : 'Log Diesel Receipt',
        fields: receiptFields(),
        initial: record || { date: new Date().toISOString().slice(0, 10) },
        submitLabel: record ? 'Save Changes' : 'Log Receipt',
        onSubmit: (data) => {
          if (record) store.update('dieselReceipts', record.id, data);
          else store.add('dieselReceipts', data);
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
        onSubmit: (data) => {
          if (record) store.update('dieselStockCounts', record.id, data);
          else store.add('dieselStockCounts', data);
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
          {
            key: 'actions',
            label: '',
            render: (r) => actionButtons({
              onPrint: () => printFuelingVoucher(r, {
                requestedByName: employees.find((e) => e.id === r.requestedBy)?.name,
                approvedByName: employees.find((e) => e.id === r.approvedBy)?.name,
              }),
              onEdit: () => openVoucherForm(r),
              onDelete: () => {
                if (confirmDelete(`Voucher for ${r.equipment} at ${r.station}`)) {
                  store.remove('fuelingVouchers', r.id);
                  refresh();
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
        onSubmit: (data) => {
          if (record) store.update('fuelingVouchers', record.id, data);
          else store.add('fuelingVouchers', data);
          refresh();
        },
      });
    }

    refresh();
  }

  setTab('roster');
}
