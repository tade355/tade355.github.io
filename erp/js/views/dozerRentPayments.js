import { store } from '../store.js';
import { todayISOString } from '../dateUtils.js';
import { formatCurrency, formatDate, el, dateInRange, ico } from '../utils.js';
import { sectionHeader, statCard, renderTable, actionButtons, openCustomModal, closeModal, confirmDelete } from '../ui.js';
import { printDozerSettlement, printDozerRentalStatement } from '../print.js';
import { getCurrentTier, getCurrentUserId } from '../session.js';
import { dozerRatesAsOf } from '../rateHistory.js';
import { currentOwnerSettlements } from '../rentSettlementBasis.js';

function rentedDozers() {
  return store.get('inventory').filter((item) => item.ownership === 'Rented');
}

function rentalWorkRows(equipment, from) {
  return store.get('operations').filter((row) =>
    row.equipment === equipment && row.date >= from && row.workType !== 'Business' && Number(row.hoursWorked || 0) > 0);
}

function rentalLedgerRow(dozer) {
  const credits = store.get('dozerRentalCredits').filter((row) => row.equipment === dozer.name);
  const transfers = store.get('dozerRentalTransfers');
  const firstDate = credits.map((row) => row.paymentDate).sort()[0] || todayISOString();
  const work = rentalWorkRows(dozer.name, firstDate);
  const workedDates = [...new Set(work.map((row) => row.date))];
  const hoursWorked = work.reduce((sum, row) => sum + Number(row.hoursWorked || 0), 0);
  const daysPaid = credits.reduce((sum, row) => sum + Number(row.daysPaid || 0), 0);
  const transferIn = transfers.filter((row) => row.toEquipment === dozer.name).reduce((sum, row) => sum + Number(row.daysTransferred || 0), 0);
  const transferOut = transfers.filter((row) => row.fromEquipment === dozer.name).reduce((sum, row) => sum + Number(row.daysTransferred || 0), 0);
  const remainingDays = daysPaid + transferIn - transferOut - workedDates.length;
  const latestCredit = credits.slice().sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)))[0];
  const rate = Number(latestCredit?.dailyRate || dozer.rentalRatePerDay || 0);
  return {
    equipment: dozer.name,
    vendor: dozer.ownerName || latestCredit?.vendor || '—',
    daysPaid, workedDays: workedDates.length, hoursWorked, transferIn, transferOut,
    remainingDays, remainingValue: remainingDays * rate, rate, firstDate,
    lastPaymentDate: latestCredit?.paymentDate,
    credits: credits.slice().sort((a, b) => String(a.paymentDate).localeCompare(String(b.paymentDate))),
    transfers: transfers.filter((row) => row.fromEquipment === dozer.name || row.toEquipment === dozer.name)
      .slice().sort((a, b) => String(a.transferDate).localeCompare(String(b.transferDate))),
    work: work.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))),
  };
}

function paidRentalRequests() {
  const allocated = new Map();
  store.get('dozerRentalCredits').forEach((row) => allocated.set(row.fundRequestId, (allocated.get(row.fundRequestId) || 0) + Number(row.amountPaid || 0)));
  return store.get('fundRequests').filter((row) => row.status === 'Paid' && /rent|rental|dozer/i.test([row.costHead, row.description, ...(row.items || []).map((item) => item.description)].join(' ')))
    .map((row) => {
      const paid = Number(row.paidAmount || row.approvedAmount || (row.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0));
      return { ...row, availableToAllocate: Math.max(0, paid - (allocated.get(row.id) || 0)) };
    }).filter((row) => row.availableToAllocate > 0);
}

function openRentalCreditForm(refresh) {
  const dozers = rentedDozers();
  const requests = paidRentalRequests();
  if (!dozers.length) { window.alert('No rented dozer is configured in Fleet Management.'); return; }
  openCustomModal({
    title: 'Allocate Paid Rental to a Dozer', wide: true,
    build: (container) => {
      const requestField = selectField('fundRequestId', 'Paid fund request', [
        { value: '', label: '— Select recorded payment —' },
        ...requests.map((r) => ({ value: r.id, label: r.id + ' · ' + formatCurrency(r.availableToAllocate) + ' available · ' + (r.description || 'Rental') })),
      ]);
      const dozerField = selectField('equipment', 'Rented dozer', dozers.map((d) => ({ value: d.name, label: d.name + ' · ' + (d.ownerName || 'No vendor') })));
      const dateField = textField('paymentDate', 'Payment date', 'date', todayISOString(), true);
      const daysField = textField('daysPaid', 'Number of days paid for', 'number', '', true);
      const rateField = textField('dailyRate', 'Daily rental rate (₦)', 'number', 400000, true);
      const amountField = textField('amountPaid', 'Amount allocated (₦)', 'number', '', true);
      const refField = textField('paymentReference', 'Payment reference', 'text', '', false);
      const notes = el('textarea', { rows: 2, placeholder: 'Optional note about this allocation' });
      const notesField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Notes'), notes]);
      const sync = () => {
        const days = Number(daysField.querySelector('input').value || 0);
        const rate = Number(rateField.querySelector('input').value || 0);
        if (days && rate) amountField.querySelector('input').value = days * rate;
      };
      daysField.querySelector('input').step = '0.25';
      [daysField, rateField].forEach((field) => field.querySelector('input').addEventListener('input', sync));
      requestField.querySelector('select').addEventListener('change', () => {
        const request = requests.find((r) => r.id === requestField.querySelector('select').value);
        if (!request) return;
        dateField.querySelector('input').value = request.paidAt || request.date || todayISOString();
        refField.querySelector('input').value = request.paymentReference || '';
        amountField.querySelector('input').value = request.availableToAllocate;
        const rate = Number(rateField.querySelector('input').value || 0);
        if (rate) daysField.querySelector('input').value = request.availableToAllocate / rate;
      });
      const submit = el('button', { type: 'button', class: 'btn btn-primary' }, 'Save Rental Credit');
      submit.addEventListener('click', async () => {
        const request = requests.find((r) => r.id === requestField.querySelector('select').value);
        const dozer = dozers.find((d) => d.name === dozerField.querySelector('select').value);
        const daysPaid = Number(daysField.querySelector('input').value || 0);
        const dailyRate = Number(rateField.querySelector('input').value || 0);
        const amountPaid = Number(amountField.querySelector('input').value || 0);
        if (!request) { window.alert('Select the recorded fund-request payment first.'); return; }
        if (!dozer || daysPaid <= 0 || dailyRate <= 0 || amountPaid <= 0) { window.alert('Dozer, days, rate and amount are required.'); return; }
        if (amountPaid > request.availableToAllocate + 0.01) { window.alert('This allocation is more than the recorded payment available on ' + request.id + '.'); return; }
        try {
          submit.disabled = true;
          await store.add('dozerRentalCredits', {
            vendor: dozer.ownerName || 'Unknown vendor', equipment: dozer.name,
            paymentDate: dateField.querySelector('input').value, daysPaid, dailyRate, amountPaid,
            fundRequestId: request.id, paymentReference: refField.querySelector('input').value,
            notes: notes.value, createdBy: getCurrentUserId(),
          });
          closeModal(); refresh();
        } catch (err) { window.alert(err.message || 'Could not save the rental credit.'); submit.disabled = false; }
      });
      container.append(
        el('p', { class: 'section-subtitle' }, 'Only payments already recorded as Paid can be allocated. One payment may be split between dozers, but the allocations cannot exceed the paid amount.'),
        el('div', { class: 'form-grid-2' }, [requestField, dozerField, dateField, daysField, rateField, amountField, refField]),
        notesField,
        el('div', { class: 'modal-actions' }, [el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Cancel'), submit]),
      );
    },
  });
}

function openRentalTransferForm(refresh) {
  const rows = rentedDozers().map(rentalLedgerRow).filter((row) => row.remainingDays > 0);
  if (rows.length < 1) { window.alert('No rented dozer has paid days available to transfer.'); return; }
  openCustomModal({
    title: 'Transfer Paid Rental Days', wide: true,
    build: (container) => {
      const from = selectField('from', 'From dozer', rows.map((r) => ({ value: r.equipment, label: r.equipment + ' · ' + r.remainingDays.toFixed(2) + ' days left' })));
      const to = selectField('to', 'To dozer', rentedDozers().map((d) => ({ value: d.name, label: d.name + ' · ' + (d.ownerName || 'No vendor') })));
      const date = textField('transferDate', 'Transfer date', 'date', todayISOString(), true);
      const days = textField('daysTransferred', 'Days to transfer', 'number', '', true);
      days.querySelector('input').step = '0.25';
      const reason = textField('reason', 'Reason (breakdown, withdrawal, etc.)', 'text', '', true);
      const submit = el('button', { type: 'button', class: 'btn btn-primary' }, 'Record Transfer');
      submit.addEventListener('click', async () => {
        const source = rows.find((r) => r.equipment === from.querySelector('select').value);
        const target = rentedDozers().find((d) => d.name === to.querySelector('select').value);
        const qty = Number(days.querySelector('input').value || 0);
        if (!source || !target || source.equipment === target.name) { window.alert('Choose two different dozers.'); return; }
        if (source.vendor !== (target.ownerName || '—')) { window.alert('Paid days can only move between dozers belonging to the same vendor.'); return; }
        if (qty <= 0 || qty > source.remainingDays) { window.alert('The transfer must be within the source dozer’s remaining paid days.'); return; }
        if (!reason.querySelector('input').value.trim()) { window.alert('Enter the reason for the transfer.'); return; }
        try {
          submit.disabled = true;
          await store.add('dozerRentalTransfers', {
            vendor: source.vendor, fromEquipment: source.equipment, toEquipment: target.name,
            transferDate: date.querySelector('input').value, daysTransferred: qty,
            reason: reason.querySelector('input').value.trim(), createdBy: getCurrentUserId(),
          });
          closeModal(); refresh();
        } catch (err) { window.alert(err.message || 'Could not record this transfer.'); submit.disabled = false; }
      });
      container.append(
        el('p', { class: 'section-subtitle' }, 'The two dozers keep separate ledgers. This entry removes days from one and adds them to the other, with the reason and date preserved.'),
        el('div', { class: 'form-grid-2' }, [from, to, date, days, reason]),
        el('div', { class: 'modal-actions' }, [el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Cancel'), submit]),
      );
    },
  });
}

function renderRentalCreditLedger(container, refresh) {
  const rows = rentedDozers().map(rentalLedgerRow);
  const canManage = ['Admin', 'Accounts'].includes(getCurrentTier());
  const actions = el('div', { class: 'toolbar-actions' }, [
    canManage ? el('button', { class: 'btn btn-primary', onClick: () => openRentalCreditForm(refresh) }, '+ Allocate Paid Rental') : null,
    canManage ? el('button', { class: 'btn btn-secondary', onClick: () => openRentalTransferForm(refresh) }, 'Transfer Paid Days') : null,
  ].filter(Boolean));
  container.appendChild(sectionHeader('Rented Dozer Credit Tracking', 'Payment-backed days, worked dates, hours, transfers and remaining rental for each hired dozer', actions));
  container.appendChild(el('p', { class: 'section-subtitle' }, 'One date with recorded work consumes one rental day. Hours are shown as supporting evidence. Saheed and Pastor remain separate even when their vendor is the same.'));
  const table = el('div'); container.appendChild(table);
  renderTable(table, {
    columns: [
      { key: 'equipment', label: 'Dozer' }, { key: 'vendor', label: 'Vendor' },
      { key: 'daysPaid', label: 'Days Paid', render: (r) => r.daysPaid.toFixed(2) },
      { key: 'workedDays', label: 'Worked Days' },
      { key: 'hoursWorked', label: 'Hours Worked', render: (r) => r.hoursWorked.toFixed(1) + ' hrs' },
      { key: 'transferIn', label: 'Days In', render: (r) => r.transferIn.toFixed(2) },
      { key: 'transferOut', label: 'Days Out', render: (r) => r.transferOut.toFixed(2) },
      { key: 'remainingDays', label: 'Rental Left', render: (r) => el('strong', { class: r.remainingDays < 2 ? 'text-critical' : 'text-good' }, r.remainingDays.toFixed(2) + ' days') },
      { key: 'remainingValue', label: 'Value Left', render: (r) => formatCurrency(r.remainingValue) },
      { key: 'lastPaymentDate', label: 'Last Payment', render: (r) => r.lastPaymentDate ? formatDate(r.lastPaymentDate) : 'Not allocated' },
      { key: 'print', label: '', render: (r) => el('button', { class: 'btn btn-ghost btn-sm', onClick: () => printDozerRentalStatement(r) }, 'Print Statement') },
    ], rows, emptyText: 'No rented dozers are configured yet.',
  });
  container.appendChild(el('h3', { class: 'subsection-title' }, 'Rental Payment & Transfer History'));
  const history = [
    ...store.get('dozerRentalCredits').map((r) => ({ ...r, entryDate: r.paymentDate, entryType: 'Payment', detail: r.daysPaid + ' days paid · ' + formatCurrency(r.amountPaid), movement: '+' + r.daysPaid })),
    ...store.get('dozerRentalTransfers').flatMap((r) => [
      { ...r, equipment: r.fromEquipment, entryDate: r.transferDate, entryType: 'Transfer out', detail: 'To ' + r.toEquipment + ' · ' + r.reason, movement: '-' + r.daysTransferred },
      { ...r, equipment: r.toEquipment, entryDate: r.transferDate, entryType: 'Transfer in', detail: 'From ' + r.fromEquipment + ' · ' + r.reason, movement: '+' + r.daysTransferred },
    ]),
  ].sort((a, b) => String(b.entryDate).localeCompare(String(a.entryDate)));
  const historyTable = el('div'); container.appendChild(historyTable);
  renderTable(historyTable, {
    columns: [
      { key: 'entryDate', label: 'Date', render: (r) => formatDate(r.entryDate) },
      { key: 'equipment', label: 'Dozer' }, { key: 'vendor', label: 'Vendor' },
      { key: 'entryType', label: 'Entry' }, { key: 'movement', label: 'Days' },
      { key: 'fundRequestId', label: 'Fund Request', render: (r) => r.fundRequestId || '—' },
      { key: 'detail', label: 'Details', wrap: true },
    ], rows: history, emptyText: 'No rental payments or transfers recorded yet.',
  });
}

// Partnership dozers pay a management fee (Emagrims retains a cut of the
// rental); Rented dozers don't (Emagrims just pays the day rate) — but both
// are 3rd-party equipment settled the same way otherwise, so they share this
// one ledger. Management Fee/Day simply stays 0 for a Rented dozer's rows.
function settleableDozers() {
  return store.get('inventory').filter((i) => i.ownership === 'Partnership' || i.ownership === 'Rented');
}

function selectField(name, label, options, value) {
  const select = el('select', { name }, options.map((o) => {
    const opt = el('option', { value: o.value }, o.label);
    if (String(o.value) === String(value ?? '')) opt.setAttribute('selected', 'selected');
    return opt;
  }));
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label), select]);
}

function textField(name, label, type, value, required) {
  const input = el('input', { type: type || 'text', name, required: required ? 'required' : undefined, min: type === 'number' ? 0 : undefined });
  input.value = value ?? '';
  return el('label', { class: 'field' }, [el('span', { class: 'field-label' }, label + (required ? ' *' : '')), input]);
}

// Distinct days worked in a period, excluding Business days — this is what
// feeds a Partnership dozer's formal, owner-shareable settlement.
function officeDaysWorked(equipment, from, to) {
  return new Set(
    store.get('operations')
      .filter((o) => o.equipment === equipment && dateInRange(o.date, from, to) && o.workType !== 'Business')
      .map((o) => o.date),
  ).size;
}

function maintenanceCostFor(equipment, from, to) {
  return store.get('maintenanceLogs')
    .filter((m) => m.equipment === equipment && dateInRange(m.date, from, to))
    .reduce((sum, m) => sum + m.cost, 0);
}

function settlementBalance(s) {
  return (s.daysWorked * s.rentalRatePerDay) - (s.daysWorked * s.managementFeePerDay) - s.repairsCost - s.amountPaidToOwner;
}

function openSettlementForm(record, refresh) {
  const dozers = settleableDozers();
  if (!dozers.length) {
    window.alert('No Partnership or Rented dozers in the fleet yet. Set a dozer\'s Ownership to Partnership or Rented in Fleet Management first.');
    return;
  }

  openCustomModal({
    title: record ? 'Edit Owner Settlement' : 'New Owner Settlement',
    wide: true,
    build: (container) => {
      const equipmentField = selectField('equipment', 'Dozer', dozers.map((d) => ({ value: d.name, label: d.name })), record?.equipment);
      const periodStartField = textField('periodStart', 'Period Start', 'date', record?.periodStart, true);
      const periodEndField = textField('periodEnd', 'Period End', 'date', record?.periodEnd, true);
      const topGrid = el('div', { class: 'form-grid-2' }, [equipmentField, periodStartField, periodEndField]);

      const daysField = textField('daysWorked', 'Days Worked (Office days only)', 'number', record?.daysWorked ?? 0, true);
      const rentalField = textField('rentalRatePerDay', 'Rental Rate/Day (₦)', 'number', record?.rentalRatePerDay ?? 0, true);
      const feeField = textField('managementFeePerDay', 'Management Fee/Day (₦, retained)', 'number', record?.managementFeePerDay ?? 0, true);
      const repairsField = textField('repairsCost', 'Repairs Cost (₦)', 'number', record?.repairsCost ?? 0);
      const paidField = textField('amountPaidToOwner', 'Amount Paid to Owner (₦)', 'number', record?.amountPaidToOwner ?? 0);
      const numbersGrid = el('div', { class: 'form-grid-2' }, [daysField, rentalField, feeField, repairsField, paidField]);

      const balanceDisplay = el('strong', {}, formatCurrency(0));
      const balanceRow = el('div', { class: 'line-items-total' }, [el('span', {}, 'Balance Owed to Owner:'), balanceDisplay]);

      function recomputeBalance() {
        const days = Number(daysField.querySelector('input').value) || 0;
        const rental = Number(rentalField.querySelector('input').value) || 0;
        const fee = Number(feeField.querySelector('input').value) || 0;
        const repairs = Number(repairsField.querySelector('input').value) || 0;
        const paid = Number(paidField.querySelector('input').value) || 0;
        balanceDisplay.textContent = formatCurrency((days * rental) - (days * fee) - repairs - paid);
      }
      [daysField, rentalField, feeField, repairsField, paidField].forEach((f) => f.querySelector('input').addEventListener('input', recomputeBalance));

      const recomputeBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, [ico('refresh'), 'Fill Days, Repairs & Rates from Records']);
      recomputeBtn.addEventListener('click', () => {
        const equipment = equipmentField.querySelector('select').value;
        const from = periodStartField.querySelector('input').value;
        const to = periodEndField.querySelector('input').value;
        if (!equipment || !from || !to) { window.alert('Pick a dozer and both period dates first.'); return; }
        daysField.querySelector('input').value = officeDaysWorked(equipment, from, to);
        repairsField.querySelector('input').value = maintenanceCostFor(equipment, from, to);
        const rates = dozerRatesAsOf(equipment, from);
        rentalField.querySelector('input').value = rates.rentalRatePerDay ?? 0;
        feeField.querySelector('input').value = rates.managementFeePerDay ?? 0;
        recomputeBalance();
      });

      // Pre-fill using the rate in effect at the start of the chosen period
      // (Rate History in Fleet Management), not necessarily today's rate.
      function fillDefaultRates() {
        const equipment = equipmentField.querySelector('select').value;
        if (!equipment || record) return;
        const asOf = periodStartField.querySelector('input').value || todayISOString();
        const rates = dozerRatesAsOf(equipment, asOf);
        rentalField.querySelector('input').value = rates.rentalRatePerDay ?? 0;
        feeField.querySelector('input').value = rates.managementFeePerDay ?? 0;
        recomputeBalance();
      }
      equipmentField.querySelector('select').addEventListener('change', fillDefaultRates);
      periodStartField.querySelector('input').addEventListener('change', fillDefaultRates);
      if (!record) fillDefaultRates();
      recomputeBalance();

      const notesInput = el('textarea', { name: 'notes', rows: 2 });
      notesInput.value = record?.notes || '';
      const notesField = el('label', { class: 'field' }, [el('span', { class: 'field-label' }, 'Notes'), notesInput]);

      const actions = el('div', { class: 'modal-actions' }, [
        el('button', { type: 'button', class: 'btn btn-ghost', onClick: closeModal }, 'Cancel'),
        el('button', { type: 'button', class: 'btn btn-primary' }, record ? 'Save Changes' : 'Save Settlement'),
      ]);
      const submitBtn = actions.lastChild;

      submitBtn.addEventListener('click', async () => {
        const payload = {
          equipment: equipmentField.querySelector('select').value,
          periodStart: periodStartField.querySelector('input').value,
          periodEnd: periodEndField.querySelector('input').value,
          daysWorked: Number(daysField.querySelector('input').value) || 0,
          rentalRatePerDay: Number(rentalField.querySelector('input').value) || 0,
          managementFeePerDay: Number(feeField.querySelector('input').value) || 0,
          repairsCost: Number(repairsField.querySelector('input').value) || 0,
          amountPaidToOwner: Number(paidField.querySelector('input').value) || 0,
          notes: notesInput.value,
        };
        if (!payload.equipment) { window.alert('Dozer is required.'); return; }
        if (!payload.periodStart || !payload.periodEnd) { window.alert('Both period dates are required.'); return; }

        try {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving…';
          if (record) await store.update('dozerOwnerSettlements', record.id, payload);
          else await store.add('dozerOwnerSettlements', payload);
          closeModal();
          refresh();
        } catch (err) {
          window.alert(err.message || 'Could not save this settlement.');
          submitBtn.disabled = false;
          submitBtn.textContent = record ? 'Save Changes' : 'Save Settlement';
        }
      });

      container.appendChild(topGrid);
      container.appendChild(recomputeBtn);
      container.appendChild(numbersGrid);
      container.appendChild(balanceRow);
      container.appendChild(notesField);
      container.appendChild(actions);
    },
  });
}

// Per-dozer running balance owed to its owner (Partnership or Rented) —
// generated rental minus management fee retained (0 for Rented), repairs,
// and what's already been paid out. Exported so the Dashboard can surface
// the company-wide total without duplicating this logic.
export function ownerSettlementBalances() {
  const settlements = store.get('dozerOwnerSettlements');
  return settleableDozers().map((d) => {
    const history = settlements.filter((s) => s.equipment === d.name);
    const own = currentOwnerSettlements(history);
    const beneficiary = history.filter((s) => s.accountNumber).sort((a, b) => String(b.periodEnd).localeCompare(String(a.periodEnd)))[0] || {};
    const opening = own.find((s) => s.isOpeningBalance);
    const generated = own.reduce((sum, s) => sum + (s.daysWorked * s.rentalRatePerDay), 0);
    const retained = own.reduce((sum, s) => sum + (s.daysWorked * s.managementFeePerDay), 0);
    const repairs = own.reduce((sum, s) => sum + s.repairsCost, 0);
    const paid = own.reduce((sum, s) => sum + s.amountPaidToOwner, 0);
    return { name: d.name, owner: d.ownerName || '—', generated, retained, repairs, paid, balance: generated - retained - repairs - paid, balanceSince: opening?.periodEnd, accountName: beneficiary.accountName, accountNumber: beneficiary.accountNumber, bankName: beneficiary.bankName };
  });
}

export function renderDozerRentPayments(container) {
  container.innerHTML = '';

  function refresh() {
    container.innerHTML = '';
    const settlements = store.get('dozerOwnerSettlements').slice().sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));

    renderRentalCreditLedger(container, refresh);

    container.appendChild(sectionHeader('Dozer Rent Payments', 'Formal, owner-shareable record of days worked, rental earned, management fee retained (0 for Rented dozers), repairs, and amount paid — Partnership and Rented dozers', el('button', { class: 'btn btn-primary', onClick: () => openSettlementForm(null, refresh) }, '+ New Settlement')));

    const balanceRows = ownerSettlementBalances();

    const summaryContainer = el('div');
    container.appendChild(summaryContainer);
    renderTable(summaryContainer, {
      columns: [
        { key: 'name', label: 'Dozer' },
        { key: 'owner', label: 'Owner' },
        { key: 'balanceSince', label: 'Opening Balance As Of', render: (r) => r.balanceSince ? formatDate(r.balanceSince) : 'All recorded periods' },
        { key: 'beneficiary', label: 'Pay To', render: (r) => [r.accountName, r.accountNumber, r.bankName].filter(Boolean).join(' · ') || '—', wrap: true },
        { key: 'generated', label: 'Total Generated', render: (r) => formatCurrency(r.generated) },
        { key: 'retained', label: 'Management Retained', render: (r) => formatCurrency(r.retained) },
        { key: 'repairs', label: 'Repairs Cost', render: (r) => formatCurrency(r.repairs) },
        { key: 'paid', label: 'Already Paid', render: (r) => formatCurrency(r.paid) },
        { key: 'balance', label: 'Balance Owed', render: (r) => el('strong', { class: r.balance >= 0 ? 'text-critical' : 'text-good' }, formatCurrency(r.balance)) },
      ],
      rows: balanceRows,
      emptyText: 'No Partnership or Rented dozers in the fleet yet.',
    });

    container.appendChild(el('p', { class: 'section-subtitle' }, 'A confirmed opening balance replaces earlier balances in the summary. Earlier entries remain below for history; no payment is implied. Add subsequent rent periods after the opening date to avoid overlap.'));
    container.appendChild(el('h3', { class: 'subsection-title' }, 'Settlement History'));
    const tableContainer = el('div');
    container.appendChild(tableContainer);
    renderTable(tableContainer, {
      columns: [
        { key: 'equipment', label: 'Dozer' },
        { key: 'basis', label: 'Record Type', render: (r) => r.isOpeningBalance ? 'Confirmed opening balance' : 'Rent settlement' },
        { key: 'notes', label: 'Notes', render: (r) => r.notes || '—', wrap: true },
        { key: 'period', label: 'Period', render: (r) => `${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}` },
        { key: 'daysWorked', label: 'Days', render: (r) => r.daysWorked },
        { key: 'rentalRatePerDay', label: 'Rate/Day', render: (r) => formatCurrency(r.rentalRatePerDay) },
        { key: 'managementFeePerDay', label: 'Mgmt Fee/Day', render: (r) => formatCurrency(r.managementFeePerDay) },
        { key: 'repairsCost', label: 'Repairs', render: (r) => formatCurrency(r.repairsCost) },
        { key: 'amountPaidToOwner', label: 'Paid to Owner', render: (r) => formatCurrency(r.amountPaidToOwner) },
        { key: 'balance', label: 'Balance', render: (r) => formatCurrency(settlementBalance(r)) },
        {
          key: 'actions',
          label: '',
          render: (r) => actionButtons({
            onPrint: () => printDozerSettlement(r, store.get('inventory').find((i) => i.name === r.equipment)?.ownerName),
            onEdit: () => openSettlementForm(r, refresh),
            onDelete: async () => {
              if (!confirmDelete(`${r.equipment} settlement (${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)})`)) return;
              try {
                await store.remove('dozerOwnerSettlements', r.id);
                refresh();
              } catch (err) {
                window.alert(err.message || 'Could not delete this settlement.');
              }
            },
          }),
        },
      ],
      rows: settlements,
      emptyText: 'No settlements recorded yet.',
    });
  }

  refresh();
}
