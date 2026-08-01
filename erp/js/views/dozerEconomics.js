import { store } from '../store.js';
import { formatCurrency, formatDate, el, dateInRange } from '../utils.js';
import { sectionHeader, statCard, renderTable, actionButtons, openCustomModal, closeModal, confirmDelete, statusPill } from '../ui.js';
import { getCurrentTier } from '../session.js';

function companyDozers() {
  return store.get('inventory').filter((i) => i.ownership === 'Company' || !i.ownership);
}
function partnershipDozers() {
  return store.get('inventory').filter((i) => i.ownership === 'Partnership');
}
function ledgerDozers() {
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
  const dozers = partnershipDozers();
  if (!dozers.length) {
    window.alert('No Partnership dozers in the fleet yet. Set a dozer\'s Ownership to Partnership in Fleet Management first.');
    return;
  }

  openCustomModal({
    title: record ? 'Edit Owner Settlement' : 'New Owner Settlement',
    wide: true,
    build: (container) => {
      const equipmentField = selectField('equipment', 'Partnership Dozer', dozers.map((d) => ({ value: d.name, label: d.name })), record?.equipment);
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

      const recomputeBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, '↻ Fill Days & Repairs from Records');
      recomputeBtn.addEventListener('click', () => {
        const equipment = equipmentField.querySelector('select').value;
        const from = periodStartField.querySelector('input').value;
        const to = periodEndField.querySelector('input').value;
        if (!equipment || !from || !to) { window.alert('Pick a dozer and both period dates first.'); return; }
        daysField.querySelector('input').value = officeDaysWorked(equipment, from, to);
        repairsField.querySelector('input').value = maintenanceCostFor(equipment, from, to);
        recomputeBalance();
      });

      function fillDefaultRates() {
        const dozer = dozers.find((d) => d.name === equipmentField.querySelector('select').value);
        if (!dozer) return;
        if (!record) {
          rentalField.querySelector('input').value = dozer.rentalRatePerDay ?? 0;
          feeField.querySelector('input').value = dozer.managementFeePerDay ?? 0;
          recomputeBalance();
        }
      }
      equipmentField.querySelector('select').addEventListener('change', fillDefaultRates);
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

function renderCompanyPerformance(container, from, to) {
  const rows = companyDozers().map((d) => {
    const operations = store.get('operations').filter((o) => o.equipment === d.name && dateInRange(o.date, from, to));
    const hours = operations.reduce((sum, o) => sum + (o.hoursWorked || 0), 0);
    const revenueProxy = hours * (d.hourlyRate || 0);
    const maintenanceCost = maintenanceCostFor(d.name, from, to);
    const profit = revenueProxy - maintenanceCost;
    return { name: d.name, hours, revenueProxy, maintenanceCost, profit };
  });

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Company-Owned Dozer Performance'));
  container.appendChild(el('p', { class: 'section-subtitle' }, 'Revenue is an estimate (hours worked × the dozer\'s internal ₦/hr rate from Fleet Management), not real billed revenue — clients are invoiced per project, not per machine. See Fleet Roster for utilization/availability.'));
  const tableContainer = el('div');
  container.appendChild(tableContainer);
  renderTable(tableContainer, {
    columns: [
      { key: 'name', label: 'Dozer' },
      { key: 'hours', label: 'Hours Worked', render: (r) => `${r.hours} h` },
      { key: 'revenueProxy', label: 'Revenue (est.)', render: (r) => formatCurrency(r.revenueProxy) },
      { key: 'maintenanceCost', label: 'Maintenance Cost', render: (r) => formatCurrency(r.maintenanceCost) },
      { key: 'profit', label: 'Profit (est.)', render: (r) => el('strong', { class: r.profit >= 0 ? 'text-good' : 'text-critical' }, formatCurrency(r.profit)) },
    ],
    rows,
    emptyText: 'No Company-owned dozers in the fleet yet.',
  });
}

function renderOwnerSettlements(container, refresh) {
  const dozers = partnershipDozers();
  const settlements = store.get('dozerOwnerSettlements').slice().sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));

  container.appendChild(sectionHeader('Partnership Owner Settlements', 'Formal, owner-shareable record of days worked, rental earned, management fee retained, repairs, and amount paid', el('button', { class: 'btn btn-primary', onClick: () => openSettlementForm(null, refresh) }, '+ New Settlement')));

  const balanceRows = dozers.map((d) => {
    const own = settlements.filter((s) => s.equipment === d.name);
    const generated = own.reduce((sum, s) => sum + (s.daysWorked * s.rentalRatePerDay), 0);
    const retained = own.reduce((sum, s) => sum + (s.daysWorked * s.managementFeePerDay), 0);
    const repairs = own.reduce((sum, s) => sum + s.repairsCost, 0);
    const paid = own.reduce((sum, s) => sum + s.amountPaidToOwner, 0);
    return { name: d.name, owner: d.ownerName || '—', generated, retained, repairs, paid, balance: generated - retained - repairs - paid };
  });

  const summaryContainer = el('div');
  container.appendChild(summaryContainer);
  renderTable(summaryContainer, {
    columns: [
      { key: 'name', label: 'Dozer' },
      { key: 'owner', label: 'Owner' },
      { key: 'generated', label: 'Total Generated', render: (r) => formatCurrency(r.generated) },
      { key: 'retained', label: 'Management Retained', render: (r) => formatCurrency(r.retained) },
      { key: 'repairs', label: 'Repairs Cost', render: (r) => formatCurrency(r.repairs) },
      { key: 'paid', label: 'Already Paid', render: (r) => formatCurrency(r.paid) },
      { key: 'balance', label: 'Balance Owed', render: (r) => el('strong', { class: r.balance >= 0 ? 'text-critical' : 'text-good' }, formatCurrency(r.balance)) },
    ],
    rows: balanceRows,
    emptyText: 'No Partnership dozers in the fleet yet.',
  });

  container.appendChild(el('h3', { class: 'subsection-title' }, 'Settlement History'));
  const tableContainer = el('div');
  container.appendChild(tableContainer);
  renderTable(tableContainer, {
    columns: [
      { key: 'equipment', label: 'Dozer' },
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

function renderInternalLedger(container) {
  container.appendChild(el('h3', { class: 'subsection-title' }, 'Internal Ledger — Office vs Business'));
  container.appendChild(el('p', { class: 'section-subtitle' }, 'Every day logged against a Partnership or Rented dozer, Office and Business alike — for internal use only. Business days and amounts never appear in the owner-shareable settlement above.'));

  const filterBar = el('div', { class: 'filter-bar' });
  const dozers = ledgerDozers();
  const equipmentSelect = el('select', {}, [
    el('option', { value: '' }, 'Select a dozer —'),
    ...dozers.map((d) => el('option', { value: d.name }, d.name)),
  ]);
  const fromInput = el('input', { type: 'date' });
  const toInput = el('input', { type: 'date' });
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'Dozer'), equipmentSelect]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), fromInput]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), toInput]));
  container.appendChild(filterBar);

  const summarySlot = el('div');
  container.appendChild(summarySlot);
  const tableContainer = el('div');
  container.appendChild(tableContainer);

  function refresh() {
    const equipment = equipmentSelect.value;
    const from = fromInput.value;
    const to = toInput.value;
    const rows = store.get('operations')
      .filter((o) => (!equipment || o.equipment === equipment) && dateInRange(o.date, from, to) && ledgerDozers().some((d) => d.name === o.equipment))
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const officeDays = new Set(rows.filter((r) => r.workType !== 'Business').map((r) => r.date)).size;
    const businessDays = rows.filter((r) => r.workType === 'Business').length;
    const businessEarnings = rows.filter((r) => r.workType === 'Business').reduce((sum, r) => sum + (r.businessAmount || 0), 0);

    summarySlot.innerHTML = '';
    summarySlot.appendChild(el('div', { class: 'stats-grid' }, [
      statCard({ label: 'Office Days', value: String(officeDays) }),
      statCard({ label: 'Business Days', value: String(businessDays), tone: businessDays ? 'warning' : 'good' }),
      statCard({ label: 'Business Earnings', value: formatCurrency(businessEarnings) }),
    ]));

    const employees = store.get('employees');
    renderTable(tableContainer, {
      columns: [
        { key: 'date', label: 'Date', render: (r) => formatDate(r.date) },
        { key: 'equipment', label: 'Dozer' },
        { key: 'operator', label: 'Operator', render: (r) => employees.find((e) => e.id === r.operatorId)?.name || 'Unknown' },
        { key: 'hoursWorked', label: 'Hours', render: (r) => `${r.hoursWorked} h` },
        { key: 'workType', label: 'Work Type', render: (r) => statusPill(r.workType || 'Office') },
        { key: 'businessAmount', label: 'Business Amount', render: (r) => (r.workType === 'Business' ? formatCurrency(r.businessAmount) : '—') },
      ],
      rows,
      emptyText: 'No days logged for these filters yet.',
    });
  }

  [equipmentSelect, fromInput, toInput].forEach((input) => input.addEventListener('change', refresh));
  refresh();
}

export function renderDozerEconomics(container) {
  container.innerHTML = '';

  const isAdmin = getCurrentTier() === 'Admin';

  container.appendChild(sectionHeader('Dozer Economics', 'Company-owned dozer performance and Partnership owner settlements'));

  const filterBar = el('div', { class: 'filter-bar' });
  const fromInput = el('input', { type: 'date' });
  const toInput = el('input', { type: 'date' });
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'From'), fromInput]));
  filterBar.appendChild(el('label', { class: 'filter-field' }, [el('span', {}, 'To'), toInput]));
  container.appendChild(filterBar);

  const companySection = el('div');
  container.appendChild(companySection);
  const settlementsSection = el('div');
  container.appendChild(settlementsSection);

  function refreshCompany() {
    companySection.innerHTML = '';
    renderCompanyPerformance(companySection, fromInput.value, toInput.value);
  }
  function refreshSettlements() {
    settlementsSection.innerHTML = '';
    renderOwnerSettlements(settlementsSection, refreshSettlements);
  }

  [fromInput, toInput].forEach((input) => input.addEventListener('change', refreshCompany));
  refreshCompany();
  refreshSettlements();

  if (isAdmin) {
    const ledgerSection = el('div');
    container.appendChild(ledgerSection);
    renderInternalLedger(ledgerSection);
  }
}
