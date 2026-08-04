import { store } from '../store.js';
import { formatCurrency, formatDate, el } from '../utils.js';
import { sectionHeader, statCard, statusPill, renderTable, actionButtons, openModal, confirmDelete } from '../ui.js';
import { FUEL_STATIONS, FUEL_TYPES } from '../constants.js';

function collectionFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'station', label: 'Filling Station', type: 'select', required: true, options: FUEL_STATIONS.map((s) => ({ value: s, label: s })) },
    { name: 'fuelType', label: 'Fuel Type', type: 'select', required: true, options: FUEL_TYPES.map((t) => ({ value: t, label: t })) },
    { name: 'litres', label: 'Litres Collected', type: 'number', required: true, min: 0 },
    { name: 'unitPrice', label: 'Unit Price (₦/litre)', type: 'number', required: true, min: 0 },
    { name: 'reference', label: 'Reference (waybill, invoice #, etc.)' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
}

function paymentFields() {
  return [
    { name: 'date', label: 'Date', type: 'date', required: true },
    { name: 'station', label: 'Filling Station', type: 'select', required: true, options: FUEL_STATIONS.map((s) => ({ value: s, label: s })) },
    { name: 'amount', label: 'Amount Paid (₦)', type: 'number', required: true, min: 0 },
    { name: 'reference', label: 'Reference (receipt #, transfer ref, etc.)' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
}

function collectionAmount(c) {
  return (c.litres || 0) * (c.unitPrice || 0);
}

// The balance owed to a station is derived live from every collection and
// payment on record — never stored — so it's always correct with no
// separate reconciliation step, the same "derive, don't persist" approach
// used for diesel stock reconciliation and dozer owner settlements.
export function stationBalances() {
  const collections = store.get('fuelCreditCollections');
  const payments = store.get('fuelCreditPayments');
  const stations = [...new Set([...collections.map((c) => c.station), ...payments.map((p) => p.station)])];

  return stations.map((station) => {
    const stationCollections = collections.filter((c) => c.station === station);
    const totalCollected = stationCollections.reduce((sum, c) => sum + collectionAmount(c), 0);
    const totalPaid = payments.filter((p) => p.station === station).reduce((sum, p) => sum + p.amount, 0);
    const balance = totalCollected - totalPaid;
    const dieselLitres = stationCollections.filter((c) => c.fuelType === 'Diesel').reduce((sum, c) => sum + c.litres, 0);
    const pmsLitres = stationCollections.filter((c) => c.fuelType === 'PMS').reduce((sum, c) => sum + c.litres, 0);
    let status = 'Outstanding';
    if (balance <= 0) status = 'Fully Settled';
    else if (totalPaid > 0) status = 'Partially Settled';
    return { station, dieselLitres, pmsLitres, totalCollected, totalPaid, balance, status };
  }).sort((a, b) => b.balance - a.balance);
}

export function renderFuelCredit(container) {
  container.innerHTML = '';

  const actionSlot = el('div');
  container.appendChild(sectionHeader(
    'Fuel Credit Tracking',
    'Diesel and PMS collected on credit from filling stations, kept on record until the balance is partly or fully settled',
    actionSlot,
  ));
  actionSlot.appendChild(el('button', { class: 'btn btn-primary', onClick: () => openCollectionForm() }, '+ Log Collection'));
  actionSlot.appendChild(el('button', { class: 'btn btn-ghost', onClick: () => openPaymentForm() }, '+ Log Payment'));

  const filterBar = el('div', { class: 'filter-bar' });
  const stationSelect = el('select', {}, [
    el('option', { value: '' }, 'All Stations'),
    ...FUEL_STATIONS.map((s) => el('option', { value: s }, s)),
  ]);
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Station'), stationSelect]));
  container.appendChild(filterBar);

  const summarySlot = el('div');
  container.appendChild(summarySlot);

  const balancesContainer = el('div');
  container.appendChild(balancesContainer);

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Collections'));
  const collectionsContainer = el('div');
  container.appendChild(collectionsContainer);

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Payments / Settlements'));
  const paymentsContainer = el('div');
  container.appendChild(paymentsContainer);

  function refresh() {
    const station = stationSelect.value;
    const balances = stationBalances();
    const totalOwed = balances.reduce((sum, b) => sum + Math.max(0, b.balance), 0);
    const outstandingCount = balances.filter((b) => b.status !== 'Fully Settled').length;

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Total Owed Across All Stations', value: formatCurrency(totalOwed), tone: totalOwed ? 'critical' : 'good' }),
      statCard({ label: 'Stations With a Balance', value: String(outstandingCount), tone: outstandingCount ? 'warning' : 'good' }),
    ]));

    renderTable(balancesContainer, {
      columns: [
        { key: 'station', label: 'Station' },
        { key: 'dieselLitres', label: 'Diesel Collected', render: (r) => `${r.dieselLitres.toLocaleString()} L` },
        { key: 'pmsLitres', label: 'PMS Collected', render: (r) => `${r.pmsLitres.toLocaleString()} L` },
        { key: 'totalCollected', label: 'Total Collected', render: (r) => formatCurrency(r.totalCollected) },
        { key: 'totalPaid', label: 'Total Paid', render: (r) => formatCurrency(r.totalPaid) },
        { key: 'balance', label: 'Balance Owed', render: (r) => el('strong', { class: r.balance > 0 ? 'text-critical' : 'text-good' }, formatCurrency(r.balance)) },
        { key: 'status', label: 'Status', render: (r) => statusPill(r.status) },
      ],
      rows: balances,
      emptyText: 'No fuel collected on credit yet.',
      rowClass: (r) => (r.status === 'Outstanding' ? 'row-critical' : r.status === 'Partially Settled' ? 'row-warning' : undefined),
    });

    let collectionRows = store.get('fuelCreditCollections').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    if (station) collectionRows = collectionRows.filter((r) => r.station === station);
    renderTable(collectionsContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'station', label: 'Station' },
        { key: 'fuelType', label: 'Fuel Type' },
        { key: 'litres', label: 'Litres', render: (r) => `${r.litres.toLocaleString()} L` },
        { key: 'unitPrice', label: 'Unit Price', render: (r) => formatCurrency(r.unitPrice) },
        { key: 'amount', label: 'Amount', render: (r) => formatCurrency(collectionAmount(r)) },
        { key: 'reference', label: 'Reference', render: (r) => r.reference || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openCollectionForm(r),
            onDelete: async () => {
              if (!confirmDelete(`${r.station} collection on ${formatDate(r.date)}`)) return;
              try {
                await store.remove('fuelCreditCollections', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this collection.');
              }
            },
          }),
        },
      ],
      rows: collectionRows,
      emptyText: 'No collections logged yet.',
    });

    let paymentRows = store.get('fuelCreditPayments').slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    if (station) paymentRows = paymentRows.filter((r) => r.station === station);
    renderTable(paymentsContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'station', label: 'Station' },
        { key: 'amount', label: 'Amount Paid', render: (r) => formatCurrency(r.amount) },
        { key: 'reference', label: 'Reference', render: (r) => r.reference || '—' },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onEdit: () => openPaymentForm(r),
            onDelete: async () => {
              if (!confirmDelete(`Payment to ${r.station} on ${formatDate(r.date)}`)) return;
              try {
                await store.remove('fuelCreditPayments', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this payment.');
              }
            },
          }),
        },
      ],
      rows: paymentRows,
      emptyText: 'No payments logged yet.',
    });
  }

  function openCollectionForm(record) {
    openModal({
      title: record ? 'Edit Collection' : 'Log Collection',
      fields: collectionFields(),
      initial: record || { date: new Date().toISOString().slice(0, 10), fuelType: 'Diesel' },
      submitLabel: record ? 'Save Changes' : 'Log Collection',
      onSubmit: async (data) => {
        if (record) await store.update('fuelCreditCollections', record.id, data);
        else await store.add('fuelCreditCollections', data);
        refresh();
      },
    });
  }

  function openPaymentForm(record) {
    openModal({
      title: record ? 'Edit Payment' : 'Log Payment',
      fields: paymentFields(),
      initial: record || { date: new Date().toISOString().slice(0, 10) },
      submitLabel: record ? 'Save Changes' : 'Log Payment',
      onSubmit: async (data) => {
        if (record) await store.update('fuelCreditPayments', record.id, data);
        else await store.add('fuelCreditPayments', data);
        refresh();
      },
    });
  }

  stationSelect.addEventListener('change', refresh);
  refresh();
}
