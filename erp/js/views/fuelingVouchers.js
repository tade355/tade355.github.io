import { store } from '../store.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { renderTable, actionButtons, statusPill, sectionHeader, openModal, confirmDelete, statCard } from '../ui.js';
import { FUEL_STATIONS } from '../constants.js';
import { printFuelingVoucher } from '../print.js';
import { fleetItems } from './fleet.js';

function projectOptions() {
  return store.get('projects').map((p) => ({ value: p.name, label: p.name }));
}

function fleetOptions() {
  return fleetItems().map((i) => ({ value: i.name, label: i.name }));
}

function employeeOptions() {
  return store.get('employees').map((e) => ({ value: e.id, label: `${e.name} (${e.role})` }));
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

export function renderFuelingVouchers(container) {
  container.innerHTML = '';

  const actionSlot = el('div');
  container.appendChild(sectionHeader(
    'Fueling Vouchers',
    "Authorization slips a driver or operator takes to a filling station to draw fuel on the company's account — only Fulfilled vouchers count toward the per-asset Diesel Ledger",
    actionSlot,
  ));
  actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openVoucherForm() }, '+ New Fueling Voucher'));

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const body = el('div');
  container.appendChild(body);

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
